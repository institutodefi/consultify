import { useEffect, useMemo, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { NORMAS, NORMA_BY_ID, MODELO_IDS } from '../../lib/calcEngine.js';

const TIPOS = [
  { id: 'produccion', nombre: 'Producción / Proyecto' },
  { id: 'gestion', nombre: 'Gestión' },
  { id: 'coordinacion', nombre: 'Coordinación' },
];
const TIPO_CHIP = {
  produccion: 'bg-brand-orange/15 text-brand-orangeDark',
  gestion: 'bg-navy-100 text-navy-700',
  coordinacion: 'bg-green-100 text-green-800',
};
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const VACIA = (norma, modelo) => ({ norma_id: norma, modelo, proceso: '', subproceso: '', descripcion: '', tipo: 'produccion', horas_base: '' });

export default function ControlSistema() {
  const [normaSel, setNormaSel] = useState('9001');
  const [catalogo, setCatalogo] = useState(null);
  const [edit, setEdit] = useState(null);   // fila en edición o nueva
  const [err, setErr] = useState(null);

  const load = () => listTable('tareas_catalogo')
    .then((d) => { setCatalogo(d || []); setErr(null); })
    .catch((e) => { setCatalogo([]); setErr(`No se pudo cargar el catálogo: ${e.message || e.code || e}. Si la tabla no existe, ejecuta migracion-v8.sql y seed-tareas.sql en Supabase.`); });
  useEffect(() => { load(); }, []);

  const norma = NORMA_BY_ID[normaSel];
  const catalogoNorma = (catalogo || []).filter((c) => c.norma_id === normaSel);
  const porModelo = useMemo(() => {
    const g = {};
    for (const m of MODELO_IDS) {
      const items = catalogoNorma.filter((c) => c.modelo === m).sort((a, b) => (a.orden || 0) - (b.orden || 0));
      if (items.length) g[m] = items;
    }
    return g;
  }, [catalogoNorma]);

  async function guardar(e) {
    e.preventDefault(); setErr(null);
    try {
      const titulo = `${edit.proceso || ''}${edit.proceso && edit.subproceso ? ' - ' : ''}${edit.subproceso || ''}`.trim();
      if (!titulo) { setErr('Indica al menos el proceso.'); return; }
      const datos = {
        norma_id: edit.norma_id, modelo: edit.modelo,
        proceso: edit.proceso || null, subproceso: edit.subproceso || null, titulo,
        descripcion: edit.descripcion || null, tipo: edit.tipo || 'produccion',
        horas_base: edit.horas_base ? Number(edit.horas_base) : 0,
      };
      if (edit.id) await updateRow('tareas_catalogo', edit.id, datos);
      else await insertRow('tareas_catalogo', { ...datos, orden: (catalogoNorma.filter(c => c.modelo === edit.modelo).length + 1) });
      setEdit(null); load();
    } catch (e2) { setErr(e2.message); }
  }

  async function borrar(id) {
    if (!confirm('¿Eliminar esta casuística del catálogo?')) return;
    await deleteRow('tareas_catalogo', id); load();
  }

  return (
    <div className="space-y-6">
      {/* Selector de norma */}
      <div>
        <p className="label">Norma / sistema</p>
        <div className="flex flex-wrap gap-2">
          {NORMAS.map((n) => (
            <button key={n.id} onClick={() => setNormaSel(n.id)}
              className={`chip border transition ${normaSel === n.id ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'}`}>
              {n.nombre}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-extrabold text-navy-900">{norma?.nombre} · tareas por norma</h2>
        <p className="text-sm font-medium text-navy-400">
          Casuísticas del catálogo por modelo de relación. Las horas son el total de cada tarea (no mensuales). Edita nombre, descripción, horas y tipo; añade o elimina tareas. Es la plantilla que se usa al planificar cada proyecto.
        </p>
      </div>

      {err && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{err}</div>}
      {!catalogo && <p className="font-semibold text-navy-400">Cargando…</p>}

      {catalogo && !catalogoNorma.length && !err && (
        <div className="card text-center">
          <p className="font-bold text-navy-700">No hay casuísticas cargadas para {norma?.nombre}.</p>
          <p className="mt-1 text-sm font-medium text-navy-400">
            Si esperabas ver el catálogo del Excel, ejecuta <code className="rounded bg-navy-50 px-1">seed-tareas.sql</code> en Supabase. También puedes añadir casuísticas a mano con «+ Añadir» en cada modelo.
          </p>
        </div>
      )}

      {catalogo && MODELO_IDS.filter((m) => porModelo[m]?.length || true).map((modelo) => {
        const items = porModelo[modelo] || [];
        const totalHoras = r2(items.reduce((s, t) => s + Number(t.horas_base || 0), 0));
        return (
          <div key={modelo} className="card !p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-navy-100 bg-navy-50/60 px-5 py-3">
              <div>
                <h3 className="font-extrabold text-navy-800">Modelo {modelo}</h3>
                <p className="text-xs font-semibold text-navy-400">{items.length} casuística(s) · {totalMes} h</p>
              </div>
              <button onClick={() => setEdit(VACIA(normaSel, modelo))} className="btn-ghost !px-3 !py-1.5 text-sm">+ Añadir</button>
            </div>
            {items.length > 0 ? (
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b border-navy-100 text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                  <th className="px-5 py-2.5">Proceso - Subproceso</th><th className="px-5 py-2.5">Descripción</th>
                  <th className="px-5 py-2.5">Tipo</th><th className="px-5 py-2.5 text-right">Horas</th><th className="px-5 py-2.5 text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-navy-50">
                  {items.map((c) => (
                    <tr key={c.id}>
                      <td className="px-5 py-2.5 font-bold">{c.titulo || `${c.proceso} - ${c.subproceso}`}</td>
                      <td className="px-5 py-2.5 text-navy-400">{c.descripcion || <span className="text-navy-200">—</span>}</td>
                      <td className="px-5 py-2.5"><span className={`chip ${TIPO_CHIP[c.tipo || 'produccion']}`}>{TIPOS.find((x) => x.id === (c.tipo || 'produccion'))?.nombre}</span></td>
                      <td className="px-5 py-2.5 text-right font-semibold">{r2(c.horas_base)} h</td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => setEdit({ ...c })} className="font-bold text-navy-700 hover:underline">Editar</button>
                        <button onClick={() => borrar(c.id)} className="ml-3 font-bold text-red-600 hover:underline">Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-6 text-center text-sm font-medium text-navy-400">Sin casuísticas para este modelo. Usa «Añadir».</p>
            )}
          </div>
        );
      })}

      {/* Modal alta/edición de casuística */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4" onClick={() => setEdit(null)}>
          <form onSubmit={guardar} className="w-full max-w-lg rounded-[22px] bg-white p-6 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-extrabold">{edit.id ? 'Editar casuística' : 'Nueva casuística'}</h3>
              <p className="text-xs font-semibold text-navy-400">{norma?.nombre} · modelo {edit.modelo}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Proceso *</label><input required className="input" placeholder="PE1 PLANIFICACIÓN ESTRATÉGICA" value={edit.proceso || ''} onChange={(e) => setEdit({ ...edit, proceso: e.target.value })} /></div>
              <div><label className="label">Subproceso</label><input className="input" placeholder="S1 PE1 GESTIÓN DEL CONTEXTO" value={edit.subproceso || ''} onChange={(e) => setEdit({ ...edit, subproceso: e.target.value })} /></div>
            </div>
            <div><label className="label">Descripción</label><textarea className="input" rows={3} placeholder="Detalle de lo que incluye esta tarea…" value={edit.descripcion || ''} onChange={(e) => setEdit({ ...edit, descripcion: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Tipo</label>
                <select className="input" value={edit.tipo || 'produccion'} onChange={(e) => setEdit({ ...edit, tipo: e.target.value })}>
                  {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div><label className="label">Horas</label><input type="number" min="0" step="0.01" className="input" value={edit.horas_base ?? ''} onChange={(e) => setEdit({ ...edit, horas_base: e.target.value })} /></div>
            </div>
            {err && <p className="text-sm font-bold text-red-600">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEdit(null)} className="btn-ghost">Cancelar</button>
              <button className="btn-orange">{edit.id ? 'Guardar' : 'Crear'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
