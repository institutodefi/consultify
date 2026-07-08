import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { listTable } from '../../lib/data.js';
import { descargarTareaICS, descargarAgendaICS } from '../../lib/ics.js';
import BoxEquipo from './BoxEquipo.jsx';
import CalendarioPlanning from './CalendarioPlanning.jsx';
import { EFICIENCIA } from '../../lib/calcEngine.js';
import {
  YEAR_AGENDA, FESTIVOS_2026, MESES, TOPE_ANUAL, MAX_HORAS_DIA, DIAS_VACACIONES,
  PCT_PRODUCTIVO, PCT_GESTION, PCT_COORDINACION, PCT_PROC_INTERNO, TIPOS_TAREA, TIPO_BY_ID,
  toISO, hoyISO, diasDelMes, esLaborable, horasDia, resumenAnual,
  getFestivos, getVacaciones, toggleVacacion,
  getTareasAgenda, crearTareaAgenda, actualizarTareaAgenda, borrarTareaAgenda,
} from '../../lib/agenda.js';

const NAVY = '#0A2A6C', ORANGE = '#F5A623';
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const r1 = (n) => Math.round(n * 10) / 10;

// ════════════════ RELOJ ANUAL (gauge SVG 270°) ════════════════
function RelojAnual({ previstas, reales, proyeccion, ritmo, capacidad }) {
  const R = 92, RI = 74, CX = 120, CY = 120, START = 135, SWEEP = 270;
  const MAXG = capacidad > 0 ? capacidad : 1;
  const ang = (h) => START + SWEEP * Math.min(h / MAXG, 1.12) / 1.12;
  const polar = (deg, r) => { const a = (deg * Math.PI) / 180; return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };
  const arco = (d1, d2, r) => {
    const [x1, y1] = polar(d1, r), [x2, y2] = polar(d2, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${d2 - d1 > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const [nx, ny] = polar(ang(proyeccion), RI - 12);
  const [t1x, t1y] = polar(ang(MAXG), R - 10);
  const [t2x, t2y] = polar(ang(MAXG), R + 10);
  const sobre = proyeccion > MAXG;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 240 200" className="w-full max-w-[280px]">
        <path d={arco(START, START + SWEEP, R)} fill="none" stroke="#D8E0F2" strokeWidth="12" strokeLinecap="round" />
        <path d={arco(START, START + SWEEP, RI)} fill="none" stroke="#EEF2FA" strokeWidth="9" strokeLinecap="round" />
        {previstas > 0 && <path d={arco(START, ang(previstas), R)} fill="none" stroke={ORANGE} strokeWidth="12" strokeLinecap="round" />}
        {reales > 0 && <path d={arco(START, ang(reales), RI)} fill="none" stroke="#061B45" strokeWidth="9" strokeLinecap="round" />}
        <line x1={t1x} y1={t1y} x2={t2x} y2={t2y} stroke="#DC2626" strokeWidth="3" />
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#4C6BB4" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 2" />
        <circle cx={CX} cy={CY} r="5" fill="#4C6BB4" />
        <text x={CX} y={CY + 32} textAnchor="middle" fontSize="20" fontWeight="800" fill="#0A1530">
          {Math.round(reales).toLocaleString('es-ES')} h
        </text>
        <text x={CX} y={CY + 47} textAnchor="middle" fontSize="9.5" fill="#5B6680">
          reales · {Math.round((reales / MAXG) * 100)}% de {Math.round(MAXG).toLocaleString('es-ES')} h productivas
        </text>
      </svg>
      <div className="grid w-full grid-cols-2 gap-2 text-center text-xs">
        <div className="rounded-xl bg-brand-orange/10 px-2 py-1.5">
          <p className="font-extrabold text-brand-orangeDark">{Math.round(previstas).toLocaleString('es-ES')} h</p>
          <p className="font-semibold text-navy-400">previstas · {Math.round((previstas / MAXG) * 100)}%</p>
        </div>
        <div className={`rounded-xl px-2 py-1.5 ${sobre ? 'bg-red-50' : 'bg-navy-50'}`}>
          <p className={`font-extrabold ${sobre ? 'text-red-700' : 'text-navy-800'}`}>{Math.round(proyeccion).toLocaleString('es-ES')} h</p>
          <p className={`font-semibold ${sobre ? 'text-red-600' : 'text-navy-400'}`}>proyección · {Math.round((proyeccion / MAXG) * 100)}%</p>
        </div>
      </div>
      {sobre && <p className="mt-1.5 text-xs font-bold text-red-600">La proyección supera la capacidad productiva</p>}
      <p className="mt-1 text-xs font-medium text-navy-400">Ritmo real: {ritmo.toFixed(1)} h imputadas por día laborable transcurrido</p>
    </div>
  );
}

// ════════════════ MODAL DE TAREA ════════════════
function ModalTarea({ tarea, fecha, consultorId, consultores, proyectos, clientes, clienteTareas = [], tareasDelDia, procesosInternos = [], equipo = [], onGuardar, onBorrar, onCerrar }) {
  const fmtNum = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString('es-ES');
  const editando = Boolean(tarea?.id);
  // Una tarea que viene de un proyecto tiene origen_cliente_tarea_id: su título,
  // proyecto y código son automáticos (no editables a mano).
  const deProyecto = Boolean(tarea?.origen_cliente_tarea_id);
  const [f, setF] = useState({
    consultor_id: tarea?.consultor_id ?? consultorId,
    titulo: tarea?.titulo ?? '',
    codigo: tarea?.codigo ?? '',
    descripcion: tarea?.descripcion ?? '',
    fecha_prevista: tarea?.fecha_prevista ?? fecha,
    horas_previstas: tarea?.horas_previstas ?? 2,
    ejecuciones: Array.isArray(tarea?.ejecuciones) && tarea.ejecuciones.length
      ? tarea.ejecuciones
      : (tarea?.fecha_efectiva ? [{ fecha: tarea.fecha_efectiva, horas: Number(tarea.horas_reales) || 0 }] : []),
    proyecto_id: tarea?.proyecto_id ?? '',
    proceso_interno_id: tarea?.proceso_interno_id ?? '',
    colaboradores: Array.isArray(tarea?.colaboradores) ? tarea.colaboradores : [],
    tipo: tarea?.tipo ?? 'produccion',
    hora_inicio: tarea?.hora_inicio ?? '09:00',
    hora_fin: tarea?.hora_fin ?? '',
    horas_base: tarea?.horas_base ?? '',
    estado: tarea?.estado ?? 'pendiente',
  });
  const nivelResp = consultores.find((c) => String(c.id) === String(f.consultor_id))?.nivel || 'J2';
  const coef = EFICIENCIA[nivelResp] ?? 1;
  // Las horas de la tarea son el TOTAL (no se aplica eficiencia a la planificación).
  // La eficiencia solo afecta a las horas que CONSUME el consultor de su capacidad.
  const horasTarea = Number(f.horas_previstas) || 0;
  const horasConsultor = Math.round(horasTarea * coef * 100) / 100;
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const suma = (campoF, campoH, fechaV, horasV) =>
    tareasDelDia.filter((t) => t.id !== tarea?.id && t[campoF] === fechaV)
      .reduce((s, t) => s + Number(t[campoH] || 0), 0) + Number(horasV || 0);
  const totalPrev = suma('fecha_prevista', 'horas_previstas', f.fecha_prevista, f.horas_previstas);
  const totalReal = f.ejecuciones.reduce((s, e) => s + (Number(e.horas) || 0), 0);

  const addEjec = () => setF((x) => ({ ...x, ejecuciones: [...x.ejecuciones, { fecha: x.fecha_prevista, horas: x.horas_previstas }] }));
  const editEjec = (i, campo, val) => setF((x) => ({ ...x, ejecuciones: x.ejecuciones.map((e, j) => j === i ? { ...e, [campo]: campo === 'horas' ? Number(val) || 0 : val } : e) }));
  const quitEjec = (i) => setF((x) => ({ ...x, ejecuciones: x.ejecuciones.filter((_, j) => j !== i) }));
  const copiar = () => setF((x) => ({ ...x, ejecuciones: [{ fecha: x.fecha_prevista, horas: x.horas_previstas }], estado: 'completada' }));

  async function guardar() {
    if (!f.titulo.trim() || !f.fecha_prevista || Number(f.horas_previstas) <= 0) return;
    setGuardando(true);
    try {
      await onGuardar({
        consultor_id: f.consultor_id,
        titulo: f.titulo.trim(),
        descripcion: f.descripcion || null,
        fecha_prevista: f.fecha_prevista,
        horas_base: f.horas_base ? Number(f.horas_base) : null,
        horas_previstas: horasTarea,
        horas_consultor: horasConsultor,
        ejecuciones: f.ejecuciones,
        fecha_efectiva: f.ejecuciones[0]?.fecha || null,
        horas_reales: f.ejecuciones.length ? f.ejecuciones.reduce((s, e) => s + (Number(e.horas) || 0), 0) : null,
        proyecto_id: f.tipo === 'proceso_interno' ? null : (f.proyecto_id || null),
        proceso_interno_id: f.tipo === 'proceso_interno' ? (f.proceso_interno_id || null) : null,
        colaboradores: f.colaboradores || [],
        codigo: f.codigo || null,
        tipo: f.tipo,
        hora_inicio: f.hora_inicio || '09:00',
        hora_fin: f.hora_fin || null,
        estado: f.estado,
      }, tarea?.id);
    } finally { setGuardando(false); }
  }

  const nombreProyecto = (p) => {
    const cl = clientes.find((c) => String(c.id) === String(p.cliente_id));
    return `${cl?.empresa || 'Cliente'} · ${p.nombre || p.modelo}`;
  };
  // Proyecto de la tarea: se resuelve por la cadena origen_cliente_tarea_id →
  // cliente_tarea → proyecto_id → proyectos_cliente → cliente.
  const ctOrigen = tarea?.origen_cliente_tarea_id
    ? clienteTareas.find((ct) => String(ct.id) === String(tarea.origen_cliente_tarea_id))
    : null;
  const proyDeOrigen = ctOrigen
    ? proyectos.find((p) => String(p.id) === String(ctOrigen.proyecto_id))
    : proyectos.find((p) => String(p.id) === String(f.proyecto_id));
  const proyectoAuto = proyDeOrigen ? nombreProyecto(proyDeOrigen) : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4" onClick={onCerrar}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[22px] bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{editando ? 'Editar tarea' : 'Nueva tarea'}</h3>
          <button onClick={onCerrar} className="rounded-full px-2.5 py-1 text-navy-300 hover:bg-navy-50 hover:text-navy-700" aria-label="Cerrar">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label">Título{deProyecto ? '' : ' *'}</label>
            {deProyecto ? (
              <div className="input bg-navy-50/60 text-navy-700 font-medium">{f.titulo || '—'}</div>
            ) : (
              <input className="input" value={f.titulo} onChange={set('titulo')} autoFocus placeholder="Ej.: Auditoría interna ISO 9001 — Cliente X" />
            )}
            {f.codigo && <p className="mt-1 text-[11px] font-bold text-brand-orangeDark">Código: {f.codigo}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Responsable *</label>
              <select className="input" value={f.consultor_id} onChange={set('consultor_id')}>
                {consultores.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.nivel}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{f.tipo === 'proceso_interno' ? 'Proceso interno' : 'Proyecto'}</label>
              {deProyecto ? (
                <div className="input bg-navy-50/60 text-navy-700 font-medium">{proyectoAuto}</div>
              ) : f.tipo === 'proceso_interno' ? (
                <select className="input" value={f.proceso_interno_id} onChange={set('proceso_interno_id')}>
                  <option value="">— Elige proceso interno —</option>
                  {procesosInternos.filter((p) => p.activo !== false).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              ) : (
                <select className="input" value={f.proyecto_id} onChange={set('proyecto_id')}>
                  <option value="">— Sin proyecto —</option>
                  {proyectos.map((p) => <option key={p.id} value={p.id}>{nombreProyecto(p)}</option>)}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="label">Tipo de horas</label>
            <div className="flex gap-2">
              {TIPOS_TAREA.map((t) => (
                <button key={t.id} type="button" onClick={() => setF((x) => ({ ...x, tipo: t.id }))}
                  className={`chip flex-1 justify-center border transition ${
                    f.tipo === t.id ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'
                  }`}>{t.nombre}</button>
              ))}
            </div>
            <p className="mt-1 text-[11px] font-medium text-navy-300">Cada tipo consume su bolsa de jornada: producción {PCT_PRODUCTIVO * 100} % · gestión {PCT_GESTION * 100} % · coordinación {PCT_COORDINACION * 100} % · procesos internos {PCT_PROC_INTERNO * 100} %.</p>
          </div>

          {/* Colaboradores invitados (gestión manual) */}
          <div>
            <label className="label">Colaboradores <span className="font-normal text-navy-300">(equipo invitado a esta tarea)</span></label>
            <div className="flex flex-wrap gap-1.5">
              {equipo.filter((c) => String(c.id) !== String(f.consultor_id)).map((c) => {
                const inv = (f.colaboradores || []).some((x) => String(x.id) === String(c.id));
                return (
                  <button key={c.id} type="button"
                    onClick={() => setF((x) => ({
                      ...x,
                      colaboradores: inv
                        ? x.colaboradores.filter((y) => String(y.id) !== String(c.id))
                        : [...x.colaboradores, { id: c.id, nombre: c.nombre, email: c.email || null }],
                    }))}
                    className={`chip border transition ${inv ? 'border-brand-orange bg-brand-orange/15 text-brand-orangeDark' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'}`}>
                    {inv ? '✓ ' : '+ '}{c.nombre}
                  </button>
                );
              })}
              {equipo.length <= 1 && <span className="text-xs text-navy-300">No hay más miembros de equipo para invitar.</span>}
            </div>
          </div>

          {/* Planificado */}
          <div className="rounded-2xl border border-brand-orange/40 bg-brand-orange/5 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-orangeDark">Planificado</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Fecha prevista *</label>
                <input type="date" className="input" value={f.fecha_prevista} onChange={set('fecha_prevista')} />
              </div>
              <div>
                <label className="label">Horas de la tarea *</label>
                <input type="number" min="0.5" max="9" step="0.5" className="input"
                  value={f.horas_previstas} onChange={set('horas_previstas')} />
              </div>
            </div>
            <div className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-[11px] font-semibold text-navy-500">
              {nivelResp} · eficiencia {Math.round(coef * 100)}% → consume <strong className="text-navy-800">{horasConsultor} h</strong> de su capacidad
              {horasTarea > 9 && <span className="ml-1 text-red-600">· la tarea supera 9h/día</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="flex items-end">
                <p className="text-[11px] font-medium text-navy-300">Las horas de la tarea son su total; no varían por el nivel del consultor.</p>
              </div>
            </div>
            <div className="mt-3 flex gap-3">
              <div className="flex-1">
                <label className="label">Hora inicio</label>
                <input type="time" className="input" value={f.hora_inicio} onChange={set('hora_inicio')} />
              </div>
              <div className="flex-1">
                <label className="label">Hora fin</label>
                <input type="time" className="input" value={f.hora_fin} onChange={set('hora_fin')} />
              </div>
            </div>
            <p className="mt-1 text-[11px] font-medium text-navy-300">Horas planificadas (se usan al descargar al calendario).</p>
            {totalPrev > MAX_HORAS_DIA && (
              <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                El plan de ese día suma {totalPrev} h; el convenio limita a {MAX_HORAS_DIA} h ordinarias/día.
              </p>
            )}
          </div>

          {/* Real: varias fechas efectivas que suman */}
          <div className="rounded-2xl border border-green-300 bg-green-50/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-green-700">Ejecución real ({fmtNum(totalReal)} h)</p>
              <div className="flex gap-2">
                <button type="button" onClick={copiar} className="chip border border-green-300 bg-white text-green-700 hover:bg-green-100">⤵ Previsto → real</button>
                <button type="button" onClick={addEjec} className="chip border border-green-300 bg-white text-green-700 hover:bg-green-100">+ fecha</button>
              </div>
            </div>
            {f.ejecuciones.length === 0 ? (
              <p className="text-xs font-medium text-green-700/70">Sin ejecuciones aún. Añade una o varias fechas; sus horas se suman.</p>
            ) : (
              <div className="space-y-1.5">
                {f.ejecuciones.map((e, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="date" className="input !py-1.5 flex-1" value={e.fecha || ''} onChange={(ev) => editEjec(i, 'fecha', ev.target.value)} />
                    <input type="number" min="0.5" step="0.5" className="input !py-1.5 !w-24 text-right" value={e.horas} onChange={(ev) => editEjec(i, 'horas', ev.target.value)} />
                    <span className="text-xs text-green-700">h</span>
                    <button type="button" onClick={() => quitEjec(i)} className="text-xs font-bold text-red-400 hover:underline">×</button>
                  </div>
                ))}
                <p className="pt-1 text-right text-xs font-bold text-green-700">Total real: {fmtNum(totalReal)} h</p>
              </div>
            )}
          </div>

          <div>
            <label className="label">Estado</label>
            <div className="flex gap-2">
              {[['pendiente', 'Pendiente'], ['en_curso', 'En curso'], ['completada', 'Completada']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setF((x) => ({ ...x, estado: v }))}
                  className={`chip flex-1 justify-center border transition ${
                    f.estado === v ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'
                  }`}>{l}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea className="input" rows={2} value={f.descripcion ?? ''} onChange={set('descripcion')} />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          {editando
            ? <button onClick={() => onBorrar(tarea.id)} className="text-sm font-bold text-red-600 hover:underline">Eliminar tarea</button>
            : <span />}
          <div className="flex gap-2">
            <button onClick={onCerrar} className="btn-ghost">Cancelar</button>
            {f.titulo.trim() && (
              <button type="button" onClick={() => descargarTareaICS({ ...f, id: tarea?.id }, '')}
                className="btn-ghost" title="Descargar esta tarea (.ics) para tu calendario">⤓ Calendario</button>
            )}
            <button onClick={guardar} disabled={guardando || !f.titulo.trim()} className="btn-orange">
              {guardando ? 'Guardando…' : 'Guardar tarea'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════ CALENDARIO MENSUAL ════════════════
function Calendario({ year, mes, onCambiarMes, festivosMap, vacacionesSet, tareas, modoVacaciones, onToggleVacacion, onNuevaTarea, onEditarTarea }) {
  const hoy = hoyISO();
  const dias = diasDelMes(year, mes);
  const offset = (dias[0].getDay() + 6) % 7;
  const festivosSet = new Set(festivosMap.keys());
  const pref = `${year}-${String(mes + 1).padStart(2, '0')}-`;

  const porDia = {};
  for (const t of tareas) {
    if (t.fecha_prevista?.startsWith(pref)) (porDia[t.fecha_prevista] ??= []).push({ t, tipo: 'prev' });
    if (t.fecha_efectiva && t.horas_reales && t.fecha_efectiva.startsWith(pref) && t.fecha_efectiva !== t.fecha_prevista)
      (porDia[t.fecha_efectiva] ??= []).push({ t, tipo: 'real' });
  }
  const estilo = {
    pendiente: 'bg-brand-orange/15 text-navy-800',
    en_curso: 'bg-navy-100 text-navy-800',
    completada: 'bg-green-100 text-green-800',
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => onCambiarMes(-1)} disabled={mes === 0} className="btn-ghost !px-3 !py-1.5 disabled:opacity-30" aria-label="Mes anterior">‹</button>
        <h3 className="font-extrabold">{MESES[mes]} {year}</h3>
        <button onClick={() => onCambiarMes(1)} disabled={mes === 11} className="btn-ghost !px-3 !py-1.5 disabled:opacity-30" aria-label="Mes siguiente">›</button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DOW.map((d) => <div key={d} className="pb-1 text-center text-[11px] font-bold uppercase tracking-wider text-navy-300">{d}</div>)}
        {Array.from({ length: offset }).map((_, i) => <div key={`v${i}`} />)}

        {dias.map((d) => {
          const iso = toISO(d);
          const laborable = esLaborable(d, festivosSet);
          const festivo = festivosMap.get(iso);
          const vacacion = vacacionesSet.has(iso);
          const entradas = porDia[iso] ?? [];
          const hPrev = entradas.filter((e) => e.tipo === 'prev').reduce((s, e) => s + Number(e.t.horas_previstas), 0);
          const hReal = tareas.filter((t) => t.fecha_efectiva === iso && t.horas_reales).reduce((s, t) => s + Number(t.horas_reales), 0);
          const exceso = hPrev > MAX_HORAS_DIA || hReal > MAX_HORAS_DIA;
          const esHoy = iso === hoy;

          let base = 'border-navy-100 bg-white';
          if (!laborable && !festivo) base = 'border-navy-50 bg-navy-50/60 text-navy-300';
          if (festivo) base = 'border-red-200 bg-red-50';
          if (vacacion) base = 'border-navy-300 bg-navy-50';

          return (
            <div key={iso}
              onClick={() => {
                if (modoVacaciones) { if (laborable) onToggleVacacion(iso); return; }
                if (laborable && !vacacion) onNuevaTarea(iso);
              }}
              className={`group min-h-[88px] rounded-xl border p-1.5 transition ${base}
                ${esHoy ? 'ring-2 ring-brand-orange' : ''}
                ${laborable && (modoVacaciones || !vacacion) ? 'cursor-pointer hover:border-navy-400' : ''}`}>
              <div className="flex items-start justify-between">
                <span className={`text-xs font-bold ${esHoy ? 'text-brand-orangeDark' : ''}`}>{d.getDate()}</span>
                {laborable && !vacacion && (
                  <span className={`text-[10px] font-bold ${exceso ? 'text-red-600' : 'text-navy-300'}`}>
                    {hPrev > 0 || hReal > 0
                      ? <>{hPrev > 0 && `${hPrev}h`}{hReal > 0 && <span className="text-green-600"> ✓{hReal}h</span>}</>
                      : `· ${horasDia(d)}h`}
                  </span>
                )}
                {vacacion && <span className="text-[10px]" title="Vacaciones">✈</span>}
              </div>
              {festivo && <p className="mt-0.5 truncate text-[10px] leading-tight text-red-600">{festivo}</p>}
              {exceso && <p className="text-[10px] font-bold text-red-600">&gt;9h/día</p>}
              <div className="mt-1 space-y-0.5">
                {entradas.slice(0, 3).map(({ t, tipo }) => {
                  const hechaAqui = tipo === 'prev' && t.fecha_efectiva === t.fecha_prevista && t.horas_reales;
                  return (
                    <button key={`${t.id}-${tipo}`} type="button"
                      onClick={(e) => { e.stopPropagation(); onEditarTarea(t); }}
                      title={`${TIPO_BY_ID[t.tipo || 'produccion'].nombre} · ${t.titulo} · prev ${t.horas_previstas}h${t.horas_reales ? ` · real ${t.horas_reales}h` : ''}`}
                      className={`block w-full truncate rounded-md px-1 py-0.5 text-left text-[10px] font-bold
                        ${tipo === 'real' ? 'border border-green-300 bg-white text-green-700' : estilo[t.estado] ?? estilo.pendiente}`}>
                      {(t.tipo === 'gestion' || t.tipo === 'coordinacion' || t.tipo === 'proceso_interno') && <span className="mr-0.5 rounded bg-navy-800 px-0.5 text-[8px] text-white">{t.tipo === 'gestion' ? 'G' : t.tipo === 'coordinacion' ? 'C' : 'PI'}</span>}
                      {tipo === 'real' ? <>✓{t.horas_reales}h · {t.titulo}</> : <>{hechaAqui ? `✓${t.horas_reales}` : t.horas_previstas}h · {t.titulo}</>}
                    </button>
                  );
                })}
                {entradas.length > 3 && <p className="text-[10px] font-semibold text-navy-300">+{entradas.length - 3} más</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-navy-400">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-red-200 align-middle" />Festivo</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-navy-200 align-middle" />Vacaciones</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-brand-orange/30 align-middle" />Pendiente</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-navy-100 align-middle" />En curso</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-green-200 align-middle" />Completada</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded border border-green-300 bg-white align-middle" />✓ Real en otro día</span>
      </div>
    </div>
  );
}

// ════════════════ PÁGINA PRINCIPAL ════════════════
export default function Agenda() {
  const YEAR = YEAR_AGENDA;
  const [consultores, setConsultores] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [procesosInternos, setProcesosInternos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [clienteTareas, setClienteTareas] = useState([]);
  const [consultorId, setConsultorId] = useState('');
  const [equipoSel, setEquipoSel] = useState(new Set()); // consultores incluidos en los relojes (suma)
  const [tareasEquipo, setTareasEquipo] = useState([]);   // tareas de todo el equipo seleccionado
  const [mes, setMes] = useState(new Date().getFullYear() === YEAR ? new Date().getMonth() : 0);
  const [festivos, setFestivos] = useState([]);
  const [vacaciones, setVacaciones] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [modoVacaciones, setModoVacaciones] = useState(false);
  const [vista, setVista] = useState('calendario');
  const [modal, setModal] = useState(null);
  const [err, setErr] = useState(null);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    listTable('consultores').then((c) => {
      const act = c.filter((x) => x.activo !== false);
      setConsultores(act);
      if (act.length) { setConsultorId(String(act[0].id)); setEquipoSel(new Set([String(act[0].id)])); }
    }).catch(() => setErr('No se pudieron cargar los consultores.'));
    listTable('proyectos_cliente').then(setProyectos).catch(() => { listTable('proyectos').then(setProyectos).catch(() => {}); });
    listTable('procesos_internos').then(setProcesosInternos).catch(() => setProcesosInternos([]));
    listTable('clientes').then(setClientes).catch(() => {});
    listTable('cliente_tareas').then(setClienteTareas).catch(() => setClienteTareas([]));
  }, []);

  useEffect(() => {
    if (!consultorId) return;
    setErr(null);
    (async () => {
      const fallos = [];
      try { setFestivos(await getFestivos(YEAR)); }
      catch (e) { console.error('festivos', e); setFestivos(FESTIVOS_2026); fallos.push(`festivos: ${e.message || e.code}`); }
      try { setVacaciones(await getVacaciones(consultorId, YEAR)); }
      catch (e) { console.error('vacaciones', e); setVacaciones([]); fallos.push(`vacaciones: ${e.message || e.code}`); }
      try { setTareas(await getTareasAgenda(consultorId, YEAR)); }
      catch (e) { console.error('agenda_tareas', e); setTareas([]); fallos.push(`agenda_tareas: ${e.message || e.code}`); }
      if (fallos.length) {
        setErr(`Error cargando la agenda → ${fallos.join(' · ')}. Si las tablas no existen, ejecuta supabase/agenda.sql en el proyecto consultify (SQL Editor → Run).`);
      }
    })();
  }, [consultorId]);

  // Tareas de TODO el equipo seleccionado (para los relojes sumados).
  useEffect(() => {
    const ids = [...equipoSel];
    if (!ids.length) { setTareasEquipo([]); return; }
    Promise.all(ids.map((id) => getTareasAgenda(id, YEAR).catch(() => [])))
      .then((arrs) => setTareasEquipo(arrs.flat()))
      .catch(() => setTareasEquipo([]));
  }, [equipoSel, tareas]);

  const festivosMap = useMemo(() => new Map(festivos.map((f) => [f.fecha, f.nombre])), [festivos]);
  const festivosSet = useMemo(() => new Set(festivos.map((f) => f.fecha)), [festivos]);
  const vacacionesSet = useMemo(() => new Set(vacaciones.map((v) => v.fecha)), [vacaciones]);

  const consultorSel = consultores.find((c) => String(c.id) === String(consultorId));
  // Capacidad sumada de los consultores incluidos en los relojes.
  const pctJornadaEquipo = useMemo(() => {
    const ids = [...equipoSel];
    if (!ids.length) return consultorSel?.pct_jornada ?? 100;
    return ids.reduce((s, id) => {
      const c = consultores.find((x) => String(x.id) === String(id));
      return s + (c?.pct_jornada ?? 100);
    }, 0);
  }, [equipoSel, consultores, consultorSel]);
  const pctJornada = consultorSel?.pct_jornada ?? 100;
  // Los relojes usan las tareas del equipo seleccionado y la capacidad sumada.
  const anual = useMemo(() => resumenAnual(YEAR, festivosSet, vacacionesSet, tareasEquipo, pctJornadaEquipo), [festivosSet, vacacionesSet, tareasEquipo, pctJornadaEquipo]);
  const rMes = anual.meses[mes];
  // Meses elegidos para el reloj de arriba (multi-mes, suma).
  const [mesesReloj, setMesesReloj] = useState(() => new Set([new Date().getFullYear() === YEAR ? new Date().getMonth() : 0]));
  const rMesSel = useMemo(() => {
    const ids = [...mesesReloj];
    const acc = { previstas: 0, reales: 0, productivas: 0, objetivo: 0, laborables: 0 };
    for (const i of ids) {
      const m = anual.meses[i]; if (!m) continue;
      acc.previstas += m.previstas; acc.reales += m.reales; acc.productivas += m.productivas;
      acc.objetivo += m.objetivo; acc.laborables += m.laborables;
    }
    return acc;
  }, [mesesReloj, anual]);
  const etiquetaMeses = useMemo(() => {
    const ids = [...mesesReloj].sort((a, b) => a - b);
    if (!ids.length) return '—';
    if (ids.length === 1) return MESES[ids[0]];
    if (ids.length === 12) return 'Todo el año';
    return ids.map(i => MESES[i].slice(0, 3)).join(' + ');
  }, [mesesReloj]);
  const nombresEquipoSel = useMemo(() =>
    [...equipoSel].map(id => consultores.find(c => String(c.id) === String(id))?.nombre).filter(Boolean).join(' + ') || '—',
    [equipoSel, consultores]);
  const tareasMes = useMemo(() => tareas
    .filter(t => t.fecha_prevista && new Date(t.fecha_prevista).getMonth() === mes && new Date(t.fecha_prevista).getFullYear() === YEAR)
    .sort((a, b) => (a.fecha_prevista || '').localeCompare(b.fecha_prevista || '')), [tareas, mes]);
  const vacRestantes = DIAS_VACACIONES - anual.total.diasVacaciones;
  const desvMes = r1(rMes.reales - rMes.previstas);

  const grafico = anual.meses.map((m) => ({
    nombre: m.nombre.slice(0, 3),
    Jornada: Math.round(m.objetivo),
    Productivas: Math.round(m.productivas),
    Previstas: r1(m.previstas),
    Reales: r1(m.reales),
  }));
  const mediaProductiva = Math.round(anual.capProductiva / 12);

  async function onToggleVacacion(iso) {
    try {
      const añadida = await toggleVacacion(consultorId, iso);
      setVacaciones((v) => añadida ? [...v, { id: `t-${iso}`, consultor_id: consultorId, fecha: iso }] : v.filter((x) => x.fecha !== iso));
      if (añadida) {
        // Reagendar las tareas previstas en ese día al siguiente día laborable libre.
        const enEseDia = tareas.filter((t) => t.fecha_prevista === iso);
        if (enEseDia.length) {
          const ocupados = new Set([...vacacionesSet, iso, ...festivosSet]);
          const siguienteHabil = (desdeISO) => {
            const d = new Date(desdeISO);
            for (let i = 0; i < 366; i++) {
              d.setDate(d.getDate() + 1);
              const di = toISO(d);
              if (esLaborable(d, festivosSet) && !ocupados.has(di)) return di;
            }
            return desdeISO;
          };
          const destino = siguienteHabil(iso);
          const movidas = [];
          for (const t of enEseDia) {
            const upd = await actualizarTareaAgenda(t.id, { fecha_prevista: destino });
            movidas.push(upd);
          }
          setTareas((ts) => ts.map((x) => movidas.find((m) => m.id === x.id) || x));
          setAviso(`Vacaciones el ${iso}: ${enEseDia.length} tarea(s) reagendada(s) al ${destino}.`);
        }
      }
    } catch { setErr('No se pudo guardar el día de vacaciones.'); }
  }

  // ── Acciones masivas sobre las tareas del consultor visible ──
  async function reasignarTodas(nuevoConsultorId) {
    if (!nuevoConsultorId || !tareas.length) return;
    if (!confirm(`¿Reasignar las ${tareas.length} tareas visibles a otro consultor?`)) return;
    try {
      for (const t of tareas) await actualizarTareaAgenda(t.id, { consultor_id: nuevoConsultorId });
      setTareas([]); // ya no son del consultor visible
      setAviso(`${tareas.length} tarea(s) reasignada(s).`);
    } catch { setErr('No se pudieron reasignar las tareas.'); }
  }

  async function cambiarTipoTodas(tipo) {
    if (!tipo || !tareas.length) return;
    if (!confirm(`¿Cambiar el tipo de las ${tareas.length} tareas visibles a "${TIPO_BY_ID[tipo]?.nombre || tipo}"?`)) return;
    try {
      const upd = [];
      for (const t of tareas) upd.push(await actualizarTareaAgenda(t.id, { tipo }));
      setTareas(upd);
      setAviso(`Tipo cambiado en ${upd.length} tarea(s).`);
    } catch { setErr('No se pudo cambiar el tipo.'); }
  }

  async function guardarTarea(datos, id) {
    try {
      if (id) {
        const t = await actualizarTareaAgenda(id, datos);
        setTareas((ts) => String(t.consultor_id) === String(consultorId)
          ? ts.map((x) => (x.id === id ? t : x))
          : ts.filter((x) => x.id !== id)); // reasignada a otro responsable
      } else {
        const t = await crearTareaAgenda(datos);
        if (String(t.consultor_id) === String(consultorId)) setTareas((ts) => [...ts, t]);
      }
      // Resincronizar los relojes del equipo (por si cambió el consultor).
      const ids = [...equipoSel];
      if (ids.length) Promise.all(ids.map((cid) => getTareasAgenda(cid, YEAR).catch(() => []))).then((a) => setTareasEquipo(a.flat()));
      setModal(null);
    } catch (e) { setErr('No se pudo guardar la tarea: ' + (e?.message || e?.error_description || 'error desconocido')); }
  }

  async function borrarTarea(id) {
    try { await borrarTareaAgenda(id); setTareas((ts) => ts.filter((x) => x.id !== id)); setModal(null); }
    catch { setErr('No se pudo eliminar la tarea.'); }
  }

  const consultor = consultores.find((c) => String(c.id) === String(consultorId));

  const Kpi = ({ label, value, sub, alerta }) => (
    <div className="card !p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-navy-300">{label}</p>
      <p className={`mt-1 text-xl font-extrabold ${alerta ? 'text-red-600' : 'text-navy-900'}`}>{value}</p>
      {sub && <p className={`text-[11px] font-semibold ${alerta ? 'text-red-500' : 'text-navy-400'}`}>{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Acciones (el consultor se elige en el box de los relojes) */}
      <div className="flex flex-wrap items-end justify-end gap-3">
        <div className="flex gap-2">
          <button onClick={() => descargarAgendaICS(tareas, consultor?.nombre ? `${consultor.nombre} ${consultor.apellidos || ''}`.trim() : '', `${consultor?.nombre || 'agenda'}-${YEAR}`)}
            disabled={!tareas.length} className="btn-ghost disabled:opacity-40"
            title="Descargar todas las tareas como .ics para importar en tu calendario">
            ⤓ Descargar a calendario
          </button>
          <button onClick={() => setModoVacaciones((m) => !m)}
            className={modoVacaciones ? 'btn-primary' : 'btn-ghost'}>
            ✈ {modoVacaciones ? 'Marcando vacaciones — clic en los días' : 'Marcar vacaciones'}
          </button>
          {/* Reloj de vacaciones disfrutadas por este consultor */}
          <div className="flex items-center gap-2 rounded-xl border border-navy-100 bg-navy-50/50 px-3 py-1.5" title="Días de vacaciones marcados este año">
            <span className="text-lg">✈</span>
            <div className="leading-tight">
              <div className="text-sm font-extrabold text-navy-900">{vacacionesSet.size} / {DIAS_VACACIONES} días</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">
                {Math.max(0, DIAS_VACACIONES - vacacionesSet.size)} disponibles
              </div>
            </div>
            <div className="ml-1 h-8 w-8 shrink-0">
              <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e9f0" strokeWidth="5" />
                <circle cx="18" cy="18" r="15" fill="none" stroke={vacacionesSet.size > DIAS_VACACIONES ? '#dc2626' : '#F5A623'} strokeWidth="5"
                  strokeDasharray={`${Math.min(100, (vacacionesSet.size / DIAS_VACACIONES) * 100) * 0.942} 999`} strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {err && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{err}</div>}
      {aviso && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-orange/10 px-4 py-3 text-sm font-bold text-brand-orangeDark">
          <span>⤴ {aviso}</span>
          <button onClick={() => setAviso(null)} className="text-brand-orangeDark/60 hover:text-brand-orangeDark">✕</button>
        </div>
      )}

      {/* Equipo en los relojes (arriba) */}
      <BoxEquipo consultores={consultores} sel={equipoSel} setSel={setEquipoSel}
        activoId={consultorId} onActivo={setConsultorId} capacidad={pctJornadaEquipo} />

      {/* KPIs del mes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label={`Jornada ${MESES[mes]}`} value={`${Math.round(rMes.objetivo)} h`}
          sub={`${rMes.laborables} laborables${mes === 7 ? ' · intensiva 36 h/sem' : ''}`} />
        <Kpi label="Productivas (70 %)" value={`${Math.round(rMes.productivas)} h`}
          sub={`Gestión ${Math.round(rMes.gestion)} h · Coord. ${Math.round(rMes.coordinacion)} h · P.internos ${Math.round(rMes.procesoInterno || 0)} h`} />
        <Kpi label="Previstas (mes)" value={`${r1(rMes.previstas)} h`}
          sub={`P ${r1(rMes.prevTipo.produccion)} · G ${r1(rMes.prevTipo.gestion)} · C ${r1(rMes.prevTipo.coordinacion)} · PI ${r1(rMes.prevTipo.proceso_interno || 0)}`}
          alerta={rMes.prevTipo.produccion > rMes.productivas} />
        <Kpi label="Reales (mes)" value={`${r1(rMes.reales)} h`}
          sub={rMes.reales > 0 ? `Desviación ${desvMes > 0 ? '+' : ''}${desvMes} h vs plan` : 'Sin horas imputadas'}
          alerta={desvMes > 0} />
        <Kpi label="Disponibles (mes)" value={`${r1(rMes.disponibles)} h`} />
        <Kpi label="Vacaciones" value={`${anual.total.diasVacaciones} / ${DIAS_VACACIONES} días`}
          sub={vacRestantes >= 0 ? `Quedan ${vacRestantes}` : `Exceso de ${-vacRestantes} días`}
          alerta={vacRestantes < 0} />
      </div>

      <div className="grid gap-6">
        <div className="card">
          <div className="mb-3 flex gap-2">
            <button onClick={() => setVista('calendario')} className={`chip text-xs font-bold ${vista === 'calendario' ? 'bg-navy-800 text-white' : 'border border-navy-200 text-navy-500'}`}>📅 Calendario</button>
            <button onClick={() => setVista('planning')} className={`chip text-xs font-bold ${vista === 'planning' ? 'bg-navy-800 text-white' : 'border border-navy-200 text-navy-500'}`}>🗓️ Planning</button>
            <button onClick={() => setVista('lista')} className={`chip text-xs font-bold ${vista === 'lista' ? 'bg-navy-800 text-white' : 'border border-navy-200 text-navy-500'}`}>☰ Lista</button>
          </div>
          {vista === 'planning' ? (
            <CalendarioPlanning
              year={YEAR} monthInicial={mes} tareas={tareas}
              festivosSet={new Set(Object.keys(festivosMap || {}))}
              onDia={(fecha) => setModal({ fecha })}
              onTarea={(tarea) => setModal({ tarea })}
            />
          ) : vista === 'calendario' ? (
            <Calendario
              year={YEAR} mes={mes} onCambiarMes={(d) => setMes((m) => Math.min(11, Math.max(0, m + d)))}
              festivosMap={festivosMap} vacacionesSet={vacacionesSet} tareas={tareas}
              modoVacaciones={modoVacaciones}
              onToggleVacacion={onToggleVacacion}
              onNuevaTarea={(fecha) => setModal({ fecha })}
              onEditarTarea={(tarea) => setModal({ tarea })}
            />
          ) : (
            <div className="overflow-x-auto">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-300">Tareas de {MESES[mes]} ({tareasMes.length})</p>
              {tareasMes.length === 0 ? (
                <p className="text-sm font-medium text-navy-300">Sin tareas este mes.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                      <th className="py-2">Fecha</th><th className="py-2">Tarea</th><th className="py-2">Tipo</th>
                      <th className="py-2 text-right">Prev.</th><th className="py-2 text-right">Real</th><th className="py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-50">
                    {tareasMes.map(t => (
                      <tr key={t.id} className="cursor-pointer hover:bg-navy-50/50" onClick={() => setModal({ tarea: t })}>
                        <td className="py-1.5 font-medium">{t.fecha_prevista}</td>
                        <td className="py-1.5">{t.codigo && <span className="mr-1 font-bold text-brand-orangeDark text-xs">{t.codigo}</span>}{t.titulo}</td>
                        <td className="py-1.5">{TIPO_BY_ID[t.tipo]?.nombre || t.tipo}</td>
                        <td className="py-1.5 text-right">{Number(t.horas_previstas) || 0}h</td>
                        <td className="py-1.5 text-right">{t.horas_reales != null ? `${t.horas_reales}h` : '—'}</td>
                        <td className="py-1.5">{t.estado || 'pendiente'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-navy-300">
              Reloj · {etiquetaMeses}
            </p>
            <details className="relative">
              <summary className="chip cursor-pointer border border-navy-200 text-xs font-bold text-navy-500 list-none">Elegir meses ▾</summary>
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-navy-100 bg-white p-2 shadow-lg">
                <div className="mb-2 flex gap-2">
                  <button onClick={() => setMesesReloj(new Set(MESES.map((_, i) => i)))} className="chip border border-navy-200 text-[11px] font-bold text-navy-500">Todos</button>
                  <button onClick={() => setMesesReloj(new Set())} className="chip border border-navy-200 text-[11px] font-bold text-navy-500">Ninguno</button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {MESES.map((m, i) => {
                    const on = mesesReloj.has(i);
                    return (
                      <button key={m} onClick={() => setMesesReloj(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                        className={`chip justify-center border text-[11px] font-bold ${on ? 'border-brand-orange bg-brand-orange/15 text-navy-900' : 'border-navy-200 text-navy-400'}`}>
                        {on ? '✓' : ''}{m.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </details>
          </div>
          <div className="mt-2">
            <RelojAnual previstas={rMesSel.previstas} reales={rMesSel.reales}
              proyeccion={rMesSel.previstas} ritmo={rMesSel.laborables > 0 ? rMesSel.reales / rMesSel.laborables : 0}
              capacidad={rMesSel.productivas} />
          </div>
          <div className="mt-3 space-y-1 border-t border-navy-50 pt-3 text-xs font-medium text-navy-400">
            <p className="font-bold text-navy-600">Sumatorio de: {nombresEquipoSel}</p>
            <p>Meses: <strong className="text-navy-800">{etiquetaMeses}</strong> · {rMesSel.laborables} laborables</p>
            <p>Jornada del periodo: <strong className="text-navy-800">{Math.round(rMesSel.objetivo)} h</strong></p>
            <p>Capacidad productiva ({PCT_PRODUCTIVO * 100} %): <strong className="text-navy-800">{Math.round(rMesSel.productivas)} h</strong></p>
            <p>Previstas: <strong className="text-navy-800">{Math.round(rMesSel.previstas)} h</strong> · Reales: <strong className="text-navy-800">{Math.round(rMesSel.reales)} h</strong></p>
          </div>

          <p className="mt-5 border-t border-navy-100 pt-4 text-xs font-bold uppercase tracking-[0.16em] text-navy-300">
            Reloj anual · {nombresEquipoSel} {YEAR}
          </p>
          <div className="mt-2">
            <RelojAnual previstas={anual.total.previstas} reales={anual.total.reales}
              proyeccion={anual.proyeccion} ritmo={anual.ritmo} capacidad={anual.capProductiva} />
          </div>
          <div className="mt-3 space-y-1 border-t border-navy-50 pt-3 text-xs font-medium text-navy-400">
            <p>Calendario {YEAR} tras festivos y vacaciones: <strong className="text-navy-800">{Math.round(anual.total.horasConvenio - anual.total.horasVacaciones)} h</strong></p>
            <p>Jornada anual real (con intensiva verano): <strong className="text-navy-800">{Math.round(anual.total.objetivo)} h</strong> de máx. {TOPE_ANUAL} h</p>
            {anual.margenTope > 0 && (
              <p>Margen hasta el tope legal: <strong className="text-navy-800">{Math.round(anual.margenTope)} h</strong></p>
            )}
            {anual.ajusteTope > 0 && (
              <p className="font-bold text-red-600">⚠ El calendario supera el tope en {Math.round(anual.ajusteTope)} h; revisar festivos o intensiva.</p>
            )}
            <p>Reparto: <strong className="text-navy-800">{Math.round(anual.total.productivas)} h</strong> productivas ({PCT_PRODUCTIVO * 100} %) · {Math.round(anual.total.gestion)} h gestión ({PCT_GESTION * 100} %) · {Math.round(anual.total.coordinacion)} h coordinación ({PCT_COORDINACION * 100} %)</p>
            <p>Desviación anual real vs plan: <strong className="text-navy-800">{r1(anual.total.reales - anual.total.previstas)} h</strong></p>
          </div>
          <div className="mt-3 space-y-2 border-t border-navy-50 pt-3">
            {[
              ['Producción', anual.total.prevTipo.produccion, anual.total.productivas, '#F5A623'],
              ['Gestión', anual.total.prevTipo.gestion, anual.total.gestion, '#4C6BB4'],
              ['Coordinación', anual.total.prevTipo.coordinacion, anual.total.coordinacion, '#061B45'],
            ].map(([nombre, usado, bolsa, color]) => {
              const pct = bolsa > 0 ? Math.round((usado / bolsa) * 100) : 0;
              return (
                <div key={nombre}>
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-navy-500">{nombre}</span>
                    <span className={pct > 100 ? 'text-red-600' : 'text-navy-400'}>{Math.round(usado)} / {Math.round(bolsa)} h · {pct}%</span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-navy-50">
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: pct > 100 ? '#DC2626' : color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-navy-300">Horas por mes · jornada, capacidad productiva (70 %), previstas y reales</p>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grafico} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF2FA" />
              <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={mediaProductiva} stroke="#DC2626" strokeDasharray="4 4"
                label={{ value: `Media prod. ${mediaProductiva}h`, fontSize: 10, fill: '#DC2626', position: 'right' }} />
              <Bar dataKey="Jornada" fill="#D8E0F2" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Productivas" fill="#4C6BB4" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Previstas" fill={ORANGE} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Reales" fill={NAVY} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {modal && (
        <ModalTarea
          tarea={modal.tarea} fecha={modal.fecha ?? modal.tarea?.fecha_prevista}
          consultorId={consultorId} consultores={consultores}
          proyectos={proyectos} clientes={clientes} clienteTareas={clienteTareas} tareasDelDia={tareas}
          procesosInternos={procesosInternos} equipo={consultores}
          onGuardar={guardarTarea} onBorrar={borrarTarea} onCerrar={() => setModal(null)}
        />
      )}
    </div>
  );
}
