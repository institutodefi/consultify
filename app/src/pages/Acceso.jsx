import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { validarPassword, mensajePassword } from '../lib/password.js';

function CampoPassword({ id, label, value, onChange, required, autoComplete, error }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input id={id} type={visible ? 'text' : 'password'} required={required} autoComplete={autoComplete}
          className={`input pr-12 ${error ? '!border-red-400 focus:!ring-red-200' : ''}`} value={value} onChange={onChange} />
        <button type="button" onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-navy-300 transition hover:text-navy-700">
          {visible ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {error && <p className="mt-1 text-xs font-bold text-red-600">{error}</p>}
    </div>
  );
}

// Tarjeta de acceso reutilizable (consultores | clientes)
function PanelAcceso({ acento, titulo, subtitulo, icono, children, footer }) {
  const ring = acento === 'navy' ? 'border-navy-800/15' : 'border-brand-orange/30';
  const head = acento === 'navy' ? 'text-navy-900' : 'text-brand-orangeDark';
  const chip = acento === 'navy' ? 'bg-navy-800 text-white' : 'bg-brand-orange text-navy-900';
  return (
    <div className={`card flex flex-col border ${ring}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${chip}`}>{icono}</span>
        <div>
          <h2 className={`text-lg font-extrabold ${head}`}>{titulo}</h2>
          <p className="text-xs font-semibold text-navy-400">{subtitulo}</p>
        </div>
      </div>
      {children}
      {footer}
    </div>
  );
}

