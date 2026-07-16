import { useEffect, useState, useCallback } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { useAuth } from '../../lib/auth.jsx';

// Nivel de riesgo a partir de probabilidad × impacto (1..25).
function nivelRiesgo(p, i) {
  const v = (p || 1) * (i || 1);
  if (v >= 15) return { txt: 'Alto', color: '#dc2626', bg: '#fef2f2', v };
  if (v >= 6) return { txt: 'Medio', color: '#d97706', bg: '#fffbeb', v };
  return { txt: 'Bajo', color: '#16a34a', bg: '#f0fdf4', v };
}
const PALETA = ['#061B45', '#0A2A6C', '#F5A623', '#0e7490', '#7c3aed', '#dc2626', '#16a34a', '#be185d'];

// Fases del ciclo del proceso (un proceso puede estar en varias).
const FASES = [
  { id: 'pre', label: 'Pre', desc: 'Antes / preparación', color: '#7c3aed' },
  { id: 'ongoing', label: 'Ongoing', desc: 'Durante / ejecución', color: '#0e7490' },
  { id: 'post', label: 'Post', desc: 'Después / cierre', color: '#be185d' },
];
const FASE_BY_ID = Object.fromEntries(FASES.map(f => [f.id, f]));

// Nombre completo de un miembro del equipo.
const nombreCompleto = (c) => `${c.nombre || ''} ${c.apellidos || ''}`.trim();

// Selector de responsable a partir del equipo dado de alta (tabla consultores).
function SelectResponsable({ equipo, value, onChange, className = '' }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}
      className={`rounded border border-navy-100 px-2 py-1 text-[11px] ${className}`}>
      <option value="">— Responsable —</option>
      {equipo.map(c => {
        const n = nombreCompleto(c);
        return <option key={c.id} value={n}>{n}{c.tipo_equipo && c.tipo_equipo !== 'consultor' ? ` (${c.tipo_equipo})` : ''}</option>;
      })}
    </select>
  );
}

