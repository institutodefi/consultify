import { useEffect, useMemo, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { NORMAS } from '../../lib/calcEngine.js';

const MODELOS = ['Apoyo', 'Implantación', 'Relación', 'Implicación', 'Compromiso'];
const HCOL = { Apoyo: 'horas_apoyo', Implantación: 'horas_implantacion', Relación: 'horas_relacion', Implicación: 'horas_implicacion', Compromiso: 'horas_compromiso' };
const fmtH = (h) => `${(Math.round((h || 0) * 100) / 100).toLocaleString('es-ES')}`;

export default function Sistemas() {
  const [catalogo, setCatalogo] = useState([]);
  const [normaSel, setNormaSel] = useState('9001');
  const [modelo, setModelo] = useState('Implicación');
  const [msg, setMsg] = useState(null);

  const cargar = () => listTable('tareas_catalogo').then(setCatalogo).catch(() => setCatalogo([]));
  useEffect(cargar, []);

  // tareas_catalogo en este proyecto es 1 fila por (norma+modelo+subproceso) con horas_base.
  const filas = useMemo(() => catalogo
    .filter(t => t.norma_id === normaSel && t.modelo === modelo)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || (a.proceso || '').localeCompare(b.proceso || '')), [catalogo, normaSel, modelo]);

  async function editarHoras(t, horas) {
    await updateRow('tareas_catalogo', t.id, { horas_base: Number(horas) || 0 });
    setCatalogo(cs => cs.map(x => x.id === t.id ? { ...x, horas_base: Number(horas) || 0 } : x));
    // Sincronizar SOLO tareas de proyecto no editadas a mano de este (norma+subproceso+modelo).
    sincronizarProyectos(t, { horas: Number(horas) || 0 });
  }
  async function editarTexto(t, campos) {
    await updateRow('tareas_catalogo', t.id, campos);
    setCatalogo(cs => cs.map(x => x.id === t.id ? { ...x, ...campos } : x));
  }
  async function addTarea() {
    const proceso = prompt('Proceso (p. ej. PE1 PLANIFICACIÓN ESTRATÉGICA):', '');
    if (!proceso) return;
    const subproceso = prompt('Subproceso (p. ej. S1 PE1 GESTIÓN DEL CONTEXTO):', '');
    if (!subproceso) return;
    const horas = Number(prompt('Horas:', '1')) || 0;
    await insertRow('tareas_catalogo', {
      norma_id: normaSel, modelo, proceso, subproceso,
      titulo: `${normaSel} - ${proceso} - ${subproceso}`, tipo: 'produccion',
      horas_base: horas, orden: filas.length + 1,
    });
    cargar(); setMsg('Tarea añadida al catálogo.');
  }
  async function quitarTarea(t) {
    if (!confirm(`¿Eliminar "${t.subproceso}" del catálogo de ${normaSel} (${modelo})?`)) return;
    await deleteRow('tareas_catalogo', t.id);
    cargar(); setMsg('Tarea eliminada del catálogo.');
  }

  // Propaga un cambio del catálogo a las tareas de proyecto NO editadas a mano.
  async function sincronizarProyectos(catTarea, campos) {
    try {
      const todas = await listTable('cliente_tareas');
      const afectadas = todas.filter(ct =>
        ct.norma_id === catTarea.norma_id &&
        ct.modelo === catTarea.modelo &&
        (ct.subproceso || '') === (catTarea.subproceso || '') &&
        !ct.editada_manual && !ct.integrada);
      for (const ct of afectadas) await updateRow('cliente_tareas', ct.id, campos);
      if (afectadas.length) setMsg(`Cambio sincronizado en ${afectadas.length} tarea(s) de proyectos.`);
    } catch { /* noop */ }
  }

  const total = filas.reduce((s, t) => s + (Number(t.horas_base) || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Configuración</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">Sistemas de gestión</h1>
        <p className="mt-2 text-sm font-medium text-navy-400">Edita el catálogo maestro de tareas por sistema y modelo. Los cambios se sincronizan en los proyectos que no hayas tocado a mano.</p>
      </div>

      {/* Subpestañas por sistema */}
      <div className="card">
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
          {NORMAS.map(n => (
            <button key={n.id} onClick={() => setNormaSel(n.id)}
              className={`chip shrink-0 whitespace-nowrap border text-xs font-bold ${normaSel === n.id ? 'border-brand-orange bg-brand-orange/15 text-navy-900' : 'border-navy-200 bg-white text-navy-400'}`}>
              {n.nombre}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <label className="label">Modelo</label>
            <select className="input !w-auto" value={modelo} onChange={e => setModelo(e.target.value)}>
              {MODELOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            {msg && <span className="text-xs font-bold text-navy-600">{msg}</span>}
            <button onClick={addTarea} className="btn-orange !px-4 !py-2">+ Añadir tarea</button>
          </div>
        </div>
      </div>

      {/* Tabla editable */}
      <div className="card overflow-x-auto">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-300">{filas.length} tareas · {modelo}</p>
          <p className="text-sm font-bold text-navy-800">{fmtH(total)} h</p>
        </div>
        {filas.length === 0 ? (
          <p className="text-sm font-medium text-navy-300">Sin tareas para {normaSel} en {modelo}. Añade la primera.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                <th className="py-2">Proceso</th><th className="py-2">Subproceso</th><th className="py-2 text-right">Horas</th><th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {filas.map(t => (
                <tr key={t.id}>
                  <td className="py-1.5"><input className="input !py-1 !text-xs" value={t.proceso || ''} onChange={e => editarTexto(t, { proceso: e.target.value })} onBlur={e => editarTexto(t, { titulo: `${t.norma_id} - ${e.target.value} - ${t.subproceso}` })} /></td>
                  <td className="py-1.5"><input className="input !py-1 !text-xs" value={t.subproceso || ''} onChange={e => editarTexto(t, { subproceso: e.target.value })} /></td>
                  <td className="py-1.5 text-right"><input type="number" min="0" step="0.25" className="input !py-1 !text-xs !w-24 text-right" value={t.horas_base ?? ''} onChange={e => editarHoras(t, e.target.value)} /></td>
                  <td className="py-1.5 text-right"><button onClick={() => quitarTarea(t)} className="text-xs font-bold text-red-500 hover:underline">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
