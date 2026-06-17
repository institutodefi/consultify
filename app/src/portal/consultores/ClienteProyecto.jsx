import { useEffect, useMemo, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { tareasDeCliente, repartirFechas, horasCoordinacion } from '../../lib/planCliente.js';
import { sincronizarTareaAgenda, sincronizarVariasAgenda, borrarReflejoAgenda } from '../../lib/sincroAgenda.js';
import { descargarAgendaICS } from '../../lib/ics.js';
import { NORMA_BY_ID } from '../../lib/calcEngine.js';

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

// Tipo de tarea para etiqueta: coordinación (bloque PM) o producción (tareas de norma).
const tipoTarea = (t) => {
  if (t.tipo) return t.tipo;
  const b = (t.bloque || '').toUpperCase();
  if (b.startsWith('PM') || /COORDINAC/i.test(t.proceso || '')) return 'coordinacion';
  return 'produccion';
};
const TIPO_LABEL = { produccion: 'Producción', gestion: 'Gestión', coordinacion: 'Coordinación' };
const TIPO_CLASE = {
  produccion: 'bg-brand-orange/15 text-brand-orangeDark',
  gestion: 'bg-navy-100 text-navy-600',
  coordinacion: 'bg-navy-800 text-white',
};

// Título con prefijo de cliente: "CLIENTE - norma - proceso - subproceso".
const tituloConCliente = (nombreCliente, p) =>
  [nombreCliente, p.norma_id, p.proceso, p.subproceso].filter(Boolean).join(' - ');

export default function ClienteProyecto({ cliente, normasCliente, equipo, onCambio }) {
  const [modelo, setModelo] = useState('Implicación');
  const [meses, setMeses] = useState(cliente.meses_estimados || 3);
  const [fechaIni, setFechaIni] = useState(cliente.fecha_inicio || hoy());
  const [c1, setC1] = useState(cliente.consultor_1_id || '');
  const [c2, setC2] = useState(cliente.consultor_2_id || '');
  const [catalogo, setCatalogo] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [festivos, setFestivos] = useState([]);
  const [msg, setMsg] = useState(null);
  const [sel, setSel] = useState(new Set());        // ids de tareas seleccionadas
  const [fSistema, setFSistema] = useState('');      // filtro por sistema/norma
  const [fBloque, setFBloque] = useState('');        // filtro por bloque
  const [fTipo, setFTipo] = useState('');            // filtro por tipo
  const [fTexto, setFTexto] = useState('');          // búsqueda libre
  const [agrupar, setAgrupar] = useState(false);     // vista agrupada por bloque
  const [redInt, setRedInt] = useState(0);           // % reducción integración a aplicar

  const consultores = equipo.filter(c => (c.tipo_equipo || 'consultor') === 'consultor' && c.activo !== false);
  const nombreCons = (id) => { const c = equipo.find(x => String(x.id) === String(id)); return c ? `${c.nombre} ${c.apellidos || ''}`.trim() : '—'; };

  const cargar = () => {
    listTable('tareas_catalogo').then(setCatalogo).catch(() => setCatalogo([]));
    listTable('festivos').then(setFestivos).catch(() => setFestivos([]));
    listTable('cliente_tareas')
      .then(all => {
        setTodasTareas(all);
        setTareas(all.filter(t => String(t.cliente_id) === String(cliente.id))
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));
      })
      .catch(() => { setTareas([]); setTodasTareas([]); });
  };
  useEffect(cargar, [cliente.id]);

  const [todasTareas, setTodasTareas] = useState([]); // todas las cliente_tareas (todos los clientes)

  // Carga previa por día del consultor 1: horas ya asignadas en OTROS clientes.
  const cargaPrevia = useMemo(() => {
    const m = {};
    if (!c1) return m;
    for (const t of todasTareas) {
      if (String(t.consultor_id) !== String(c1)) continue;
      if (String(t.cliente_id) === String(cliente.id)) continue; // excluir este proyecto
      // sumar tramos si existen; si no, las horas en su fecha estimada
      const tramos = Array.isArray(t.seguimientos) && t.seguimientos.length ? t.seguimientos : (t.fecha_estimada ? [{ fecha: t.fecha_estimada, horas: t.horas }] : []);
      for (const tr of tramos) { if (tr.fecha) m[tr.fecha] = (m[tr.fecha] || 0) + (Number(tr.horas) || 0); }
    }
    return m;
  }, [todasTareas, c1, cliente.id]);

  const opcionesReparto = useMemo(() => ({ festivos, meses, cargaPrevia }), [festivos, meses, cargaPrevia]);

  // Propuesta de tareas según las normas del cliente (no se guarda hasta confirmar).
  const propuesta = useMemo(() => {
    if (!catalogo) return [];
    const base = tareasDeCliente(catalogo, normasCliente, modelo);
    return repartirFechas(base, fechaIni, meses, opcionesReparto);
  }, [catalogo, normasCliente, modelo, fechaIni, meses, opcionesReparto]);

  async function guardarCabecera() {
    setMsg(null);
    try {
      await updateRow('clientes', cliente.id, {
        consultor_1_id: c1 || null, consultor_2_id: c2 || null,
        meses_estimados: Number(meses) || 3, fecha_inicio: fechaIni || null,
      });
      // Si hay tareas guardadas, reescala su calendario a la nueva duración/inicio.
      const n = await reescalarFechas();
      onCambio?.();
      setMsg(n > 0 ? `Guardado. Calendario reescalado (${n} tareas).` : 'Guardado.');
    } catch (e) { setMsg(e.message); }
  }

  // Reescala la fecha_estimada de las tareas YA guardadas según meses + fecha inicio,
  // manteniendo el reparto por bloques de proceso. Devuelve nº de tareas actualizadas.
  async function reescalarFechas() {
    if (!tareas.length) return 0;
    const base = tareas.map(t => ({ bloque: t.bloque, _id: t.id }));
    const conFecha = repartirFechas(base, fechaIni, meses, opcionesReparto);
    let n = 0;
    for (const t of conFecha) {
      const actual = tareas.find(x => x.id === t._id);
      if (actual && actual.fecha_estimada !== t.fecha_estimada) {
        await updateRow('cliente_tareas', t._id, { fecha_estimada: t.fecha_estimada });
        try { await sincronizarTareaAgenda({ ...actual, fecha_estimada: t.fecha_estimada }, c1 || null, equipo); } catch { /* noop */ }
        n++;
      }
    }
    if (n) cargar();
    return n;
  }

  // Construye el payload de una cliente_tarea con título prefijado por cliente y tipo.
  const payloadTarea = (p) => ({
    cliente_id: cliente.id, norma_id: p.norma_id, modelo: p.modelo,
    proceso: p.proceso, subproceso: p.subproceso,
    titulo: tituloConCliente(cliente.empresa, p),
    horas: p.horas, bloque: p.bloque, tipo: tipoTarea(p),
    consultor_id: c1 || null, fecha_estimada: p.fecha_estimada,
    seguimientos: (p.tramos && p.tramos.length > 1) ? p.tramos.map(tr => ({ ...tr, hecho: false })) : [],
    fecha_real: null, hecha: false, orden: p.orden,
  });

  // Añade a demanda las tareas de la propuesta que aún no existan (por norma+subproceso).
  async function generarTareas() {
    setMsg(null);
    try {
      const existentes = new Set(tareas.map(t => `${t.norma_id}|${t.subproceso}`));
      const nuevas = propuesta.filter(p => !existentes.has(`${p.norma_id}|${p.subproceso}`));
      if (!nuevas.length) { setMsg('No hay tareas nuevas que añadir.'); return; }
      const creadas = [];
      for (const p of nuevas) {
        const fila = await insertRow('cliente_tareas', payloadTarea(p));
        if (fila?.id) creadas.push(fila);
      }
      await sincronizarVariasAgenda(creadas, c1 || null, equipo);
      cargar();
      setMsg(`${nuevas.length} tarea(s) añadidas y volcadas a la agenda.`);
    } catch (e) { setMsg(e.message); }
  }

  async function addTarea(p) {
    const fila = await insertRow('cliente_tareas', payloadTarea(p));
    if (fila?.id) await sincronizarTareaAgenda(fila, c1 || null, equipo);
    cargar();
  }

  async function addVarias(lista) {
    const creadas = [];
    for (const p of lista) {
      const fila = await insertRow('cliente_tareas', payloadTarea(p));
      if (fila?.id) creadas.push(fila);
    }
    await sincronizarVariasAgenda(creadas, c1 || null, equipo);
    cargar();
  }

  async function patch(id, campos) {
    await updateRow('cliente_tareas', id, campos);
    const actualizada = { ...(tareas.find(t => t.id === id) || {}), ...campos, id };
    setTareas(ts => ts.map(t => t.id === id ? actualizada : t));
    // Reflejar el cambio (fecha, consultor, horas, hecha…) en la agenda.
    try { await sincronizarTareaAgenda(actualizada, c1 || null, equipo); } catch { /* noop */ }
  }
  async function quitar(id) {
    await deleteRow('cliente_tareas', id);
    await borrarReflejoAgenda(id);
    cargar();
  }

  // Añade un seguimiento (tramo) manual a una tarea.
  async function addSeguimiento(t) {
    const fecha = prompt('Fecha del seguimiento (YYYY-MM-DD):', t.fecha_estimada || '');
    if (!fecha) return;
    const horas = Number(prompt('Horas de este seguimiento:', '2')) || 0;
    const segs = [...(Array.isArray(t.seguimientos) ? t.seguimientos : []), { fecha, horas, hecho: false }];
    await patch(t.id, { seguimientos: segs });
  }
  async function quitarSeguimiento(t, idx) {
    const segs = (Array.isArray(t.seguimientos) ? t.seguimientos : []).filter((_, i) => i !== idx);
    await patch(t.id, { seguimientos: segs });
  }

  // ── Filtro de tareas ──
  const bloquesDisponibles = useMemo(() => [...new Set(tareas.map(t => t.bloque).filter(Boolean))].sort(), [tareas]);
  const tareasFiltradas = useMemo(() => tareas.filter(t =>
    (!fSistema || t.norma_id === fSistema) &&
    (!fBloque || t.bloque === fBloque) &&
    (!fTipo || tipoTarea(t) === fTipo) &&
    (!fTexto || (t.titulo || '').toLowerCase().includes(fTexto.toLowerCase()))
  ), [tareas, fSistema, fBloque, fTipo, fTexto]);

  // Tareas sobre las que actúan las acciones masivas: la selección, o si está
  // vacía, las que se ven tras aplicar el filtro.
  const objetivo = useMemo(() => {
    if (sel.size) return tareas.filter(t => sel.has(t.id));
    return tareasFiltradas;
  }, [sel, tareas, tareasFiltradas]);

  const toggleSel = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selTodas = () => setSel(new Set(tareasFiltradas.map(t => t.id)));
  const selNinguna = () => setSel(new Set());

  // Asigna las tareas objetivo a un consultor (y sincroniza agenda).
  async function asignarMasivo(consultorId) {
    if (!objetivo.length) return;
    if (!confirm(`¿Asignar ${objetivo.length} tarea(s) a ${consultorId ? nombreCons(consultorId) : 'sin asignar'}?`)) return;
    try {
      for (const t of objetivo) {
        await updateRow('cliente_tareas', t.id, { consultor_id: consultorId || null });
        await sincronizarTareaAgenda({ ...t, consultor_id: consultorId || null }, c1 || null, equipo);
      }
      cargar(); selNinguna();
      setMsg(`${objetivo.length} tarea(s) reasignada(s).`);
    } catch (e) { setMsg(e.message); }
  }

  async function tipoMasivo(tipo) {
    if (!tipo || !objetivo.length) return;
    try {
      for (const t of objetivo) {
        await updateRow('cliente_tareas', t.id, { tipo });
        await sincronizarTareaAgenda({ ...t, tipo }, c1 || null, equipo);
      }
      cargar(); selNinguna();
      setMsg(`Tipo cambiado en ${objetivo.length} tarea(s).`);
    } catch (e) { setMsg(e.message); }
  }

  // Aplica un % de reducción por integración a las horas de las tareas objetivo.
  async function aplicarReduccion() {
    const pct = Number(redInt) || 0;
    if (pct <= 0 || !objetivo.length) { setMsg('Indica un % de reducción y selecciona tareas.'); return; }
    if (!confirm(`¿Reducir un ${pct}% las horas de ${objetivo.length} tarea(s) por integración de sistemas?`)) return;
    try {
      for (const t of objetivo) {
        const nuevasHoras = Math.round((Number(t.horas) || 0) * (1 - pct / 100) * 100) / 100;
        await updateRow('cliente_tareas', t.id, { horas: nuevasHoras, reduccion_pct: pct });
        await sincronizarTareaAgenda({ ...t, horas: nuevasHoras }, c1 || null, equipo);
      }
      cargar(); selNinguna();
      setMsg(`Reducción del ${pct}% aplicada a ${objetivo.length} tarea(s).`);
    } catch (e) { setMsg(e.message); }
  }

  async function borrarMasivo() {
    if (!objetivo.length) return;
    if (!confirm(`¿Eliminar ${objetivo.length} tarea(s)?`)) return;
    try {
      for (const t of objetivo) { await deleteRow('cliente_tareas', t.id); await borrarReflejoAgenda(t.id); }
      cargar(); selNinguna();
      setMsg(`${objetivo.length} tarea(s) eliminada(s).`);
    } catch (e) { setMsg(e.message); }
  }

  // Agrupación configurable: 'bloque' o 'subproceso' (proceso+subproceso comunes
  // entre sistemas → permite sumar y compensar horas de sistemas integrados).
  const [modoGrupo, setModoGrupo] = useState('bloque');
  const grupos = useMemo(() => {
    const m = new Map();
    for (const t of tareasFiltradas) {
      const k = modoGrupo === 'subproceso'
        ? `${t.proceso || '—'} · ${t.subproceso || '—'}`
        : (t.bloque || '—');
      if (!m.has(k)) m.set(k, { clave: k, items: [], horas: 0, sistemas: new Set() });
      const g = m.get(k);
      g.items.push(t); g.horas += Number(t.horas) || 0; g.sistemas.add(t.norma_id);
    }
    return [...m.values()].sort((a, b) => a.clave.localeCompare(b.clave));
  }, [tareasFiltradas, modoGrupo]);

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

  // La planificación solo se permite sobre un cliente realmente dado de alta.
  if (!cliente?.id) {
    return (
      <div className="mt-5 border-t border-navy-100 pt-5">
        <h4 className="font-extrabold">Proyecto y tareas</h4>
        <p className="mt-3 rounded-xl bg-navy-50 p-4 text-sm font-medium text-navy-500">
          Guarda primero el cliente (alta) para poder planificar sus tareas.
        </p>
      </div>
    );
  }

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
          <p className="mt-1 text-xs font-medium text-navy-400">Al guardar, el calendario de las tareas se reescala a esta duración.</p>
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
        <div className="space-y-3">
          {/* Filtro de tareas */}
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-navy-100 bg-white px-3 py-2">
            <div>
              <label className="label !mb-0.5 !text-[11px]">Buscar</label>
              <input className="input !w-40 !py-1.5 !text-sm" placeholder="texto…" value={fTexto} onChange={e => setFTexto(e.target.value)} />
            </div>
            <div>
              <label className="label !mb-0.5 !text-[11px]">Sistema</label>
              <select className="input !w-auto !py-1.5 !text-sm" value={fSistema} onChange={e => setFSistema(e.target.value)}>
                <option value="">Todos</option>
                {normasCliente.map(n => <option key={n} value={n}>{NORMA_BY_ID[n]?.nombre || n}</option>)}
              </select>
            </div>
            <div>
              <label className="label !mb-0.5 !text-[11px]">Bloque</label>
              <select className="input !w-auto !py-1.5 !text-sm" value={fBloque} onChange={e => setFBloque(e.target.value)}>
                <option value="">Todos</option>
                {bloquesDisponibles.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="label !mb-0.5 !text-[11px]">Tipo</label>
              <select className="input !w-auto !py-1.5 !text-sm" value={fTipo} onChange={e => setFTipo(e.target.value)}>
                <option value="">Todos</option>
                <option value="produccion">Producción</option>
                <option value="gestion">Gestión</option>
                <option value="coordinacion">Coordinación</option>
              </select>
            </div>
            <button onClick={() => { setFTexto(''); setFSistema(''); setFBloque(''); setFTipo(''); }} className="btn-ghost !px-3 !py-1.5 text-xs">Limpiar</button>
            <button onClick={() => setAgrupar(a => !a)} className={`chip border text-xs font-bold ${agrupar ? 'border-brand-orange bg-brand-orange/10 text-brand-orangeDark' : 'border-navy-200 text-navy-500'}`}>
              {agrupar ? '▣ Agrupado' : '☰ Vista lista'}
            </button>
            {agrupar && (
              <select className="input !w-auto !py-1.5 !text-xs" value={modoGrupo} onChange={e => setModoGrupo(e.target.value)}>
                <option value="bloque">por bloque</option>
                <option value="subproceso">por proceso+subproceso (sistemas comunes)</option>
              </select>
            )}
            <span className="ml-auto text-xs font-medium text-navy-400">{tareasFiltradas.length} de {tareas.length} · {fmtH(tareasFiltradas.reduce((s, t) => s + (Number(t.horas) || 0), 0))}</span>
          </div>

          {/* Acciones masivas sobre la selección (o el filtro si no hay selección) */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-navy-100 bg-navy-50/40 px-3 py-2">
            <span className="text-xs font-bold text-navy-500">
              {sel.size ? `${sel.size} seleccionada(s)` : `${tareasFiltradas.length} filtrada(s)`}
            </span>
            <button onClick={selTodas} className="text-xs font-bold text-navy-500 hover:underline">Sel. todas</button>
            <button onClick={selNinguna} className="text-xs font-bold text-navy-500 hover:underline">Ninguna</button>
            <span className="mx-1 h-4 w-px bg-navy-200" />
            <select className="input !w-auto !py-1.5 !text-sm" value="__" onChange={e => { if (e.target.value !== '__') { asignarMasivo(e.target.value === '__none' ? '' : e.target.value); e.target.value = '__'; } }}>
              <option value="__" disabled>Asignar a…</option>
              <option value="__none">Sin asignar</option>
              {consultores.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''}</option>)}
            </select>
            <select className="input !w-auto !py-1.5 !text-sm" value="__" onChange={e => { if (e.target.value !== '__') { tipoMasivo(e.target.value); e.target.value = '__'; } }}>
              <option value="__" disabled>Tipo…</option>
              <option value="produccion">Producción</option>
              <option value="gestion">Gestión</option>
              <option value="coordinacion">Coordinación</option>
            </select>
            <span className="mx-1 h-4 w-px bg-navy-200" />
            <label className="text-xs font-bold text-navy-500">Reducción integración</label>
            <input type="number" min="0" max="100" className="input !w-16 !py-1.5 !text-sm" value={redInt} onChange={e => setRedInt(e.target.value)} />
            <span className="text-xs font-bold text-navy-400">%</span>
            <button onClick={aplicarReduccion} className="chip border border-brand-orange bg-brand-orange/10 text-xs font-bold text-brand-orangeDark">Aplicar</button>
            <button onClick={borrarMasivo} className="ml-auto text-xs font-bold text-red-500 hover:underline">Eliminar</button>
          </div>

          {/* Vista AGRUPADA por bloque */}
          {agrupar ? (
            <div className="space-y-2">
              {grupos.map(g => (
                <details key={g.clave} className="rounded-xl border border-navy-100 bg-white p-3" open>
                  <summary className="flex cursor-pointer items-center justify-between gap-2">
                    <span className="font-extrabold text-navy-700">{g.clave} <span className="text-xs font-medium text-navy-400">· {g.items.length} tareas · {[...g.sistemas].join(', ')}</span></span>
                    <span className="flex items-center gap-2">
                      {g.sistemas.size > 1 && (
                        <button onClick={(e) => { e.preventDefault(); setSel(new Set(g.items.map(t => t.id))); }}
                          className="chip border border-brand-orange bg-brand-orange/10 text-[11px] font-bold text-brand-orangeDark"
                          title="Seleccionar este grupo para sumar/compensar sus horas con el % de reducción de arriba">
                          ⚖ seleccionar para compensar
                        </button>
                      )}
                      <span className="text-sm font-bold text-navy-800">{fmtH(g.horas)}</span>
                    </span>
                  </summary>
                  <div className="mt-2 space-y-1">
                    {g.items.map(t => {
                      const tipo = tipoTarea(t);
                      return (
                        <div key={t.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggleSel(t.id)} />
                          <span className="chip w-16 justify-center bg-navy-50 text-[11px] text-navy-600">{t.norma_id}</span>
                          <span className={`chip text-[11px] font-bold ${TIPO_CLASE[tipo]}`}>{TIPO_LABEL[tipo]}</span>
                          <span className="flex-1 font-medium">{t.proceso} - {t.subproceso}</span>
                          <span className="text-navy-400">{fmtH(t.horas)}</span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            /* Vista LISTA */
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                    <th className="py-2" title="Seleccionar para acciones en masa"><input type="checkbox" checked={sel.size === tareasFiltradas.length && tareasFiltradas.length > 0} onChange={e => e.target.checked ? selTodas() : selNinguna()} /> sel</th>
                    <th className="py-2" title="Marcar tarea como hecha">hecha</th>
                    <th className="py-2">Sistema</th>
                    <th className="py-2">Bloque</th>
                    <th className="py-2">Tarea</th>
                    <th className="py-2">Tipo</th>
                    <th className="py-2 text-right">Horas</th>
                    <th className="py-2">Consultor</th>
                    <th className="py-2">Estimada</th>
                    <th className="py-2">Real</th>
                    <th className="py-2">Seg.</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-50">
                  {tareasFiltradas.map(t => {
                    const tipo = tipoTarea(t);
                    return (
                      <tr key={t.id} className={`${t.hecha ? 'opacity-60' : ''} ${sel.has(t.id) ? 'bg-brand-orange/5' : ''}`}>
                        <td className="py-1.5"><input type="checkbox" checked={sel.has(t.id)} onChange={() => toggleSel(t.id)} /></td>
                        <td className="py-1.5"><input type="checkbox" checked={!!t.hecha} onChange={e => patch(t.id, { hecha: e.target.checked })} /></td>
                        <td className="py-1.5"><span className="chip bg-navy-50 text-[11px] text-navy-600">{t.norma_id}</span></td>
                        <td className="py-1.5 text-xs font-bold text-navy-400">{t.bloque}</td>
                        <td className="py-1.5 font-medium">{t.proceso} - {t.subproceso}</td>
                        <td className="py-1.5"><span className={`chip text-[11px] font-bold ${TIPO_CLASE[tipo]}`}>{TIPO_LABEL[tipo]}</span></td>
                        <td className="py-1.5 text-right">{fmtH(t.horas)}</td>
                        <td className="py-1.5">
                          <select className="input !py-1 !text-xs" value={t.consultor_id || ''} onChange={e => patch(t.id, { consultor_id: e.target.value || null })}>
                            <option value="">—</option>
                            {consultores.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5"><input type="date" className="input !py-1 !text-xs" value={t.fecha_estimada || ''} onChange={e => patch(t.id, { fecha_estimada: e.target.value || null })} /></td>
                        <td className="py-1.5"><input type="date" className="input !py-1 !text-xs" value={t.fecha_real || ''} onChange={e => patch(t.id, { fecha_real: e.target.value || null })} /></td>
                        <td className="py-1.5 text-center">
                          <button onClick={() => addSeguimiento(t)} title="Añadir seguimiento" className="text-xs font-bold text-navy-500 hover:text-brand-orange">
                            +seg{Array.isArray(t.seguimientos) && t.seguimientos.length ? ` (${t.seguimientos.length})` : ''}
                          </button>
                        </td>
                        <td className="py-1.5 text-right"><button onClick={() => quitar(t.id)} className="text-xs font-bold text-red-500 hover:underline">×</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
