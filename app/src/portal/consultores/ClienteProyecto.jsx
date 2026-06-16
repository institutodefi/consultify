import { useEffect, useMemo, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { tareasDeCliente, repartirFechas, horasCoordinacion } from '../../lib/planCliente.js';
import { descargarAgendaICS } from '../../lib/ics.js';

const MODELOS = ['Apoyo', 'Relación', 'Implicación', 'Compromiso', 'Implantación'];
const fmtH = (h) => `${(Math.round((h || 0) * 100) / 100).toLocaleString('es-ES')} h`;
const hoy = () => new Date().toISOString().slice(0, 10);

// Convierte una cliente_tarea al shape que entiende ics.js (descargarAgendaICS).
const aEventoICS = (t) => ({
  id: t.id,
  titulo: t.titulo,
  tipo: 'produccion',
  descripcion: `${t.norma_id} · ${t.proceso || ''}`,
  fecha_prevista: t.fecha_estimada,
  fecha_efectiva: t.fecha_real,
  horas_previstas: Number(t.horas) || 1,
  horas_reales: Number(t.horas) || 1,
  hora_inicio: '09:00',
});

export default function ClienteProyecto({ cliente, normasCliente, equipo, onCambio }) {
  const [modelo, setModelo] = useState('Implicación');
  const [meses, setMeses] = useState(cliente.meses_estimados || 3);
  const [fechaIni, setFechaIni] = useState(cliente.fecha_inicio || hoy());
  const [c1, setC1] = useState(cliente.consultor_1_id || '');
  const [c2, setC2] = useState(cliente.consultor_2_id || '');
  const [catalogo, setCatalogo] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [msg, setMsg] = useState(null);

  const consultores = equipo.filter(c => (c.tipo_equipo || 'consultor') === 'consultor' && c.activo !== false);
  const nombreCons = (id) => { const c = equipo.find(x => String(x.id) === String(id)); return c ? `${c.nombre} ${c.apellidos || ''}`.trim() : '—'; };

  const cargar = () => {
    listTable('tareas_catalogo').then(setCatalogo).catch(() => setCatalogo([]));
    listTable('cliente_tareas')
      .then(all => setTareas(all.filter(t => String(t.cliente_id) === String(cliente.id))
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))))
      .catch(() => setTareas([]));
  };
  useEffect(cargar, [cliente.id]);

  // Propuesta de tareas según las normas del cliente (no se guarda hasta confirmar).
  const propuesta = useMemo(() => {
    if (!catalogo) return [];
    const base = tareasDeCliente(catalogo, normasCliente, modelo);
    return repartirFechas(base, fechaIni, meses);
  }, [catalogo, normasCliente, modelo, fechaIni, meses]);

  async function guardarCabecera() {
    setMsg(null);
    try {
      await updateRow('clientes', cliente.id, {
        consultor_1_id: c1 || null, consultor_2_id: c2 || null,
        meses_estimados: Number(meses) || 3, fecha_inicio: fechaIni || null,
      });
      onCambio?.();
      setMsg('Guardado.');
    } catch (e) { setMsg(e.message); }
  }

  // Añade a demanda las tareas de la propuesta que aún no existan (por norma+subproceso).
  async function generarTareas() {
    setMsg(null);
    try {
      const existentes = new Set(tareas.map(t => `${t.norma_id}|${t.subproceso}`));
      const nuevas = propuesta.filter(p => !existentes.has(`${p.norma_id}|${p.subproceso}`));
      if (!nuevas.length) { setMsg('No hay tareas nuevas que añadir.'); return; }
      for (const p of nuevas) {
        await insertRow('cliente_tareas', {
          cliente_id: cliente.id, norma_id: p.norma_id, modelo: p.modelo,
          proceso: p.proceso, subproceso: p.subproceso, titulo: p.titulo,
          horas: p.horas, bloque: p.bloque,
          consultor_id: c1 || null, fecha_estimada: p.fecha_estimada,
          fecha_real: null, hecha: false, orden: p.orden,
        });
      }
      cargar();
      setMsg(`${nuevas.length} tarea(s) añadidas.`);
    } catch (e) { setMsg(e.message); }
  }

  async function addTarea(p) {
    await insertRow('cliente_tareas', {
      cliente_id: cliente.id, norma_id: p.norma_id, modelo: p.modelo,
      proceso: p.proceso, subproceso: p.subproceso, titulo: p.titulo,
      horas: p.horas, bloque: p.bloque, consultor_id: c1 || null,
      fecha_estimada: p.fecha_estimada, fecha_real: null, hecha: false, orden: p.orden,
    });
    cargar();
  }

  async function addVarias(lista) {
    for (const p of lista) {
      await insertRow('cliente_tareas', {
        cliente_id: cliente.id, norma_id: p.norma_id, modelo: p.modelo,
        proceso: p.proceso, subproceso: p.subproceso, titulo: p.titulo,
        horas: p.horas, bloque: p.bloque, consultor_id: c1 || null,
        fecha_estimada: p.fecha_estimada, fecha_real: null, hecha: false, orden: p.orden,
      });
    }
    cargar();
  }

  async function patch(id, campos) {
    await updateRow('cliente_tareas', id, campos);
    setTareas(ts => ts.map(t => t.id === id ? { ...t, ...campos } : t));
  }
  async function quitar(id) { await deleteRow('cliente_tareas', id); cargar(); }

  // Totales y coordinación
  const totalHoras = tareas.reduce((s, t) => s + (Number(t.horas) || 0), 0);
  const coordinacion = horasCoordinacion(normasCliente.length, meses);
  const porConsultor = useMemo(() => {
    const m = {};
    for (const t of tareas) {
      const k = t.consultor_id || 'sin';
      m[k] = (m[k] || 0) + (Number(t.horas) || 0);
    }
    return m;
  }, [tareas]);

  // Datos del Gantt: por bloque, min fecha estimada → max fecha (estimada o real)
  const gantt = useMemo(() => {
    const conFecha = tareas.filter(t => t.fecha_estimada);
    if (!conFecha.length) return null;
    const fechas = conFecha.flatMap(t => [t.fecha_estimada, t.fecha_real].filter(Boolean));
    const min = fechas.reduce((a, b) => a < b ? a : b);
    const max = fechas.reduce((a, b) => a > b ? a : b);
    const t0 = new Date(min).getTime();
    const span = Math.max(1, new Date(max).getTime() - t0);
    const bloques = [...new Set(conFecha.map(t => t.bloque))];
    const filas = bloques.map(b => {
      const tb = conFecha.filter(t => t.bloque === b);
      const fmin = tb.map(t => t.fecha_estimada).reduce((a, c) => a < c ? a : c);
      const fmaxArr = tb.map(t => t.fecha_real || t.fecha_estimada);
      const fmax = fmaxArr.reduce((a, c) => a > c ? a : c);
      const left = ((new Date(fmin).getTime() - t0) / span) * 100;
      const width = Math.max(3, ((new Date(fmax).getTime() - new Date(fmin).getTime()) / span) * 100);
      const horas = tb.reduce((s, t) => s + (Number(t.horas) || 0), 0);
      const hechas = tb.filter(t => t.hecha).length;
      return { bloque: b, left, width, horas, n: tb.length, hechas, fmin, fmax };
    });
    return { min, max, filas };
  }, [tareas]);

  function descargarICS(consultorId) {
    const lista = tareas.filter(t => String(t.consultor_id) === String(consultorId) && t.fecha_estimada);
    if (!lista.length) { setMsg('Ese consultor no tiene tareas con fecha.'); return; }
    descargarAgendaICS(lista.map(aEventoICS), nombreCons(consultorId), `${cliente.empresa}-${nombreCons(consultorId)}`.toLowerCase().replace(/\s+/g, '-'));
  }

  function descargarICSNorma(normaId) {
    const lista = tareas.filter(t => t.norma_id === normaId && t.fecha_estimada);
    if (!lista.length) { setMsg('Esa norma no tiene tareas con fecha.'); return; }
    descargarAgendaICS(lista.map(aEventoICS), `${cliente.empresa} · ${normaId}`, `${cliente.empresa}-${normaId}`.toLowerCase().replace(/\s+/g, '-'));
  }

  const normasConTareas = useMemo(() => [...new Set(tareas.map(t => t.norma_id))], [tareas]);

  return (
    <div className="mt-5 space-y-5 border-t border-navy-100 pt-5">
      <h4 className="font-extrabold">Proyecto y tareas</h4>

      {normasCliente.length === 0 && (
        <p className="rounded-xl bg-navy-50 p-3 text-sm font-medium text-navy-500">
          Este cliente no tiene normas en sus empresas todavía. Añade normas en el perfil para detectar sus tareas.
        </p>
      )}

      {/* Cabecera del proyecto */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="label">Modelo</label>
          <select className="input" value={modelo} onChange={e => setModelo(e.target.value)}>
            {MODELOS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Meses estimados</label>
          <input type="number" min="1" className="input" value={meses} onChange={e => setMeses(e.target.value)} />
        </div>
        <div>
          <label className="label">Fecha inicio</label>
          <input type="date" className="input" value={fechaIni || ''} onChange={e => setFechaIni(e.target.value)} />
        </div>
        <div>
          <label className="label">Consultor 1</label>
          <select className="input" value={c1} onChange={e => setC1(e.target.value)}>
            <option value="">Sin asignar</option>
            {consultores.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Consultor 2</label>
          <select className="input" value={c2} onChange={e => setC2(e.target.value)}>
            <option value="">Sin asignar</option>
            {consultores.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={guardarCabecera} className="btn-primary !px-4 !py-2">Guardar proyecto</button>
        <button onClick={generarTareas} disabled={!normasCliente.length} className="btn-orange !px-4 !py-2 disabled:opacity-40">
          Detectar y añadir tareas ({propuesta.length})
        </button>
        {msg && <span className="text-sm font-bold text-navy-600">{msg}</span>}
      </div>

      {/* Resumen horas y coordinación */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-navy-900 p-4 text-white">
          <p className="text-xs font-bold uppercase tracking-wider text-white/60">Horas tareas + coordinación</p>
          <p className="mt-1 text-2xl font-extrabold">{fmtH(totalHoras + coordinacion)}</p>
          <p className="text-xs font-medium text-white/60">{fmtH(totalHoras)} tareas · {fmtH(coordinacion)} coord.</p>
        </div>
        <div className="rounded-xl border border-navy-100 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-300">{nombreCons(c1)}</p>
          <p className="mt-1 text-2xl font-extrabold">{fmtH(porConsultor[c1] || 0)}</p>
          <button onClick={() => descargarICS(c1)} disabled={!c1} className="btn-ghost !px-3 !py-1.5 mt-1 text-xs disabled:opacity-40">⬇ Calendario .ics</button>
        </div>
        <div className="rounded-xl border border-navy-100 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-300">{nombreCons(c2)}</p>
          <p className="mt-1 text-2xl font-extrabold">{fmtH(porConsultor[c2] || 0)}</p>
          <button onClick={() => descargarICS(c2)} disabled={!c2} className="btn-ghost !px-3 !py-1.5 mt-1 text-xs disabled:opacity-40">⬇ Calendario .ics</button>
        </div>
      </div>

      {/* Gantt por bloques */}
      {gantt && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="label !mb-0">Gantt por bloque de proceso</p>
            <p className="text-xs font-medium text-navy-400">{gantt.min} → {gantt.max}</p>
          </div>
          <div className="space-y-1.5">
            {gantt.filas.map(f => (
              <div key={f.bloque} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs font-bold text-navy-600">{f.bloque}</span>
                <div className="relative h-6 flex-1 rounded bg-navy-50">
                  <div className="absolute top-0 h-6 rounded bg-brand-orange/80"
                    style={{ left: `${f.left}%`, width: `${f.width}%` }}
                    title={`${f.bloque}: ${f.n} tareas · ${fmtH(f.horas)} · ${f.fmin}→${f.fmax}`} />
                </div>
                <span className="w-28 shrink-0 text-right text-xs font-medium text-navy-400">{f.hechas}/{f.n} · {fmtH(f.horas)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Descargas de calendario por norma */}
      {normasConTareas.length > 0 && (
        <div>
          <p className="label">Calendario por norma (.ics)</p>
          <div className="flex flex-wrap gap-2">
            {normasConTareas.map(n => (
              <button key={n} onClick={() => descargarICSNorma(n)}
                className="chip border border-navy-200 bg-white font-bold text-navy-700 hover:border-brand-orange">
                ⬇ {n} ({tareas.filter(t => t.norma_id === n && t.fecha_estimada).length})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tareas guardadas */}
      {tareas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                <th className="py-2">✓</th>
                <th className="py-2">Tarea</th>
                <th className="py-2 text-right">Horas</th>
                <th className="py-2">Consultor</th>
                <th className="py-2">Estimada</th>
                <th className="py-2">Real</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {tareas.map(t => (
                <tr key={t.id} className={t.hecha ? 'opacity-60' : ''}>
                  <td className="py-1.5">
                    <input type="checkbox" checked={!!t.hecha} onChange={e => patch(t.id, { hecha: e.target.checked })} />
                  </td>
                  <td className="py-1.5 font-medium">{t.titulo}</td>
                  <td className="py-1.5 text-right">{fmtH(t.horas)}</td>
                  <td className="py-1.5">
                    <select className="input !py-1 !text-xs" value={t.consultor_id || ''} onChange={e => patch(t.id, { consultor_id: e.target.value || null })}>
                      <option value="">—</option>
                      {consultores.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5">
                    <input type="date" className="input !py-1 !text-xs" value={t.fecha_estimada || ''} onChange={e => patch(t.id, { fecha_estimada: e.target.value || null })} />
                  </td>
                  <td className="py-1.5">
                    <input type="date" className="input !py-1 !text-xs" value={t.fecha_real || ''} onChange={e => patch(t.id, { fecha_real: e.target.value || null })} />
                  </td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => quitar(t.id)} className="text-xs font-bold text-red-500 hover:underline">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Propuesta a demanda agrupada por norma (añadir tarea a tarea) */}
      {propuesta.length > 0 && (() => {
        const pend = propuesta.filter(p => !tareas.some(t => t.norma_id === p.norma_id && t.subproceso === p.subproceso));
        const porNorma = [...new Set(pend.map(p => p.norma_id))];
        return (
          <details className="rounded-xl border border-navy-100 p-4" open>
            <summary className="cursor-pointer text-sm font-bold text-navy-700">
              Tareas detectadas a demanda · {pend.length} sin añadir
            </summary>
            <div className="mt-3 space-y-4">
              {porNorma.map(norma => {
                const lista = pend.filter(p => p.norma_id === norma);
                return (
                  <div key={norma}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-navy-500">{norma} · {lista.length} tareas</span>
                      <button onClick={() => addVarias(lista)} className="chip border border-brand-orange bg-brand-orange/10 text-xs font-bold text-brand-orangeDark">+ añadir toda la norma</button>
                    </div>
                    <div className="space-y-1">
                      {lista.map((p, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium">{p.proceso} - {p.subproceso} <span className="text-navy-300">· {fmtH(p.horas)} · {p.fecha_estimada}</span></span>
                          <button onClick={() => addTarea(p)} className="chip border border-navy-200 bg-white text-xs font-bold text-navy-600 hover:border-brand-orange">+ añadir</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })()}
    </div>
  );
}
