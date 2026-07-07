import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth.jsx';
import { ROL_LABEL } from '../../lib/permisos.js';

// Espacio personal del usuario: editar nombre/apellidos y solicitar el cambio de
// contraseña (por email de restablecimiento).
export default function MisDatos() {
  const { user, role, perfil, actualizarMiPerfil, enviarResetPropio, demo } = useAuth();
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pwMsg, setPwMsg] = useState(null);
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => { setNombre(perfil?.nombre || ''); setApellidos(perfil?.apellidos || ''); }, [perfil]);

  async function guardar(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await actualizarMiPerfil({ nombre: nombre.trim(), apellidos: apellidos.trim() });
    setMsg(r.ok ? { ok: true, t: 'Datos guardados.' } : { ok: false, t: r.error || 'No se pudo guardar.' });
    setBusy(false);
  }

  async function cambiarPassword() {
    setPwBusy(true); setPwMsg(null);
    const r = await enviarResetPropio();
    setPwMsg(r.ok
      ? { ok: true, t: `Te hemos enviado un email a ${user?.email} con el enlace para cambiar tu contraseña.` }
      : { ok: false, t: r.error || 'No se pudo enviar el email.' });
    setPwBusy(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="eyebrow">Mi cuenta</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Mis datos</h1>
        <p className="mt-1 text-sm font-medium text-navy-400">Edita tu información personal y gestiona tu contraseña.</p>
      </div>

      {demo && <div className="rounded-xl bg-brand-orange/10 p-3 text-xs font-semibold text-brand-orangeDark">Modo demo: los cambios no se guardan.</div>}

      {/* Datos personales */}
      <form onSubmit={guardar} className="card space-y-4">
        <h2 className="text-lg font-extrabold text-navy-900">Información personal</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Nombre</label><input className="input" value={nombre} onChange={e => setNombre(e.target.value)} /></div>
          <div><label className="label">Apellidos</label><input className="input" value={apellidos} onChange={e => setApellidos(e.target.value)} /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Email</label>
            <input className="input bg-navy-50/60 text-navy-500" value={user?.email || ''} disabled />
            <p className="mt-1 text-xs text-navy-300">El email no se puede cambiar aquí.</p>
          </div>
          <div>
            <label className="label">Rol</label>
            <input className="input bg-navy-50/60 text-navy-500" value={ROL_LABEL[role] || role || ''} disabled />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button disabled={busy} className="btn-primary">{busy ? 'Guardando…' : 'Guardar cambios'}</button>
          {msg && <p className={`text-sm font-bold ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.t}</p>}
        </div>
      </form>

      {/* Contraseña */}
      <div className="card space-y-3">
        <h2 className="text-lg font-extrabold text-navy-900">Contraseña</h2>
        <p className="text-sm text-navy-500">Por seguridad, el cambio de contraseña se hace por email: recibirás un enlace para elegir una nueva.</p>
        <div className="flex items-center gap-3">
          <button onClick={cambiarPassword} disabled={pwBusy} className="rounded-xl border border-navy-200 px-4 py-2 text-sm font-bold text-navy-600 hover:bg-navy-50 disabled:opacity-40">
            {pwBusy ? 'Enviando…' : 'Enviarme enlace para cambiar contraseña'}
          </button>
          {pwMsg && <p className={`text-sm font-bold ${pwMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{pwMsg.t}</p>}
        </div>
      </div>
    </div>
  );
}
