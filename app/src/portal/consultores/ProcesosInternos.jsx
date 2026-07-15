import { useEffect, useState, useCallback } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { useAuth } from '../../lib/auth.jsx';

// Las tres bandas del mapa de procesos.
const BANDAS = [
  { id: 'estrategico', label: 'Procesos estratégicos', color: '#061B45', hint: 'Marcan el rumbo: dirección, comercial, mejora.' },
  { id: 'clave', label: 'Procesos clave (operativos)', color: '#0A2A6C', hint: 'La cadena de valor: lo que entregamos al cliente.' },
  { id: 'soporte', label: 'Procesos de apoyo y soporte', color: '#F5A623', hint: 'Sostienen la operación: personas, IT, administración.' },
];
const COLOR_BANDA = Object.fromEntries(BANDAS.map(b => [b.id, b.color]));

export default function ProcesosInternos() {
  const { role, demo } = useAuth();
  const puedeEditar = ['superadmin', 'admin'].includes(role);
  const [items, setItems] = useState([]);
  const [subs, setSubs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState(null);
  const [vista, setVista] = useState('mapa');
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [dragId, setDragId] = useState(null);
  const [dropBanda, setDropBanda] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [all, sall] = await Promise.all([
        listTable('procesos_internos'),
        listTable('procesos_subprocesos').catch(() => []),
      ]);
      all.sort((a, b) => (a.orden ?? 100) - (b.orden ?? 100) || (a.nombre || '').localeCompare(b.nombre || ''));
      setItems(all);
      setSubs(sall || []);
    } catch { setItems([]); setSubs([]); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const porBanda = (b) => items.filter(i => (i.banda || 'clave') === b);
  const subsDe = (pid) => subs.filter(s => String(s.proceso_id) === String(pid)).sort((a, b) => (a.orden ?? 100) - (b.orden ?? 100));

  async function crearEn(banda) {
    if (!puedeEditar) return;
    try {
      const orden = (porBanda(banda).reduce((mx, i) => Math.max(mx, i.orden ?? 0), 0)) + 10;
      const nuevo = await insertRow('procesos_internos', {
        nombre: 'Nuevo proceso', banda, activo: true, orden, color: COLOR_BANDA[banda],
      });
      await cargar();
      if (nuevo?.id) empezarEdicion(nuevo);
    } catch (e) { setMsg({ err: true, t: 'No se pudo crear: ' + (e.message || '') }); }
  }

  function empezarEdicion(it) {
    setEditId(it.id);
    setEditData({ nombre: it.nombre || '', codigo: it.codigo || '', responsable: it.responsable || '', descripcion: it.descripcion || '', banda: it.banda || 'clave' });
  }
  async function guardarEdicion(id) {
    try {
      await updateRow('procesos_internos', id, {
        nombre: editData.nombre, codigo: editData.codigo?.trim() || null,
        responsable: editData.responsable || null, descripcion: editData.descripcion || null,
        banda: editData.banda, color: COLOR_BANDA[editData.banda],
      });
      setEditId(null); setMsg({ t: 'Guardado.' }); cargar();
    } catch (e) { setMsg({ err: true, t: 'No se pudo guardar: ' + (e.message || '') }); }
  }
  async function eliminar(it) {
    if (!window.confirm(`¿Eliminar el proceso "${it.nombre}" y sus subprocesos?`)) return;
    try { await deleteRow('procesos_internos', it.id); setMsg({ t: 'Eliminado.' }); cargar(); }
    catch (e) { setMsg({ err: true, t: 'No se pudo eliminar (¿tiene tareas asociadas?).' }); }
  }

  async function addSub(pid) {
    try { await insertRow('procesos_subprocesos', { proceso_id: pid, nombre: 'Nuevo subproceso', orden: (subsDe(pid).reduce((mx, s) => Math.max(mx, s.orden ?? 0), 0)) + 10 }); cargar(); }
    catch (e) { setMsg({ err: true, t: 'No se pudo añadir el subproceso.' }); }
  }
  async function guardarSub(id, campos) {
    try { await updateRow('procesos_subprocesos', id, campos); setSubs(ss => ss.map(s => s.id === id ? { ...s, ...campos } : s)); }
    catch (e) { setMsg({ err: true, t: 'No se pudo guardar el subproceso.' }); }
  }
  async function delSub(id) {
    try { await deleteRow('procesos_subprocesos', id); cargar(); }
    catch (e) { setMsg({ err: true, t: 'No se pudo eliminar el subproceso.' }); }
  }

  function onDragStart(id) { setDragId(id); }
  function onDragEnd() { setDragId(null); setDropBanda(null); }
  async function onDropEn(banda) {
    if (!dragId) return;
    const proc = items.find(i => i.id === dragId);
    setDropBanda(null); setDragId(null);
    if (!proc || (proc.banda || 'clave') === banda) return;
    setItems(is => is.map(i => i.id === proc.id ? { ...i, banda, color: COLOR_BANDA[banda] } : i));
    try { await updateRow('procesos_internos', proc.id, { banda, color: COLOR_BANDA[banda] }); }
    catch { setMsg({ err: true, t: 'No se pudo mover el proceso.' }); cargar(); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Organización</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Mapa de procesos</h1>
          <p className="mt-1 max-w-2xl text-sm font-medium text-navy-400">
            Los procesos internos en sus tres niveles: estratégicos, clave y de soporte.
            {puedeEditar && <> Arrastra una tarjeta para moverla de banda, pulsa ✎ para editarla y <strong>+ proceso</strong> para añadir.</>}
          </p>
        </div>
        <div className="flex overflow-hidden rounded-xl border border-navy-200 text-sm font-bold">
          <button onClick={() => setVista('mapa')} className={`px-4 py-2 ${vista === 'mapa' ? 'bg-navy-900 text-white' : 'text-navy-500'}`}>🧬 Mapa</button>
          <button onClick={() => setVista('tabla')} className={`px-4 py-2 ${vista === 'tabla' ? 'bg-navy-900 text-white' : 'text-navy-500'}`}>☰ Lista</button>
        </div>
      </div>

      {demo && <div className="rounded-xl bg-brand-orange/10 p-3 text-xs font-semibold text-brand-orangeDark">Modo demo: los cambios no se guardan.</div>}
      {msg && <div className={`rounded-xl p-3 text-sm font-bold ${msg.err ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{msg.t}</div>}

      {cargando ? <p className="py-10 text-center text-navy-400">Cargando…</p> : vista === 'mapa' ? (
        <div className="space-y-4">
          {BANDAS.map(banda => (
            <div key={banda.id}
              onDragOver={e => { if (dragId) { e.preventDefault(); setDropBanda(banda.id); } }}
              onDragLeave={() => setDropBanda(d => d === banda.id ? null : d)}
              onDrop={() => onDropEn(banda.id)}
              className={`rounded-2xl border bg-white p-4 transition ${dropBanda === banda.id ? 'ring-2 ring-brand-orange' : 'border-navy-100'}`}
              style={{ borderLeft: `6px solid ${banda.color}` }}>
              <div className="mb-3 flex items-center gap-3">
                <h3 className="text-sm font-extrabold uppercase tracking-wide" style={{ color: banda.color }}>{banda.label}</h3>
                <span className="hidden text-xs font-medium text-navy-300 sm:inline">{banda.hint}</span>
                {puedeEditar && <button onClick={() => crearEn(banda.id)} className="ml-auto rounded-lg border border-dashed px-3 py-1 text-xs font-bold" style={{ borderColor: banda.color, color: banda.color }}>+ proceso</button>}
              </div>

              <div className="flex flex-wrap gap-3">
                {porBanda(banda.id).length === 0 && <p className="py-3 text-sm text-navy-300">Sin procesos en esta banda{puedeEditar ? ' — pulsa «+ proceso» o arrastra uno aquí.' : '.'}</p>}
                {porBanda(banda.id).map(it => (
                  <ProcesoCard key={it.id} it={it} banda={banda} subs={subsDe(it.id)} puedeEditar={puedeEditar}
                    editando={editId === it.id} editData={editData} setEditData={setEditData}
                    onEdit={() => empezarEdicion(it)} onGuardar={() => guardarEdicion(it.id)} onCancelar={() => setEditId(null)}
                    onEliminar={() => eliminar(it)} onDragStart={() => onDragStart(it.id)} onDragEnd={onDragEnd}
                    onAddSub={() => addSub(it.id)} onGuardarSub={guardarSub} onDelSub={delSub} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <TablaProcesos items={items} puedeEditar={puedeEditar} onEliminar={eliminar} />
      )}
    </div>
  );
}

function ProcesoCard({ it, banda, subs, puedeEditar, editando, editData, setEditData, onEdit, onGuardar, onCancelar, onEliminar, onDragStart, onDragEnd, onAddSub, onGuardarSub, onDelSub }) {
  const [abierto, setAbierto] = useState(false);
  if (editando) {
    return (
      <div className="w-full max-w-md rounded-xl border-2 bg-white p-3" style={{ borderColor: banda.color }}>
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-bold uppercase text-navy-400">Nombre
            <input className="input !mt-1 !py-1.5" value={editData.nombre} onChange={e => setEditData({ ...editData, nombre: e.target.value })} /></label>
          <div className="flex gap-2">
            <label className="flex-1 text-[10px] font-bold uppercase text-navy-400">Código
              <input className="input !mt-1 !py-1.5" value={editData.codigo} onChange={e => setEditData({ ...editData, codigo: e.target.value })} placeholder="PC-XXX" /></label>
            <label className="flex-1 text-[10px] font-bold uppercase text-navy-400">Responsable
              <input className="input !mt-1 !py-1.5" value={editData.responsable} onChange={e => setEditData({ ...editData, responsable: e.target.value })} /></label>
          </div>
          <label className="text-[10px] font-bold uppercase text-navy-400">Banda
            <select className="input !mt-1 !py-1.5" value={editData.banda} onChange={e => setEditData({ ...editData, banda: e.target.value })}>
              {BANDAS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select></label>
          <label className="text-[10px] font-bold uppercase text-navy-400">Descripción
            <textarea className="input !mt-1 !py-1.5" rows={2} value={editData.descripcion} onChange={e => setEditData({ ...editData, descripcion: e.target.value })} /></label>
          <div className="flex justify-end gap-2">
            <button onClick={onCancelar} className="rounded-lg border border-navy-200 px-3 py-1.5 text-xs font-bold text-navy-500">Cancelar</button>
            <button onClick={onGuardar} className="rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-bold text-white">Guardar</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div draggable={puedeEditar} onDragStart={onDragStart} onDragEnd={onDragEnd}
      className="relative w-[184px] rounded-xl border-[1.5px] bg-white p-3 shadow-sm" style={{ borderColor: banda.color, cursor: puedeEditar ? 'grab' : 'default' }}>
      {puedeEditar && (
        <div className="absolute right-1.5 top-1.5 flex gap-1">
          <button onClick={onEdit} title="Editar" className="text-[11px] text-navy-300 hover:text-navy-700">✎</button>
          <button onClick={onEliminar} title="Eliminar" className="text-[11px] text-navy-300 hover:text-red-600">✕</button>
        </div>
      )}
      {it.codigo && <div className="text-[9.5px] font-extrabold tracking-wide" style={{ color: banda.color }}>{it.codigo}</div>}
      <div className="pr-8 text-[13px] font-extrabold leading-tight text-navy-900">{it.nombre}</div>
      {it.responsable && <div className="mt-1 text-[10.5px] font-bold" style={{ color: banda.color }}>{it.responsable}</div>}
      {it.descripcion && <div className="mt-1.5 border-t border-dashed border-navy-100 pt-1.5 text-[10.5px] leading-snug text-navy-400">{it.descripcion}</div>}

      {(subs.length > 0 || puedeEditar) && (
        <div className="mt-2 border-t border-dashed border-navy-100 pt-2">
          <button onClick={() => setAbierto(a => !a)} className="text-[10px] font-bold uppercase tracking-wide text-navy-400 hover:text-navy-700">
            {abierto ? '▾' : '▸'} Subprocesos ({subs.length})
          </button>
          {abierto && (
            <div className="mt-1.5 flex flex-col gap-1.5">
              {subs.map(s => (
                <div key={s.id} className="border-l-2 pl-2" style={{ borderColor: banda.color }}>
                  {puedeEditar ? (
                    <div className="flex items-center gap-1">
                      <input defaultValue={s.nombre} onBlur={e => e.target.value !== s.nombre && onGuardarSub(s.id, { nombre: e.target.value })}
                        className="w-full rounded border border-navy-100 px-1.5 py-0.5 text-[10.5px]" />
                      <button onClick={() => onDelSub(s.id)} className="text-[10px] text-navy-300 hover:text-red-600">✕</button>
                    </div>
                  ) : (
                    <div className="text-[10.5px] leading-tight">
                      {s.codigo && <span className="mr-1 font-extrabold" style={{ color: banda.color }}>{s.codigo}</span>}
                      {s.nombre}{s.responsable && <span className="block text-[9.5px] text-navy-400">{s.responsable}</span>}
                    </div>
                  )}
                </div>
              ))}
              {puedeEditar && <button onClick={onAddSub} className="mt-0.5 text-left text-[10px] font-bold text-navy-300 hover:text-navy-700">+ subproceso</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TablaProcesos({ items, puedeEditar, onEliminar }) {
  const nombreBanda = (b) => BANDAS.find(x => x.id === b)?.label || b;
  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-y border-navy-100 bg-navy-50/50 text-left text-xs font-bold uppercase tracking-wide text-navy-400">
            <th className="px-5 py-3">Proceso</th><th className="px-3 py-3">Código</th><th className="px-3 py-3">Banda</th><th className="px-3 py-3">Responsable</th>{puedeEditar && <th className="px-5 py-3 text-right">Acciones</th>}
          </tr></thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id} className="border-b border-navy-50 last:border-0">
                <td className="px-5 py-3"><span className="inline-flex items-center gap-2 font-bold text-navy-900"><span className="h-3 w-3 rounded-full" style={{ background: it.color || '#0A2A6C' }} />{it.nombre}</span></td>
                <td className="px-3 py-3 text-navy-500">{it.codigo || '—'}</td>
                <td className="px-3 py-3 text-navy-500">{nombreBanda(it.banda || 'clave')}</td>
                <td className="px-3 py-3 text-navy-500">{it.responsable || '—'}</td>
                {puedeEditar && <td className="px-5 py-3 text-right"><button onClick={() => onEliminar(it)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-navy-400 hover:text-red-600">✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
