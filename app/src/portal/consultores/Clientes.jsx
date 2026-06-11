import { useEffect, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { NORMAS, NORMA_BY_ID } from '../../lib/calcEngine.js';

const VACIO = { codigo: '', empresa: '', contacto: '', email: '', telefono: '' };

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [normasEmp, setNormasEmp] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [abierto, setAbierto] = useState(null); // cliente_id expandido
  const [msg, setMsg] = useState(null);

  const cargar = () => {
    listTable('clientes').then(setClientes);
    listTable('cliente_empresas').then(setEmpresas);
    listTable('empresa_centros').then(setCentros);
    listTable('empresa_normas').then(setNormasEmp);
  };
  useEffect(cargar, []);

  async function guardarCliente(e) {
    e.preventDefault(); setMsg(null);
    try {
      const datos = { codigo: form.codigo, empresa: form.empresa, contacto: form.contacto, email: form.email, telefono: form.telefono };
      if (form.id) await updateRow('clientes', form.id, datos);
      else await insertRow('clientes', datos);
      setForm(VACIO); cargar();
    } catch (err) { setMsg(err.message); }
  }

  async function addEmpresa(clienteId) {
    const cif = prompt('CIF de la nueva empresa:');
    if (!cif) return;
    const razon = prompt('Razón social (opcional):') || '';
    await insertRow('cliente_empresas', { cliente_id: clienteId, cif: cif.trim().toUpperCase(), razon_social: razon });
    cargar();
  }

  async function addCentro(empresaId) {
    const nombre = prompt('Nombre del centro de trabajo:');
    if (!nombre) return;
    const direccion = prompt('Dirección (opcional):') || '';
    await insertRow('empresa_centros', { empresa_id: empresaId, nombre, direccion });
    cargar();
  }

  async function toggleNorma(empresaId, normaId) {
    const existente = normasEmp.find(n => String(n.empresa_id) === String(empresaId) && n.norma_id === normaId);
    if (existente) await deleteRow('empresa_normas', existente.id);
    else await insertRow('empresa_normas', { empresa_id: empresaId, norma_id: normaId, alcance: '' });
    cargar();
  }

  async function editarAlcance(reg, texto) {
    await updateRow('empresa_normas', reg.id, { alcance: texto });
    setNormasEmp(ns => ns.map(n => n.id === reg.id ? { ...n, alcance: texto } : n));
  }

  async function copiarAlcance(reg) {
    // Copia el alcance de esta norma al resto de normas de la MISMA empresa que estén vacías,
    // y ofrece extenderlo a las demás empresas del cliente.
    const mismaEmpresa = normasEmp.filter(n => String(n.empresa_id) === String(reg.empresa_id) && n.id !== reg.id && !n.alcance);
    for (const n of mismaEmpresa) await updateRow('empresa_normas', n.id, { alcance: reg.alcance });
    const emp = empresas.find(e => String(e.id) === String(reg.empresa_id));
    const hermanas = empresas.filter(e => String(e.cliente_id) === String(emp?.cliente_id) && e.id !== emp?.id);
    if (hermanas.length && confirm(`Alcance copiado a las normas sin alcance de ${emp?.cif}. ¿Copiarlo también a las otras ${hermanas.length} empresa(s) del cliente (normas coincidentes con alcance vacío)?`)) {
      for (const h of hermanas) {
        const coincidentes = normasEmp.filter(n => String(n.empresa_id) === String(h.id) && !n.alcance);
        for (const n of coincidentes) await updateRow('empresa_normas', n.id, { alcance: reg.alcance });
      }
    }
    cargar();
  }

  return (
    <div className="space-y-6">
      {/* Alta / edición de cliente */}
      <form onSubmit={guardarCliente} className="card">
        <h3 className="font-extrabold">{form.id ? `Editar · ${form.empresa}` : 'Nuevo cliente'}</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div><label className="label" htmlFor="c-codigo">ID de cliente</label><input id="c-codigo" className="input" placeholder="CL-0001" value={form.codigo || ''} onChange={e => setForm({ ...form, codigo: e.target.value })} /></div>
          <div><label className="label" htmlFor="c-empresa">Nombre comercial</label><input id="c-empresa" required className="input" value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} /></div>
          <div><label className="label" htmlFor="c-contacto">Contacto</label><input id="c-contacto" className="input" value={form.contacto || ''} onChange={e => setForm({ ...form, contacto: e.target.value })} /></div>
          <div><label className="label" htmlFor="c-email">Email</label><input id="c-email" type="email" className="input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label" htmlFor="c-tel">Teléfono</label><input id="c-tel" className="input" value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn-primary">{form.id ? 'Guardar cambios' : 'Crear cliente'}</button>
          {form.id && <button type="button" onClick={() => setForm(VACIO)} className="btn-ghost">Cancelar</button>}
          {msg && <p className="text-sm font-bold text-red-600">{msg}</p>}
        </div>
      </form>

      {/* Lista con perfil expandible */}
      {clientes.map(c => {
        const emps = empresas.filter(e => String(e.cliente_id) === String(c.id));
        const open = String(abierto) === String(c.id);
        return (
          <div key={c.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="chip bg-navy-800 text-white">{c.codigo || 'sin ID'}</span>
                <div>
                  <p className="font-extrabold">{c.empresa}</p>
                  <p className="text-xs font-medium text-navy-400">{c.contacto} · {c.email} · {c.telefono}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAbierto(open ? null : c.id)} className="btn-ghost !px-4 !py-2">{open ? 'Cerrar perfil' : `Perfil · ${emps.length} CIF`}</button>
                <button onClick={() => setForm({ ...VACIO, ...c })} className="btn-ghost !px-4 !py-2">Editar</button>
              </div>
            </div>

            {open && (
              <div className="mt-5 space-y-4 border-t border-navy-100 pt-5">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold">Empresas del cliente (CIF)</h4>
                  <button onClick={() => addEmpresa(c.id)} className="btn-orange !px-4 !py-2">+ Añadir CIF</button>
                </div>
                {emps.length === 0 && <p className="text-sm font-medium text-navy-400">Sin empresas todavía. Añade el primer CIF.</p>}
                {emps.map(emp => {
                  const cts = centros.filter(x => String(x.empresa_id) === String(emp.id));
                  const nrs = normasEmp.filter(x => String(x.empresa_id) === String(emp.id));
                  return (
                    <div key={emp.id} className="rounded-2xl border border-navy-100 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-extrabold">{emp.cif} <span className="font-medium text-navy-400">· {emp.razon_social || 'sin razón social'}</span></p>
                        <button onClick={async () => { if (confirm(`¿Eliminar ${emp.cif} con sus centros y normas?`)) { await deleteRow('cliente_empresas', emp.id); cargar(); } }}
                          className="text-xs font-bold text-red-500 hover:underline">Eliminar CIF</button>
                      </div>

                      {/* Centros de trabajo */}
                      <div className="mt-3">
                        <div className="flex items-center gap-2">
                          <p className="label !mb-0">Centros de trabajo</p>
                          <button onClick={() => addCentro(emp.id)} className="chip border border-brand-orange bg-brand-orange/10 font-bold text-brand-orangeDark hover:bg-brand-orange/20">+ centro</button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {cts.length === 0 && <span className="text-xs font-medium text-navy-300">Ninguno</span>}
                          {cts.map(ct => (
                            <span key={ct.id} className="chip border border-navy-200 bg-white text-navy-600">
                              {ct.nombre}{ct.direccion ? ` · ${ct.direccion}` : ''}
                              <button onClick={async () => { await deleteRow('empresa_centros', ct.id); cargar(); }} aria-label={`Eliminar ${ct.nombre}`} className="ml-1 font-bold text-navy-300 hover:text-red-500">×</button>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Normas y alcances */}
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
                          <div className="mt-3 space-y-2">
                            {nrs.map(reg => (
                              <div key={reg.id} className="flex flex-wrap items-center gap-2">
                                <span className="chip w-24 justify-center bg-navy-50 text-navy-600">{NORMA_BY_ID[reg.norma_id]?.nombre || reg.norma_id}</span>
                                <input className="input !w-auto flex-1 min-w-[220px]" placeholder="Alcance de la certificación…"
                                  value={reg.alcance || ''} onChange={e => editarAlcance(reg, e.target.value)} />
                                <button onClick={() => copiarAlcance(reg)} disabled={!reg.alcance}
                                  title="Copiar este alcance a las demás normas (y empresas) con alcance vacío"
                                  className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40">⧉ Copiar alcance</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
