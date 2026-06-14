import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, DEMO } from './supabase';
import { can } from './permisos';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // { id, email }
  const [realRole, setRealRole] = useState(null); // rol REAL en BD
  const [viewAs, setViewAs] = useState(null);   // rol simulado (solo superadmin)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (DEMO) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) hydrate(data.session.user);
      else setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) hydrate(session.user);
      else { setUser(null); setRealRole(null); setViewAs(null); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function hydrate(u) {
    setUser(u);
    const { data } = await supabase.from('perfiles').select('rol').eq('id', u.id).single();
    setRealRole(data?.rol || 'cliente');
    setLoading(false);
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: p } = await supabase.from('perfiles').select('rol').eq('id', data.user.id).single();
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

  async function logout() {
    if (!DEMO) await supabase.auth.signOut();
    setUser(null); setRealRole(null); setViewAs(null);
  }

  // Solo el superadmin puede "ver como" otro rol
  const esSuper = realRole === 'superadmin';
  function verComo(rol) { if (esSuper) setViewAs(rol === 'superadmin' ? null : rol); }
  function resetVista() { setViewAs(null); }

  // Rol EFECTIVO que usa toda la UI
  const role = (esSuper && viewAs) ? viewAs : realRole;

  return (
    <AuthCtx.Provider value={{
      user, role, realRole, viewAs, esSuper,
      login, register, logout, verComo, resetVista,
      loading, demo: DEMO,
      verEconomico: can.verEconomico(role),
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
