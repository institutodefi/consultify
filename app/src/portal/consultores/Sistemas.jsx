import { useEffect, useMemo, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { sincronizarTareaAgenda } from '../../lib/sincroAgenda.js';
import { NORMAS } from '../../lib/calcEngine.js';

// Modelos que se editan lado a lado (4 columnas). Implantación es un precio
// cerrado derivado de Implicación, no se edita tarea a tarea aquí.
const MODELOS_COL = ['Apoyo', 'Relación', 'Implicación', 'Compromiso'];
const fmtH = (h) => `${(Math.round((h || 0) * 100) / 100).toLocaleString('es-ES')}`;

export default function Sistemas() {
  const [catalogo, setCatalogo] = useState([]);
  const [normaSel, setNormaSel] = useState('9001');
  const [msg, setMsg] = useState(null);
  const [pendiente, setPendiente] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [filtro, setFiltro] = useState('');

  const cargar = () => listTable('tareas_catalogo').then(setCatalogo).catch(() => setCatalogo([]));
  useEffect(cargar, []);

  // Agrupa las tareas de la norma por subproceso, cruzando los 4 modelos en columnas.
  // Cada grupo tiene: subproceso, proceso, orden, y por modelo la fila {id, horas_base}.
  const grupos = useMemo(() => {
    const dela = catalogo.filter(t => t.norma_id === normaSel);
    const mapa = new Map(); // clave = subproceso
    for (const t of dela) {
      const clave = t.subproceso || t.titulo || '';
      if (!mapa.has(clave)) mapa.set(clave, { subproceso: t.subproceso || '', proceso: t.proceso || '', orden: t.orden ?? 999, porModelo: {} });
      const g = mapa.get(clave);
      if ((t.orden ?? 999) < g.orden) g.orden = t.orden ?? 999;
      if (t.proceso && !g.proceso) g.proceso = t.proceso;
      g.porModelo[t.modelo] = { id: t.id, horas: Number(t.horas_base) || 0 };
    }
    let arr = [...mapa.values()].sort((a, b) => a.orden - b.orden || a.subproceso.localeCompare(b.subproceso));
    if (filtro.trim()) {
      const q = filtro.toLowerCase();
      arr = arr.filter(g => `${g.proceso} ${g.subproceso}`.toLowerCase().includes(q));
    }
    return arr;
  }, [catalogo, normaSel, filtro]);

  // Totales por modelo (columna).
  const totales = useMemo(() => {
    const t = {}; for (const m of MODELOS_COL) t[m] = 0;
    for (const g of grupos) for (const m of MODELOS_COL) t[m] += g.porModelo[m]?.horas || 0;
    return t;
  }, [grupos]);

  // Edita las horas de una celda (norma+subproceso+modelo). Si esa combinación no
  // existe todavía como fila, la crea.
  async function editarCelda(grupo, modelo, valor) {
    const horas = Number(valor) || 0;
    const cel = grupo.porModelo[modelo];
    if (cel) {
      await updateRow('tareas_catalogo', cel.id, { horas_base: horas });
      setCatalogo(cs => cs.map(x => x.id === cel.id ? { ...x, horas_base: horas } : x));
    } else {
      // Crear la fila de ese modelo para este subproceso (p. ej. Compromiso que faltaba).
      const nueva = await insertRow('tareas_catalogo', {
        norma_id: normaSel, modelo, proceso: grupo.proceso, subproceso: grupo.subproceso,
        titulo: `${normaSel} - ${grupo.proceso} - ${grupo.subproceso}`, tipo: 'produccion',
        horas_base: horas, orden: grupo.orden,
      });
      if (nueva) setCatalogo(cs => [...cs, nueva]);
      else cargar();
    }
    setPendiente(true);
  }

  // Edita el texto del subproceso/proceso en TODAS las filas de modelo de ese grupo.
  async function editarTextoGrupo(grupo, campo, valor) {
    const ids = MODELOS_COL.map(m => grupo.porModelo[m]?.id).filter(Boolean);
    for (const id of ids) {
      const patch = { [campo]: valor };
      await updateRow('tareas_catalogo', id, patch);
    }
    setCatalogo(cs => cs.map(x => (ids.includes(x.id) ? { ...x, [campo]: valor } : x)));
    setPendiente(true);
  }

  async function addTarea() {
    const proceso = prompt('Proceso (p. ej. PE1 PLANIFICACIÓN ESTRATÉGICA):', '');
    if (!proceso) return;
    const subproceso = prompt('Subproceso (p. ej. S1 PE1 GESTIÓN DEL CONTEXTO):', '');
    if (!subproceso) return;
    const orden = grupos.length + 1;
    // Crea la tarea en los 4 modelos con 0 h, para poder rellenarlos.
    for (const m of MODELOS_COL) {
      await insertRow('tareas_catalogo', {
        norma_id: normaSel, modelo: m, proceso, subproceso,
        titulo: `${normaSel} - ${proceso} - ${subproceso}`, tipo: 'produccion',
        horas_base: 0, orden,
      });
    }
    cargar(); setMsg('Tarea añadida en los 4 modelos.');
  }

  async function quitarGrupo(grupo) {
    if (!confirm(`¿Eliminar "${grupo.subproceso}" del catálogo de ${normaSel} (en los 4 modelos)?`)) return;
    const ids = MODELOS_COL.map(m => grupo.porModelo[m]?.id).filter(Boolean);
    for (const id of ids) await deleteRow('tareas_catalogo', id);
    cargar(); setMsg('Tarea eliminada.');
  }

  // Sincroniza el catálogo de la norma con los proyectos (todas las filas de modelo).
  async function sincronizarAgendas() {
    setSincronizando(true); setMsg(null);
    try {
      const todas = await listTable('cliente_tareas');
      const consultores = await listTable('consultores').catch(() => []);
      const delaNorma = catalogo.filter(t => t.norma_id === normaSel);
      let n = 0;
      for (const cat of delaNorma) {
        const afectadas = todas.filter(ct =>
          ct.norma_id === cat.norma_id &&
          ct.modelo === cat.modelo &&
          (ct.subproceso || '') === (cat.subproceso || '') &&
          !ct.hecha && !ct.editada_manual && !ct.integrada);
        for (const ct of afectadas) {
          const horas = Number(cat.horas_base) || 0;
          await updateRow('cliente_tareas', ct.id, { horas });
          try { await sincronizarTareaAgenda({ ...ct, horas }, ct.consultor_id, consultores); } catch { /* noop */ }
          n++;
        }
      }
      setPendiente(false);
      setMsg(n ? `${n} tarea(s) no terminadas sincronizadas en proyectos y agendas.` : 'No había tareas pendientes que sincronizar.');
    } catch (e) { setMsg(e.message); }
    finally { setSincronizando(false); }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Configuración</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">Sistemas de gestión</h1>
        <p className="mt-2 text-sm font-medium text-navy-400">Edita las horas del catálogo maestro. Cada tarea muestra los 4 modelos en columnas para ajustarlos rápido. Los cambios se sincronizan en los proyectos que no hayas tocado a mano.</p>
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
            <label className="label">Filtrar tareas</label>
            <input className="input !w-64" placeholder="Buscar proceso o subproceso…" value={filtro} onChange={e => setFiltro(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            {msg && <span className="text-xs font-bold text-navy-600">{msg}</span>}
            {pendiente && <button onClick={sincronizarAgendas} disabled={sincronizando} className="rounded-xl border border-navy-200 px-4 py-2 text-sm font-bold text-navy-600 hover:bg-navy-50 disabled:opacity-40">{sincronizando ? 'Sincronizando…' : '⟳ Sincronizar proyectos'}</button>}
            <button onClick={addTarea} className="btn-orange !px-4 !py-2">+ Añadir tarea</button>
          </div>
        </div>
      </div>

      {/* Tabla editable con 4 columnas de modelo */}
      <div className="card overflow-x-auto">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-300">{grupos.length} tareas · {NORMAS.find(n => n.id === normaSel)?.nombre}</p>
        </div>
        {grupos.length === 0 ? (
          <p className="text-sm font-medium text-navy-300">Sin tareas para esta norma. Añade la primera.</p>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                <th className="py-2">Proceso</th>
                <th className="py-2">Subproceso</th>
                {MODELOS_COL.map(m => <th key={m} className="py-2 text-right px-1">{m}</th>)}
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {grupos.map((g, i) => (
                <tr key={g.subproceso + i}>
                  <td className="py-1.5 pr-2"><input className="input !py-1 !text-xs" value={g.proceso || ''} onChange={e => editarTextoGrupo(g, 'proceso', e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className="input !py-1 !text-xs" value={g.subproceso || ''} onChange={e => editarTextoGrupo(g, 'subproceso', e.target.value)} /></td>
                  {MODELOS_COL.map(m => (
                    <td key={m} className="py-1.5 px-1 text-right">
                      <input type="number" min="0" step="0.25"
                        className="input !py-1 !text-xs !w-20 text-right"
                        value={g.porModelo[m]?.horas ?? ''}
                        placeholder="0"
                        onChange={e => editarCelda(g, m, e.target.value)} />
                    </td>
                  ))}
                  <td className="py-1.5 text-right"><button onClick={() => quitarGrupo(g)} className="text-xs font-bold text-red-500 hover:underline">×</button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-navy-100 font-bold text-navy-800">
                <td className="py-2" colSpan={2}>Total</td>
                {MODELOS_COL.map(m => <td key={m} className="py-2 px-1 text-right">{fmtH(totales[m])} h</td>)}
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
