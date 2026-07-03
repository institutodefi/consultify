import { useEffect, useMemo, useState } from 'react';
import { listTable } from '../../lib/data.js';
import { getTareasAgenda, TIPO_BY_ID } from '../../lib/agenda.js';
import { useAuth } from '../../lib/auth.jsx';
import CalendarioPlanning from './CalendarioPlanning.jsx';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const YEAR = new Date().getFullYear();
const fmtH = (h) => `${(Math.round((h || 0) * 100) / 100).toLocaleString('es-ES')} h`;

// Reloj de jornada: medidor semicircular previsto (naranja) vs efectivo (navy) sobre la capacidad.
function RelojJornada({ titulo, valor, capacidad, color, sub }) {
  const R = 80, CX = 100, CY = 100, START = 135, SWEEP = 270;
  const MAXG = capacidad > 0 ? capacidad : 1;
  const ang = (h) => START + SWEEP * Math.min(h / MAXG, 1) ;
  const polar = (deg, r) => { const a = (deg * Math.PI) / 180; return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };
  const arco = (d1, d2, r) => {
    const [x1, y1] = polar(d1, r), [x2, y2] = polar(d2, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${d2 - d1 > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const pct = Math.round((valor / MAXG) * 100);
  return (
    <div className="flex flex-col items-center rounded-2xl border border-navy-100 p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-navy-300">{titulo}</p>
      <svg viewBox="0 0 200 170" className="w-full max-w-[180px]">
        <path d={arco(START, START + SWEEP, R)} fill="none" stroke="#EEF2FA" strokeWidth="13" strokeLinecap="round" />
        {valor > 0 && <path d={arco(START, ang(valor), R)} fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" />}
        <text x={CX} y={CY + 6} textAnchor="middle" fontSize="24" fontWeight="800" fill="#0A1530">{Math.round(valor).toLocaleString('es-ES')}</text>
        <text x={CX} y={CY + 24} textAnchor="middle" fontSize="11" fill="#5B6680">horas · {pct}%</text>
      </svg>
      <p className="text-[11px] font-medium text-navy-400">{sub}</p>
    </div>
  );
}

export default function MiAgenda() {
  const { user } = useAuth();
  const [yo, setYo] = useState(null);          // mi ficha de consultor
  const [tareas, setTareas] = useState([]);
  const [mesesSel, setMesesSel] = useState(new Set([new Date().getMonth()]));
  const [cargado, setCargado] = useState(false);
  const [vista, setVista] = useState('lista'); // 'lista' | 'planning'

  // Identifica MI consultor por el email del usuario logueado.
  useEffect(() => {
    listTable('consultores').then(cs => {
      const act = cs.filter(c => c.activo !== false);
      const mail = (user?.email || '').toLowerCase();
      const mio = act.find(c => (c.email || '').toLowerCase() === mail) || act[0] || null;
      setYo(mio); setCargado(true);
    }).catch(() => setCargado(true));
  }, [user]);

  // Carga SOLO mis tareas.
  useEffect(() => {
    if (!yo?.id) { setTareas([]); return; }
    getTareasAgenda(yo.id, YEAR).then(setTareas).catch(() => setTareas([]));
  }, [yo]);

  const capacidad = yo?.pct_jornada ?? 100;       // % de jornada → usamos como tope del reloj (h productivas/mes aprox.)
  const capacidadH = Math.round((capacidad / 100) * 160 * 0.7); // 160 h/mes × 70% productivo, escalado a meses elegidos
  const nMeses = Math.max(mesesSel.size, 1);
  const topeJornada = capacidadH * nMeses;

  const toggleMes = (m) => setMesesSel(s => { const n = new Set(s); n.has(m) ? n.delete(m) : n.add(m); return n; });
  const todos = () => setMesesSel(new Set(MESES.map((_, i) => i)));
  const ninguno = () => setMesesSel(new Set());
  const mesDe = (iso) => iso ? new Date(iso).getMonth() : null;

  const filas = useMemo(() => {
    return [...mesesSel].sort((a, b) => a - b).map(m => {
      const delMes = tareas.filter(t => mesDe(t.fecha_prevista) === m);
      const prevista = delMes.reduce((s, t) => s + (Number(t.horas_previstas) || 0), 0);
      const efectiva = delMes.reduce((s, t) => s + (Number(t.horas_reales) || 0), 0);
      const pendientes = delMes.filter(t => (t.estado || 'pendiente') !== 'completada');
      const hPend = pendientes.reduce((s, t) => s + (Number(t.horas_previstas) || 0), 0);
      // Horas previstas desglosadas por tipo de jornada
      const porTipo = { produccion: 0, gestion: 0, coordinacion: 0, proceso_interno: 0 };
      for (const t of delMes) {
        const tipo = t.tipo && porTipo.hasOwnProperty(t.tipo) ? t.tipo : 'produccion';
        porTipo[tipo] += Number(t.horas_previstas) || 0;
      }
      return { mes: m, prevista, efectiva, nPend: pendientes.length, hPend, total: delMes.length, porTipo };
    });
  }, [tareas, mesesSel]);

  const tareasPendientes = useMemo(() =>
    tareas.filter(t => mesesSel.has(mesDe(t.fecha_prevista)) && (t.estado || 'pendiente') !== 'completada')
      .sort((a, b) => (a.fecha_prevista || '').localeCompare(b.fecha_prevista || '')), [tareas, mesesSel]);

  const tot = filas.reduce((a, f) => ({
    prev: a.prev + f.prevista, efe: a.efe + f.efectiva, pend: a.pend + f.hPend,
    produccion: a.produccion + f.porTipo.produccion,
    gestion: a.gestion + f.porTipo.gestion,
    coordinacion: a.coordinacion + f.porTipo.coordinacion,
    proceso_interno: a.proceso_interno + f.porTipo.proceso_interno,
  }), { prev: 0, efe: 0, pend: 0, produccion: 0, gestion: 0, coordinacion: 0, proceso_interno: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Mi agenda</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">Mis tareas y mi jornada</h1>
          {yo && <p className="mt-1 text-sm font-medium text-navy-400">{yo.nombre} {yo.apellidos || ''} · jornada {capacidad}%</p>}
        </div>
        <div className="inline-flex rounded-xl border border-navy-200 p-0.5">
          <button onClick={() => setVista('lista')} className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${vista === 'lista' ? 'bg-navy-800 text-white' : 'text-navy-400 hover:text-navy-700'}`}>Lista</button>
          <button onClick={() => setVista('planning')} className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${vista === 'planning' ? 'bg-navy-800 text-white' : 'text-navy-400 hover:text-navy-700'}`}>Planning</button>
        </div>
      </div>

      {cargado && !yo && (
        <div className="card"><p className="text-sm font-medium text-navy-400">No encontramos tu ficha de consultor. Pide que asocien tu correo en Equipo.</p></div>
      )}

      {vista === 'planning' && yo && (
        <CalendarioPlanning year={YEAR} monthInicial={[...mesesSel][0] ?? new Date().getMonth()} tareas={tareas} />
      )}

      {vista === 'lista' && <>
      {/* Selector de meses */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="label !mb-0">Meses</p>
          <div className="flex gap-2">
            <button onClick={todos} className="chip border border-navy-200 text-xs font-bold text-navy-500">Todos</button>
            <button onClick={ninguno} className="chip border border-navy-200 text-xs font-bold text-navy-500">Ninguno</button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {MESES.map((m, i) => (
            <button key={m} onClick={() => toggleMes(i)}
              className={`chip justify-center border text-xs font-bold transition ${mesesSel.has(i) ? 'border-brand-orange bg-brand-orange/15 text-navy-900' : 'border-navy-200 bg-white text-navy-400'}`}>
              {mesesSel.has(i) ? '✓ ' : ''}{m.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* Relojes de jornada */}
      <div className="grid gap-3 sm:grid-cols-3">
        <RelojJornada titulo="Jornada prevista" valor={tot.prev} capacidad={topeJornada} color="#F5A623" sub={`de ${fmtH(topeJornada)} disponibles`} />
        <RelojJornada titulo="Jornada efectiva" valor={tot.efe} capacidad={topeJornada} color="#061B45" sub={`imputado de ${fmtH(topeJornada)}`} />
        <RelojJornada titulo="Jornada pendiente" valor={tot.pend} capacidad={topeJornada} color="#d8910e" sub="aún por ejecutar" />
      </div>

      {/* Desglose de horas previstas por tipo de jornada */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { tipo: 'produccion', label: 'Producción', color: '#F5A623' },
          { tipo: 'gestion', label: 'Gestión', color: '#061B45' },
          { tipo: 'coordinacion', label: 'Coordinación', color: '#1E3A8A' },
          { tipo: 'proceso_interno', label: 'Procesos internos', color: '#0e7490' },
        ].map(({ tipo, label, color }) => (
          <div key={tipo} className="card !p-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              <span className="text-xs font-bold uppercase tracking-wide text-navy-400">{label}</span>
            </div>
            <p className="mt-1 text-2xl font-extrabold text-navy-900">{fmtH(tot[tipo])}</p>
            <p className="text-[11px] font-medium text-navy-300">
              {tot.prev > 0 ? Math.round((tot[tipo] / tot.prev) * 100) : 0}% de lo previsto
            </p>
          </div>
        ))}
      </div>

      {/* Tabla por mes */}
      {filas.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                <th className="py-2">Mes</th><th className="py-2 text-right">Prevista</th><th className="py-2 text-right">Efectiva</th>
                <th className="py-2 text-right">Pendiente</th><th className="py-2 text-right">Tareas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {filas.map(f => (
                <tr key={f.mes}>
                  <td className="py-2 font-bold">{MESES[f.mes]}</td>
                  <td className="py-2 text-right">{fmtH(f.prevista)}</td>
                  <td className="py-2 text-right">{fmtH(f.efectiva)}</td>
                  <td className="py-2 text-right text-brand-orangeDark font-bold">{fmtH(f.hPend)} <span className="text-navy-300 font-medium">({f.nPend})</span></td>
                  <td className="py-2 text-right text-navy-400">{f.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tareas pendientes */}
      <div className="card">
        <h4 className="font-extrabold">Mis tareas pendientes ({tareasPendientes.length})</h4>
        {tareasPendientes.length === 0 ? (
          <p className="mt-3 text-sm font-medium text-navy-300">No tienes tareas pendientes en los meses elegidos.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                  <th className="py-2">Fecha</th><th className="py-2">Tarea</th><th className="py-2">Tipo</th><th className="py-2 text-right">Horas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {tareasPendientes.map(t => (
                  <tr key={t.id}>
                    <td className="py-1.5 font-medium">{t.fecha_prevista}</td>
                    <td className="py-1.5">{t.titulo}</td>
                    <td className="py-1.5">{TIPO_BY_ID[t.tipo]?.nombre || t.tipo || '—'}</td>
                    <td className="py-1.5 text-right">{Number(t.horas_previstas) || 0}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>}
    </div>
  );
}
