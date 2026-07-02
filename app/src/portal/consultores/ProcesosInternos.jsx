import { useEffect, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { useAuth } from '../../lib/auth.jsx';

const COLORES = ['#0A2A6C', '#061B45', '#F5A623', '#1E3A8A', '#0e7490', '#7c3aed', '#dc2626', '#16a34a'];

export default function ProcesosInternos() {
  const { role, demo } = useAuth();
  const puedeEditar = ['superadmin', 'admin'].includes(role);
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState(null);
  const [nuevo, setNuevo] = useState({ nombre: '', codigo: '', descripcion: '', color: '#0A2A6C' });
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});

  async function cargar() {
    setCargando(true);
    try {
      const all = await listTable('procesos_internos');
      all.sort((a, b) => (a.orden ?? 100) - (b.orden ?? 100) || (a.nombre || '').localeCompare(b.nombre || ''));
      setItems(all);
    } catch { setItems([]); }
    finally { setCargando(false); }
  }
  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!nuevo.nombre.trim()) { setMsg({ err: true, t: 'El nombre es obligatorio.' }); return; }
    try {
      const orden = (items.reduce((mx, i) => Math.max(mx, i.orden ?? 0), 0)) + 10;
      await insertRow('procesos_internos', { ...nuevo, codigo: nuevo.codigo.trim() || null, activo: true, orden });
      setNuevo({ nombre: '', codigo: '', descripcion: '', color: '#0A2A6C' });
      setMsg({ t: 'Proceso interno creado.' }); cargar();
    } catch (e) { setMsg({ err: true, t: 'No se pudo crear: ' + (e.message || '') }); }
  }

  function empezarEdicion(it) { setEditId(it.id); setEditData({ nombre: it.nombre, codigo: it.codigo || '', descripcion: it.descripcion || '', color: it.color || '#0A2A6C' }); }
  async function guardarEdicion(id) {
    try {
      await updateRow('procesos_internos', id, { ...editData, codigo: editData.codigo?.trim() || null });
      setEditId(null); setMsg({ t: 'Guardado.' }); cargar();
    } catch (e) { setMsg({ err: true, t: 'No se pudo guardar: ' + (e.message || '') }); }
  }
  async function toggleActivo(it) {
    try { await updateRow('procesos_internos', it.id, { activo: !it.activo }); cargar(); }
    catch (e) { setMsg({ err: true, t: 'No se pudo cambiar el estado.' }); }
  }
  async function eliminar(it) {
    if (!window.confirm(`¿Eliminar el proceso interno "${it.nombre}"?`)) return;
    try { await deleteRow('procesos_internos', it.id); setMsg({ t: 'Eliminado.' }); cargar(); }
    catch (e) { setMsg({ err: true, t: 'No se pudo eliminar (¿tiene tareas asociadas?).' }); }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Organización</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Procesos internos</h1>
        <p className="mt-1 text-sm font-medium text-navy-400">Catálogo de trabajo interno (no ligado a clientes). Se usa al crear tareas de tipo «Procesos internos».</p>
      </div>

      {demo && <div className="rounded-xl bg-brand-orange/10 p-3 text-xs font-semibold text-brand-orangeDark">Modo demo: los cambios no se guardan.</div>}
      {msg && <div className={`rounded-xl p-3 text-sm font-bold ${msg.err ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{msg.t}</div>}

      {puedeEditar && (
        <div className="card">
          <h2 className="mb-4 text-lg font-extrabold text-navy-900">Nuevo proceso interno</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-1"><label className="label">Nombre</label><input className="input" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} /></div>
            <div><label className="label">Código (opcional)</label><input className="input" value={nuevo.codigo} onChange={e => setNuevo({ ...nuevo, codigo: e.target.value })} placeholder="PI-XXX" /></div>
            <div className="lg:col-span-1"><label className="label">Descripción</label><input className="input" value={nuevo.descripcion} onChange={e => setNuevo({ ...nuevo, descripcion: e.target.value })} /></div>
            <div>
              <label className="label">Color</label>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {COLORES.map(c => (
                  <button key={c} onClick={() => setNuevo({ ...nuevo, color: c })} aria-label={c}
                    className={`h-7 w-7 rounded-lg border-2 ${nuevo.color === c ? 'border-navy-900' : 'border-transparent'}`} style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-4"><button onClick={crear} className="btn-primary">Añadir proceso interno</button></div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-lg font-extrabold text-navy-900">Catálogo</h2>
          <button onClick={cargar} className="text-sm font-bold text-navy-500 hover:text-navy-800">↻ Actualizar</button>
        </div>
        {cargando ? <p className="px-5 py-8 text-center text-navy-400">Cargando…</p>
        : items.length === 0 ? <p className="px-5 py-8 text-center text-navy-400">Aún no hay procesos internos.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-y border-navy-100 bg-navy-50/50 text-left text-xs font-bold uppercase tracking-wide text-navy-400">
                <th className="px-5 py-3">Proceso</th><th className="px-3 py-3">Código</th><th className="px-3 py-3">Descripción</th><th className="px-3 py-3">Estado</th>{puedeEditar && <th className="px-5 py-3 text-right">Acciones</th>}
              </tr></thead>
              <tbody>
                {items.map(it => editId === it.id ? (
                  <tr key={it.id} className="border-b border-navy-50 bg-brand-orange/5">
                    <td className="px-5 py-3"><input className="input !py-1.5" value={editData.nombre} onChange={e => setEditData({ ...editData, nombre: e.target.value })} /></td>
                    <td className="px-3 py-3"><input className="input !py-1.5 !w-24" value={editData.codigo} onChange={e => setEditData({ ...editData, codigo: e.target.value })} /></td>
                    <td className="px-3 py-3"><input className="input !py-1.5" value={editData.descripcion} onChange={e => setEditData({ ...editData, descripcion: e.target.value })} /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">{COLORES.map(c => <button key={c} onClick={() => setEditData({ ...editData, color: c })} className={`h-5 w-5 rounded border-2 ${editData.color === c ? 'border-navy-900' : 'border-transparent'}`} style={{ background: c }} />)}</div>
                    </td>
                    <td className="px-5 py-3 text-right"><button onClick={() => guardarEdicion(it.id)} className="mr-2 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700">Guardar</button><button onClick={() => setEditId(null)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-navy-400">Cancelar</button></td>
                  </tr>
                ) : (
                  <tr key={it.id} className="border-b border-navy-50 last:border-0">
                    <td className="px-5 py-3"><span className="inline-flex items-center gap-2 font-bold text-navy-900"><span className="h-3 w-3 rounded-full" style={{ background: it.color || '#0A2A6C' }} />{it.nombre}</span></td>
                    <td className="px-3 py-3 text-navy-500">{it.codigo || '—'}</td>
                    <td className="px-3 py-3 text-navy-500">{it.descripcion || '—'}</td>
                    <td className="px-3 py-3">{it.activo ? <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">Activo</span> : <span className="rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-bold text-navy-500">Inactivo</span>}</td>
                    {puedeEditar && <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => empezarEdicion(it)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-navy-500 hover:bg-navy-50">Editar</button>
                        <button onClick={() => toggleActivo(it)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${it.activo ? 'bg-navy-50 text-navy-600' : 'bg-green-50 text-green-700'}`}>{it.activo ? 'Desactivar' : 'Activar'}</button>
                        <button onClick={() => eliminar(it)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-navy-400 hover:text-red-600">✕</button>
                      </div>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
