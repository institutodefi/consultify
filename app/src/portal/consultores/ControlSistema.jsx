import { useEffect, useMemo, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { NORMAS, NORMA_BY_ID, MODELO_IDS, EFICIENCIA } from '../../lib/calcEngine.js';
import { useAuth } from '../../lib/auth.jsx';

const TIPOS = [
  { id: 'produccion', nombre: 'Producción / Proyecto' },
  { id: 'gestion', nombre: 'Gestión' },
  { id: 'coordinacion', nombre: 'Coordinación' },
];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const r2 = (n) => Math.round(Number(n) * 100) / 100;

export default function ControlSistema() {
  const { verEconomico } = useAuth();
  const [normaSel, setNormaSel] = useState('9001');
  const [vista, setVista] = useState('sistema'); // 'sistema' | 'catalogo'
  const [proyectos, setProyectos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [tsistema, setTsistema] = useState([]);   // tareas de sistema (mensuales, sin fecha)
  const [agenda, setAgenda] = useState([]);       // instancias programadas
  const [editCat, setEditCat] = useState(null);
  const [editSis, setEditSis] = useState(null);
  const [programar, setProgramar] = useState(null); // tarea de sistema a programar en meses
  const [err, setErr] = useState(null);
  const [ready, setReady] = useState(false);

  const load = () => {
    Promise.all([
      listTable('proyectos'), listTable('clientes'), listTable('consultores'),
      listTable('tareas_catalogo'), listTable('tareas_sistema'), listTable('agenda_tareas'),
    ]).then(([p, cl, co, cat, ts, ag]) => {
      setProyectos(p); setClientes(cl); setConsultores(co);
      setCatalogo(cat); setTsistema(ts); setAgenda(ag); setReady(true);
    }).catch(() => setReady(true));
  };
  useEffect(() => { load(); }, []);

  const norma = NORMA_BY_ID[normaSel];
  const proyNorma = useMemo(() => proyectos.filter((p) => (p.normas || []).includes(normaSel)), [proyectos, normaSel]);
  const nombreCliente = (p) => clientes.find((c) => String(c.id) === String(p?.cliente_id))?.empresa || 'Cliente';
  const nombreConsultor = (id) => {
    const c = consultores.find((x) => String(x.id) === String(id));
    return c ? `${c.nombre} ${c.apellidos || ''}`.trim() : '—';
  };

  // ── Catálogo de la norma, agrupado por modelo ──
  const catalogoNorma = catalogo.filter((c) => c.norma_id === normaSel);
  const catPorModelo = MODELO_IDS.reduce((acc, m) => {
    const items = catalogoNorma.filter((c) => c.modelo === m).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    if (items.length) acc[m] = items;
    return acc;
  }, {});

  // ── Tareas de sistema de la norma, agrupadas por proyecto ──
  const proyIds = new Set(proyNorma.map((p) => p.id));
  const tsNorma = tsistema.filter((t) => t.norma_id === normaSel && proyIds.has(t.proyecto_id));
  const tsPorProyecto = proyNorma.map((p) => ({
    proyecto: p,
    tareas: tsNorma.filter((t) => t.proyecto_id === p.id).sort((a, b) => (a.orden || 0) - (b.orden || 0)),
  })).filter((g) => g.tareas.length);

  // Meses ya programados en agenda para una tarea de sistema
  const mesesProgramados = (tsId) => new Set(agenda.filter((a) => a.tarea_sistema_id === tsId && a.mes).map((a) => a.mes));

  // ── Volcar catálogo del proyecto → tareas de sistema (SIN fecha) ──
  async function volcarASistema(proyecto) {
    if (!proyecto) return;
    const normasProy = proyecto.normas || [];
    if (!confirm(`Volcar el catálogo a tareas de sistema de este proyecto (${normasProy.length} norma/s integradas)? No se programan fechas; las horas son mensuales.`)) return;
    const ya = new Set(tsistema.filter((t) => t.proyecto_id === proyecto.id).map((t) => `${t.norma_id}|${t.titulo}`));
    let n = 0;
    for (const nid of normasProy) {
      const items = catalogo.filter((c) => c.norma_id === nid && c.modelo === proyecto.modelo);
      for (const c of items) {
        const titulo = c.titulo || `${c.proceso} - ${c.subproceso}`;
        if (ya.has(`${nid}|${titulo}`)) continue;
        try {
          await insertRow('tareas_sistema', {
            proyecto_id: proyecto.id, norma_id: nid, catalogo_id: c.id || null,
            proceso: c.proceso, subproceso: c.subproceso, titulo,
            descripcion: c.descripcion || null, tipo: 'produccion',
            horas_base: c.horas_base ?? c.horas ?? 0, activa: true, orden: c.orden || 0,
          });
          n += 1;
        } catch (e) { /* sigue */ }
      }
    }
    alert(n ? `${n} tarea(s) de sistema creadas.` : 'No hay tareas nuevas (ya estaban todas).');
    load();
  }

  // ── Guardar edición de una tarea de sistema ──
  async function guardarSistema(e) {
    e.preventDefault(); setErr(null);
    try {
      const titulo = `${editSis.proceso || ''}${editSis.proceso && editSis.subproceso ? ' - ' : ''}${editSis.subproceso || ''}`.trim();
      await updateRow('tareas_sistema', editSis.id, {
        proceso: editSis.proceso || null, subproceso: editSis.subproceso || null, titulo,
        descripcion: editSis.descripcion || null, tipo: editSis.tipo || 'produccion',
        horas_base: editSis.horas_base ? Number(editSis.horas_base) : 0, activa: editSis.activa !== false,
      });
      setEditSis(null); load();
    } catch (e2) { setErr(e2.message); }
  }

  async function borrarSistema(id) {
    if (!confirm('¿Eliminar esta tarea de sistema? (no borra lo ya programado en agenda)')) return;
    await deleteRow('tareas_sistema', id); load();
  }

  // ── Programar una tarea de sistema en meses concretos (→ agenda) ──
  function abrirProgramar(ts, proyecto) {
    const consultor = consultores.find((c) => String(c.id) === String(proyecto?.consultor_id)) || consultores[0];
    setProgramar({
      ts, proyecto,
      consultor_id: consultor?.id || '',
      meses: [...mesesProgramados(ts.id)],
      hora_inicio: '09:00',
    });
  }
  async function guardarProgramacion(e) {
    e.preventDefault(); setErr(null);
    const { ts, proyecto, consultor_id, meses, hora_inicio } = programar;
    const nivel = consultores.find((c) => String(c.id) === String(consultor_id))?.nivel || 'J2';
    const coef = EFICIENCIA[nivel] ?? 1;
    const horasPrev = r2((ts.horas_base || 0) * coef);
    const yaMeses = mesesProgramados(ts.id);
    const year = new Date().getFullYear();
    try {
      // Crear las nuevas instancias de agenda para los meses marcados
      for (const m of meses) {
        if (yaMeses.has(m)) continue;
        const fecha = `${year}-${String(m).padStart(2, '0')}-15`;
        await insertRow('agenda_tareas', {
          proyecto_id: proyecto.id, consultor_id, norma_id: ts.norma_id,
          tarea_sistema_id: ts.id, mes: m,
          titulo: ts.titulo, proceso: ts.proceso, subproceso: ts.subproceso,
          descripcion: ts.descripcion || null, tipo: ts.tipo || 'produccion',
          fecha_prevista: fecha, horas_base: ts.horas_base, horas_previstas: horasPrev,
          hora_inicio: hora_inicio || '09:00', estado: 'pendiente',
        });
      }
      // Quitar las instancias de meses desmarcados que no tengan horas hechas
      for (const a of agenda.filter((x) => x.tarea_sistema_id === ts.id)) {
        if (!meses.includes(a.mes) && (a.horas_reales == null || a.horas_reales === '')) {
          await deleteRow('agenda_tareas', a.id);
        }
      }
      setProgramar(null); load();
    } catch (e2) { setErr(e2.message); }
  }

  // ── Guardar edición del catálogo (plantilla) ──
  async function guardarCatalogo(e) {
    e.preventDefault(); setErr(null);
    try {
      const titulo = `${editCat.proceso || ''}${editCat.proceso && editCat.subproceso ? ' - ' : ''}${editCat.subproceso || ''}`.trim();
      const datos = {
        proceso: editCat.proceso || null, subproceso: editCat.subproceso || null, titulo,
        descripcion: editCat.descripcion || null, horas_base: editCat.horas_base ? Number(editCat.horas_base) : 0,
      };
      await updateRow('tareas_catalogo', editCat.id, datos);
      // Propagar a las tareas de sistema derivadas de esta fila (no a la agenda)
      for (const ts of tsistema.filter((t) => t.catalogo_id === editCat.id)) {
        try { await updateRow('tareas_sistema', ts.id, { titulo, proceso: datos.proceso, subproceso: datos.subproceso, descripcion: ts.descripcion || datos.descripcion, horas_base: datos.horas_base }); } catch (e2) {}
      }
      setEditCat(null); load();
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <div className="space-y-6">
      {/* Selector de norma */}
      <div>
        <p className="label">Sistema / norma</p>
        <div className="flex flex-wrap gap-2">
          {NORMAS.map((n) => (
            <button key={n.id} onClick={() => setNormaSel(n.id)}
              className={`chip border transition ${normaSel === n.id ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'}`}>
              {n.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Toggle de vista */}
      <div className="flex gap-2">
        {[['sistema', 'Tareas de sistema'], ['catalogo', 'Catálogo (plantilla)']].map(([id, label]) => (
          <button key={id} onClick={() => { setVista(id); setEditCat(null); setEditSis(null); setProgramar(null); }}
            className={`chip border transition ${vista === id ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'}`}>
            {label}
          </button>
        ))}
      </div>

      <div>
        <h2 className="text-xl font-extrabold text-navy-900">
          {norma?.nombre} · {vista === 'catalogo' ? 'catálogo (plantilla editable)' : 'tareas de sistema por proyecto'}
        </h2>
        <p className="text-sm font-medium text-navy-400">
          {vista === 'catalogo'
            ? 'Edita nombres, descripción y horas mensuales. Los cambios se propagan a las tareas de sistema.'
            : 'Vuelca el catálogo a cada proyecto (horas mensuales, sin fecha). Desde aquí el consultor programa cada tarea en los meses que decida.'}
        </p>
      </div>

      {!ready && <p className="font-semibold text-navy-400">Cargando…</p>}

      {/* ═══ VISTA TAREAS DE SISTEMA ═══ */}
      {ready && vista === 'sistema' && (
        <>
          {!proyNorma.length && (
            <div className="card text-center font-medium text-navy-400">No hay proyectos con {norma?.nombre}. Créalos en Proyectos.</div>
          )}

          {proyNorma.map((p) => {
            const grupo = tsPorProyecto.find((g) => g.proyecto.id === p.id);
            const tareas = grupo?.tareas || [];
            return (
              <div key={p.id} className="card !p-0 overflow-hidden">
                <div className="flex items-center justify-between border-b border-navy-100 bg-navy-50/60 px-5 py-3">
                  <div>
                    <h3 className="font-extrabold text-navy-800">{nombreCliente(p)} · {p.modelo}</h3>
                    <p className="text-xs font-semibold text-navy-400">
                      {tareas.length} tarea(s) de sistema · {r2(tareas.reduce((s, t) => s + Number(t.horas_base || 0), 0))} h/mes base · resp. {nombreConsultor(p.consultor_id)}
                    </p>
                  </div>
                  {!tareas.length && <button onClick={() => volcarASistema(p)} className="btn-orange">Volcar catálogo</button>}
                </div>
                {tareas.length > 0 && (
                  <table className="w-full min-w-[820px] text-sm">
                    <thead><tr className="border-b border-navy-100 text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                      <th className="px-5 py-2.5">Proceso - Subproceso</th><th className="px-5 py-2.5">Tipo</th>
                      <th className="px-5 py-2.5 text-right">Horas/mes</th><th className="px-5 py-2.5">Meses programados</th><th className="px-5 py-2.5 text-right">Acciones</th>
                    </tr></thead>
                    <tbody className="divide-y divide-navy-50">
                      {tareas.map((t) => {
                        const prog = mesesProgramados(t.id);
                        return (
                          <tr key={t.id} className={t.activa === false ? 'opacity-50' : ''}>
                            <td className="px-5 py-2.5">
                              <p className="font-bold">{t.titulo}</p>
                              {t.descripcion && <p className="text-xs text-navy-400">{t.descripcion}</p>}
                            </td>
                            <td className="px-5 py-2.5 text-navy-400">{TIPOS.find((x) => x.id === (t.tipo || 'produccion'))?.nombre}</td>
                            <td className="px-5 py-2.5 text-right font-semibold">{r2(t.horas_base)} h</td>
                            <td className="px-5 py-2.5">
                              <div className="flex flex-wrap gap-0.5">
                                {MESES.map((m, i) => (
                                  <span key={i} className={`inline-flex h-5 w-7 items-center justify-center rounded text-[10px] font-bold ${prog.has(i + 1) ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-300'}`}>{m}</span>
                                ))}
                              </div>
                            </td>
                            <td className="px-5 py-2.5 text-right whitespace-nowrap">
                              <button onClick={() => abrirProgramar(t, p)} className="font-bold text-brand-orangeDark hover:underline">Programar</button>
                              <button onClick={() => setEditSis({ ...t })} className="ml-3 font-bold text-navy-700 hover:underline">Editar</button>
                              <button onClick={() => borrarSistema(t.id)} className="ml-3 font-bold text-red-600 hover:underline">×</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* ═══ VISTA CATÁLOGO ═══ */}
      {ready && vista === 'catalogo' && (
        <div className="space-y-4">
          {MODELO_IDS.filter((m) => catPorModelo[m]?.length).map((modelo) => (
            <div key={modelo} className="card !p-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-navy-100 bg-navy-50/60 px-5 py-3">
                <h3 className="font-extrabold text-navy-800">Modelo {modelo}</h3>
                <span className="text-xs font-bold text-navy-400">
                  {catPorModelo[modelo].length} tarea(s) · {r2(catPorModelo[modelo].reduce((s, t) => s + Number(t.horas_base || 0), 0))} h/mes base
                </span>
              </div>
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-navy-100 text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                  <th className="px-5 py-2.5">Proceso - Subproceso</th><th className="px-5 py-2.5">Descripción</th>
                  <th className="px-5 py-2.5 text-right">Horas/mes</th><th className="px-5 py-2.5 text-right">Acción</th>
                </tr></thead>
                <tbody className="divide-y divide-navy-50">
                  {catPorModelo[modelo].map((c) => (
                    <tr key={c.id}>
                      <td className="px-5 py-2.5 font-bold">{c.titulo || `${c.proceso} - ${c.subproceso}`}</td>
                      <td className="px-5 py-2.5 text-navy-400">{c.descripcion || <span className="text-navy-200">— sin descripción —</span>}</td>
                      <td className="px-5 py-2.5 text-right font-semibold">{r2(c.horas_base)} h</td>
                      <td className="px-5 py-2.5 text-right">
                        <button onClick={() => setEditCat({ ...c })} className="font-bold text-navy-700 hover:underline">Editar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {!catalogoNorma.length && (
            <div className="card text-center font-medium text-navy-400">No hay catálogo para {norma?.nombre}. Ejecuta seed-tareas.sql.</div>
          )}
        </div>
      )}

      {/* ─── Modal PROGRAMAR en meses ─── */}
      {programar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4" onClick={() => setProgramar(null)}>
          <form onSubmit={guardarProgramacion} className="w-full max-w-lg rounded-[22px] bg-white p-6 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-extrabold">Programar en agenda</h3>
              <p className="text-xs font-semibold text-navy-400">{programar.ts.titulo} · {r2(programar.ts.horas_base)} h/mes</p>
            </div>
            <div>
              <label className="label">Consultor que la ejecuta</label>
              <select className="input" value={programar.consultor_id} onChange={(e) => setProgramar({ ...programar, consultor_id: e.target.value })}>
                {consultores.filter((c) => (c.tipo_equipo || 'consultor') === 'consultor').map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''} · {c.nivel}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] font-semibold text-navy-400">
                {(() => { const niv = consultores.find((c) => String(c.id) === String(programar.consultor_id))?.nivel || 'J2'; return `Aplica ${Math.round((EFICIENCIA[niv] ?? 1) * 100)}% → ${r2((programar.ts.horas_base || 0) * (EFICIENCIA[niv] ?? 1))} h/mes`; })()}
              </p>
            </div>
            <div>
              <label className="label">Meses en los que se realiza</label>
              <div className="flex flex-wrap gap-1.5">
                {MESES.map((m, i) => {
                  const on = programar.meses.includes(i + 1);
                  return (
                    <button type="button" key={i}
                      onClick={() => setProgramar({ ...programar, meses: on ? programar.meses.filter((x) => x !== i + 1) : [...programar.meses, i + 1] })}
                      className={`chip border transition ${on ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'}`}>{m}</button>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setProgramar({ ...programar, meses: [1,2,3,4,5,6,7,8,9,10,11,12] })} className="text-xs font-bold text-navy-700 hover:underline">Todo el año</button>
                <button type="button" onClick={() => setProgramar({ ...programar, meses: [] })} className="text-xs font-bold text-navy-400 hover:underline">Ninguno</button>
              </div>
            </div>
            <div className="w-1/3">
              <label className="label">Hora</label>
              <input type="time" className="input" value={programar.hora_inicio} onChange={(e) => setProgramar({ ...programar, hora_inicio: e.target.value })} />
            </div>
            <p className="rounded-xl bg-navy-50 px-3 py-2 text-[11px] font-semibold text-navy-500">
              Se crea una entrada de agenda por cada mes marcado (día 15). Desmarcar un mes elimina su entrada salvo que tenga horas hechas.
            </p>
            {err && <p className="text-sm font-bold text-red-600">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setProgramar(null)} className="btn-ghost">Cancelar</button>
              <button className="btn-orange">Programar {programar.meses.length} mes(es)</button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Modal editar TAREA DE SISTEMA ─── */}
      {editSis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4" onClick={() => setEditSis(null)}>
          <form onSubmit={guardarSistema} className="w-full max-w-lg rounded-[22px] bg-white p-6 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold">Editar tarea de sistema</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Proceso *</label><input required className="input" value={editSis.proceso || ''} onChange={(e) => setEditSis({ ...editSis, proceso: e.target.value })} /></div>
              <div><label className="label">Subproceso</label><input className="input" value={editSis.subproceso || ''} onChange={(e) => setEditSis({ ...editSis, subproceso: e.target.value })} /></div>
            </div>
            <div><label className="label">Descripción</label><textarea className="input" rows={2} value={editSis.descripcion || ''} onChange={(e) => setEditSis({ ...editSis, descripcion: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Tipo</label>
                <select className="input" value={editSis.tipo || 'produccion'} onChange={(e) => setEditSis({ ...editSis, tipo: e.target.value })}>
                  {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div><label className="label">Horas/mes base</label><input type="number" min="0" step="0.01" className="input" value={editSis.horas_base ?? ''} onChange={(e) => setEditSis({ ...editSis, horas_base: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={editSis.activa !== false} onChange={(e) => setEditSis({ ...editSis, activa: e.target.checked })} /> Activa</label>
            {err && <p className="text-sm font-bold text-red-600">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditSis(null)} className="btn-ghost">Cancelar</button>
              <button className="btn-orange">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Modal editar CATÁLOGO ─── */}
      {editCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4" onClick={() => setEditCat(null)}>
          <form onSubmit={guardarCatalogo} className="w-full max-w-lg rounded-[22px] bg-white p-6 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-extrabold">Editar tarea del catálogo</h3>
              <p className="text-xs font-semibold text-navy-400">{norma?.nombre} · modelo {editCat.modelo}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Proceso *</label><input required className="input" value={editCat.proceso || ''} onChange={(e) => setEditCat({ ...editCat, proceso: e.target.value })} /></div>
              <div><label className="label">Subproceso</label><input className="input" value={editCat.subproceso || ''} onChange={(e) => setEditCat({ ...editCat, subproceso: e.target.value })} /></div>
            </div>
            <div><label className="label">Descripción de la tarea</label><textarea className="input" rows={3} value={editCat.descripcion || ''} onChange={(e) => setEditCat({ ...editCat, descripcion: e.target.value })} /></div>
            <div className="w-1/2"><label className="label">Horas/mes base</label><input type="number" min="0" step="0.01" className="input" value={editCat.horas_base ?? ''} onChange={(e) => setEditCat({ ...editCat, horas_base: e.target.value })} /></div>
            <p className="rounded-xl bg-navy-50 px-3 py-2 text-[11px] font-semibold text-navy-500">Los cambios se propagan a las tareas de sistema derivadas. La agenda ya programada no se toca.</p>
            {err && <p className="text-sm font-bold text-red-600">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditCat(null)} className="btn-ghost">Cancelar</button>
              <button className="btn-orange">Guardar y propagar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
