import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, DEMO } from './supabase';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);     // { id, email }
  const [role, setRole] = useState(null);     // 'cliente' | 'consultor' | 'admin'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (DEMO) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) hydrate(data.session.user);
      else setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) hydrate(session.user);
      else { setUser(null); setRole(null); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function hydrate(u) {
    setUser(u);
    const { data } = await supabase.from('perfiles').select('rol').eq('id', u.id).single();
    setRole(data?.rol || 'cliente');
    setLoading(false);
  }

  async function login(email, password) {
    if (DEMO) {
      // En demo: cualquier email entra; el rol depende del dominio.
      const r = email.includes('consultify') ? 'consultor' : 'cliente';
      setUser({ id: 'demo', email }); setRole(r);
      return { role: r };
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: p } = await supabase.from('perfiles').select('rol').eq('id', data.user.id).single();
    return { role: p?.rol || 'cliente' };
  }

  async function register(email, password, nombre, empresa) {
    if (DEMO) { setUser({ id: 'demo', email }); setRole('cliente'); return { role: 'cliente' }; }
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { nombre, empresa } },
    });
    if (error) throw error;
    return { role: 'cliente', needsConfirm: !data.session };
  }

  async function logout() {
    if (!DEMO) await supabase.auth.signOut();
    setUser(null); setRole(null);
  }

  return (
    <AuthCtx.Provider value={{ user, role, loading, login, register, logout, demo: DEMO }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
