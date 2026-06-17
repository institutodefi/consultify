import { useEffect, useMemo, useState } from 'react';
import { listTable } from '../../lib/data.js';
import { getTareasAgenda, TIPO_BY_ID } from '../../lib/agenda.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const YEAR = new Date().getFullYear();
const fmtH = (h) => `${(Math.round((h || 0) * 100) / 100).toLocaleString('es-ES')} h`;

export default function MiAgenda() {
  const [equipo, setEquipo] = useState([]);
  const [consultorId, setConsultorId] = useState('');
  const [tareas, setTareas] = useState([]);
  const [mesesSel, setMesesSel] = useState(new Set([new Date().getMonth()]));

  useEffect(() => { listTable('consultores').then(cs => { setEquipo(cs); if (cs[0]) setConsultorId(String(cs[0].id)); }).catch(() => {}); }, []);
  useEffect(() => { if (consultorId) getTareasAgenda(consultorId, YEAR).then(setTareas).catch(() => setTareas([])); }, [consultorId]);

  const toggleMes = (m) => setMesesSel(s => { const n = new Set(s); n.has(m) ? n.delete(m) : n.add(m); return n; });
  const todos = () => setMesesSel(new Set(MESES.map((_, i) => i)));
  const ninguno = () => setMesesSel(new Set());

  const mesDe = (iso) => iso ? new Date(iso).getMonth() : null;

  // Resumen por mes seleccionado
  const filas = useMemo(() => {
    return [...mesesSel].sort((a, b) => a - b).map(m => {
      const delMes = tareas.filter(t => mesDe(t.fecha_prevista) === m);
      const prevista = delMes.reduce((s, t) => s + (Number(t.horas_previstas) || 0), 0);
      const efectiva = delMes.reduce((s, t) => s + (Number(t.horas_reales) || 0), 0);
      const pendientes = delMes.filter(t => (t.estado || 'pendiente') !== 'completada');
      const hPend = pendientes.reduce((s, t) => s + (Number(t.horas_previstas) || 0), 0);
      return { mes: m, prevista, efectiva, nPend: pendientes.length, hPend, total: delMes.length };
    });
  }, [tareas, mesesSel]);

  const tareasPendientes = useMemo(() =>
    tareas.filter(t => mesesSel.has(mesDe(t.fecha_prevista)) && (t.estado || 'pendiente') !== 'completada')
      .sort((a, b) => (a.fecha_prevista || '').localeCompare(b.fecha_prevista || '')), [tareas, mesesSel]);

  const tot = filas.reduce((a, f) => ({ prev: a.prev + f.prevista, efe: a.efe + f.efectiva, pend: a.pend + f.hPend }), { prev: 0, efe: 0, pend: 0 });

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Mi agenda</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">Previsto, efectivo y pendiente</h1>
      </div>

      {/* Consultor */}
      <div className="card">
        <label className="label">Consultor</label>
        <select className="input w-full max-w-md" value={consultorId} onChange={e => setConsultorId(e.target.value)}>
          {equipo.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''}</option>)}
        </select>
      </div>

      {/* Selector de meses (aspas) */}
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

      {/* Totales */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-navy-900 p-4 text-white">
          <p className="text-xs font-bold uppercase tracking-wider text-white/60">Agenda prevista</p>
          <p className="mt-1 text-2xl font-extrabold">{fmtH(tot.prev)}</p>
        </div>
        <div className="rounded-2xl border border-navy-100 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-300">Agenda efectiva</p>
          <p className="mt-1 text-2xl font-extrabold">{fmtH(tot.efe)}</p>
        </div>
        <div className="rounded-2xl border border-navy-100 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-300">Pendiente</p>
          <p className="mt-1 text-2xl font-extrabold text-brand-orangeDark">{fmtH(tot.pend)}</p>
        </div>
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
        <h4 className="font-extrabold">Tareas pendientes ({tareasPendientes.length})</h4>
        {tareasPendientes.length === 0 ? (
          <p className="mt-3 text-sm font-medium text-navy-300">No hay tareas pendientes en los meses elegidos.</p>
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
    </div>
  );
}
