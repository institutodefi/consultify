import { useEffect, useMemo, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { NORMAS, NORMA_BY_ID, MODELO_IDS, EFICIENCIA } from '../../lib/calcEngine.js';

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

  const load = () => {
    listTable('agenda_tareas').then(setTareas).catch(() => setTareas([]));
    listTable('proyectos').then(setProyectos).catch(() => {});
    listTable('clientes').then(setClientes).catch(() => {});
    listTable('consultores').then(setConsultores).catch(() => {});
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
      titulo: '', tipo: 'produccion',
      fecha_prevista: new Date().toISOString().slice(0, 10),
      horas_base: '', horas_previstas: 2, hora_inicio: '09:00',
      estado: 'pendiente', descripcion: '',
    });
  }

  async function guardar(e) {
    e.preventDefault(); setErr(null);
    const nivel = consultores.find((c) => String(c.id) === String(form.consultor_id))?.nivel || 'J2';
    const coef = EFICIENCIA[nivel] ?? 1;
    const horasPrev = form.horas_base ? Math.round(Number(form.horas_base) * coef * 10) / 10 : Number(form.horas_previstas);
    try {
      const datos = {
        proyecto_id: form.proyecto_id || null,
        consultor_id: form.consultor_id,
        titulo: form.titulo,
        tipo: form.tipo,
        fecha_prevista: form.fecha_prevista,
        horas_base: form.horas_base ? Number(form.horas_base) : null,
        horas_previstas: horasPrev,
        hora_inicio: form.hora_inicio || '09:00',
        estado: form.estado,
        descripcion: form.descripcion || null,
      };
      if (form.id) await updateRow('agenda_tareas', form.id, datos);
      else await insertRow('agenda_tareas', datos);
      setForm(null); load();
    } catch (e2) { setErr(e2.message); }
  }

  async function borrar(id) {
    if (!confirm('¿Eliminar esta tarea?')) return;
    await deleteRow('agenda_tareas', id); load();
  }

  const norma = NORMA_BY_ID[normaSel];
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

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-navy-900">{norma?.nombre} · tareas por modelo</h2>
          <p className="text-sm font-medium text-navy-400">{proyNorma.length} proyecto(s) con esta norma</p>
        </div>
        <button onClick={() => nuevaTarea(null)} disabled={!proyNorma.length} className="btn-orange disabled:opacity-40">+ Añadir tarea</button>
      </div>

      {!tareas && <p className="font-semibold text-navy-400">Cargando…</p>}
      {tareas && !proyNorma.length && (
        <div className="card text-center font-medium text-navy-400">
          No hay proyectos contratados con {norma?.nombre}. Créalos en la pestaña Proyectos.
        </div>
      )}

      {/* Agrupación por modelo */}
      {MODELO_IDS.filter((m) => porModelo[m]?.length).map((modelo) => (
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
                    <button onClick={() => setForm({ ...t, horas_base: t.horas_base ?? '' })} className="font-bold text-navy-700 hover:underline">Editar</button>
                    <button onClick={() => borrar(t.id)} className="ml-3 font-bold text-red-600 hover:underline">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {tareas && proyNorma.length > 0 && !Object.keys(porModelo).length && (
        <div className="card text-center font-medium text-navy-400">
          Sin tareas programadas para {norma?.nombre}. Usa «Añadir tarea».
        </div>
      )}

      {/* Modal alta/edición */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4" onClick={() => setForm(null)}>
          <form onSubmit={guardar} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[22px] bg-white p-6 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold">{form.id ? 'Editar tarea' : 'Nueva tarea'}</h3>
            <div><label className="label">Título *</label><input required className="input" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
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
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Horas base (tarea tipo)</label><input type="number" min="0.5" step="0.5" className="input" placeholder="opcional" value={form.horas_base} onChange={(e) => setForm({ ...form, horas_base: e.target.value })} /></div>
              <div><label className="label">Horas programadas</label>
                <input type="number" min="0.5" max="9" step="0.5" className="input" value={derivadas ?? form.horas_previstas} disabled={!!derivadas} onChange={(e) => setForm({ ...form, horas_previstas: e.target.value })} />
                {derivadas != null && <p className="mt-1 text-[11px] font-semibold text-navy-400">{nivelForm} aplica {Math.round(coefForm * 100)}% → {derivadas} h</p>}
              </div>
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
    </div>
  );
}
