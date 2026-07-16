import { useEffect, useState, useCallback, useMemo } from 'react';
import { listTable, insertRow, updateRow, deleteRow, brevoFn } from '../../lib/data.js';
import { useAuth } from '../../lib/auth.jsx';

const VACIO = { nombre: '', apellidos: '', cargo: '', email: '', telefono: '', consentimiento_marketing: false };

export default function Contactos() {
  const { role, demo } = useAuth();
  const puedeEditar = ['superadmin', 'admin', 'director', 'gestion'].includes(role);
  const puedeBorrar = ['superadmin', 'admin'].includes(role);
  const [contactos, setContactos] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [vinculos, setVinculos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todos'); // todos | consent | sin_email
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [sync, setSync] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [c, e, v] = await Promise.all([
        listTable('contactos').catch(() => []),
        listTable('empresas').catch(() => []),
        listTable('empresa_contactos').catch(() => []),
      ]);
      c.sort((a, b) => `${a.nombre} ${a.apellidos || ''}`.localeCompare(`${b.nombre} ${b.apellidos || ''}`));
      setContactos(c); setEmpresas(e || []); setVinculos(v || []);
    } catch { setContactos([]); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return contactos.filter(c => {
      if (filtro === 'consent' && !c.consentimiento_marketing) return false;
      if (filtro === 'sin_email' && c.email) return false;
      if (!t) return true;
      return [c.nombre, c.apellidos, c.email, c.telefono].filter(Boolean).join(' ').toLowerCase().includes(t);
    });
  }, [contactos, q, filtro]);

  const contacto = sel ? contactos.find(c => c.id === sel) : null;
  const empresasDe = (cid) => vinculos.filter(v => String(v.contacto_id) === String(cid)).map(v => ({ vinc: v, e: empresas.find(e => String(e.id) === String(v.empresa_id)) })).filter(x => x.e);

  async function guardar() {
    if (!form.nombre?.trim()) { setMsg({ err: true, t: 'El nombre es obligatorio.' }); return; }
    try {
      const payload = {
        nombre: form.nombre.trim(), apellidos: form.apellidos?.trim() || null, cargo: form.cargo || null,
        email: form.email?.trim() || null, telefono: form.telefono?.trim() || null,
        consentimiento_marketing: !!form.consentimiento_marketing,
      };
      // Al marcar consentimiento por primera vez, registrar la fecha
      if (form.consentimiento_marketing && !form._teniaConsent) payload.consentimiento_fecha = new Date().toISOString();
      if (form.id) await updateRow('contactos', form.id, payload);
      else { const n = await insertRow('contactos', payload); if (n?.id) setSel(n.id); }
      setForm(null); setMsg({ t: 'Contacto guardado.' }); cargar();
    } catch (e) { setMsg({ err: true, t: 'No se pudo guardar: ' + (e.message || '') }); }
  }
  async function borrar(c) {
    if (!window.confirm(`¿Eliminar el contacto "${c.nombre} ${c.apellidos || ''}"? Se quitará de todas sus empresas.`)) return;
    try { await deleteRow('contactos', c.id); setSel(null); setForm(null); cargar(); }
    catch { setMsg({ err: true, t: 'No se pudo eliminar.' }); }
  }

  // Sincronizar a Brevo SOLO si tiene email y consentimiento
  // Sincroniza en bloque los contactos con email Y consentimiento (uno a uno).
  async function sincronizarTodos() {
    const elegibles = contactos.filter(c => c.email && c.consentimiento_marketing);
    if (elegibles.length === 0) { setMsg({ err: true, t: 'No hay contactos con email y consentimiento para enviar.' }); return; }
    if (!window.confirm(`Se enviarán ${elegibles.length} contacto(s) a Brevo (los que tienen email y consentimiento). ¿Continuar?`)) return;
    setSync(true); setMsg(null);
    let ok = 0, err = 0;
    for (const c of elegibles) {
      try {
        const emps = empresasDe(c.id);
        const ppal = (emps.find(x => x.vinc.principal) || emps[0])?.e;
        const r = await brevoFn({ action: 'sincronizar_cliente', cliente: {
          email: c.email, contacto: c.nombre, contacto_apellidos: c.apellidos,
          empresa: ppal?.nombre || '', cif: ppal?.cif || '',
        } });
        if (r?.ok) { ok++; await updateRow('contactos', c.id, { brevo_sincronizado_en: new Date().toISOString() }); }
        else err++;
      } catch { err++; }
    }
    setMsg({ t: `✓ ${ok} contacto(s) enviados a Brevo${err ? ` · ${err} con error` : ''}. Recibirán el email de confirmación (doble opt-in).` });
    setSync(false); cargar();
  }

  async function sincronizarBrevo(c) {
    if (!c.email) { setMsg({ err: true, t: 'El contacto no tiene email.' }); return; }
    if (!c.consentimiento_marketing) { setMsg({ err: true, t: 'El contacto no ha dado consentimiento de marketing (RGPD).' }); return; }
    setSync(true); setMsg(null);
    try {
      // Empresa principal (o la primera) del contacto, para segmentar en Brevo.
      const emps = empresasDe(c.id);
      const ppal = (emps.find(x => x.vinc.principal) || emps[0])?.e;
      const r = await brevoFn({ action: 'sincronizar_cliente', cliente: {
        email: c.email, contacto: c.nombre, contacto_apellidos: c.apellidos,
        empresa: ppal?.nombre || '', cif: ppal?.cif || '',
      } });
      if (r?.ok) {
        await updateRow('contactos', c.id, { brevo_sincronizado_en: new Date().toISOString(), brevo_id: r.id || c.brevo_id });
        setMsg({ t: '✓ Enviado a Brevo (lista de doble opt-in). Recibirá el email de confirmación.' }); cargar();
      } else setMsg({ err: true, t: 'Brevo: ' + (r?.error || 'error desconocido') });
    } catch (e) { setMsg({ err: true, t: 'Error al sincronizar: ' + (e.message || '') }); }
    setSync(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">CRM</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Contactos</h1>
          <p className="mt-1 text-sm font-medium text-navy-400">Personas del CRM. Un contacto puede pertenecer a varias empresas. Solo se envían a Brevo los que tienen email y consentimiento.</p>
        </div>
        {puedeEditar && <div className="flex gap-2">
          <button onClick={sincronizarTodos} disabled={sync} className="rounded-xl border border-navy-200 px-4 py-2 text-sm font-bold text-navy-600 hover:bg-navy-50 disabled:opacity-40" title="Enviar a Brevo todos los contactos con email y consentimiento">{sync ? 'Enviando…' : '✉ Sincronizar todos'}</button>
          <button onClick={() => { setForm({ ...VACIO }); setSel(null); }} className="btn-orange">+ Nuevo contacto</button>
        </div>}
      </div>

      {demo && <div className="rounded-xl bg-brand-orange/10 p-3 text-xs font-semibold text-brand-orangeDark">Modo demo: los cambios no se guardan.</div>}
      {msg && <div className={`rounded-xl p-3 text-sm font-bold ${msg.err ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`} onClick={() => setMsg(null)}>{msg.t}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, email…" className="input max-w-xs !py-2" />
        <div className="flex overflow-hidden rounded-xl border border-navy-200 text-xs font-bold">
          {[['todos', 'Todos'], ['consent', 'Con consentimiento'], ['sin_email', 'Sin email']].map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-2 ${filtro === k ? 'bg-navy-900 text-white' : 'text-navy-500'}`}>{l}</button>
          ))}
        </div>
        <span className="text-xs font-semibold text-navy-300">{lista.length} contacto(s)</span>
      </div>

      {cargando ? <p className="py-10 text-center text-navy-400">Cargando…</p> : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          {/* Listado */}
          <div className="card overflow-hidden p-0">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {lista.length === 0 && <tr><td className="px-5 py-8 text-center text-navy-300">Sin contactos. {contactos.length === 0 && '¿Has ejecutado la migración v48?'}</td></tr>}
                  {lista.map(c => (
                    <tr key={c.id} onClick={() => { setSel(c.id); setForm(null); }}
                      className={`cursor-pointer border-b border-navy-50 last:border-0 ${sel === c.id ? 'bg-brand-orange/10' : 'hover:bg-navy-50/60'}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 font-bold text-navy-900">{c.nombre} {c.apellidos || ''}
                          {c.consentimiento_marketing && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-700">RGPD</span>}
                        </div>
                        <div className="text-xs text-navy-400">{c.email || 'sin email'} · {empresasDe(c.id).length} empresa(s)</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalle / formulario */}
          <div>
            {form ? (
              <div className="card space-y-3">
                <h3 className="text-lg font-extrabold">{form.id ? 'Editar contacto' : 'Nuevo contacto'}</h3>
                <div className="flex gap-2">
                  <label className="block flex-1 text-xs font-bold uppercase text-navy-400">Nombre*
                    <input className="input !mt-1" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></label>
                  <label className="block flex-1 text-xs font-bold uppercase text-navy-400">Apellidos
                    <input className="input !mt-1" value={form.apellidos || ''} onChange={e => setForm({ ...form, apellidos: e.target.value })} /></label>
                </div>
                <label className="block text-xs font-bold uppercase text-navy-400">Cargo
                  <input className="input !mt-1" value={form.cargo || ''} onChange={e => setForm({ ...form, cargo: e.target.value })} /></label>
                <div className="flex gap-2">
                  <label className="block flex-1 text-xs font-bold uppercase text-navy-400">Email
                    <input className="input !mt-1" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
                  <label className="block flex-1 text-xs font-bold uppercase text-navy-400">Teléfono
                    <input className="input !mt-1" value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} /></label>
                </div>
                <label className="flex items-start gap-2 rounded-xl bg-navy-50/60 p-3 text-sm font-semibold text-navy-700">
                  <input type="checkbox" className="mt-0.5" checked={!!form.consentimiento_marketing} onChange={e => setForm({ ...form, consentimiento_marketing: e.target.checked, _teniaConsent: form.consentimiento_marketing })} />
                  <span>Ha dado su <strong>consentimiento</strong> para recibir comunicaciones comerciales (RGPD). Necesario para enviarlo a Brevo.</span>
                </label>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setForm(null)} className="rounded-xl border border-navy-200 px-4 py-2 text-sm font-bold text-navy-500">Cancelar</button>
                  <button onClick={guardar} className="btn-orange !px-4 !py-2">Guardar</button>
                </div>
              </div>
            ) : contacto ? (
              <div className="card space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-extrabold text-navy-900">{contacto.nombre} {contacto.apellidos || ''}</h3>
                    {contacto.cargo && <p className="text-sm font-semibold text-navy-500">{contacto.cargo}</p>}
                    <p className="text-sm text-navy-400">{[contacto.email, contacto.telefono].filter(Boolean).join(' · ') || 'sin datos de contacto'}</p>
                    <div className="mt-1.5 flex gap-2">
                      {contacto.consentimiento_marketing
                        ? <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">✓ Consentimiento RGPD</span>
                        : <span className="rounded bg-navy-100 px-2 py-0.5 text-[10px] font-bold uppercase text-navy-500">Sin consentimiento</span>}
                      {contacto.brevo_sincronizado_en && <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">En Brevo</span>}
                    </div>
                  </div>
                  {puedeEditar && <div className="flex gap-2">
                    <button onClick={() => setForm({ ...contacto, _teniaConsent: contacto.consentimiento_marketing })} className="rounded-lg border border-navy-200 px-3 py-1.5 text-xs font-bold text-navy-600">✎ Editar</button>
                    {puedeBorrar && <button onClick={() => borrar(contacto)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-500">🗑</button>}
                  </div>}
                </div>

                {/* Enviar a Brevo */}
                {puedeEditar && (
                  <div className="rounded-xl border border-navy-100 p-3">
                    <button onClick={() => sincronizarBrevo(contacto)} disabled={sync || !contacto.email || !contacto.consentimiento_marketing}
                      className="btn-orange !px-4 !py-2 disabled:opacity-40">{sync ? 'Enviando…' : '✉ Enviar a Brevo (doble opt-in)'}</button>
                    {(!contacto.email || !contacto.consentimiento_marketing) && (
                      <p className="mt-2 text-xs font-semibold text-navy-400">
                        {!contacto.email ? 'Necesita un email. ' : ''}{!contacto.consentimiento_marketing ? 'Necesita marcar el consentimiento RGPD.' : ''}
                      </p>
                    )}
                  </div>
                )}

                {/* Empresas del contacto */}
                <div>
                  <h4 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-navy-500">Empresas ({empresasDe(contacto.id).length})</h4>
                  <div className="space-y-2">
                    {empresasDe(contacto.id).length === 0 && <p className="text-sm text-navy-300">No está vinculado a ninguna empresa. Ve a «Empresas» para vincularlo.</p>}
                    {empresasDe(contacto.id).map(({ vinc, e }) => (
                      <div key={vinc.id} className="flex items-center gap-2 rounded-xl border border-navy-100 p-2.5">
                        <div className="flex-1">
                          <span className="font-bold text-navy-900">{e.nombre}</span>
                          <span className="ml-2 text-xs text-navy-400">{e.cif || 'sin CIF'}</span>
                        </div>
                        {vinc.principal && <span className="rounded bg-brand-orange/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-orangeDark">Principal</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card flex h-full items-center justify-center py-16 text-center text-sm text-navy-300">
                Selecciona un contacto para ver su ficha y sus empresas.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
