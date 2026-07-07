import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, DEMO } from './supabase';
import { can } from './permisos';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // { id, email }
  const [realRole, setRealRole] = useState(null); // rol REAL en BD
  const [viewAs, setViewAs] = useState(null);   // rol simulado (solo superadmin)
  const [loading, setLoading] = useState(true);
  const [politicasOk, setPoliticasOk] = useState(true); // ¿aceptó políticas? (true por defecto para no bloquear demo)
  const [perfil, setPerfil] = useState({ nombre: '', apellidos: '' });

  useEffect(() => {
    if (DEMO) { setLoading(false); return; }
    // Si faltan credenciales en el build, no hay cliente: no intentes usarlo
    // (evita que la app entera reviente al arrancar). El login mostrará el aviso.
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) hydrate(data.session.user);
      else setLoading(false);
    }).catch(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) hydrate(session.user);
      else { setUser(null); setRealRole(null); setViewAs(null); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function hydrate(u) {
    setUser(u);
    const { data } = await supabase.from('perfiles').select('rol, activo, politicas_aceptadas_en, nombre, apellidos').eq('id', u.id).single();
    // Usuario desactivado: cerrar sesión de inmediato.
    if (data && data.activo === false) {
      await supabase.auth.signOut();
      setUser(null); setRealRole(null); setViewAs(null); setLoading(false);
      return;
    }
    setRealRole(data?.rol || 'cliente');
    setPoliticasOk(!!data?.politicas_aceptadas_en);
    setPerfil({ nombre: data?.nombre || '', apellidos: data?.apellidos || '' });
    setLoading(false);
    // Marca de último acceso (no bloqueante).
    Promise.resolve(supabase.rpc('marcar_acceso')).catch(() => {});
  }

  // Actualiza el nombre/apellidos del propio usuario.
  async function actualizarMiPerfil({ nombre, apellidos }) {
    if (DEMO) { setPerfil({ nombre, apellidos }); return { ok: true }; }
    if (!supabase || !user) return { ok: false, error: 'Sin sesión.' };
    const { error } = await supabase.from('perfiles').update({ nombre, apellidos }).eq('id', user.id);
    if (error) return { ok: false, error: error.message };
    setPerfil({ nombre, apellidos });
    return { ok: true };
  }

  // Se autoenvía el email de restablecimiento de contraseña.
  async function enviarResetPropio() {
    if (DEMO) return { ok: true };
    if (!supabase || !user?.email) return { ok: false, error: 'Sin sesión.' };
    const redirectTo = `${window.location.origin}/app/nueva-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // El usuario acepta las políticas de seguridad y confidencialidad (primer login).
  async function aceptarPoliticas() {
    if (DEMO) { setPoliticasOk(true); return { ok: true }; }
    if (!supabase) return { ok: false };
    await Promise.resolve(supabase.rpc('aceptar_politicas')).catch(() => {});
    setPoliticasOk(true);
    return { ok: true };
  }

  async function login(email, password) {
    if (DEMO) {
      // En demo, el rol depende del email para poder probar todas las vistas:
      //   *super*  → superadmin · *admin* → admin · *comercial*/*gestion* → gestion
      //   *consultify*/*consultor* → consultor · resto → cliente
      let r = 'cliente';
      if (/super/i.test(email)) r = 'superadmin';
      else if (/admin/i.test(email)) r = 'admin';
      else if (/comercial|gestion|marketing/i.test(email)) r = 'gestion';
      else if (/consultify|consultor/i.test(email)) r = 'consultor';
      setUser({ id: 'demo', email }); setRealRole(r); setViewAs(null);
      return { role: r };
    }
    // Salvaguarda: si el build salió sin credenciales de Supabase (variables de
    // entorno ausentes en el hosting), el cliente es null y signInWithPassword
    // reventaría con un críptico "Failed to fetch". Mensaje claro en su lugar.
    if (!supabase) {
      throw new Error('La aplicación no está conectada a la base de datos (faltan las variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el despliegue). Avisa al administrador.');
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: p } = await supabase.from('perfiles').select('rol, activo').eq('id', data.user.id).single();
    if (p && p.activo === false) {
      await supabase.auth.signOut();
      throw new Error('Tu cuenta está desactivada. Contacta con el administrador.');
    }
    Promise.resolve(supabase.rpc('marcar_acceso')).catch(() => {});
    return { role: p?.rol || 'cliente' };
  }

  async function register(email, password, nombre, empresa) {
    if (DEMO) { setUser({ id: 'demo', email }); setRealRole('cliente'); return { role: 'cliente' }; }
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { data: { nombre, empresa } },
    });
    if (error) throw error;
    return { role: 'cliente', needsConfirm: !data.session };
  }

  // Establece la contraseña del usuario autenticado por el enlace de invitación/reset.
  // Supabase crea una sesión temporal al abrir ese enlace; updateUser fija la nueva clave.
  async function establecerPassword(password) {
    if (DEMO) return { ok: true };
    if (!supabase) throw new Error('La aplicación no está conectada a la base de datos.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return { ok: true };
  }

  async function logout() {
    if (!DEMO) await supabase.auth.signOut();
    setUser(null); setRealRole(null); setViewAs(null);
  }

  // Solo el superadmin puede "ver como" otro rol
  const esSuper = realRole === 'superadmin';
  function verComo(rol) { if (esSuper) setViewAs(rol === 'superadmin' ? null : rol); }
  function resetVista() { setViewAs(null); }

  // Llama a la Netlify Function de administración de accesos con el token del usuario.
  // Solo tiene efecto real si el backend confirma que el llamante es superadmin.
  async function adminUsuarios(payload) {
    if (DEMO) {
      // En demo devolvemos datos simulados para poder ver la UI.
      if (payload.action === 'list') {
        return { ok: true, usuarios: [
          { id: 'u1', rol: 'superadmin', nombre: 'Alejandro', email: 'alejandro@tuconsultor.com', nivel: null, activo: true, ultimo_acceso: new Date().toISOString() },
          { id: 'u2', rol: 'consultor', nombre: 'Carlota', email: 'carlota@tuconsultor.com', nivel: 'J3', activo: true, ultimo_acceso: null },
          { id: 'u3', rol: 'gestion', nombre: 'Irene', email: 'irene@tuconsultor.com', nivel: null, activo: false, ultimo_acceso: null },
        ] };
      }
      return { ok: true, demo: true };
    }
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    const r = await fetch('/.netlify/functions/admin-usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
      body: JSON.stringify(payload),
    });
    return r.json();
  }

  // Rol EFECTIVO que usa toda la UI
  const role = (esSuper && viewAs) ? viewAs : realRole;

  return (
    <AuthCtx.Provider value={{
      user, role, realRole, viewAs, esSuper,
      login, register, logout, verComo, resetVista,
      establecerPassword,
      perfil, actualizarMiPerfil, enviarResetPropio,
      adminUsuarios,
      politicasOk, aceptarPoliticas,
      loading, demo: DEMO,
      verEconomico: can.verEconomico(role),
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
