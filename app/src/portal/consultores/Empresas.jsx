import { useEffect, useState, useCallback, useMemo } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { useAuth } from '../../lib/auth.jsx';

const VACIA = { nombre: '', cif: '', es_cliente: true, es_proveedor: false, direccion: '', notas: '' };

export default function Empresas() {
  const { role, demo } = useAuth();
  const puedeEditar = ['superadmin', 'admin', 'director', 'gestion'].includes(role);
  const puedeBorrar = ['superadmin', 'admin'].includes(role);
  const [empresas, setEmpresas] = useState([]);
  const [contactos, setContactos] = useState([]);
  const [vinculos, setVinculos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todas'); // todas | cliente | proveedor
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [vinculando, setVinculando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [e, c, v] = await Promise.all([
        listTable('empresas').catch(() => []),
        listTable('contactos').catch(() => []),
        listTable('empresa_contactos').catch(() => []),
      ]);
      e.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      setEmpresas(e); setContactos(c || []); setVinculos(v || []);
    } catch { setEmpresas([]); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const lista = useMemo(() => {
    const term = q.trim().toLowerCase();
    return empresas.filter(e => {
      if (filtro === 'cliente' && !e.es_cliente) return false;
      if (filtro === 'proveedor' && !e.es_proveedor) return false;
      if (!term) return true;
      return [e.nombre, e.cif, e.codigo].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [empresas, q, filtro]);

  const empresa = sel ? empresas.find(e => e.id === sel) : null;
  const contactosDe = (empId) => {
    const ids = vinculos.filter(v => String(v.empresa_id) === String(empId)).map(v => ({ vinc: v, c: contactos.find(c => String(c.id) === String(v.contacto_id)) }));
    return ids.filter(x => x.c);
  };

  async function guardar() {
    if (!form.nombre?.trim()) { setMsg({ err: true, t: 'El nombre es obligatorio.' }); return; }
    try {
      const payload = { nombre: form.nombre.trim(), cif: form.cif?.trim() || null, es_cliente: !!form.es_cliente, es_proveedor: !!form.es_proveedor, direccion: form.direccion || null, notas: form.notas || null };
      if (form.id) await updateRow('empresas', form.id, payload);
      else { const nueva = await insertRow('empresas', payload); if (nueva?.id) setSel(nueva.id); }
      setForm(null); setMsg({ t: 'Empresa guardada.' }); cargar();
    } catch (e) { setMsg({ err: true, t: 'No se pudo guardar: ' + (e.message || '') }); }
  }
  async function borrar(e) {
    if (!window.confirm(`¿Eliminar la empresa "${e.nombre}"? Se desvincularán sus contactos (los contactos NO se borran).`)) return;
    try { await deleteRow('empresas', e.id); setSel(null); setForm(null); cargar(); }
    catch { setMsg({ err: true, t: 'No se pudo eliminar.' }); }
  }

  // Vincular un contacto existente a la empresa
  async function vincularContacto(contactoId) {
    try {
      await insertRow('empresa_contactos', { empresa_id: sel, contacto_id: contactoId, principal: contactosDe(sel).length === 0 });
      setVinculando(false); cargar();
    } catch { setMsg({ err: true, t: 'No se pudo vincular (¿ya estaba?).' }); }
  }
  async function desvincular(vincId) {
    if (!window.confirm('¿Quitar este contacto de la empresa? (el contacto seguirá existiendo)')) return;
    try { await deleteRow('empresa_contactos', vincId); cargar(); }
    catch { setMsg({ err: true, t: 'No se pudo desvincular.' }); }
  }
  async function marcarPrincipal(vinc) {
    try {
      // Quitar principal a los demás de esta empresa y poner a este
      for (const x of contactosDe(sel)) if (x.vinc.principal && x.vinc.id !== vinc.id) await updateRow('empresa_contactos', x.vinc.id, { principal: false });
      await updateRow('empresa_contactos', vinc.id, { principal: true }); cargar();
    } catch { setMsg({ err: true, t: 'No se pudo marcar principal.' }); }
  }

  const tipoBadge = (e) => (
    <span className="inline-flex gap-1">
      {e.es_cliente && <span className="rounded bg-brand-orange/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-orangeDark">Cliente</span>}
      {e.es_proveedor && <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-bold text-navy-600">Proveedor</span>}
      {!e.es_cliente && !e.es_proveedor && <span className="text-[10px] text-navy-300">—</span>}
    </span>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">CRM</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Empresas</h1>
          <p className="mt-1 text-sm font-medium text-navy-400">Clientes y proveedores. Cada empresa agrupa sus contactos por CIF.</p>
        </div>
        {puedeEditar && <button onClick={() => { setForm({ ...VACIA }); setSel(null); }} className="btn-orange">+ Nueva empresa</button>}
      </div>

      {demo && <div className="rounded-xl bg-brand-orange/10 p-3 text-xs font-semibold text-brand-orangeDark">Modo demo: los cambios no se guardan.</div>}
      {msg && <div className={`rounded-xl p-3 text-sm font-bold ${msg.err ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`} onClick={() => setMsg(null)}>{msg.t}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o CIF…" className="input max-w-xs !py-2" />
        <div className="flex overflow-hidden rounded-xl border border-navy-200 text-xs font-bold">
          {[['todas', 'Todas'], ['cliente', 'Clientes'], ['proveedor', 'Proveedores']].map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-2 ${filtro === k ? 'bg-navy-900 text-white' : 'text-navy-500'}`}>{l}</button>
          ))}
        </div>
        <span className="text-xs font-semibold text-navy-300">{lista.length} empresa(s)</span>
      </div>

      {cargando ? <p className="py-10 text-center text-navy-400">Cargando…</p> : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          {/* Listado */}
          <div className="card overflow-hidden p-0">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {lista.length === 0 && <tr><td className="px-5 py-8 text-center text-navy-300">Sin empresas. {empresas.length === 0 && '¿Has ejecutado la migración v48?'}</td></tr>}
                  {lista.map(e => (
                    <tr key={e.id} onClick={() => { setSel(e.id); setForm(null); }}
                      className={`cursor-pointer border-b border-navy-50 last:border-0 ${sel === e.id ? 'bg-brand-orange/10' : 'hover:bg-navy-50/60'}`}>
                      <td className="px-5 py-3">
                        <div className="font-bold text-navy-900">{e.nombre}</div>
                        <div className="text-xs text-navy-400">{e.cif || 'sin CIF'} · {contactosDe(e.id).length} contacto(s)</div>
                      </td>
                      <td className="px-3 py-3 text-right">{tipoBadge(e)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalle / formulario */}
          <div className="space-y-4">
            {form ? (
              <div className="card space-y-3">
                <h3 className="text-lg font-extrabold">{form.id ? 'Editar empresa' : 'Nueva empresa'}</h3>
                <label className="block text-xs font-bold uppercase text-navy-400">Nombre*
                  <input className="input !mt-1" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></label>
                <label className="block text-xs font-bold uppercase text-navy-400">CIF
                  <input className="input !mt-1" value={form.cif} onChange={e => setForm({ ...form, cif: e.target.value })} /></label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!form.es_cliente} onChange={e => setForm({ ...form, es_cliente: e.target.checked })} /> Cliente</label>
                  <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!form.es_proveedor} onChange={e => setForm({ ...form, es_proveedor: e.target.checked })} /> Proveedor</label>
                </div>
                <label className="block text-xs font-bold uppercase text-navy-400">Dirección
                  <input className="input !mt-1" value={form.direccion || ''} onChange={e => setForm({ ...form, direccion: e.target.value })} /></label>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setForm(null)} className="rounded-xl border border-navy-200 px-4 py-2 text-sm font-bold text-navy-500">Cancelar</button>
                  <button onClick={guardar} className="btn-orange !px-4 !py-2">Guardar</button>
                </div>
              </div>
            ) : empresa ? (
              <div className="card space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-extrabold text-navy-900">{empresa.nombre}</h3>
                    <p className="text-sm text-navy-400">{empresa.cif || 'sin CIF'}</p>
                    <div className="mt-1">{tipoBadge(empresa)}</div>
                  </div>
                  {puedeEditar && <div className="flex gap-2">
                    <button onClick={() => setForm({ ...empresa })} className="rounded-lg border border-navy-200 px-3 py-1.5 text-xs font-bold text-navy-600">✎ Editar</button>
                    {puedeBorrar && <button onClick={() => borrar(empresa)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-500">🗑</button>}
                  </div>}
                </div>

                {/* Contactos de esta empresa (por CIF) */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-extrabold uppercase tracking-wide text-navy-500">Contactos ({contactosDe(empresa.id).length})</h4>
                    {puedeEditar && <button onClick={() => setVinculando(v => !v)} className="text-xs font-bold text-brand-orangeDark hover:underline">{vinculando ? 'cerrar' : '+ vincular contacto'}</button>}
                  </div>

                  {vinculando && (
                    <div className="mb-3 rounded-xl border border-navy-100 bg-navy-50/40 p-2">
                      <p className="mb-1 text-xs font-semibold text-navy-400">Elige un contacto para vincular:</p>
                      <div className="max-h-40 overflow-y-auto">
                        {contactos.filter(c => !contactosDe(empresa.id).some(x => String(x.c.id) === String(c.id))).map(c => (
                          <button key={c.id} onClick={() => vincularContacto(c.id)} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white">
                            <span className="font-semibold text-navy-800">{c.nombre} {c.apellidos || ''}</span>
                            {c.email && <span className="ml-2 text-xs text-navy-400">{c.email}</span>}
                          </button>
                        ))}
                        {contactos.length === 0 && <p className="px-2 py-2 text-xs text-navy-300">No hay contactos creados. Ve a «Contactos» para crear alguno.</p>}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {contactosDe(empresa.id).length === 0 && <p className="text-sm text-navy-300">Sin contactos vinculados a este CIF.</p>}
                    {contactosDe(empresa.id).map(({ vinc, c }) => (
                      <div key={vinc.id} className="flex items-center gap-2 rounded-xl border border-navy-100 p-2.5">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-navy-900">{c.nombre} {c.apellidos || ''}</span>
                            {vinc.principal && <span className="rounded bg-brand-orange/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-orangeDark">Principal</span>}
                            {c.consentimiento_marketing && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-700">✓ RGPD</span>}
                          </div>
                          <div className="text-xs text-navy-400">{[c.cargo, c.email, c.telefono].filter(Boolean).join(' · ') || '—'}</div>
                        </div>
                        {puedeEditar && <div className="flex gap-1">
                          {!vinc.principal && <button onClick={() => marcarPrincipal(vinc)} className="text-[10px] font-bold text-navy-400 hover:text-navy-700" title="Marcar principal">★</button>}
                          <button onClick={() => desvincular(vinc.id)} className="text-[11px] text-navy-300 hover:text-red-600" title="Quitar de la empresa">✕</button>
                        </div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card flex h-full items-center justify-center py-16 text-center text-sm text-navy-300">
                Selecciona una empresa para ver sus contactos, o crea una nueva.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
