import { useState } from 'react';
import { TIPO_BY_ID } from '../../lib/agenda.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Color por tipo de tarea (coherente con el reparto de jornada)
const COLOR_TIPO = {
  produccion: '#F5A623',
  gestion: '#0A2A6C',
  coordinacion: '#1E3A8A',
  proceso_interno: '#0e7490',
};

const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Calendario mensual tipo planning.
 * props:
 *  - year, monthInicial
 *  - tareas: [{fecha_prevista, titulo, horas_previstas, tipo, estado, ...}]
 *  - onDia(fechaISO): al pulsar un día (opcional, p.ej. crear tarea)
 *  - onTarea(tarea): al pulsar una tarea (opcional, p.ej. editar)
 *  - festivosSet: Set de fechas ISO festivas (opcional)
 */
export default function CalendarioPlanning({ year = new Date().getFullYear(), monthInicial = new Date().getMonth(), tareas = [], onDia, onTarea, festivosSet = new Set(), anioMin, anioMax }) {
  const [mes, setMes] = useState(monthInicial);
  const [anio, setAnio] = useState(year);

  // Agrupar tareas por día
  const porDia = {};
  for (const t of tareas) {
    if (!t.fecha_prevista) continue;
    (porDia[t.fecha_prevista] ??= []).push(t);
  }

  // Construir la rejilla (lunes a domingo)
  const primero = new Date(anio, mes, 1);
  const offset = (primero.getDay() + 6) % 7; // 0=lunes
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(new Date(anio, mes, d));
  while (celdas.length % 7 !== 0) celdas.push(null);

  const hoy = toISO(new Date());
  // Navegación perpetua: al pasar de dic→ene o ene→dic, cambia también el año.
  const cambiarMes = (delta) => {
    let m = mes + delta, y = anio;
    if (m > 11) { m = 0; y += 1; }
    if (m < 0) { m = 11; y -= 1; }
    setMes(m); setAnio(y);
  };

  // Rango de años para el desplegable (por defecto: 2 años atrás → 6 adelante).
  const hoyAnio = new Date().getFullYear();
  const desdeAnio = anioMin ?? (hoyAnio - 2);
  const hastaAnio = anioMax ?? (hoyAnio + 6);
  const anios = [];
  for (let a = desdeAnio; a <= hastaAnio; a++) anios.push(a);
  // Asegura que el año actualmente seleccionado esté siempre en la lista.
  if (!anios.includes(anio)) anios.push(anio), anios.sort((a, b) => a - b);

  const horasDia = (iso) => (porDia[iso] || []).reduce((s, t) => s + (Number(t.horas_previstas) || 0), 0);

  return (
    <div className="card p-0 overflow-hidden">
      {/* Cabecera navegación: flechas + dos desplegables (mes / año) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-navy-100">
        <button onClick={() => cambiarMes(-1)}
          className="rounded-lg px-3 py-1.5 text-sm font-bold text-navy-500 hover:bg-navy-50">←</button>
        <div className="flex items-center gap-2">
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))}
            className="rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-sm font-bold text-navy-800">
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}
            className="rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-sm font-bold text-navy-800">
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={() => { setMes(new Date().getMonth()); setAnio(hoyAnio); }}
            className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-orangeDark hover:bg-brand-orange/10" title="Ir al mes actual">Hoy</button>
        </div>
        <button onClick={() => cambiarMes(1)}
          className="rounded-lg px-3 py-1.5 text-sm font-bold text-navy-500 hover:bg-navy-50">→</button>
      </div>

      {/* Cabecera días de la semana */}
      <div className="grid grid-cols-7 border-b border-navy-100 bg-navy-50/40">
        {DOW.map((d) => <div key={d} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-navy-400">{d}</div>)}
      </div>

      {/* Rejilla */}
      <div className="grid grid-cols-7">
        {celdas.map((dia, i) => {
          if (!dia) return <div key={i} className="min-h-[90px] border-b border-r border-navy-50 bg-navy-50/20" />;
          const iso = toISO(dia);
          const items = porDia[iso] || [];
          const esFinde = dia.getDay() === 0 || dia.getDay() === 6;
          const esFestivo = festivosSet.has(iso);
          const esHoy = iso === hoy;
          const hd = horasDia(iso);
          return (
            <div key={i}
              onClick={() => onDia && !esFinde && !esFestivo && onDia(iso)}
              className={`min-h-[90px] border-b border-r border-navy-50 p-1.5 align-top transition ${esFinde || esFestivo ? 'bg-navy-50/40' : 'bg-white hover:bg-brand-orange/5'} ${onDia && !esFinde && !esFestivo ? 'cursor-pointer' : ''}`}>
              <div className="flex items-center justify-between">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${esHoy ? 'bg-brand-orange text-navy-900' : esFinde || esFestivo ? 'text-navy-300' : 'text-navy-600'}`}>{dia.getDate()}</span>
                {hd > 0 && <span className="text-[10px] font-bold text-navy-400">{Math.round(hd * 10) / 10}h</span>}
              </div>
              <div className="mt-1 space-y-0.5">
                {items.slice(0, 3).map((t) => {
                  const col = COLOR_TIPO[t.tipo] || COLOR_TIPO.produccion;
                  const hecha = (t.estado === 'completada') || (t.horas_reales && Number(t.horas_reales) > 0);
                  return (
                    <button key={t.id} type="button"
                      onClick={(e) => { e.stopPropagation(); onTarea && onTarea(t); }}
                      title={`${TIPO_BY_ID[t.tipo]?.nombre || t.tipo} · ${t.titulo} · ${t.horas_previstas}h`}
                      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-semibold hover:opacity-80"
                      style={{ background: `${col}1a`, color: col }}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: col }} />
                      <span className="truncate">{hecha ? '✓ ' : ''}{t.titulo}</span>
                    </button>
                  );
                })}
                {items.length > 3 && <p className="px-1 text-[9px] font-bold text-navy-300">+{items.length - 3} más</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-navy-100 text-[11px] font-semibold text-navy-400">
        {Object.entries(COLOR_TIPO).map(([tipo, col]) => (
          <span key={tipo} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: col }} />
            {TIPO_BY_ID[tipo]?.nombre || tipo}
          </span>
        ))}
      </div>
    </div>
  );
}
