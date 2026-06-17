import { useEffect, useMemo, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { NORMAS, NORMA_BY_ID } from '../../lib/calcEngine.js';

const VACIO = { codigo: '', empresa: '', contacto: '', email: '', telefono: '', director_proyecto_id: '', jefe_cuenta_id: '' };

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [normasEmp, setNormasEmp] = useState([]);
  const [equipo, setEquipo] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [contactos, setContactos] = useState([]);
  const [sel, setSel] = useState('');
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);

  const cargar = () => {
    listTable('clientes').then(setClientes);
    listTable('cliente_empresas').then(setEmpresas);
    listTable('empresa_centros').then(setCentros);
    listTable('empresa_normas').then(setNormasEmp);
    listTable('consultores').then(setEquipo).catch(() => {});
    listTable('proyectos_cliente').then(setProyectos).catch(() => setProyectos([]));
    listTable('cliente_contactos').then(setContactos).catch(() => setContactos([]));
  };
  useEffect(cargar, []);

  const cliente = useMemo(() => clientes.find(c => String(c.id) === String(sel)) || null, [clientes, sel]);
  const emps = useMemo(() => empresas.filter(e => String(e.cliente_id) === String(sel)), [empresas, sel]);
  const proyectosCliente = useMemo(() => proyectos.filter(p => String(p.cliente_id) === String(sel)), [proyectos, sel]);
  const contactosCliente = useMemo(() => contactos.filter(c => String(c.cliente_id) === String(sel)), [contactos, sel]);

  async function addContacto() {
    if (!cliente?.id) return;
    await insertRow('cliente_contactos', { cliente_id: cliente.id, nombre: '', cargo: '', email: '', telefono: '', principal: contactosCliente.length === 0 });
    cargar();
  }
  async function editarContacto(ct, campos) {
    await updateRow('cliente_contactos', ct.id, campos);
    setContactos(cs => cs.map(c => c.id === ct.id ? { ...c, ...campos } : c));
  }
  async function marcarPrincipal(ct) {
    // Solo uno principal por cliente.
    for (const c of contactosCliente) {
      if (c.id === ct.id && !c.principal) await updateRow('cliente_contactos', c.id, { principal: true });
      else if (c.id !== ct.id && c.principal) await updateRow('cliente_contactos', c.id, { principal: false });
    }
    cargar();
  }
  async function quitarContacto(id) { await deleteRow('cliente_contactos', id); cargar(); }
  const normasCliente = useMemo(() => [...new Set(
    emps.flatMap(e => normasEmp.filter(n => String(n.empresa_id) === String(e.id)).map(n => n.norma_id))
  )], [emps, normasEmp]);

  async function guardarCliente(e) {
    e.preventDefault(); setMsg(null);
    try {
      const datos = { codigo: form.codigo, empresa: form.empresa, contacto: form.contacto, email: form.email, telefono: form.telefono, director_proyecto_id: form.director_proyecto_id || null, jefe_cuenta_id: form.jefe_cuenta_id || null };
      if (form.id) await updateRow('clientes', form.id, datos);
      else { const nuevo = await insertRow('clientes', datos); if (nuevo?.id) setSel(nuevo.id); }
      setForm(null); cargar();
    } catch (err) { setMsg(err.message); }
  }

  async function addEmpresa() {
    if (!cliente) return;
    await insertRow('cliente_empresas', { cliente_id: cliente.id, cif: '', razon_social: '' });
    cargar();
  }
  async function editarEmpresa(emp, campos) {
    await updateRow('cliente_empresas', emp.id, campos);
    setEmpresas(es => es.map(e => e.id === emp.id ? { ...e, ...campos } : e));
  }
  async function addCentro(empresaId) {
    await insertRow('empresa_centros', { empresa_id: empresaId, nombre: '', direccion: '', trabajadores: 0 });
    cargar();
  }
  async function editarCentro(ct, campos) {
    await updateRow('empresa_centros', ct.id, campos);
    setCentros(cs => cs.map(c => c.id === ct.id ? { ...c, ...campos } : c));
  }

  async function toggleNorma(empresaId, normaId) {
    const existente = normasEmp.find(n => String(n.empresa_id) === String(empresaId) && n.norma_id === normaId);
    if (existente) await deleteRow('empresa_normas', existente.id);
    else await insertRow('empresa_normas', { empresa_id: empresaId, norma_id: normaId, alcance: '' });
    cargar();
  }
  async function editarNorma(reg, campos) {
    await updateRow('empresa_normas', reg.id, campos);
    setNormasEmp(ns => ns.map(n => n.id === reg.id ? { ...n, ...campos } : n));
  }
  async function copiarAlcance(reg) {
    const mismaEmpresa = normasEmp.filter(n => String(n.empresa_id) === String(reg.empresa_id) && n.id !== reg.id && !n.alcance);
    for (const n of mismaEmpresa) await updateRow('empresa_normas', n.id, { alcance: reg.alcance });
    const emp = empresas.find(e => String(e.id) === String(reg.empresa_id));
    const hermanas = empresas.filter(e => String(e.cliente_id) === String(emp?.cliente_id) && e.id !== emp?.id);
    if (hermanas.length && confirm(`Alcance copiado a las normas sin alcance de ${emp?.cif}. ¿Copiarlo también a las otras ${hermanas.length} empresa(s) del cliente?`)) {
      for (const h of hermanas) {
        const coincidentes = normasEmp.filter(n => String(n.empresa_id) === String(h.id) && !n.alcance);
        for (const n of coincidentes) await updateRow('empresa_normas', n.id, { alcance: reg.alcance });
      }
    }
    cargar();
  }

  const totalTrabajadores = useMemo(() => {
    const ids = new Set(emps.map(e => String(e.id)));
    return centros.filter(c => ids.has(String(c.empresa_id))).reduce((a, c) => a + (Number(c.trabajadores) || 0), 0);
  }, [emps, centros]);

  return (
    <div className="space-y-6">
      {/* Selector de cliente */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[260px] flex-1">
            <label className="label" htmlFor="sel-cliente">Cliente</label>
            <select id="sel-cliente" className="input" value={sel} onChange={e => { setSel(e.target.value); setForm(null); }}>
              <option value="">— Selecciona un cliente —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} · ` : ''}{c.empresa}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setForm({ ...VACIO })} className="btn-orange !px-4 !py-2">+ Nuevo cliente</button>
            {cliente && <button onClick={() => setForm({ ...VACIO, ...cliente })} className="btn-ghost !px-4 !py-2">Editar datos</button>}
          </div>
        </div>
      </div>

      {/* Alta / edición */}
      {form && (
        <form onSubmit={guardarCliente} className="card">
          <h3 className="font-extrabold">{form.id ? `Editar · ${form.empresa}` : 'Nuevo cliente'}</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <div><label className="label">ID de cliente</label><input className="input" placeholder="CL-0001" value={form.codigo || ''} onChange={e => setForm({ ...form, codigo: e.target.value })} /></div>
            <div><label className="label">Nombre comercial</label><input required className="input" value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} /></div>
            <div><label className="label">Contacto</label><input className="input" value={form.contacto || ''} onChange={e => setForm({ ...form, contacto: e.target.value })} /></div>
            <div><label className="label">Email</label><input type="email" className="input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label">Teléfono</label><input className="input" value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
            <div><label className="label">Director de Proyecto</label>
              <select className="input" value={form.director_proyecto_id || ''} onChange={e => setForm({ ...form, director_proyecto_id: e.target.value })}>
                <option value="">Sin asignar</option>
                {equipo.filter(c => (c.tipo_equipo || 'consultor') === 'consultor' && c.activo !== false).map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''}</option>)}
              </select>
            </div>
            <div><label className="label">Jefe de Cuenta</label>
              <select className="input" value={form.jefe_cuenta_id || ''} onChange={e => setForm({ ...form, jefe_cuenta_id: e.target.value })}>
                <option value="">Sin asignar</option>
                {equipo.filter(c => c.tipo_equipo === 'gestion' && c.subtipo === 'comercial' && c.activo !== false).map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button className="btn-primary">{form.id ? 'Guardar cambios' : 'Crear cliente'}</button>
            <button type="button" onClick={() => setForm(null)} className="btn-ghost">Cancelar</button>
            {msg && <p className="text-sm font-bold text-red-600">{msg}</p>}
          </div>
        </form>
      )}

      {!cliente && !form && (
        <p className="card text-sm font-medium text-navy-400">Selecciona un cliente en el desplegable para ver sus CIF, centros y todas las tareas del proyecto.</p>
      )}

      {/* Detalle del cliente */}
      {cliente && (
        <>
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="chip bg-navy-800 text-white">{cliente.codigo || 'sin ID'}</span>
                <div>
                  <p className="text-lg font-extrabold">{cliente.empresa}</p>
                  <p className="text-xs font-medium text-navy-400">{[cliente.contacto, cliente.email, cliente.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</p>
                </div>
              </div>
              <div className="text-right text-xs font-medium text-navy-400">
                <p>{emps.length} CIF · {normasCliente.length} norma{normasCliente.length !== 1 ? 's' : ''}</p>
                <p>{totalTrabajadores} trabajador{totalTrabajadores !== 1 ? 'es' : ''} en plantilla</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold">Empresas y centros de trabajo</h4>
              <button onClick={addEmpresa} className="btn-orange !px-4 !py-2">+ Añadir CIF</button>
            </div>
            <p className="mt-1 text-sm font-medium text-navy-400">Cada empresa (CIF y razón social) y, dentro, sus centros con dirección y nº de trabajadores.</p>
            {emps.length === 0 && <p className="mt-4 text-sm font-medium text-navy-300">Aún no hay empresas. Añade el primer CIF.</p>}

            <div className="mt-4 space-y-4">
              {emps.map((emp, ei) => {
                const cts = centros.filter(x => String(x.empresa_id) === String(emp.id));
                const nrs = normasEmp.filter(x => String(x.empresa_id) === String(emp.id));
                return (
                  <div key={emp.id} className="rounded-2xl border border-navy-100 bg-navy-50/30 p-4">
                    <div className="flex items-center justify-between">
                      <span className="chip bg-brand-orange/15 font-bold text-brand-orangeDark">Empresa {ei + 1}</span>
                      <button onClick={async () => { if (confirm(`¿Eliminar ${emp.cif || 'esta empresa'} con sus centros y normas?`)) { await deleteRow('cliente_empresas', emp.id); cargar(); } }}
                        className="text-xs font-bold text-red-500 hover:underline">Eliminar empresa</button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div><label className="label">Razón social</label><input className="input" value={emp.razon_social || ''} onChange={e => editarEmpresa(emp, { razon_social: e.target.value })} /></div>
                      <div><label className="label">CIF</label><input className="input" value={emp.cif || ''} onChange={e => editarEmpresa(emp, { cif: e.target.value.toUpperCase() })} /></div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center gap-2">
                        <p className="label !mb-0">Centros de trabajo</p>
                        <button onClick={() => addCentro(emp.id)} className="chip border border-brand-orange bg-brand-orange/10 font-bold text-brand-orangeDark hover:bg-brand-orange/20">+ centro</button>
                      </div>
                      {cts.length === 0 && <p className="mt-2 text-xs font-medium text-navy-300">Sin centros aún.</p>}
                      <div className="mt-2 space-y-2">
                        {cts.map((ct, ci) => (
                          <div key={ct.id} className="rounded-xl border border-navy-100 bg-white p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-navy-400">Centro {ci + 1}</span>
                              <button onClick={async () => { await deleteRow('empresa_centros', ct.id); cargar(); }} className="text-xs font-bold text-red-500 hover:underline">Eliminar</button>
                            </div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr]">
                              <div><label className="label">Nombre / referencia</label><input className="input !py-1.5" value={ct.nombre || ''} onChange={e => editarCentro(ct, { nombre: e.target.value })} /></div>
                              <div><label className="label">Nº trabajadores</label><input type="number" min="0" className="input !py-1.5" value={ct.trabajadores ?? ''} onChange={e => editarCentro(ct, { trabajadores: parseInt(e.target.value) || 0 })} /></div>
                            </div>
                            <div className="mt-2"><label className="label">Dirección</label><input className="input !py-1.5" placeholder="Calle, nº, CP, localidad" value={ct.direccion || ''} onChange={e => editarCentro(ct, { direccion: e.target.value })} /></div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="label">Normas de esta empresa</p>
                      <div className="flex flex-wrap gap-2">
                        {NORMAS.map(n => {
                          const on = nrs.some(x => x.norma_id === n.id);
                          return (
                            <button key={n.id} onClick={() => toggleNorma(emp.id, n.id)}
                              className={`chip border transition ${on ? 'border-brand-orange bg-brand-orange/15 text-navy-900' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'}`}>
                              {n.nombre}
                            </button>
                          );
                        })}
                      </div>
                      {nrs.length > 0 && (
                        <div className="mt-3 space-y-3">
                          {nrs.map(reg => (
                            <div key={reg.id} className="rounded-xl border border-navy-100 bg-white p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="chip w-24 justify-center bg-navy-50 text-navy-600">{NORMA_BY_ID[reg.norma_id]?.nombre || reg.norma_id}</span>
                                <input className="input !w-auto flex-1 min-w-[220px] !py-1.5" placeholder="Alcance de la certificación…"
                                  value={reg.alcance || ''} onChange={e => editarNorma(reg, { alcance: e.target.value })} />
                                <button onClick={() => copiarAlcance(reg)} disabled={!reg.alcance}
                                  title="Copiar este alcance a las demás normas con alcance vacío"
                                  className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40">⧉ Copiar</button>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <label className="text-xs font-bold text-navy-300">Responsable</label>
                                <select className="input !w-auto !py-1 !text-xs" value={reg.responsable_id || ''}
                                  onChange={e => editarNorma(reg, { responsable_id: e.target.value || null })}>
                                  <option value="">—</option>
                                  {equipo.filter(x => (x.tipo_equipo || 'consultor') === 'consultor').map(x =>
                                    <option key={x.id} value={x.id}>{x.nombre} {x.apellidos || ''}</option>)}
                                </select>
                                <label className="text-xs font-bold text-navy-300">Auditoría ext.</label>
                                <input type="date" className="input !w-auto !py-1 !text-xs" value={reg.fecha_auditoria || ''}
                                  onChange={e => editarNorma(reg, { fecha_auditoria: e.target.value || null })} />
                                <label className="text-xs font-bold text-navy-300">Caduca</label>
                                <input type="date" className="input !w-auto !py-1 !text-xs" value={reg.fecha_caducidad || ''}
                                  onChange={e => editarNorma(reg, { fecha_caducidad: e.target.value || null })} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold">Contactos</h4>
              <button onClick={addContacto} className="btn-orange !px-4 !py-2">+ Añadir contacto</button>
            </div>
            {contactosCliente.length === 0 ? (
              <p className="mt-4 text-sm font-medium text-navy-300">Sin contactos. Añade el primero y márcalo como principal.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {contactosCliente.map(ct => (
                  <div key={ct.id} className={`rounded-xl border p-3 ${ct.principal ? 'border-brand-orange bg-brand-orange/5' : 'border-navy-100 bg-white'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => marcarPrincipal(ct)}
                        className={`chip text-[11px] font-bold ${ct.principal ? 'bg-brand-orange text-navy-900' : 'border border-navy-200 bg-white text-navy-400'}`}>
                        {ct.principal ? '★ Principal' : '☆ Marcar principal'}
                      </button>
                      <button onClick={() => quitarContacto(ct.id)} className="text-xs font-bold text-red-500 hover:underline">Eliminar</button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div><label className="label">Nombre</label><input className="input !py-1.5" value={ct.nombre || ''} onChange={e => editarContacto(ct, { nombre: e.target.value })} /></div>
                      <div><label className="label">Cargo</label><input className="input !py-1.5" value={ct.cargo || ''} onChange={e => editarContacto(ct, { cargo: e.target.value })} /></div>
                      <div><label className="label">Email</label><input type="email" className="input !py-1.5" value={ct.email || ''} onChange={e => editarContacto(ct, { email: e.target.value })} /></div>
                      <div><label className="label">Teléfono</label><input className="input !py-1.5" value={ct.telefono || ''} onChange={e => editarContacto(ct, { telefono: e.target.value })} /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold">Proyectos de este cliente</h4>
              <a href="../proyectos" className="btn-ghost !px-4 !py-2 text-sm">Ir a Proyectos →</a>
            </div>
            <p className="mt-1 text-sm font-medium text-navy-400">Los proyectos se crean y configuran en la pestaña Proyectos. Aquí solo se consultan.</p>
            {proyectosCliente.length === 0 ? (
              <p className="mt-4 text-sm font-medium text-navy-300">Aún no hay proyectos. Crea el primero.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {proyectosCliente.map(p => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl border border-navy-100 bg-white px-4 py-3">
                    <div>
                      <p className="font-bold text-navy-800">{p.nombre}</p>
                      <p className="text-xs font-medium text-navy-400">
                        {(p.normas || []).join(', ') || 'sin normas'} · {p.modelo || 'sin modelo'} · <span className={p.estado === 'activo' ? 'text-green-600' : 'text-navy-400'}>{p.estado}</span>
                      </p>
                    </div>
                    <a href={`../proyectos?proyecto=${p.id}`} className="btn-ghost !px-3 !py-1.5 text-xs">Abrir →</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
