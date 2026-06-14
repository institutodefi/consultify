import { useEffect, useMemo, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { NORMAS, NORMA_BY_ID, MODELO_IDS, EFICIENCIA } from '../../lib/calcEngine.js';
import { tareasCatalogo } from '../../lib/catalogoTareas.js';
import { useAuth } from '../../lib/auth.jsx';

const TIPOS = [
  { id: 'produccion', nombre: 'Producción / Proyecto' },
  { id: 'gestion', nombre: 'Gestión' },
  { id: 'coordinacion', nombre: 'Coordinación' },
];
const ESTADO_CHIP = {
  pendiente: 'bg-brand-orange/15 text-brand-orangeDark',
  en_curso: 'bg-navy-100 text-navy-700',
  completada: 'bg-green-100 text-green-800',
};

export default function ControlSistema() {
  const [normaSel, setNormaSel] = useState('9001');
  const [tareas, setTareas] = useState(null);
  const [proyectos, setProyectos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);
  const [vista, setVista] = useState('programadas'); // 'programadas' | 'catalogo'
  const [catalogo, setCatalogo] = useState([]);
  const [editCat, setEditCat] = useState(null);
  const { verEconomico } = useAuth();

  const load = () => {
    listTable('agenda_tareas').then(setTareas).catch(() => setTareas([]));
    listTable('proyectos').then(setProyectos).catch(() => {});
    listTable('clientes').then(setClientes).catch(() => {});
    listTable('consultores').then(setConsultores).catch(() => {});
    listTable('tareas_catalogo').then(setCatalogo).catch(() => setCatalogo([]));
  };
  useEffect(() => { load(); }, []);

  // Proyectos que incluyen la norma seleccionada
  const proyNorma = useMemo(
    () => proyectos.filter((p) => (p.normas || []).includes(normaSel)),
    [proyectos, normaSel]
  );
  const proyIds = new Set(proyNorma.map((p) => p.id));

  // Tareas de esos proyectos, agrupadas por modelo
  const porModelo = useMemo(() => {
    if (!tareas) return {};
    const g = {};
    for (const t of tareas) {
      if (!proyIds.has(t.proyecto_id)) continue;
      const p = proyNorma.find((x) => x.id === t.proyecto_id);
      const modelo = p?.modelo || '—';
      (g[modelo] ??= []).push({ ...t, _proy: p });
    }
    return g;
  }, [tareas, proyNorma]);

  const nombreCliente = (p) => clientes.find((c) => String(c.id) === String(p?.cliente_id))?.empresa || 'Cliente';
  const nombreConsultor = (id) => {
    const c = consultores.find((x) => String(x.id) === String(id));
    return c ? `${c.nombre} ${c.apellidos || ''}`.trim() : '—';
  };

  function nuevaTarea(proyecto) {
    setForm({
      proyecto_id: proyecto?.id || (proyNorma[0]?.id ?? ''),
      consultor_id: consultores[0]?.id || '',
      titulo: '', proceso: '', subproceso: '', tipo: 'produccion',
      fecha_prevista: new Date().toISOString().slice(0, 10),
      horas_base: '', horas_previstas: 2, horas_reales: '', hora_inicio: '09:00',
      estado: 'pendiente', descripcion: '',
    });
  }

  // Carga las tareas tipo del catálogo (Proceso-Subproceso) para un proyecto,
  // por cada norma que el proyecto integra (sistemas integrados).
  async function cargarCatalogo(proyecto) {
    if (!proyecto) return;
    const normasProy = proyecto.normas || [];
    if (!normasProy.length) return;
    if (!confirm(`Cargar tareas del catálogo para ${normasProy.length} norma(s) integrada(s) del proyecto? Las tareas ya existentes con horas hechas no se tocan.`)) return;
    const consultor = consultores.find((c) => String(c.id) === String(proyecto.consultor_id));
    const coef = EFICIENCIA[consultor?.nivel] ?? 1;
    const yaCreadas = new Set(
      tareas.filter((t) => t.proyecto_id === proyecto.id).map((t) => `${t.norma_id}|${t.titulo}`)
    );
    const nuevas = [];
    for (const nid of normasProy) {
      const delCat = catalogo.filter(c => c.norma_id === nid && c.modelo === proyecto.modelo);
      for (const tc of delCat) {
        const titulo = tc.titulo || `${tc.proceso} - ${tc.subproceso}`;
        if (yaCreadas.has(`${nid}|${titulo}`)) continue;       // no duplicar
        nuevas.push({
          proyecto_id: proyecto.id,
          consultor_id: proyecto.consultor_id || consultores[0]?.id || null,
          norma_id: nid,
          titulo, proceso: tc.proceso, subproceso: tc.subproceso,
          descripcion: tc.descripcion || null,
          catalogo_id: tc.id || null,
          tipo: 'produccion',
          fecha_prevista: new Date().toISOString().slice(0, 10),
          horas_base: tc.horas,
          horas_previstas: Math.round(tc.horas * coef * 100) / 100,
          hora_inicio: '09:00', estado: 'pendiente',
        });
      }
    }
    if (!nuevas.length) { alert('No hay tareas nuevas que cargar (ya estaban todas).'); return; }
    for (const n of nuevas) { try { await insertRow('agenda_tareas', n); } catch (e) { /* sigue */ } }
    alert(`${nuevas.length} tarea(s) cargada(s) desde el catálogo.`);
    load();
  }

  async function guardarCatalogo(e) {
    e.preventDefault(); setErr(null);
    try {
      const titulo = `${editCat.proceso || ''}${editCat.proceso && editCat.subproceso ? ' - ' : ''}${editCat.subproceso || ''}`.trim();
      const datos = {
        proceso: editCat.proceso || null,
        subproceso: editCat.subproceso || null,
        titulo,
        descripcion: editCat.descripcion || null,
        horas_base: editCat.horas_base ? Number(editCat.horas_base) : 0,
      };
      await updateRow('tareas_catalogo', editCat.id, datos);
      // Propagar a la PROGRAMACIÓN FUTURA: instancias de esta fila del
      // catálogo sin horas hechas. No rompe lo ya ejecutado.
      const instancias = tareas.filter(t =>
        (t.catalogo_id === editCat.id) && (t.horas_reales == null || t.horas_reales === ''));
      for (const t of instancias) {
        const niv = consultores.find(c => String(c.id) === String(t.consultor_id))?.nivel || 'J2';
        const cf = EFICIENCIA[niv] ?? 1;
        try {
          await updateRow('agenda_tareas', t.id, {
            titulo, proceso: datos.proceso, subproceso: datos.subproceso,
            descripcion: t.descripcion || datos.descripcion,
            horas_base: datos.horas_base,
            horas_previstas: Math.round(datos.horas_base * cf * 100) / 100,
          });
        } catch (e2) { /* sigue */ }
      }
      setEditCat(null); load();
    } catch (e2) { setErr(e2.message); }
  }

  async function guardar(e) {
    e.preventDefault(); setErr(null);
    const nivel = consultores.find((c) => String(c.id) === String(form.consultor_id))?.nivel || 'J2';
    const coef = EFICIENCIA[nivel] ?? 1;
    const horasPrev = form.horas_base ? Math.round(Number(form.horas_base) * coef * 10) / 10 : Number(form.horas_previstas);
    try {
      const titulo = (form.proceso || form.subproceso)
        ? `${form.proceso || ''}${form.proceso && form.subproceso ? ' - ' : ''}${form.subproceso || ''}`.trim()
        : form.titulo;
      const datos = {
        proyecto_id: form.proyecto_id || null,
        consultor_id: form.consultor_id,
        titulo,
        proceso: form.proceso || null,
        subproceso: form.subproceso || null,
        tipo: form.tipo,
        fecha_prevista: form.fecha_prevista,
        horas_base: form.horas_base ? Number(form.horas_base) : null,
        horas_previstas: horasPrev,
        horas_reales: form.horas_reales ? Number(form.horas_reales) : null,
        hora_inicio: form.hora_inicio || '09:00',
        estado: form.estado,
        descripcion: form.descripcion || null,
      };
      if (form.id) {
        await updateRow('agenda_tareas', form.id, datos);
        // Propagar a sistemas integrados: misma tarea (titulo) en el mismo
        // proyecto y otras normas integradas, sin horas hechas.
        if (datos.horas_base != null) {
          const hermanas = tareas.filter(t =>
            t.id !== form.id && t.proyecto_id === form.proyecto_id &&
            t.titulo === datos.titulo && t.horas_reales == null);
          for (const h of hermanas) {
            const niv = consultores.find(c => String(c.id) === String(h.consultor_id))?.nivel || 'J2';
            const cf = EFICIENCIA[niv] ?? 1;
            try { await updateRow('agenda_tareas', h.id, { horas_base: datos.horas_base, horas_previstas: Math.round(datos.horas_base * cf * 100) / 100 }); } catch (e) {}
          }
        }
      } else {
        await insertRow('agenda_tareas', datos);
      }
      setForm(null); load();
    } catch (e2) { setErr(e2.message); }
  }

  async function borrar(id) {
    if (!confirm('¿Eliminar esta tarea?')) return;
    await deleteRow('agenda_tareas', id); load();
  }

  const norma = NORMA_BY_ID[normaSel];
  const catalogoNorma = catalogo.filter(c => c.norma_id === normaSel);
  const catPorModelo = MODELO_IDS.reduce((acc, m) => {
    const items = catalogoNorma.filter(c => c.modelo === m).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    if (items.length) acc[m] = items;
    return acc;
  }, {});
  const nivelForm = consultores.find((c) => String(c.id) === String(form?.consultor_id))?.nivel || 'J2';
  const coefForm = EFICIENCIA[nivelForm] ?? 1;
  const derivadas = form?.horas_base ? Math.round(Number(form.horas_base) * coefForm * 10) / 10 : null;

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

      {/* Toggle de vista: tareas programadas (en proyectos) vs catálogo (plantilla) */}
      <div className="flex gap-2">
        {[['programadas', 'Tareas programadas'], ['catalogo', 'Catálogo de tareas']].map(([id, label]) => (
          <button key={id} onClick={() => { setVista(id); setForm(null); setEditCat(null); }}
            className={`chip border transition ${vista === id ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-navy-900">
            {norma?.nombre} · {vista === 'catalogo' ? 'catálogo (plantilla de tareas)' : 'tareas por modelo'}
          </h2>
          <p className="text-sm font-medium text-navy-400">
            {vista === 'catalogo'
              ? 'Edita nombres, descripción y horas. Los cambios se aplican a la programación futura sin tocar lo ya ejecutado.'
              : `${proyNorma.length} proyecto(s) con esta norma`}
          </p>
        </div>
        {vista === 'programadas' && (
          <div className="flex gap-2">
            <select id="cat-proy" className="input !py-2 text-sm" defaultValue=""
              onChange={(e) => { const p = proyNorma.find(x => String(x.id) === e.target.value); if (p) cargarCatalogo(p); e.target.value=''; }}>
              <option value="" disabled>Cargar catálogo en…</option>
              {proyNorma.map(p => <option key={p.id} value={p.id}>{nombreCliente(p)} · {p.modelo}</option>)}
            </select>
            <button onClick={() => nuevaTarea(null)} disabled={!proyNorma.length} className="btn-orange disabled:opacity-40">+ Añadir tarea</button>
          </div>
        )}
      </div>

      {/* ─── VISTA CATÁLOGO: tablas editables por modelo ─── */}
      {vista === 'catalogo' && (
        <div className="space-y-4">
          {MODELO_IDS.filter((m) => catPorModelo[m]?.length).map((modelo) => (
            <div key={modelo} className="card !p-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-navy-100 bg-navy-50/60 px-5 py-3">
                <h3 className="font-extrabold text-navy-800">Modelo {modelo}</h3>
                <span className="text-xs font-bold text-navy-400">
                  {catPorModelo[modelo].length} tarea(s) · {catPorModelo[modelo].reduce((s, t) => s + Number(t.horas_base || 0), 0).toFixed(2)} h base
                </span>
              </div>
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-navy-100 text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                  <th className="px-5 py-2.5">Proceso - Subproceso</th><th className="px-5 py-2.5">Descripción</th>
                  <th className="px-5 py-2.5 text-right">Horas base</th><th className="px-5 py-2.5 text-right">Acción</th>
                </tr></thead>
                <tbody className="divide-y divide-navy-50">
                  {catPorModelo[modelo].map((c) => (
                    <tr key={c.id}>
                      <td className="px-5 py-2.5 font-bold">{c.titulo || `${c.proceso} - ${c.subproceso}`}</td>
                      <td className="px-5 py-2.5 text-navy-400">{c.descripcion || <span className="text-navy-200">— sin descripción —</span>}</td>
                      <td className="px-5 py-2.5 text-right font-semibold">{Number(c.horas_base).toFixed(2)} h</td>
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
            <div className="card text-center font-medium text-navy-400">
              No hay tareas de catálogo para {norma?.nombre}. Ejecuta seed-tareas.sql en Supabase (o revisa el modo demo).
            </div>
          )}
        </div>
      )}

      {vista === 'programadas' && !tareas && <p className="font-semibold text-navy-400">Cargando…</p>}
      {vista === 'programadas' && tareas && !proyNorma.length && (
        <div className="card text-center font-medium text-navy-400">
          No hay proyectos contratados con {norma?.nombre}. Créalos en la pestaña Proyectos.
        </div>
      )}

      {/* Agrupación por modelo */}
      {vista === 'programadas' && MODELO_IDS.filter((m) => porModelo[m]?.length).map((modelo) => (
        <div key={modelo} className="card !p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-navy-100 bg-navy-50/60 px-5 py-3">
            <h3 className="font-extrabold text-navy-800">Modelo {modelo}</h3>
            <span className="text-xs font-bold text-navy-400">
              {porModelo[modelo].length} tarea(s) · {porModelo[modelo].reduce((s, t) => s + Number(t.horas_previstas || 0), 0)} h previstas
            </span>
          </div>
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-navy-100 text-left text-xs font-bold uppercase tracking-wider text-navy-300">
              <th className="px-5 py-2.5">Tarea</th><th className="px-5 py-2.5">Cliente</th><th className="px-5 py-2.5">Responsable</th>
              <th className="px-5 py-2.5">Tipo</th><th className="px-5 py-2.5">Fecha</th><th className="px-5 py-2.5 text-right">Horas</th>
              <th className="px-5 py-2.5">Estado</th><th className="px-5 py-2.5 text-right">Acciones</th>
            </tr></thead>
            <tbody className="divide-y divide-navy-50">
              {porModelo[modelo].map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-2.5 font-bold">{t.titulo}</td>
                  <td className="px-5 py-2.5 text-navy-400">{nombreCliente(t._proy)}</td>
                  <td className="px-5 py-2.5 text-navy-400">{nombreConsultor(t.consultor_id)}</td>
                  <td className="px-5 py-2.5 text-navy-400">{TIPOS.find((x) => x.id === (t.tipo || 'produccion'))?.nombre}</td>
                  <td className="px-5 py-2.5 text-navy-400">{t.fecha_prevista}</td>
                  <td className="px-5 py-2.5 text-right font-semibold">{t.horas_previstas} h{t.horas_base ? <span className="text-navy-300"> (base {t.horas_base})</span> : null}</td>
                  <td className="px-5 py-2.5"><span className={`chip ${ESTADO_CHIP[t.estado] || ESTADO_CHIP.pendiente}`}>{t.estado}</span></td>
                  <td className="px-5 py-2.5 text-right">
                    <button onClick={() => setForm({ ...t, horas_base: t.horas_base ?? '', proceso: t.proceso || '', subproceso: t.subproceso || '', horas_reales: t.horas_reales ?? '' })} className="font-bold text-navy-700 hover:underline">Editar</button>
                    <button onClick={() => borrar(t.id)} className="ml-3 font-bold text-red-600 hover:underline">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {vista === 'programadas' && tareas && proyNorma.length > 0 && !Object.keys(porModelo).length && (
        <div className="card text-center font-medium text-navy-400">
          Sin tareas programadas para {norma?.nombre}. Usa «Añadir tarea».
        </div>
      )}

      {/* Modal alta/edición */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4" onClick={() => setForm(null)}>
          <form onSubmit={guardar} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[22px] bg-white p-6 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold">{form.id ? 'Editar tarea' : 'Nueva tarea'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Proceso *</label><input required className="input" placeholder="PE1 PLANIFICACIÓN ESTRATÉGICA" value={form.proceso || ''} onChange={(e) => setForm({ ...form, proceso: e.target.value })} /></div>
              <div><label className="label">Subproceso</label><input className="input" placeholder="S1 PE1 GESTIÓN DEL CONTEXTO" value={form.subproceso || ''} onChange={(e) => setForm({ ...form, subproceso: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Proyecto</label>
                <select className="input" value={form.proyecto_id} onChange={(e) => setForm({ ...form, proyecto_id: e.target.value })}>
                  {proyNorma.map((p) => <option key={p.id} value={p.id}>{nombreCliente(p)} · {p.modelo}</option>)}
                </select>
              </div>
              <div><label className="label">Responsable</label>
                <select className="input" value={form.consultor_id} onChange={(e) => setForm({ ...form, consultor_id: e.target.value })}>
                  {consultores.map((c) => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''} · {c.nivel}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">Tipo</label>
                <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                  {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div><label className="label">Fecha</label><input type="date" className="input" value={form.fecha_prevista} onChange={(e) => setForm({ ...form, fecha_prevista: e.target.value })} /></div>
              <div><label className="label">Hora</label><input type="time" className="input" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">Horas base (tarea tipo)</label><input type="number" min="0.5" step="0.5" className="input" placeholder="opcional" value={form.horas_base} onChange={(e) => setForm({ ...form, horas_base: e.target.value })} /></div>
              <div><label className="label">Horas programadas</label>
                <input type="number" min="0.5" max="9" step="0.5" className="input" value={derivadas ?? form.horas_previstas} disabled={!!derivadas} onChange={(e) => setForm({ ...form, horas_previstas: e.target.value })} />
                {derivadas != null && <p className="mt-1 text-[11px] font-semibold text-navy-400">{nivelForm} aplica {Math.round(coefForm * 100)}% → {derivadas} h</p>}
              </div>
              <div><label className="label">Horas hechas</label><input type="number" min="0" max="9" step="0.5" className="input" placeholder="—" value={form.horas_reales || ''} onChange={(e) => setForm({ ...form, horas_reales: e.target.value })} /></div>
            </div>
            <div><label className="label">Estado</label>
              <div className="flex gap-2">
                {['pendiente', 'en_curso', 'completada'].map((v) => (
                  <button type="button" key={v} onClick={() => setForm({ ...form, estado: v })}
                    className={`chip flex-1 justify-center border ${form.estado === v ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-200 bg-white text-navy-400'}`}>{v}</button>
                ))}
              </div>
            </div>
            <div><label className="label">Descripción</label><textarea className="input" rows={2} value={form.descripcion || ''} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
            {err && <p className="text-sm font-bold text-red-600">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="btn-ghost">Cancelar</button>
              <button className="btn-orange">{form.id ? 'Guardar' : 'Crear tarea'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal edición de CATÁLOGO (plantilla) */}
      {editCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4" onClick={() => setEditCat(null)}>
          <form onSubmit={guardarCatalogo} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[22px] bg-white p-6 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-extrabold">Editar tarea del catálogo</h3>
              <p className="text-xs font-semibold text-navy-400">{norma?.nombre} · modelo {editCat.modelo}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Proceso *</label><input required className="input" value={editCat.proceso || ''} onChange={(e) => setEditCat({ ...editCat, proceso: e.target.value })} /></div>
              <div><label className="label">Subproceso</label><input className="input" value={editCat.subproceso || ''} onChange={(e) => setEditCat({ ...editCat, subproceso: e.target.value })} /></div>
            </div>
            <div>
              <label className="label">Descripción de la tarea</label>
              <textarea className="input" rows={3} placeholder="Detalle de lo que incluye esta tarea…" value={editCat.descripcion || ''} onChange={(e) => setEditCat({ ...editCat, descripcion: e.target.value })} />
            </div>
            <div className="w-1/2">
              <label className="label">Horas base</label>
              <input type="number" min="0" step="0.01" className="input" value={editCat.horas_base ?? ''} onChange={(e) => setEditCat({ ...editCat, horas_base: e.target.value })} />
            </div>
            <p className="rounded-xl bg-navy-50 px-3 py-2 text-[11px] font-semibold text-navy-500">
              Al guardar, los cambios se aplican a la programación futura de esta tarea (tareas sin horas hechas). Lo ya ejecutado no se modifica.
            </p>
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