export default function ProcesosInternos() {
  const { role, demo } = useAuth();
  const puedeEditar = ['superadmin', 'admin'].includes(role);
  const [bandas, setBandas] = useState([]);
  const [procs, setProcs] = useState([]);
  const [subs, setSubs] = useState([]);
  const [riesgos, setRiesgos] = useState([]);
  const [equipo, setEquipo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState(null);
  const [vista, setVista] = useState('mapa');
  const [editProc, setEditProc] = useState(null);
  const [editBanda, setEditBanda] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dropB, setDropB] = useState(null);
  const [panelSub, setPanelSub] = useState(null); // proceso cuyo panel de subprocesos/riesgos está abierto

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [b, p, s, r] = await Promise.all([
        listTable('procesos_bandas').catch(() => []),
        listTable('procesos_internos').catch(() => []),
        listTable('procesos_subprocesos').catch(() => []),
        listTable('procesos_riesgos').catch(() => []),
      ]);
      const eq = await listTable('consultores').catch(() => []);
      b.sort((x, y) => (x.orden ?? 100) - (y.orden ?? 100));
      p.sort((x, y) => (x.orden ?? 100) - (y.orden ?? 100));
      setBandas(b); setProcs(p); setSubs(s || []); setRiesgos(r || []);
      setEquipo((eq || []).filter(c => c.activo !== false).sort((a, b2) => `${a.nombre} ${a.apellidos || ''}`.localeCompare(`${b2.nombre} ${b2.apellidos || ''}`)));
    } catch { setBandas([]); setProcs([]); setSubs([]); setRiesgos([]); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const procsDe = (bid) => procs.filter(p => String(p.banda_id) === String(bid));
  const subsDe = (pid) => subs.filter(s => String(s.proceso_id) === String(pid)).sort((a, b) => (a.orden ?? 100) - (b.orden ?? 100));
  const riesgosDe = (sid) => riesgos.filter(r => String(r.subproceso_id) === String(sid));

  // ---- Código automático de proceso: PR-<PREFIJO>-NN ----
  function siguienteCodigoProceso(banda) {
    const existentes = procsDe(banda.id).map(p => p.codigo || '');
    let n = 1;
    while (existentes.includes(`PR-${banda.prefijo}-${String(n).padStart(2, '0')}`)) n++;
    return `PR-${banda.prefijo}-${String(n).padStart(2, '0')}`;
  }
  // ---- Código automático de subproceso: S01-<codproc> ----
  function codigoSub(proc, idx) {
    return `S${String(idx + 1).padStart(2, '0')}${proc.codigo ? '-' + proc.codigo : ''}`;
  }

  // ===== BANDAS =====
  async function addBanda() {
    if (!puedeEditar) return;
    const orden = bandas.reduce((mx, b) => Math.max(mx, b.orden ?? 0), 0) + 10;
    const prefijo = 'B' + (bandas.length + 1);
    try {
      await insertRow('procesos_bandas', { titulo: 'Nueva banda', prefijo, color: PALETA[bandas.length % PALETA.length], orden });
      cargar();
    } catch (e) { setMsg({ err: true, t: 'No se pudo crear la banda.' }); }
  }
  async function guardarBanda(id, campos) {
    try { await updateRow('procesos_bandas', id, campos); setEditBanda(null); cargar(); }
    catch { setMsg({ err: true, t: 'No se pudo guardar la banda.' }); }
  }
  async function eliminarBanda(b) {
    if (procsDe(b.id).length) { setMsg({ err: true, t: 'Vacía o mueve antes los procesos de esta banda.' }); return; }
    if (!window.confirm(`¿Eliminar la banda "${b.titulo}"?`)) return;
    try { await deleteRow('procesos_bandas', b.id); cargar(); }
    catch { setMsg({ err: true, t: 'No se pudo eliminar la banda.' }); }
  }

  // ===== PROCESOS =====
  async function addProceso(banda) {
    try {
      const orden = procsDe(banda.id).reduce((mx, p) => Math.max(mx, p.orden ?? 0), 0) + 10;
      const codigo = siguienteCodigoProceso(banda);
      const nuevo = await insertRow('procesos_internos', {
        nombre: 'Nuevo proceso', banda_id: banda.id, codigo, activo: true, orden, color: banda.color, fases: ['ongoing'],
      });
      await cargar();
      if (nuevo?.id) setEditProc({ id: nuevo.id, nombre: 'Nuevo proceso', codigo, responsable: '', descripcion: '', banda_id: banda.id, fases: ['ongoing'] });
    } catch (e) { setMsg({ err: true, t: 'No se pudo crear el proceso: ' + (e.message || '') }); }
  }
  async function guardarProceso() {
    const e = editProc;
    try {
      await updateRow('procesos_internos', e.id, {
        nombre: e.nombre, responsable: e.responsable || null, descripcion: e.descripcion || null, banda_id: e.banda_id,
        fases: (e.fases && e.fases.length) ? e.fases : ['ongoing'],
      });
      setEditProc(null); cargar();
    } catch (er) { setMsg({ err: true, t: 'No se pudo guardar: ' + (er.message || '') }); }
  }
  async function eliminarProceso(p) {
    if (!window.confirm(`¿Eliminar el proceso "${p.nombre}" con sus subprocesos y riesgos?`)) return;
    try { await deleteRow('procesos_internos', p.id); cargar(); }
    catch { setMsg({ err: true, t: 'No se pudo eliminar.' }); }
  }
  async function moverProceso(banda) {
    if (!dragId) return;
    const p = procs.find(x => x.id === dragId);
    setDropB(null); setDragId(null);
    if (!p || String(p.banda_id) === String(banda.id)) return;
    // Recodificar al mover de banda
    const codigo = siguienteCodigoProceso(banda);
    setProcs(ps => ps.map(x => x.id === p.id ? { ...x, banda_id: banda.id, codigo, color: banda.color } : x));
    try { await updateRow('procesos_internos', p.id, { banda_id: banda.id, codigo, color: banda.color }); cargar(); }
    catch { setMsg({ err: true, t: 'No se pudo mover.' }); cargar(); }
  }

  // ===== SUBPROCESOS =====
  async function addSub(proc) {
    try {
      const orden = subsDe(proc.id).reduce((mx, s) => Math.max(mx, s.orden ?? 0), 0) + 10;
      const idx = subsDe(proc.id).length;
      await insertRow('procesos_subprocesos', { proceso_id: proc.id, codigo: codigoSub(proc, idx), nombre: 'Nuevo subproceso', orden });
      cargar();
    } catch { setMsg({ err: true, t: 'No se pudo añadir el subproceso.' }); }
  }
  async function guardarSub(id, campos) {
    try { await updateRow('procesos_subprocesos', id, campos); setSubs(ss => ss.map(s => s.id === id ? { ...s, ...campos } : s)); }
    catch { setMsg({ err: true, t: 'No se pudo guardar el subproceso.' }); }
  }
  async function delSub(id) {
    try { await deleteRow('procesos_subprocesos', id); cargar(); }
    catch { setMsg({ err: true, t: 'No se pudo eliminar el subproceso.' }); }
  }

  // ===== RIESGOS =====
  async function addRiesgo(sid) {
    try { await insertRow('procesos_riesgos', { subproceso_id: sid, descripcion: '', probabilidad: 1, impacto: 1, control: '' }); cargar(); }
    catch { setMsg({ err: true, t: 'No se pudo añadir el riesgo.' }); }
  }
  async function guardarRiesgo(id, campos) {
    try { await updateRow('procesos_riesgos', id, campos); setRiesgos(rs => rs.map(r => r.id === id ? { ...r, ...campos } : r)); }
    catch { setMsg({ err: true, t: 'No se pudo guardar el riesgo.' }); }
  }
  async function delRiesgo(id) {
    try { await deleteRow('procesos_riesgos', id); cargar(); }
    catch { setMsg({ err: true, t: 'No se pudo eliminar el riesgo.' }); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Organización</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Mapa de procesos</h1>
          <p className="mt-1 max-w-2xl text-sm font-medium text-navy-400">
            Diagrama de procesos por bandas. Los códigos se generan solos.
            {puedeEditar && <> Arrastra para mover de banda, ✎ para editar, y despliega cada proceso para gestionar subprocesos y riesgos.</>}
          </p>
        </div>
        <div className="flex overflow-hidden rounded-xl border border-navy-200 text-sm font-bold">
          <button onClick={() => setVista('mapa')} className={`px-4 py-2 ${vista === 'mapa' ? 'bg-navy-900 text-white' : 'text-navy-500'}`}>🧬 Diagrama</button>
          <button onClick={() => setVista('lista')} className={`px-4 py-2 ${vista === 'lista' ? 'bg-navy-900 text-white' : 'text-navy-500'}`}>☰ Lista</button>
        </div>
      </div>

      {demo && <div className="rounded-xl bg-brand-orange/10 p-3 text-xs font-semibold text-brand-orangeDark">Modo demo: los cambios no se guardan.</div>}
      {msg && <div className={`rounded-xl p-3 text-sm font-bold ${msg.err ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`} onClick={() => setMsg(null)}>{msg.t}</div>}

      {cargando ? <p className="py-10 text-center text-navy-400">Cargando…</p> : vista === 'mapa' ? (
        <div className="space-y-4">
          {bandas.map(banda => (
            <div key={banda.id}
              onDragOver={e => { if (dragId) { e.preventDefault(); setDropB(banda.id); } }}
              onDragLeave={() => setDropB(d => d === banda.id ? null : d)}
              onDrop={() => moverProceso(banda)}
              className={`rounded-2xl border bg-white p-4 transition ${dropB === banda.id ? 'ring-2 ring-brand-orange' : 'border-navy-100'}`}
              style={{ borderLeft: `6px solid ${banda.color}` }}>

              {/* Cabecera de banda (editable) */}
              <div className="mb-3 flex items-center gap-2">
                {editBanda === banda.id ? (
                  <BandaEditor banda={banda} onGuardar={c => guardarBanda(banda.id, c)} onCancelar={() => setEditBanda(null)} />
                ) : (
                  <>
                    <h3 className="text-sm font-extrabold uppercase tracking-wide" style={{ color: banda.color }}>{banda.titulo}</h3>
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-extrabold text-white" style={{ background: banda.color }}>{banda.prefijo}</span>
                    {puedeEditar && <>
                      <button onClick={() => setEditBanda(banda.id)} className="text-[11px] text-navy-300 hover:text-navy-700" title="Editar banda">✎</button>
                      <button onClick={() => eliminarBanda(banda)} className="text-[11px] text-navy-300 hover:text-red-600" title="Eliminar banda">✕</button>
                      <button onClick={() => addProceso(banda)} className="ml-auto rounded-lg border border-dashed px-3 py-1 text-xs font-bold" style={{ borderColor: banda.color, color: banda.color }}>+ proceso</button>
                    </>}
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {procsDe(banda.id).length === 0 && <p className="py-2 text-sm text-navy-300">Sin procesos{puedeEditar ? ' — pulsa «+ proceso» o arrastra uno aquí.' : '.'}</p>}
                {procsDe(banda.id).map(p => (
                  <ProcesoCard key={p.id} p={p} banda={banda} puedeEditar={puedeEditar}
                    editando={editProc?.id === p.id} editProc={editProc} setEditProc={setEditProc}
                    onEdit={() => setEditProc({ id: p.id, nombre: p.nombre || '', codigo: p.codigo, responsable: p.responsable || '', descripcion: p.descripcion || '', banda_id: p.banda_id, fases: p.fases || ['ongoing'] })}
                    onGuardar={guardarProceso} onCancelar={() => setEditProc(null)} onEliminar={() => eliminarProceso(p)}
                    onDragStart={() => setDragId(p.id)} onDragEnd={() => { setDragId(null); setDropB(null); }}
                    bandas={bandas} equipo={equipo}
                    subN={subsDe(p.id).length}
                    onAbrirPanel={() => setPanelSub(panelSub === p.id ? null : p.id)}
                    panelAbierto={panelSub === p.id} />
                ))}
              </div>

              {/* Panel de subprocesos + riesgos del proceso abierto en esta banda */}
              {panelSub && procsDe(banda.id).some(p => p.id === panelSub) && (
                <PanelSubprocesos
                  proc={procs.find(p => p.id === panelSub)} banda={banda} puedeEditar={puedeEditar} equipo={equipo}
                  subs={subsDe(panelSub)} riesgosDe={riesgosDe} codigoSub={codigoSub}
                  onAddSub={() => addSub(procs.find(p => p.id === panelSub))} onGuardarSub={guardarSub} onDelSub={delSub}
                  onAddRiesgo={addRiesgo} onGuardarRiesgo={guardarRiesgo} onDelRiesgo={delRiesgo} />
              )}
            </div>
          ))}

          {puedeEditar && (
            <button onClick={addBanda} className="w-full rounded-2xl border-2 border-dashed border-navy-200 py-3 text-sm font-bold text-navy-400 hover:border-brand-orange hover:text-brand-orangeDark">
              + Añadir banda (tipo de proceso)
            </button>
          )}
        </div>
      ) : (
        <ListaProcesos bandas={bandas} procs={procs} subs={subs} riesgos={riesgos} subsDe={subsDe} riesgosDe={riesgosDe} />
      )}
    </div>
  );
}

// ---------- Editor de banda ----------
function BandaEditor({ banda, onGuardar, onCancelar }) {
  const [t, setT] = useState(banda.titulo);
  const [pre, setPre] = useState(banda.prefijo);
  const [col, setCol] = useState(banda.color);
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <input value={t} onChange={e => setT(e.target.value)} className="input !py-1.5 !w-56" placeholder="Título de la banda" />
      <input value={pre} onChange={e => setPre(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} className="input !py-1.5 !w-24" placeholder="PREFIJO" />
      <div className="flex gap-1">{PALETA.map(c => <button key={c} onClick={() => setCol(c)} className={`h-6 w-6 rounded border-2 ${col === c ? 'border-navy-900' : 'border-transparent'}`} style={{ background: c }} />)}</div>
      <button onClick={() => onGuardar({ titulo: t, prefijo: pre || 'B', color: col })} className="rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-bold text-white">Guardar</button>
      <button onClick={onCancelar} className="rounded-lg border border-navy-200 px-3 py-1.5 text-xs font-bold text-navy-500">Cancelar</button>
    </div>
  );
}

// ---------- Tarjeta de proceso ----------
function ProcesoCard({ p, banda, puedeEditar, editando, editProc, setEditProc, onEdit, onGuardar, onCancelar, onEliminar, onDragStart, onDragEnd, bandas, equipo, subN, onAbrirPanel, panelAbierto }) {
  if (editando) {
    return (
      <div className="w-full max-w-md rounded-xl border-2 bg-white p-3" style={{ borderColor: banda.color }}>
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-extrabold" style={{ color: banda.color }}>{editProc.codigo} <span className="font-medium text-navy-300">(código automático)</span></div>
          <label className="text-[10px] font-bold uppercase text-navy-400">Nombre
            <input className="input !mt-1 !py-1.5" value={editProc.nombre} onChange={e => setEditProc({ ...editProc, nombre: e.target.value })} /></label>
          <label className="text-[10px] font-bold uppercase text-navy-400">Responsable
            <SelectResponsable equipo={equipo} value={editProc.responsable} onChange={v => setEditProc({ ...editProc, responsable: v })} className="!mt-1 w-full !text-[12px] !py-1.5" /></label>
          <label className="text-[10px] font-bold uppercase text-navy-400">Banda
            <select className="input !mt-1 !py-1.5" value={editProc.banda_id} onChange={e => setEditProc({ ...editProc, banda_id: e.target.value })}>
              {bandas.map(b => <option key={b.id} value={b.id}>{b.titulo}</option>)}
            </select></label>
          <div>
            <span className="text-[10px] font-bold uppercase text-navy-400">Fases del proceso</span>
            <div className="mt-1 flex gap-1.5">
              {FASES.map(f => {
                const on = (editProc.fases || []).includes(f.id);
                return (
                  <button key={f.id} type="button"
                    onClick={() => setEditProc({ ...editProc, fases: on ? (editProc.fases || []).filter(x => x !== f.id) : [...(editProc.fases || []), f.id] })}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${on ? 'text-white' : 'text-navy-400'}`}
                    style={on ? { background: f.color, borderColor: f.color } : { borderColor: '#cbd5e1' }}
                    title={f.desc}>{f.label}</button>
                );
              })}
            </div>
          </div>
          <label className="text-[10px] font-bold uppercase text-navy-400">Descripción
            <textarea className="input !mt-1 !py-1.5" rows={2} value={editProc.descripcion} onChange={e => setEditProc({ ...editProc, descripcion: e.target.value })} /></label>
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
      className={`relative w-[190px] rounded-xl border-[1.5px] bg-white p-3 shadow-sm ${panelAbierto ? 'ring-2 ring-brand-orange' : ''}`}
      style={{ borderColor: banda.color, cursor: puedeEditar ? 'grab' : 'default' }}>
      {puedeEditar && (
        <div className="absolute right-1.5 top-1.5 flex gap-1">
          <button onClick={onEdit} title="Editar" className="text-[11px] text-navy-300 hover:text-navy-700">✎</button>
          <button onClick={onEliminar} title="Eliminar" className="text-[11px] text-navy-300 hover:text-red-600">✕</button>
        </div>
      )}
      <div className="flex items-center justify-between gap-1">
        <div className="text-[9.5px] font-extrabold tracking-wide" style={{ color: banda.color }}>{p.codigo}</div>
        <div className="flex gap-1">
          {(p.fases || ['ongoing']).map(fid => {
            const f = FASE_BY_ID[fid]; if (!f) return null;
            return <span key={fid} className="rounded px-1 py-0.5 text-[8px] font-extrabold uppercase text-white" style={{ background: f.color }} title={f.desc}>{f.label}</span>;
          })}
        </div>
      </div>
      <div className="pr-8 text-[13px] font-extrabold leading-tight text-navy-900">{p.nombre}</div>
      {p.responsable && <div className="mt-1 text-[10.5px] font-bold" style={{ color: banda.color }}>{p.responsable}</div>}
      {p.descripcion && <div className="mt-1.5 border-t border-dashed border-navy-100 pt-1.5 text-[10.5px] leading-snug text-navy-400">{p.descripcion}</div>}
      <button onClick={onAbrirPanel} className="mt-2 w-full rounded-lg border border-dashed border-navy-200 py-1 text-[10px] font-bold text-navy-400 hover:border-navy-400 hover:text-navy-700">
        {panelAbierto ? '▾ ocultar' : '▸ subprocesos y riesgos'} ({subN})
      </button>
    </div>
  );
}

// ---------- Panel de subprocesos con sus riesgos ----------
function PanelSubprocesos({ proc, banda, puedeEditar, equipo, subs, riesgosDe, onAddSub, onGuardarSub, onDelSub, onAddRiesgo, onGuardarRiesgo, onDelRiesgo }) {
  return (
    <div className="mt-4 rounded-xl border border-navy-100 bg-navy-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[11px] font-extrabold" style={{ color: banda.color }}>{proc.codigo}</span>
        <h4 className="text-sm font-extrabold text-navy-900">{proc.nombre} · subprocesos y riesgos</h4>
        {puedeEditar && <button onClick={onAddSub} className="ml-auto rounded-lg border border-dashed px-3 py-1 text-xs font-bold" style={{ borderColor: banda.color, color: banda.color }}>+ subproceso</button>}
      </div>
      {subs.length === 0 && <p className="text-sm text-navy-300">Sin subprocesos todavía.</p>}
      <div className="space-y-3">
        {subs.map(s => (
          <div key={s.id} className="rounded-lg border border-navy-100 bg-white p-3">
            <div className="flex items-center gap-2">
              <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[9.5px] font-extrabold text-navy-600">{s.codigo}</span>
              {puedeEditar ? (
                <input defaultValue={s.nombre} onBlur={e => e.target.value !== s.nombre && onGuardarSub(s.id, { nombre: e.target.value })}
                  className="flex-1 rounded border border-navy-100 px-2 py-1 text-[12px] font-semibold" placeholder="Nombre del subproceso" />
              ) : <span className="flex-1 text-[12px] font-semibold text-navy-800">{s.nombre}</span>}
              {puedeEditar && <>
                <SelectResponsable equipo={equipo} value={s.responsable || ''} onChange={v => onGuardarSub(s.id, { responsable: v })} className="w-32" />
                <button onClick={() => onDelSub(s.id)} className="text-[11px] text-navy-300 hover:text-red-600">✕</button>
              </>}
            </div>

            {/* Riesgos del subproceso */}
            <div className="mt-2 pl-2">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-navy-400">Riesgos</span>
                {puedeEditar && <button onClick={() => onAddRiesgo(s.id)} className="text-[10px] font-bold text-brand-orangeDark hover:underline">+ riesgo</button>}
              </div>
              <div className="space-y-1.5">
                {riesgosDe(s.id).length === 0 && <p className="text-[11px] text-navy-300">Sin riesgos identificados.</p>}
                {riesgosDe(s.id).map(r => <FilaRiesgo key={r.id} r={r} puedeEditar={puedeEditar} onGuardar={onGuardarRiesgo} onDel={onDelRiesgo} />)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Fila de riesgo (probabilidad × impacto = nivel + control) ----------
function FilaRiesgo({ r, puedeEditar, onGuardar, onDel }) {
  const [prob, setProb] = useState(r.probabilidad || 1);
  const [imp, setImp] = useState(r.impacto || 1);
  const n = nivelRiesgo(prob, imp);
  if (!puedeEditar) {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        <span className="rounded px-2 py-0.5 font-bold" style={{ color: n.color, background: n.bg }}>{n.txt} ({n.v})</span>
        <span className="flex-1 text-navy-700">{r.descripcion || '—'}</span>
        {r.control && <span className="text-navy-400">→ {r.control}</span>}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_1fr_auto] items-center gap-1.5 rounded-md bg-navy-50/60 p-1.5">
      <input defaultValue={r.descripcion} onBlur={e => e.target.value !== r.descripcion && onGuardar(r.id, { descripcion: e.target.value })}
        className="rounded border border-navy-100 px-2 py-1 text-[11px]" placeholder="Descripción del riesgo" />
      <label className="flex items-center gap-1 text-[9px] font-bold text-navy-400">P
        <select value={prob} onChange={e => { const v = +e.target.value; setProb(v); onGuardar(r.id, { probabilidad: v }); }} className="rounded border border-navy-100 py-1 text-[11px]">
          {[1, 2, 3, 4, 5].map(x => <option key={x} value={x}>{x}</option>)}
        </select></label>
      <label className="flex items-center gap-1 text-[9px] font-bold text-navy-400">I
        <select value={imp} onChange={e => { const v = +e.target.value; setImp(v); onGuardar(r.id, { impacto: v }); }} className="rounded border border-navy-100 py-1 text-[11px]">
          {[1, 2, 3, 4, 5].map(x => <option key={x} value={x}>{x}</option>)}
        </select></label>
      <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ color: n.color, background: n.bg }}>{n.txt} ({n.v})</span>
      <input defaultValue={r.control || ''} onBlur={e => e.target.value !== (r.control || '') && onGuardar(r.id, { control: e.target.value })}
        className="rounded border border-navy-100 px-2 py-1 text-[11px]" placeholder="Medida de control" />
      <button onClick={() => onDel(r.id)} className="text-[11px] text-navy-300 hover:text-red-600">✕</button>
    </div>
  );
}

// ---------- Vista lista ----------
function ListaProcesos({ bandas, procs, subs, riesgos, subsDe, riesgosDe }) {
  const bandaDe = (id) => bandas.find(b => String(b.id) === String(id));
  return (
    <div className="space-y-4">
      {procs.map(p => {
        const b = bandaDe(p.banda_id);
        const ss = subsDe(p.id);
        return (
          <div key={p.id} className="card">
            <div className="flex items-center gap-2">
              <span className="rounded px-2 py-0.5 text-[10px] font-extrabold text-white" style={{ background: b?.color || '#0A2A6C' }}>{p.codigo}</span>
              <h3 className="text-base font-extrabold text-navy-900">{p.nombre}</h3>
              {(p.fases || ['ongoing']).map(fid => {
                const f = FASE_BY_ID[fid]; if (!f) return null;
                return <span key={fid} className="rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white" style={{ background: f.color }}>{f.label}</span>;
              })}
              {b && <span className="text-xs font-bold text-navy-400">{b.titulo}</span>}
              {p.responsable && <span className="ml-auto text-xs font-bold text-navy-500">{p.responsable}</span>}
            </div>
            {ss.length > 0 && (
              <div className="mt-3 space-y-2">
                {ss.map(s => (
                  <div key={s.id} className="rounded-lg border border-navy-100 p-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[9.5px] font-extrabold text-navy-600">{s.codigo}</span>
                      <span className="font-semibold text-navy-800">{s.nombre}</span>
                      {s.responsable && <span className="text-xs text-navy-400">· {s.responsable}</span>}
                    </div>
                    {riesgosDe(s.id).map(r => {
                      const n = nivelRiesgo(r.probabilidad, r.impacto);
                      return (
                        <div key={r.id} className="mt-1 flex items-center gap-2 pl-6 text-[11px]">
                          <span className="rounded px-1.5 py-0.5 font-bold" style={{ color: n.color, background: n.bg }}>{n.txt}</span>
                          <span className="text-navy-700">{r.descripcion || '—'}</span>
                          {r.control && <span className="text-navy-400">→ {r.control}</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
