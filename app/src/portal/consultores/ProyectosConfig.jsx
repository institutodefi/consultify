import { useEffect, useMemo, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { tareasDeCliente, repartirFechas, anidarTareas, codigoTareaIntegrada, horasCoordinacion } from '../../lib/planCliente.js';
import { esLaborable, toISO, FESTIVOS_2026 } from '../../lib/agenda.js';
import { sincronizarTareaAgenda, sincronizarVariasAgenda, borrarReflejoAgenda } from '../../lib/sincroAgenda.js';
import { NORMAS, NORMA_BY_ID, MESES_MODELO, mesesPorModelo } from '../../lib/calcEngine.js';

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
  const [arrastra, setArrastra] = useState(null);
  const [selT, setSelT] = useState(new Set());
  const [distribuyendo, setDistribuyendo] = useState(false);
  const puedeFusionar = (claveA, claveB) => claveA === claveB; // misma clave = mismo proceso+subproceso
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
  const [meses, setMeses] = useState(MESES_MODELO['Implicación']);
  useEffect(() => {
    if (proyecto) {
      const ns = proyecto.normas || [];
      setNormasSel(ns.includes('9001') ? ns : ['9001', ...ns]);
      const m = proyecto.modelo || 'Implicación';
      setModelo(m);
      setMeses(proyecto.meses_estimados || MESES_MODELO[m] || 3);
    }
  }, [proyecto]);

  // Al cambiar el modelo (acuerdo), proponer su duración por defecto.
  function cambiarModelo(m) { setModelo(m); setMeses(mesesPorModelo(m, normasSel.length)); }

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
    setNormasSel(s => {
      const next = s.includes(id) ? s.filter(x => x !== id) : [...s, id];
      // Apoyo: la duración mínima depende del nº de sistemas.
      if (modelo === 'Apoyo') setMeses(mesesPorModelo('Apoyo', next.length));
      return next;
    });
  }
  function toggleAnidar(k) {
    setAnidar(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }
  function anidarTodas() { setAnidar(new Set(clavesComunes)); }
  function anidarNinguna() { setAnidar(new Set()); }

  // Edita una tarea ya distribuida: marca editada_manual para que la sincronización
  // del catálogo no la pise, y refleja el cambio en la agenda.
  async function patchTarea(t, campos) {
    const conFlag = { ...campos, editada_manual: true };
    await updateRow('cliente_tareas', t.id, conFlag);
    setTareas(ts => ts.map(x => x.id === t.id ? { ...x, ...conFlag } : x));
    try { await sincronizarTareaAgenda({ ...t, ...conFlag }, proyecto?.consultor_1_id || null, equipo); } catch { /* noop */ }
  }

  // Horas reales = suma de los seguimientos marcados como hechos.
  function horasRealesDe(t) {
    const segs = Array.isArray(t.seguimientos) ? t.seguimientos : [];
    return Math.round(segs.filter(s => s.hecho).reduce((a, s) => a + (Number(s.horas) || 0), 0) * 100) / 100;
  }

  const toggleSelT = (id) => setSelT(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Asigna consultor a las tareas seleccionadas (lote).
  async function asignarLote(consultorId) {
    const ids = [...selT];
    if (!ids.length) { setMsg('Selecciona tareas con el aspa primero.'); return; }
    if (!confirm(`¿Asignar ${ids.length} tarea(s) a ${consultorId ? nombreConsultor(consultorId) : 'sin asignar'}?`)) return;
    try {
      for (const id of ids) {
        const t = tareas.find(x => x.id === id); if (!t) continue;
        await updateRow('cliente_tareas', id, { consultor_id: consultorId, editada_manual: true });
        try { await sincronizarTareaAgenda({ ...t, consultor_id: consultorId }, proyecto?.consultor_1_id || null, equipo); } catch { /* noop */ }
      }
      setSelT(new Set()); cargar();
      setMsg(`${ids.length} tarea(s) reasignada(s).`);
    } catch (e) { setMsg(e.message); }
  }

  // Vuelca a la agenda todas las tareas del proyecto (sin regenerar fechas).
  async function distribuirAgenda() {
    setDistribuyendo(true); setMsg(null);
    try {
      const n = await sincronizarVariasAgenda(tareasProyecto, proyecto?.consultor_1_id || null, equipo);
      setMsg(`Agenda distribuida: ${n} tarea(s) volcadas a las agendas de los consultores.`);
    } catch (e) { setMsg(e.message); }
    finally { setDistribuyendo(false); }
  }

  const nombreConsultor = (id) => { const c = equipo.find(x => String(x.id) === String(id)); return c ? `${c.nombre} ${c.apellidos || ''}`.trim() : '—'; };

  async function nuevoProyecto() {
    if (!clientes.length) { setMsg('Crea primero un cliente.'); return; }
    const lista = clientes.map((c, i) => `${i + 1}. ${c.empresa}`).join('\n');
    const idx = Number(prompt(`¿Para qué cliente?\n${lista}\n\nEscribe el número:`, '1'));
    const cli = clientes[idx - 1];
    if (!cli) return;
    const nombre = prompt('Nombre del proyecto:', 'Proyecto 1');
    if (!nombre) return;
    const nuevo = await insertRow('proyectos_cliente', { cliente_id: cli.id, nombre, normas: [], modelo: 'Implicación', estado: 'activo', meses_estimados: 3 });
    cargar();
    if (nuevo?.id) setSel(nuevo.id);
  }

  async function guardarConfig() {
    if (!proyecto) return;
    await updateRow('proyectos_cliente', proyecto.id, { normas: normasSel, modelo, meses_estimados: meses });
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
      const conFechas = repartirFechas(filas, proyecto.fecha_inicio, meses, { festivos, meses });

      const creadas = [];
      for (const f of conFechas) {
        const { tramos, _clave, _id, ...campos } = f;
        const fila = await insertRow('cliente_tareas', {
          ...campos,
          seguimientos: (tramos && tramos.length > 1) ? tramos.map(tr => ({ ...tr, hecho: false })) : [],
          fecha_real: null, hecha: false,
        });
        if (fila?.id) creadas.push(fila);
      }

      // ── Tarea de coordinación del proyecto: 30 min × nº de sistemas, el 2º lunes
      //    laborable de CADA mes que abarque el proyecto. ──
      const fSet = new Set((festivos.length ? festivos : FESTIVOS_2026).map(x => x.fecha || x));
      const segundoLunesLaborable = (anio, mes) => {
        let lunes = 0; const d = new Date(anio, mes, 1);
        for (let i = 0; i < 31 && d.getMonth() === mes; i++) {
          if (d.getDay() === 1 && esLaborable(d, fSet)) { lunes++; if (lunes === 2) return new Date(d); }
          d.setDate(d.getDate() + 1);
        }
        return null;
      };
      const nSis = normasSel.length;
      const horasCoord = Math.round(0.5 * nSis * 100) / 100; // 30 min por sistema
      const inicio = proyecto.fecha_inicio ? new Date(proyecto.fecha_inicio) : new Date();
      const mesesProy = Math.max(3, meses);
      for (let k = 0; k < mesesProy; k++) {
        const ref = new Date(inicio.getFullYear(), inicio.getMonth() + k, 1);
        const fecha = segundoLunesLaborable(ref.getFullYear(), ref.getMonth());
        if (!fecha) continue;
        const fila = await insertRow('cliente_tareas', {
          cliente_id: cliente.id, proyecto_id: proyecto.id,
          norma_id: '9001', modelo,
          proceso: 'PM COORDINACIÓN', subproceso: 'Reunión de coordinación del proyecto',
          titulo: `${cliente.empresa} - ${modelo} - Coordinación del proyecto`,
          horas: horasCoord, bloque: 'PM', tipo: 'coordinacion',
          integrada: false, normas_integradas: normasSel,
          consultor_id: proyecto.consultor_1_id || null,
          fecha_estimada: toISO(fecha), fecha_real: null, hecha: false,
          seguimientos: [], orden: 9000 + k,
        });
        if (fila?.id) creadas.push(fila);
      }

      await sincronizarVariasAgenda(creadas, proyecto.consultor_1_id || null, equipo);
      cargar();
      setMsg(`${creadas.length} tareas generadas (incluida coordinación mensual de ${horasCoord} h).`);
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="label" htmlFor="sel-proy">Proyecto (vinculado a su cliente matriz)</label>
            <select id="sel-proy" className="input w-full max-w-xl" value={sel} onChange={e => setSel(e.target.value)}>
              <option value="">— Selecciona un proyecto activo —</option>
              {activos.map(p => <option key={p.id} value={p.id}>{nombreCli(p.cliente_id)} · {p.nombre}</option>)}
            </select>
          </div>
          <button onClick={nuevoProyecto} className="btn-orange !px-4 !py-2">+ Nuevo proyecto</button>
        </div>
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
                <label className="label">Modelo de relación (acuerdo)</label>
                <select className="input !w-auto" value={modelo} onChange={e => cambiarModelo(e.target.value)}>
                  {MODELOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Duración (meses)</label>
                <input type="number" min="1" className="input !w-28" value={meses} onChange={e => setMeses(Number(e.target.value) || 1)} />
                <p className="mt-1 text-xs font-medium text-navy-400">
                  Mínimo {mesesPorModelo(modelo, normasSel.length)} meses para {modelo}{modelo === 'Apoyo' ? ` con ${normasSel.length} sistema(s)` : ''}.
                </p>
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
            <p className="mt-1 text-xs font-medium text-navy-400">Arrastra una tarea sobre otra del mismo proceso y subproceso para anidarlas (fusionar e integrar sus horas).</p>
            <div className="mt-3 max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                    <th className="py-2"></th><th className="py-2">Código</th><th className="py-2">Tipo</th><th className="py-2 text-right">Horas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-50">
                  {candidatas.map((c, i) => (
                    <tr key={c._clave + i}
                      draggable
                      onDragStart={() => setArrastra(c._clave)}
                      onDragOver={(e) => { if (arrastra && puedeFusionar(arrastra, c._clave)) e.preventDefault(); }}
                      onDrop={() => { if (arrastra && puedeFusionar(arrastra, c._clave)) { setAnidar(s => new Set([...s, c._clave])); } setArrastra(null); }}
                      className={`${arrastra && puedeFusionar(arrastra, c._clave) ? 'bg-brand-orange/5' : ''} cursor-grab`}>
                      <td className="py-1.5 text-navy-300">⠿</td>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-extrabold">Tareas distribuidas ({tareasProyecto.length})</h4>
                <button onClick={distribuirAgenda} disabled={distribuyendo} className="btn-orange !px-4 !py-2 disabled:opacity-40">
                  {distribuyendo ? 'Distribuyendo…' : '↻ Distribuir agenda'}
                </button>
              </div>
              <p className="mt-1 text-xs font-medium text-navy-400">Asigna consultor responsable. Las horas reales salen del seguimiento de la tarea. Pulsa «Distribuir agenda» tras aceptar las tareas.</p>

              {/* Acciones masivas */}
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-navy-100 bg-navy-50/40 px-3 py-2">
                <span className="text-xs font-bold text-navy-500">{selT.size ? `${selT.size} seleccionada(s)` : `${tareasProyecto.length} tareas`}</span>
                <button onClick={() => setSelT(new Set(tareasProyecto.map(t => t.id)))} className="text-xs font-bold text-navy-500 hover:underline">Todas</button>
                <button onClick={() => setSelT(new Set())} className="text-xs font-bold text-navy-500 hover:underline">Ninguna</button>
                <span className="mx-1 h-4 w-px bg-navy-200" />
                <label className="text-xs font-bold text-navy-500">Asignar consultor en lote</label>
                <select className="input !w-auto !py-1.5 !text-sm" value="__" onChange={e => { if (e.target.value !== '__') { asignarLote(e.target.value === '__none' ? null : e.target.value); e.target.value = '__'; } }}>
                  <option value="__" disabled>Elegir…</option>
                  <option value="__none">Sin asignar</option>
                  {consultores.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''}</option>)}
                </select>
              </div>

              <div className="mt-3 max-h-96 overflow-y-auto overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                      <th className="py-2"><input type="checkbox" checked={selT.size === tareasProyecto.length && tareasProyecto.length > 0} onChange={e => e.target.checked ? setSelT(new Set(tareasProyecto.map(t => t.id))) : setSelT(new Set())} /> sel</th>
                      <th className="py-2">hecha</th><th className="py-2">Tarea</th><th className="py-2">Consultor</th>
                      <th className="py-2 text-right">Horas</th><th className="py-2 text-right">Reales</th>
                      <th className="py-2">Estimada</th><th className="py-2">Seg.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-50">
                    {tareasProyecto.map(t => {
                      const reales = horasRealesDe(t);
                      return (
                      <tr key={t.id} className={`${t.hecha ? 'opacity-60' : ''} ${selT.has(t.id) ? 'bg-brand-orange/5' : ''}`}>
                        <td className="py-1.5"><input type="checkbox" checked={selT.has(t.id)} onChange={() => toggleSelT(t.id)} /></td>
                        <td className="py-1.5"><input type="checkbox" checked={!!t.hecha} onChange={e => patchTarea(t, { hecha: e.target.checked })} /></td>
                        <td className="py-1.5 font-medium">{t.titulo}</td>
                        <td className="py-1.5">
                          <select className="input !py-1 !text-xs" value={t.consultor_id || ''} onChange={e => patchTarea(t, { consultor_id: e.target.value || null })}>
                            <option value="">—</option>
                            {consultores.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 text-right">{fmtH(t.horas)}</td>
                        <td className="py-1.5 text-right" title="Suma de los seguimientos marcados como hechos">{reales > 0 ? fmtH(reales) : '—'}</td>
                        <td className="py-1.5">{t.fecha_estimada || '—'}</td>
                        <td className="py-1.5">{Array.isArray(t.seguimientos) && t.seguimientos.length ? `${t.seguimientos.filter(s => s.hecho).length}/${t.seguimientos.length}` : '—'}</td>
                      </tr>
                      );
                    })}
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
