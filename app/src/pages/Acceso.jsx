import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

function CampoPassword({ id, label, value, onChange, required, autoComplete, error }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required={required}
          autoComplete={autoComplete}
          className={`input pr-12 ${error ? '!border-red-400 focus:!ring-red-200' : ''}`}
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-navy-300 transition hover:text-navy-700"
        >
          {visible ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {error && <p className="mt-1 text-xs font-bold text-red-600">{error}</p>}
    </div>
  );
}

export default function Acceso() {
  const { login, register, demo } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ email: '', password: '', password2: '', nombre: '', empresa: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const registro = mode === 'register';
  const passCorta = registro && f.password.length > 0 && f.password.length < 8;
  const noCoinciden = registro && f.password2.length > 0 && f.password !== f.password2;
  const registroInvalido = registro && (f.password.length < 8 || f.password !== f.password2);

  async function submit(e) {
    e.preventDefault();
    if (registroInvalido && !demo) return;
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

  function cambiarModo() {
    setMode(m => m === 'login' ? 'register' : 'login');
    setMsg(null);
    setF(prev => ({ ...prev, password: '', password2: '' }));
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
          {registro && (
            <>
              <div><label className="label" htmlFor="a-nombre">Nombre</label><input id="a-nombre" required className="input" autoComplete="name" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></div>
              <div><label className="label" htmlFor="a-empresa">Empresa</label><input id="a-empresa" required className="input" autoComplete="organization" value={f.empresa} onChange={e => setF({ ...f, empresa: e.target.value })} /></div>
            </>
          )}
          <div><label className="label" htmlFor="a-email">Email</label><input id="a-email" type="email" required className="input" autoComplete="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
          <CampoPassword
            id="a-pass"
            label="Contraseña"
            value={f.password}
            onChange={e => setF({ ...f, password: e.target.value })}
            required={!demo}
            autoComplete={registro ? 'new-password' : 'current-password'}
            error={passCorta ? 'Mínimo 8 caracteres.' : null}
          />
          {registro && (
            <CampoPassword
              id="a-pass2"
              label="Confirmar contraseña"
              value={f.password2}
              onChange={e => setF({ ...f, password2: e.target.value })}
              required={!demo}
              autoComplete="new-password"
              error={noCoinciden ? 'Las contraseñas no coinciden.' : null}
            />
          )}
          {msg && <p className={`text-sm font-bold ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
          <button disabled={busy || (registroInvalido && !demo)} className="btn-primary w-full">
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>
        <button onClick={cambiarModo}
          className="mt-4 w-full text-center text-sm font-bold text-brand-orangeDark hover:underline">
          {mode === 'login' ? '¿Aún no tienes cuenta? Crear cuenta de cliente' : '¿Ya tienes cuenta? Entrar'}
        </button>
      </div>
    </div>
  );
}
