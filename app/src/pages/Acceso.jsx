import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Acceso() {
  const { login, register, demo } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ email: '', password: '', nombre: '', empresa: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === 'login') {
        const { role } = await login(f.email, f.password);
        nav(role === 'consultor' || role === 'admin' ? '/consultores' : '/clientes');
      } else {
        const r = await register(f.email, f.password, f.nombre, f.empresa);
        if (r.needsConfirm) setMsg({ ok: true, text: 'Cuenta creada. Revisa tu email para confirmar el acceso.' });
        else nav('/clientes');
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : (err.message || 'No se pudo completar la operación.') });
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card">
        <h1 className="text-2xl font-extrabold">{mode === 'login' ? 'Acceso' : 'Crear cuenta de cliente'}</h1>
        <p className="mt-1 text-sm font-medium text-navy-400">
          {mode === 'login' ? 'Clientes y consultores entran por aquí.' : 'Para seguir tus servicios y presupuestos.'}
        </p>
        {demo && (
          <p className="mt-3 rounded-xl bg-brand-orange/10 p-3 text-xs font-semibold text-brand-orangeDark">
            Modo demo (sin Supabase): cualquier email entra. Usa un email con «consultify» para ver la zona de consultores.
          </p>
        )}
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === 'register' && (
            <>
              <div><label className="label" htmlFor="a-nombre">Nombre</label><input id="a-nombre" required className="input" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></div>
              <div><label className="label" htmlFor="a-empresa">Empresa</label><input id="a-empresa" required className="input" value={f.empresa} onChange={e => setF({ ...f, empresa: e.target.value })} /></div>
            </>
          )}
          <div><label className="label" htmlFor="a-email">Email</label><input id="a-email" type="email" required className="input" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
          <div><label className="label" htmlFor="a-pass">Contraseña</label><input id="a-pass" type="password" required={!demo} className="input" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></div>
          {msg && <p className={`text-sm font-bold ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
          <button disabled={busy} className="btn-primary w-full">{busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
        </form>
        <button onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setMsg(null); }}
          className="mt-4 w-full text-center text-sm font-bold text-brand-orangeDark hover:underline">
          {mode === 'login' ? '¿Aún no tienes cuenta? Crear cuenta de cliente' : '¿Ya tienes cuenta? Entrar'}
        </button>
      </div>
    </div>
  );
}
