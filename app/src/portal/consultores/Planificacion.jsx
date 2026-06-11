import { useEffect, useMemo, useState } from 'react';
import { listTable, updateRow } from '../../lib/data.js';
import { NORMAS, NORMA_BY_ID, MODELO_IDS } from '../../lib/calcEngine.js';
import { generarTareas, totalesPorPerfil, PERFILES, CAPACIDAD_MES } from '../../lib/tareas.js';

const NIVEL_DEF = { 'Responsable del Proyecto': 'J3', 'Consultor 1': 'J2', 'Consultor 2': 'J1' };

export default function Planificacion() {
  const [proyectos, setProyectos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [proyectoId, setProyectoId] = useState('');
  const [normas, setNormas] = useState(['9001']);
  const [modelo, setModelo] = useState('Implicación');
  const [mesesApoyo, setMesesApoyo] = useState(3);
  const [equipo, setEquipo] = useState({});     // perfil -> consultor_id
  const [asignaciones, setAsignaciones] = useState({}); // tareaId -> perfil
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    listTable('proyectos').then(setProyectos);
    listTable('clientes').then(setClientes);
    listTable('consultores').then(setConsultores);
  }, []);

  const proyecto = proyectos.find(p => String(p.id) === String(proyectoId));
  useEffect(() => {
    if (!proyecto) return;
    setNormas([...new Set(['9001', ...(proyecto.normas || [])])]);
    setModelo(proyecto.modelo || 'Implicación');
    if (proyecto.plan) {
      setEquipo(proyecto.plan.equipo || {});
      setAsignaciones(proyecto.plan.asignaciones || {});
    } else { setEquipo({}); setAsignaciones({}); }
  }, [proyectoId, proyectos.length]);

  const tareas = useMemo(() => {
    const base = generarTareas(normas, modelo, { mesesApoyo });
    return base.map(t => ({ ...t, asignado: t.fija ? t.asignado : (asignaciones[t.id] || t.asignado) }));
  }, [normas, modelo, mesesApoyo, asignaciones]);

  const niveles = Object.fromEntries(PERFILES.map(p => {
    const c = consultores.find(x => String(x.id) === String(equipo[p]));
    return [p, c?.nivel || NIVEL_DEF[p]];
  }));
  const totales = totalesPorPerfil(tareas, niveles);
  const totalProyecto = tareas.reduce((a, t) => a + t.hMes, 0);

  const toggleNorma = (id) => {
    if (id === '9001') return;
    setNormas(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  async function guardar() {
    if (!proyecto) { setMsg({ ok: false, text: 'Selecciona un proyecto para guardar el plan.' }); return; }
    try {
      await updateRow('proyectos', proyecto.id, { plan: { equipo, asignaciones, modelo, normas, mesesApoyo, actualizado: new Date().toISOString() } });
      setMsg({ ok: true, text: 'Plan guardado en el proyecto.' });
      listTable('proyectos').then(setProyectos);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-extrabold">Planificación automática de tareas</h2>
        <p className="mt-1 text-sm font-medium text-navy-400">Las tareas y horas salen de la plantilla de planificación TuConsultor según el modelo y las normas. La coordinación mensual del Responsable (0,5 h/sistema) se añade siempre, sea cual sea el modelo.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div>
            <label className="label">Proyecto (opcional, para guardar el plan)</label>
            <select className="input" value={proyectoId} onChange={e => setProyectoId(e.target.value)}>
              <option value="">— Planificación libre —</option>
              {proyectos.map(p => {
                const cl = clientes.find(c => String(c.id) === String(p.cliente_id));
                return <option key={p.id} value={p.id}>{cl?.empresa || 'Cliente'} · {p.modelo} · {(p.normas || []).map(n => NORMA_BY_ID[n]?.nombre || n).join(' + ')}</option>;
              })}
            </select>
          </div>
          <div>
            <label className="label">Modelo</label>
            <select className="input" value={modelo} onChange={e => setModelo(e.target.value)}>
              {MODELO_IDS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          {modelo === 'Apoyo' && (
            <div>
              <label className="label">Meses de consumo de la bolsa</label>
              <input type="number" min="1" max="12" className="input" value={mesesApoyo} onChange={e => setMesesApoyo(Math.max(1, +e.target.value || 3))} />
            </div>
          )}
        </div>
        <div className="mt-4">
          <p className="label">Normas (ISO 9001 siempre incluida)</p>
          <div className="flex flex-wrap gap-2">
            {NORMAS.map(n => {
              const on = normas.includes(n.id);
              const fija = n.id === '9001';
              return (
                <button type="button" key={n.id} onClick={() => toggleNorma(n.id)}
                  className={`chip border transition ${fija ? 'border-navy-800 bg-navy-800 text-white cursor-default' : on ? 'border-brand-orange bg-brand-orange/15 text-navy-900' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'}`}>
                  {n.nombre}{fija ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-extrabold">Equipo del proyecto</h3>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          {PERFILES.map(p => {
            const t = totales[p];
            const sobre = t.capacidadPct > 100;
            return (
              <div key={p} className="rounded-2xl border border-navy-100 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-navy-400">{p}</p>
                <select className="input mt-2" value={equipo[p] || ''} onChange={e => setEquipo({ ...equipo, [p]: e.target.value })}>
                  <option value="">— Sin asignar ({NIVEL_DEF[p]}) —</option>
                  {consultores.map(c => <option key={c.id} value={c.id}>{c.nombre} · {c.nivel}</option>)}
                </select>
                <div className="mt-3 text-sm font-medium text-navy-500">
                  <p>{t.hPlantilla} h plantilla (J1) → <strong className="text-navy-900">{t.hReales} h reales/mes</strong> ({niveles[p]})</p>
                  <div className="mt-2 h-2 rounded-full bg-navy-50">
                    <div className={`h-2 rounded-full ${sobre ? 'bg-red-500' : 'bg-brand-orange'}`} style={{ width: `${Math.min(100, t.capacidadPct)}%` }} />
                  </div>
                  <p className={`mt-1 text-xs font-bold ${sobre ? 'text-red-600' : 'text-navy-400'}`}>{t.capacidadPct}% de {CAPACIDAD_MES} h/mes{sobre ? ' · ¡sobrecarga!' : ''}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-extrabold">Tareas generadas <span className="chip bg-navy-50 text-navy-500">{tareas.length}</span></h3>
          <p className="text-sm font-bold text-navy-700">{Math.round(totalProyecto * 100) / 100} h/mes (plantilla J1)</p>
        </div>
        <table className="mt-3 w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-navy-100 text-left text-xs font-bold uppercase tracking-wider text-navy-400">
              <th className="py-2 pr-3">Proceso</th>
              <th className="py-2 pr-3">Tarea</th>
              <th className="py-2 pr-3">h/mes</th>
              <th className="py-2">Asignado a</th>
            </tr>
          </thead>
          <tbody>
            {tareas.map(t => (
              <tr key={t.id} className={`border-b border-navy-50 ${t.fija ? 'bg-brand-orange/10' : ''}`}>
                <td className="py-2 pr-3 font-semibold text-navy-500">{t.proc}</td>
                <td className="py-2 pr-3">{t.sub}</td>
                <td className="py-2 pr-3 font-bold">{t.hMes}</td>
                <td className="py-2">
                  {t.fija ? <span className="chip bg-navy-800 text-white">Responsable del Proyecto · fija</span> : (
                    <select className="input !w-auto !py-1.5" value={t.asignado}
                      onChange={e => setAsignaciones({ ...asignaciones, [t.id]: e.target.value })}>
                      {PERFILES.map(p => <option key={p}>{p}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={guardar} className="btn-primary" disabled={!proyecto}>Guardar plan en el proyecto</button>
          {msg && <p className={`text-sm font-bold ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
        </div>
      </div>
    </div>
  );
}
