import { useEffect, useMemo, useState } from 'react';
import { listTable } from '../lib/data.js';
import { NORMAS, MODELO_IDS } from '../lib/calcEngine.js';

const PASOS = ['Sistemas', 'Modelo', 'Tareas'];
const fmtH = (h) => `${(Math.round(h * 100) / 100).toLocaleString('es-ES')} h`;

// Aplica la reducción por integración (columna editable del catálogo) a las horas base.
const horasNetas = (t) => {
  const base = Number(t.horas_base) || 0;
  const red = Number(t.reduccion_pct) || 0;
  return base * (1 - red / 100);
};

export default function PlanificadorTareas() {
  const [paso, setPaso] = useState(0);
  // ISO 9001 es la base de todo sistema: siempre incluida.
  const [sel, setSel] = useState(['9001']);
  const [modelo, setModelo] = useState('Implicación');
  const [meses, setMeses] = useState(3);
  const [catalogo, setCatalogo] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    listTable('tareas_catalogo')
      .then(setCatalogo)
      .catch(() => { setErr('No se pudo cargar el catálogo de tareas.'); setCatalogo([]); });
  }, []);

  const toggle = (id) => {
    if (id === '9001') return; // base obligatoria
    setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  // Tareas del catálogo para los sistemas y modelo elegidos (con horas > 0).
  const tareas = useMemo(() => {
    if (!catalogo) return [];
    return catalogo
      .filter(t => sel.includes(t.norma_id) && t.modelo === modelo && (Number(t.horas_base) || 0) > 0)
      .map(t => ({ ...t, neta: horasNetas(t) }))
      .sort((a, b) =>
        (a.norma_id || '').localeCompare(b.norma_id || '') ||
        (a.orden ?? 0) - (b.orden ?? 0) ||
        (a.subproceso || '').localeCompare(b.subproceso || ''));
  }, [catalogo, sel, modelo]);

  // Coordinación del proyecto: 0,5 h × nº sistemas × meses (todos los modelos).
  const coordinacion = useMemo(
    () => 0.5 * sel.length * Math.max(Number(meses) || 1, 1),
    [sel.length, meses]
  );

  const totalTareas = useMemo(() => tareas.reduce((s, t) => s + t.neta, 0), [tareas]);
  const totalProyecto = totalTareas + coordinacion;

  // Agrupado por sistema para mostrar el desglose por norma de forma independiente.
  const porSistema = useMemo(() => {
    const map = new Map();
    for (const t of tareas) {
      if (!map.has(t.norma_id)) map.set(t.norma_id, []);
      map.get(t.norma_id).push(t);
    }
    return [...map.entries()];
  }, [tareas]);

  const nombreNorma = (id) => NORMAS.find(n => n.id === id)?.nombre || id;

  return (
    <div>
      <div className="mb-8 max-w-2xl">
        <p className="eyebrow">Planificador de tareas</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Tareas y horas del proyecto</h1>
        <p className="mt-3 text-navy-400 font-medium">
          Elige los sistemas, el modelo de relación y la duración. El planificador devuelve las tareas
          con sus horas totales (una sola ejecución por tarea, sin prorrateo) más la coordinación.
        </p>
      </div>

      {/* Pasos */}
      <ol className="mb-8 flex gap-2 max-w-2xl">
        {PASOS.map((p, i) => (
          <li key={p} className="flex-1">
            <button onClick={() => i < paso && setPaso(i)}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm font-bold transition ${i === paso ? 'bg-navy-800 text-white' : i < paso ? 'bg-navy-100 text-navy-700' : 'bg-white text-navy-300 border border-navy-100'}`}>
              <span className="mr-2 opacity-60">{i + 1}</span>{p}
            </button>
          </li>
        ))}
      </ol>

      {err && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{err}</p>}

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div>
          {/* Paso 0 · Sistemas */}
          {paso === 0 && (
            <section>
              <h2 className="mb-4 text-lg font-extrabold">¿Qué sistemas entran en el proyecto?</h2>
              <p className="mb-4 text-sm font-medium text-navy-400">ISO 9001 va siempre incluida. Cada sistema aporta sus tareas de forma independiente.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {NORMAS.map(n => {
                  const on = sel.includes(n.id);
                  const fija = n.id === '9001';
                  return (
                    <button key={n.id} onClick={() => toggle(n.id)} aria-disabled={fija}
                      className={`card text-left transition ${on ? '!border-brand-orange ring-2 ring-brand-orange/30' : 'hover:border-navy-300'} ${fija ? 'cursor-default' : ''}`}>
                      <div className="flex items-start justify-between">
                        <span className="font-extrabold">{n.nombre}</span>
                        <span className={`chip ${fija ? 'bg-navy-800 text-white' : on ? 'bg-brand-orange text-navy-900' : 'bg-navy-50 text-navy-300'}`}>{fija ? 'Siempre' : on ? '✓' : '+'}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-navy-400">{n.desc}</p>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6">
                <button disabled={!sel.length} onClick={() => setPaso(1)} className="btn-orange">Continuar →</button>
              </div>
            </section>
          )}

          {/* Paso 1 · Modelo + meses */}
          {paso === 1 && (
            <section>
              <h2 className="mb-4 text-lg font-extrabold">Modelo de relación y duración</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {MODELO_IDS.map(mid => {
                  const on = modelo === mid;
                  return (
                    <button key={mid} onClick={() => setModelo(mid)}
                      className={`card text-left transition ${on ? '!border-brand-orange ring-2 ring-brand-orange/30' : 'hover:border-navy-300'}`}>
                      <span className="text-lg font-extrabold">{mid}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 max-w-xs">
                <label className="label" htmlFor="meses">Duración del proyecto (meses)</label>
                <input id="meses" type="number" min="1" className="input" value={meses}
                  onChange={e => setMeses(e.target.value)} />
                <p className="mt-1 text-xs font-medium text-navy-400">Solo afecta a la coordinación (0,5 h × sistema × mes). Las tareas son horas totales, no se multiplican por meses.</p>
              </div>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setPaso(0)} className="btn-ghost">← Sistemas</button>
                <button onClick={() => setPaso(2)} className="btn-orange">Ver tareas →</button>
              </div>
            </section>
          )}

          {/* Paso 2 · Tareas */}
          {paso === 2 && (
            <section className="space-y-6">
              {catalogo === null ? (
                <p className="text-sm font-medium text-navy-400">Cargando catálogo…</p>
              ) : tareas.length === 0 ? (
                <p className="text-sm font-medium text-navy-400">No hay tareas para esta combinación de sistemas y modelo.</p>
              ) : (
                porSistema.map(([norma, lista]) => {
                  const subtotal = lista.reduce((s, t) => s + t.neta, 0);
                  return (
                    <div key={norma} className="card">
                      <div className="mb-3 flex items-baseline justify-between">
                        <h3 className="text-base font-extrabold">{nombreNorma(norma)}</h3>
                        <span className="text-sm font-bold text-navy-800">{fmtH(subtotal)}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-sm">
                          <thead>
                            <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                              <th className="py-2">Proceso</th>
                              <th className="py-2">Subproceso (tarea)</th>
                              <th className="py-2 text-right">Base</th>
                              <th className="py-2 text-right">Red. %</th>
                              <th className="py-2 text-right">Horas</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-navy-50">
                            {lista.map(t => (
                              <tr key={t.id}>
                                <td className="py-2 font-semibold text-navy-400">{t.proceso}</td>
                                <td className="py-2 font-medium">{t.subproceso}</td>
                                <td className="py-2 text-right text-navy-400">{fmtH(Number(t.horas_base) || 0)}</td>
                                <td className="py-2 text-right text-navy-400">{(Number(t.reduccion_pct) || 0)} %</td>
                                <td className="py-2 text-right font-bold">{fmtH(t.neta)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
              <div className="flex gap-3">
                <button onClick={() => setPaso(1)} className="btn-ghost">← Modelo</button>
              </div>
            </section>
          )}
        </div>

        {/* Panel resumen */}
        <aside className="lg:sticky lg:top-24 h-fit">
          <div className="rounded-[22px] bg-navy-900 p-6 text-white shadow-xl">
            <p className="eyebrow !text-brand-orange">Resumen del proyecto</p>
            <p className="mt-3 text-4xl font-extrabold tracking-tight">{fmtH(totalProyecto)}</p>
            <p className="mt-1 text-sm font-semibold text-white/70">horas totales del proyecto</p>
            <div className="mt-4 space-y-1.5 text-sm font-medium text-white/80">
              <p>{sel.length} sistema{sel.length > 1 ? 's' : ''} · modelo {modelo}</p>
              <p>{tareas.length} tarea{tareas.length !== 1 ? 's' : ''} · {fmtH(totalTareas)}</p>
              <p>Coordinación: {fmtH(coordinacion)} ({meses || 1} mes{(meses || 1) > 1 ? 'es' : ''})</p>
            </div>
            <div className="mt-5 border-t border-white/15 pt-4 text-xs font-medium leading-relaxed text-white/50">
              Horas totales (acto único por tarea, sin prorrateo). La reducción por integración se aplica por tarea desde el catálogo. Coordinación = 0,5 h × sistema × mes.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