export default function Acceso() {
  const { login, register, demo } = useAuth();
  const nav = useNavigate();

  // Estado consultores (solo login)
  const [c, setC] = useState({ email: '', password: '' });
  const [cMsg, setCMsg] = useState(null);
  const [cBusy, setCBusy] = useState(false);

  // Estado clientes (login + registro)
  const [modo, setModo] = useState('login');
  const [k, setK] = useState({ email: '', password: '', password2: '', nombre: '', empresa: '' });
  const [kMsg, setKMsg] = useState(null);
  const [kBusy, setKBusy] = useState(false);

  const registro = modo === 'register';
  const pwVal = validarPassword(k.password);
  const passCorta = registro && k.password.length > 0 && !pwVal.ok;
  const noCoinciden = registro && k.password2.length > 0 && k.password !== k.password2;
  const registroInvalido = registro && (!pwVal.ok || k.password !== k.password2);

  const ROLES_EQUIPO = ['director', 'consultor', 'admin', 'superadmin', 'gestion'];

  async function loginConsultor(e) {
    e.preventDefault(); setCBusy(true); setCMsg(null);
    try {
      const { role } = await login(c.email, c.password);
      if (ROLES_EQUIPO.includes(role)) nav('/consultores');
      else { setCMsg('Esta cuenta no es de equipo. Usa el acceso de clientes.'); }
    } catch (err) {
      setCMsg(err.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : (err.message || 'No se pudo entrar.'));
    } finally { setCBusy(false); }
  }

  async function submitCliente(e) {
    e.preventDefault();
    if (registroInvalido && !demo) return;
    setKBusy(true); setKMsg(null);
    try {
      if (modo === 'login') {
        const { role } = await login(k.email, k.password);
        nav(ROLES_EQUIPO.includes(role) ? '/consultores' : '/clientes');
      } else {
        const r = await register(k.email, k.password, k.nombre, k.empresa);
        if (r.needsConfirm) setKMsg({ ok: true, text: 'Cuenta creada. Revisa tu email para confirmar el acceso.' });
        else nav('/clientes');
      }
    } catch (err) {
      setKMsg({ ok: false, text: err.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : (err.message || 'No se pudo completar.') });
    } finally { setKBusy(false); }
  }

  const iconoConsultor = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  );
  const iconoCliente = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8 text-center">
        <img src="/app/orbita-horizontal.png" alt="Órbita" className="mx-auto mb-3 h-14 w-auto" />
        <h1 className="font-orbita text-2xl font-extrabold text-navy-900">El ecosistema digital de TuConsultor</h1>
        <p className="mt-1 text-sm font-medium text-navy-400">Elige tu tipo de acceso.</p>
        {demo && (
          <p className="mx-auto mt-3 max-w-xl rounded-xl bg-brand-orange/10 p-3 text-xs font-semibold text-brand-orangeDark">
            Modo demo (sin Supabase): cualquier email entra. Usa un email con «consultify» para la zona de consultores.
          </p>
        )}
      </div>

      <div className="grid items-start gap-6 md:grid-cols-2">
        {/* ─── CONSULTORES ─── */}
        <PanelAcceso acento="navy" titulo="Consultores" subtitulo="Equipo y administración" icono={iconoConsultor}
          footer={<p className="mt-4 text-center text-xs font-medium text-navy-300">¿Sin cuenta de consultor? La crea un administrador desde la zona de equipo.</p>}>
          <form onSubmit={loginConsultor} className="space-y-4">
            <div><label className="label" htmlFor="c-email">Email corporativo</label><input id="c-email" type="email" required className="input" autoComplete="email" value={c.email} onChange={e => setC({ ...c, email: e.target.value })} /></div>
            <CampoPassword id="c-pass" label="Contraseña" value={c.password} onChange={e => setC({ ...c, password: e.target.value })} required={!demo} autoComplete="current-password" />
            {cMsg && <p className="text-sm font-bold text-red-600">{cMsg}</p>}
            <button disabled={cBusy} className="btn-primary w-full">{cBusy ? 'Un momento…' : 'Entrar como consultor'}</button>
          </form>
        </PanelAcceso>

        {/* ─── CLIENTES ─── */}
        <PanelAcceso acento="orange" titulo="Clientes" subtitulo={registro ? 'Crear cuenta para seguir tus servicios' : 'Seguimiento de servicios y presupuestos'} icono={iconoCliente}
          footer={
            <button onClick={() => { setModo(m => m === 'login' ? 'register' : 'login'); setKMsg(null); setK(p => ({ ...p, password: '', password2: '' })); }}
              className="mt-4 w-full text-center text-sm font-bold text-brand-orangeDark hover:underline">
              {registro ? '¿Ya tienes cuenta? Entrar' : '¿Aún no tienes cuenta? Crear cuenta de cliente'}
            </button>
          }>
          <form onSubmit={submitCliente} className="space-y-4">
            {registro && (
              <>
                <div><label className="label" htmlFor="k-nombre">Nombre</label><input id="k-nombre" required className="input" autoComplete="name" value={k.nombre} onChange={e => setK({ ...k, nombre: e.target.value })} /></div>
                <div><label className="label" htmlFor="k-empresa">Empresa</label><input id="k-empresa" required className="input" autoComplete="organization" value={k.empresa} onChange={e => setK({ ...k, empresa: e.target.value })} /></div>
              </>
            )}
            <div><label className="label" htmlFor="k-email">Email</label><input id="k-email" type="email" required className="input" autoComplete="email" value={k.email} onChange={e => setK({ ...k, email: e.target.value })} /></div>
            <CampoPassword id="k-pass" label="Contraseña" value={k.password} onChange={e => setK({ ...k, password: e.target.value })} required={!demo} autoComplete={registro ? 'new-password' : 'current-password'} error={passCorta ? mensajePassword(k.password) : null} />
            {registro && <CampoPassword id="k-pass2" label="Confirmar contraseña" value={k.password2} onChange={e => setK({ ...k, password2: e.target.value })} required={!demo} autoComplete="new-password" error={noCoinciden ? 'Las contraseñas no coinciden.' : null} />}
            {kMsg && <p className={`text-sm font-bold ${kMsg.ok ? 'text-green-700' : 'text-red-600'}`}>{kMsg.text}</p>}
            <button disabled={kBusy || (registroInvalido && !demo)} className="btn-orange w-full">{kBusy ? 'Un momento…' : registro ? 'Crear cuenta' : 'Entrar como cliente'}</button>
          </form>
        </PanelAcceso>
      </div>
    </div>
  );
}
