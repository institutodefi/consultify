import { useEffect, useMemo, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { tareasDeCliente, repartirFechas, anidarTareas, codigoTareaIntegrada, horasCoordinacion } from '../../lib/planCliente.js';
import { sincronizarVariasAgenda, borrarReflejoAgenda } from '../../lib/sincroAgenda.js';
import { NORMAS, NORMA_BY_ID } from '../../lib/calcEngine.js';

const MODELOS = ['Apoyo', 'Relación', 'Implicación', 'Compromiso', 'Implantación'];
const fmtH = (h) => `${(Math.round((h || 0) * 100) / 100).toLocaleString('es-ES')} h`;
const tipoTarea = (t) => {
  const b = (t.bloque || '').toUpperCase();
  if (b.startsWith('PM') || /COORDINAC/i.test(t.proceso || '')) return 'coordinacion';
  return 'produccion';
};
const TIPO_LABEL = { produccion: 'Producción', gestion: 'Gestión', coordinacion: 'Coordinación' };

export default function Proyectos() {
  const [clientes, setClientes] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [catalogo, setCatalogo] = useState(null);
  const [festivos, setFestivos] = useState([]);
  const [equipo, setEquipo] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [sel, setSel] = useState('');         // proyecto seleccionado
  const [anidar, setAnidar] = useState(new Set()); // claves proceso|subproceso a anidar
  const [msg, setMsg] = useState(null);

  const cargar = () => {
    listTable('clientes').then(setClientes);
    listTable('proyectos_cliente').then(setProyectos).catch(() => setProyectos([]));
    listTable('tareas_catalogo').then(setCatalogo).catch(() => setCatalogo([]));
    listTable('festivos').then(setFestivos).catch(() => setFestivos([]));
    listTable('consultores').then(setEquipo).catch(() => {});
    listTable('cliente_tareas').then(all => setTareas(all)).catch(() => setTareas([]));
  };
  useEffect(cargar, []);

  // Permitir abrir un proyecto por querystring (?proyecto=ID) desde Clientes.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('proyecto');
    if (q) setSel(q);
  }, []);

  const proyecto = useMemo(() => proyectos.find(p => String(p.id) === String(sel)) || null, [proyectos, sel]);
  const cliente = useMemo(() => clientes.find(c => String(c.id) === String(proyecto?.cliente_id)) || null, [clientes, proyecto]);
  const activos = useMemo(() => proyectos.filter(p => p.estado === 'activo'), [proyectos]);
  const tareasProyecto = useMemo(() => tareas.filter(t => String(t.proyecto_id) === String(sel)), [tareas, sel]);
  const nombreCli = (id) => clientes.find(c => String(c.id) === String(id))?.empresa || '—';

  const [normasSel, setNormasSel] = useState([]);
  const [modelo, setModelo] = useState('Implicación');
  useEffect(() => { if (proyecto) { setNormasSel(proyecto.normas || []); setModelo(proyecto.modelo || 'Implicación'); } }, [proyecto]);

  const consultores = equipo.filter(c => (c.tipo_equipo || 'consultor') === 'consultor' && c.activo !== false);

  // Tareas candidatas del modelo elegido para las normas elegidas → con anidado.
  const candidatas = useMemo(() => {
    if (!catalogo || !normasSel.length) return [];
    const base = tareasDeCliente(catalogo, normasSel, modelo);
    return anidarTareas(base, normasSel, anidar.size ? anidar : null);
  }, [catalogo, normasSel, modelo, anidar]);

  // Claves con más de una norma (candidatas a anidar).
  const clavesComunes = useMemo(() => {
    if (!catalogo || !normasSel.length) return [];
    const base = tareasDeCliente(catalogo, normasSel, modelo);
    const m = new Map();
    for (const t of base) { const k = `${t.proceso}|${t.subproceso}`; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  }, [catalogo, normasSel, modelo]);

  function toggleNorma(id) {
    if (id === '9001') return; // base obligatoria
    setNormasSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }
  function toggleAnidar(k) {
    setAnidar(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }
  function anidarTodas() { setAnidar(new Set(clavesComunes)); }
  function anidarNinguna() { setAnidar(new Set()); }

  async function guardarConfig() {
    if (!proyecto) return;
    await updateRow('proyectos_cliente', proyecto.id, { normas: normasSel, modelo });
    cargar(); setMsg('Configuración guardada.');
  }

  // Guarda las tareas configuradas y deja que el programa las distribuya por meses.
  async function generarYDistribuir() {
    if (!proyecto || !cliente) return;
    setMsg(null);
    try {
      // Limpiar tareas previas de este proyecto
      for (const t of tareasProyecto) { await deleteRow('cliente_tareas', t.id); await borrarReflejoAgenda(t.id); }

      // Construir filas a partir de las candidatas (con o sin anidado)
      const filas = candidatas.map((c, i) => ({
        cliente_id: cliente.id, proyecto_id: proyecto.id,
        norma_id: c.norma_id, modelo,
        proceso: c.proceso, subproceso: c.subproceso,
        titulo: codigoTareaIntegrada(cliente.empresa, modelo, c.proceso, c.subproceso, c.normas_integradas),
        horas: c.horas, bloque: c.bloque, tipo: tipoTarea(c),
        integrada: !!c.integrada, normas_integradas: c.normas_integradas || [c.norma_id],
        consultor_id: proyecto.consultor_1_id || null, orden: i,
      }));

      // Distribuir fechas (mínimo 3 meses, 6h/día, festivos)
      const conFechas = repartirFechas(filas, proyecto.fecha_inicio, proyecto.meses_estimados || 3, { festivos, meses: proyecto.meses_estimados || 3 });

      const creadas = [];
      for (const f of conFechas) {
        const fila = await insertRow('cliente_tareas', {
          ...f, fecha_estimada: f.fecha_estimada,
          seguimientos: (f.tramos && f.tramos.length > 1) ? f.tramos.map(tr => ({ ...tr, hecho: false })) : [],
          fecha_real: null, hecha: false,
        });
        if (fila?.id) creadas.push(fila);
      }
      await sincronizarVariasAgenda(creadas, proyecto.consultor_1_id || null, equipo);
      cargar();
      setMsg(`${creadas.length} tareas generadas y distribuidas por los meses del proyecto.`);
    } catch (e) { setMsg(e.message); }
  }

  const totalHoras = candidatas.reduce((s, c) => s + (Number(c.horas) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <p className="eyebrow">Proyectos activos</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Configuración de proyectos</h1>
      </div>

      {/* Selector de proyecto activo */}
      <div className="card">
        <label className="label" htmlFor="sel-proy">Proyecto (vinculado a su cliente matriz)</label>
        <select id="sel-proy" className="input max-w-xl" value={sel} onChange={e => setSel(e.target.value)}>
          <option value="">— Selecciona un proyecto activo —</option>
          {activos.map(p => <option key={p.id} value={p.id}>{nombreCli(p.cliente_id)} · {p.nombre}</option>)}
        </select>
      </div>

      {!proyecto ? (
        <p className="card text-sm font-medium text-navy-400">Selecciona un proyecto. Los proyectos se crean desde la pestaña Clientes.</p>
      ) : (
        <>
          {/* Cabecera */}
          <div className="card">
            <p className="text-xs font-bold uppercase tracking-wider text-navy-300">Cliente matriz</p>
            <p className="text-lg font-extrabold">{cliente?.empresa || '—'}</p>
            <p className="text-sm font-medium text-navy-400">{proyecto.nombre} · {proyecto.estado}</p>
          </div>

          {/* Normas + modelo */}
          <div className="card">
            <h4 className="font-extrabold">Normas y modelo del proyecto</h4>
            <p className="mt-1 text-sm font-medium text-navy-400">ISO 9001 va siempre. Solo se mostrarán las tareas de las normas y el modelo elegidos.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {NORMAS.map(n => {
                const on = normasSel.includes(n.id);
                return (
                  <button key={n.id} onClick={() => toggleNorma(n.id)}
                    className={`chip border transition ${on ? 'border-brand-orange bg-brand-orange/15 text-navy-900' : 'border-navy-200 bg-white text-navy-400 hover:border-navy-400'}`}>
                    {n.nombre}{n.id === '9001' ? ' (base)' : ''}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="label">Modelo de relación</label>
                <select className="input !w-auto" value={modelo} onChange={e => setModelo(e.target.value)}>
                  {MODELOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <button onClick={guardarConfig} className="btn-ghost !px-4 !py-2">Guardar configuración</button>
            </div>
          </div>

          {/* Anidado de tareas comunes */}
          {clavesComunes.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold">Anidar tareas comunes ({clavesComunes.length})</h4>
                <div className="flex gap-2">
                  <button onClick={anidarTodas} className="chip border border-brand-orange bg-brand-orange/10 text-xs font-bold text-brand-orangeDark">Anidar todas</button>
                  <button onClick={anidarNinguna} className="chip border border-navy-200 text-xs font-bold text-navy-500">Ninguna</button>
                </div>
              </div>
              <p className="mt-1 text-sm font-medium text-navy-400">Tareas que existen en varias normas. Al anidar, se funden en una tarea integrada con la suma de horas.</p>
              <div className="mt-3 space-y-1">
                {clavesComunes.map(k => {
                  const [proc, sub] = k.split('|');
                  return (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={anidar.has(k)} onChange={() => toggleAnidar(k)} />
                      <span className="font-medium">{proc} - {sub}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Vista previa de la configuración */}
          <div className="card">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold">Tareas resultantes ({candidatas.length})</h4>
              <span className="text-sm font-bold text-navy-800">{fmtH(totalHoras)}</span>
            </div>
            <div className="mt-3 max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                    <th className="py-2">Código</th><th className="py-2">Tipo</th><th className="py-2 text-right">Horas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-50">
                  {candidatas.map((c, i) => (
                    <tr key={i}>
                      <td className="py-1.5 font-medium">
                        {codigoTareaIntegrada(cliente?.empresa, modelo, c.proceso, c.subproceso, c.normas_integradas)}
                        {c.integrada && <span className="ml-2 chip bg-brand-orange/15 text-[10px] font-bold text-brand-orangeDark">integrada</span>}
                      </td>
                      <td className="py-1.5">{TIPO_LABEL[tipoTarea(c)]}</td>
                      <td className="py-1.5 text-right">{fmtH(c.horas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button onClick={generarYDistribuir} disabled={!candidatas.length} className="btn-orange disabled:opacity-40">
                Guardar y distribuir por meses
              </button>
              {msg && <span className="text-sm font-bold text-navy-600">{msg}</span>}
            </div>
          </div>

          {/* Tareas ya distribuidas */}
          {tareasProyecto.length > 0 && (
            <div className="card">
              <h4 className="font-extrabold">Tareas distribuidas ({tareasProyecto.length})</h4>
              <div className="mt-3 max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                      <th className="py-2">Tarea</th><th className="py-2 text-right">Horas</th><th className="py-2">Estimada</th><th className="py-2">Seg.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-50">
                    {tareasProyecto.map(t => (
                      <tr key={t.id}>
                        <td className="py-1.5 font-medium">{t.titulo}</td>
                        <td className="py-1.5 text-right">{fmtH(t.horas)}</td>
                        <td className="py-1.5">{t.fecha_estimada || '—'}</td>
                        <td className="py-1.5">{Array.isArray(t.seguimientos) && t.seguimientos.length ? t.seguimientos.length : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
