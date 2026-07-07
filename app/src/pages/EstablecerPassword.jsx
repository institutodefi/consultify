import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { validarPassword, mensajePassword } from '../lib/password.js';
import { supabase } from '../lib/supabase.js';

// Página a la que llegan los enlaces de invitación y de restablecimiento de
// contraseña. Supabase abre una sesión temporal al pulsar el enlace; aquí el
// usuario fija su nueva contraseña (con reglas de robustez).
export default function EstablecerPassword() {
  const nav = useNavigate();
  const { establecerPassword } = useAuth();
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [haySesion, setHaySesion] = useState(null); // null = comprobando

  // Al montar, Supabase ya debería haber creado sesión desde el enlace.
  useEffect(() => {
    if (!supabase) { setHaySesion(false); return; }
    supabase.auth.getSession().then(({ data }) => setHaySesion(!!data.session));
    // Por si el token llega justo después (evento del SDK).
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setHaySesion(!!session));
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  const val = validarPassword(pwd);
  const coincide = pwd && pwd === pwd2;

  async function guardar(e) {
    e.preventDefault();
    if (!val.ok || !coincide) return;
    setBusy(true); setMsg(null);
    try {
      await establecerPassword(pwd);
      setMsg({ ok: true, t: 'Contraseña actualizada. Redirigiendo…' });
      setTimeout(() => nav('/acceso'), 1500);
    } catch (err) {
      setMsg({ ok: false, t: err.message || 'No se pudo guardar la contraseña.' });
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card">
        <h1 className="text-2xl font-extrabold text-navy-900">Crea tu contraseña</h1>
        <p className="mt-1 text-sm font-medium text-navy-400">Elige una contraseña segura para acceder a Consultify.</p>

        {haySesion === false && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-600">
            Este enlace no es válido o ha caducado. Pide al administrador que te reenvíe la invitación.
          </div>
        )}

        {msg && <div className={`mt-4 rounded-xl p-3 text-sm font-bold ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{msg.t}</div>}

        <form onSubmit={guardar} className="mt-5 space-y-4">
          <div>
            <label className="label">Nueva contraseña</label>
            <input type="password" className="input" value={pwd} onChange={e => setPwd(e.target.value)} autoComplete="new-password" disabled={haySesion === false} />
            {pwd && !val.ok && <p className="mt-1 text-xs font-semibold text-red-500">{mensajePassword(pwd)}</p>}
            {val.ok && <p className="mt-1 text-xs font-semibold text-green-600">✓ Contraseña segura</p>}
          </div>
          <div>
            <label className="label">Repite la contraseña</label>
            <input type="password" className="input" value={pwd2} onChange={e => setPwd2(e.target.value)} autoComplete="new-password" disabled={haySesion === false} />
            {pwd2 && !coincide && <p className="mt-1 text-xs font-semibold text-red-500">Las contraseñas no coinciden.</p>}
          </div>
          <button disabled={busy || !val.ok || !coincide || haySesion === false} className="btn-primary w-full">
            {busy ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>

        <p className="mt-4 text-xs text-navy-300">Requisitos: mínimo 8 caracteres, con mayúscula, minúscula y número.</p>
      </div>
    </div>
  );
}
