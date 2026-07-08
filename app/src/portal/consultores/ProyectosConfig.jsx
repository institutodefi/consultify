import { useEffect, useMemo, useState } from 'react';
import { listTable, insertRow, updateRow, deleteRow } from '../../lib/data.js';
import { tareasDeCliente, repartirFechas, anidarTareas, codigoTareaIntegrada, horasCoordinacion, bloquesEjecucion, trocearEnBloques, codigoTarea } from '../../lib/planCliente.js';
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

// Editor de bloques de ejecución con ESTADO LOCAL: permite escribir la fecha y las
// horas con libertad y solo persiste al salir del campo (onBlur) o al añadir/quitar.
// Sin esto, cada pulsación disparaba un guardado asíncrono que revertía la edición
// de la fecha (no dejaba escribirla entera).
function EditorBloques({ tarea, bloquesIniciales, onPersistir, onAdd, onQuitar }) {
  const [locales, setLocales] = useState(bloquesIniciales);

  // Si cambian los bloques por fuera (añadir/quitar/recargar), reflejarlo.
  useEffect(() => { setLocales(bloquesIniciales); }, [JSON.stringify(bloquesIniciales)]);

  const setCampo = (i, campo, val) =>
    setLocales(bs => bs.map((b, j) => j === i ? { ...b, [campo]: val } : b));

  const persistir = (bloques) => onPersistir(tarea, bloques);

  return (
    <div className="space-y-1.5">
      {locales.map((b, bi) => (
        <div key={bi} className="flex items-center gap-2">
          <span className="w-14 text-xs font-bold text-navy-400">Bloque {bi + 1}</span>
          <input
            type="date"
            className="input !py-1 !text-xs !w-auto"
            value={b.fecha || ''}
            onChange={e => setCampo(bi, 'fecha', e.target.value)}
            onBlur={() => persistir(locales)}
          />
          <input
            type="number" min="0.5" step="0.5"
            className="input !py-1 !text-xs !w-20 text-right"
            value={b.horas}
            onChange={e => setCampo(bi, 'horas', Number(e.target.value) || 0)}
            onBlur={() => persistir(locales)}
          />
          <span className="text-xs text-navy-400">h</span>
          <button onClick={() => onQuitar(tarea, bi)} className="text-xs font-bold text-red-400 hover:underline">×</button>
        </div>
      ))}
      <button onClick={() => onAdd(tarea)} className="chip border border-brand-orange bg-brand-orange/10 text-[11px] font-bold text-brand-orangeDark">+ bloque</button>
    </div>
  );
}

export default function Proyectos() {
  const [clientes, setClientes] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [catalogo, setCatalogo] = useState(null);
  const [festivos, setFestivos] = useState([]);
  const [equipo, setEquipo] = useState([]);
  // Consultores activos (derivado de equipo). Debe ir ANTES de los useMemo que lo usan.
  const consultores = equipo.filter(c => (c.tipo_equipo || 'consultor') === 'consultor' && c.activo !== false);
  const [tareas, setTareas] = useState([]);
  const [sel, setSel] = useState('');         // proyecto seleccionado
  const [anidar, setAnidar] = useState(new Set()); // claves proceso|subproceso a anidar
  const [arrastra, setArrastra] = useState(null);
  const [selT, setSelT] = useState(new Set());
  const [distribuyendo, setDistribuyendo] = useState(false);
  const [expandida, setExpandida] = useState(null);
  const [buscaP, setBuscaP] = useState('');
  const [porPagP, setPorPagP] = useState('25');
  const [pagP, setPagP] = useState(0);

  const proyectosFiltrados = useMemo(() => {
    const q = buscaP.trim().toLowerCase();
    if (!q) return proyectos;
    return proyectos.filter(p => `${p.nombre} ${nombreCli(p.cliente_id)} ${(p.normas || []).join(' ')} ${p.modelo || ''}`.toLowerCase().includes(q));
  }, [proyectos, buscaP, clientes]);
  const totalPagsP = porPagP === 'todos' ? 1 : Math.max(1, Math.ceil(proyectosFiltrados.length / Number(porPagP)));
  const proyectosPagina = useMemo(() => {
    if (porPagP === 'todos') return proyectosFiltrados;
    const n = Number(porPagP);
    return proyectosFiltrados.slice(pagP * n, pagP * n + n);
  }, [proyectosFiltrados, porPagP, pagP]);
  const puedeFusionar = (claveA, claveB) => claveA === claveB; // misma clave = mismo proceso+subproceso
  const [msg, setMsg] = useState(null);

  const cargar = () => {
    listTable('clientes').then(setClientes).catch(e => { setClientes([]); setMsg('No se pudieron cargar los clientes: ' + (e?.message || e)); });
    listTable('proyectos_cliente').then(setProyectos).catch(() => setProyectos([]));
    listTable('tareas_catalogo').then(setCatalogo).catch(() => setCatalogo([]));
    listTable('festivos').then(setFestivos).catch(() => setFestivos([]));
    listTable('consultores').then(setEquipo).catch(() => {});
    listTable('cliente_tareas').then(all => setTareas(all)).catch(() => setTareas([]));
  };
  useEffect(cargar, []);
  const nombreCli = (id) => clientes.find(c => String(c.id) === String(id))?.empresa || '—';
  const codigoCli = (id) => clientes.find(c => String(c.id) === String(id))?.codigo || 'CLI';
  // Enriquece una tarea con el código de su cliente (para el código CLI-Txxx-By).
  const conCod = (t) => ({ ...t, codigo_cliente: codigoCli(t.cliente_id) });

  // Permitir abrir un proyecto por querystring (?proyecto=ID) desde Clientes.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('proyecto');
    if (q) setSel(q);
  }, []);

  const proyecto = useMemo(() => proyectos.find(p => String(p.id) === String(sel)) || null, [proyectos, sel]);
  const cliente = useMemo(() => clientes.find(c => String(c.id) === String(proyecto?.cliente_id)) || null, [clientes, proyecto]);
  const activos = useMemo(() => proyectos.filter(p => p.estado === 'activo'), [proyectos]);
  const [ordenCol, setOrdenCol] = useState('codigo'); // codigo | titulo | consultor | fecha | horas
  const [ordenDir, setOrdenDir] = useState('asc');
  const [filtroT, setFiltroT] = useState('');
  const [filtroConsultor, setFiltroConsultor] = useState('');

  const tareasProyecto = useMemo(() => {
    let arr = tareas.filter(t => String(t.proyecto_id) === String(sel));
    // Filtros
    if (filtroT.trim()) { const q = filtroT.toLowerCase(); arr = arr.filter(t => (t.titulo || '').toLowerCase().includes(q)); }
    if (filtroConsultor) arr = arr.filter(t => String(t.consultor_id || '') === String(filtroConsultor));
    // Orden
    const fechaLim = (t) => { const b = Array.isArray(t.bloques_ejecucion) ? t.bloques_ejecucion : []; return (b.length ? b.map(x => x.fecha).filter(Boolean).sort().slice(-1)[0] : t.fecha_estimada) || ''; };
    const nombreCons = (t) => { const c = consultores.find(c => String(c.id) === String(t.consultor_id)); return c ? `${c.nombre} ${c.apellidos || ''}` : ''; };
    const val = (t) => ({ codigo: t.num_tarea || 0, titulo: (t.titulo || '').toLowerCase(), consultor: nombreCons(t).toLowerCase(), fecha: fechaLim(t), horas: Number(t.horas) || 0 }[ordenCol]);
    arr = [...arr].sort((a, b) => { const va = val(a), vb = val(b); if (va < vb) return ordenDir === 'asc' ? -1 : 1; if (va > vb) return ordenDir === 'asc' ? 1 : -1; return 0; });
    return arr;
  }, [tareas, sel, filtroT, filtroConsultor, ordenCol, ordenDir, consultores]);

  const ordenarPor = (col) => { if (ordenCol === col) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc'); else { setOrdenCol(col); setOrdenDir('asc'); } };
  const flechaOrden = (col) => ordenCol === col ? (ordenDir === 'asc' ? ' ▲' : ' ▼') : '';

  const [normasSel, setNormasSel] = useState([]);
  const [nombreProy, setNombreProy] = useState('');
  const [estadoProy, setEstadoProy] = useState('activo');
  const [msgCab, setMsgCab] = useState(null);
  const [modelo, setModelo] = useState('Implicación');
  const [meses, setMeses] = useState(MESES_MODELO['Implicación']);
  useEffect(() => {
    if (proyecto) {
      const ns = proyecto.normas || [];
      setNormasSel(ns.includes('9001') ? ns : ['9001', ...ns]);
      const m = proyecto.modelo || 'Implicación';
      setModelo(m);
      setMeses(proyecto.meses_estimados || MESES_MODELO[m] || 3);
      setNombreProy(proyecto.nombre || '');
      setEstadoProy(proyecto.estado || 'activo');
      setMsgCab(null);
    }
  }, [proyecto]);

  async function guardarCabecera() {
    if (!proyecto) return;
    await updateRow('proyectos_cliente', proyecto.id, { nombre: nombreProy.trim() || proyecto.nombre, estado: estadoProy });
    cargar(); setMsgCab('Guardado.');
  }

  // Al cambiar el modelo (acuerdo), proponer su duración por defecto.
  function cambiarModelo(m) { setModelo(m); setMeses(mesesPorModelo(m, normasSel.length)); }

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
  async function addBloque(t) {
    const base = Array.isArray(t.bloques_ejecucion) && t.bloques_ejecucion.length
      ? [...t.bloques_ejecucion]
      : trocearEnBloques(t.horas).map(h => ({ horas: h, fecha: t.fecha_estimada }));
    base.push({ horas: 4, fecha: t.fecha_estimada });
    await guardarBloques(t, base);
  }
  async function quitarBloque(t, idx) {
    const base = Array.isArray(t.bloques_ejecucion) && t.bloques_ejecucion.length
      ? t.bloques_ejecucion
      : trocearEnBloques(t.horas).map(h => ({ horas: h, fecha: t.fecha_estimada }));
    await guardarBloques(t, base.filter((_, i) => i !== idx));
  }
  async function guardarBloques(t, bloques) {
    const upd = { bloques_ejecucion: bloques, editada_manual: true };
    await updateRow('cliente_tareas', t.id, upd);
    setTareas(ts => ts.map(x => x.id === t.id ? { ...x, ...upd } : x));
    try { await sincronizarTareaAgenda(conCod({ ...t, ...upd }), proyecto?.consultor_1_id || null, equipo); } catch { /* noop */ }
  }

  async function patchTarea(t, campos) {
    const conFlag = { ...campos, editada_manual: true };
    await updateRow('cliente_tareas', t.id, conFlag);
    setTareas(ts => ts.map(x => x.id === t.id ? { ...x, ...conFlag } : x));
    try { await sincronizarTareaAgenda(conCod({ ...t, ...conFlag }), proyecto?.consultor_1_id || null, equipo); } catch { /* noop */ }
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
        try { await sincronizarTareaAgenda(conCod({ ...t, consultor_id: consultorId }), proyecto?.consultor_1_id || null, equipo); } catch { /* noop */ }
      }
      setSelT(new Set()); cargar();
      setMsg(`${ids.length} tarea(s) reasignada(s).`);
    } catch (e) { setMsg(e.message); }
  }

  // Vuelca a la agenda todas las tareas del proyecto (sin regenerar fechas).
  async function distribuirAgenda() {
    if (!tareasProyecto.length) { setMsg('No hay tareas que distribuir.'); return; }
    const conConsultor = tareasProyecto.filter(t => t.consultor_id || proyecto?.consultor_1_id);
    if (!conConsultor.length) { setMsg('Asigna un consultor a las tareas (o un consultor 1 al proyecto) antes de distribuir.'); return; }
    setDistribuyendo(true); setMsg('Distribuyendo…');
    try {
      const n = await sincronizarVariasAgenda(tareasProyecto.map(conCod), proyecto?.consultor_1_id || null, equipo);
      const sinFecha = tareasProyecto.filter(t => !t.fecha_estimada).length;
      setMsg(`Agenda distribuida: ${n} tarea(s) volcadas${sinFecha ? ` · ${sinFecha} sin fecha no se volcaron` : ''}.`);
    } catch (e) { setMsg('Error al distribuir: ' + e.message); }
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
        consultor_id: proyecto.consultor_1_id || null, orden: i, num_tarea: i + 1,
      }));

      // Distribuir fechas respetando el tope de fecha_inicio + meses.
      const conFechas = repartirFechas(filas, proyecto.fecha_inicio, meses, { festivos, meses, topeMeses: true });
      const fueraPlazo = conFechas.filter(f => f.fuera_de_plazo).length;
      if (fueraPlazo > 0) {
        setMsg(`⚠️ Aviso: ${fueraPlazo} tarea(s) no caben en ${meses} meses desde el inicio. Se han colocado igualmente, pero revisa el plazo o la carga.`);
      }

      const creadas = [];
      for (const f of conFechas) {
        const { tramos, _clave, _id, ...campos } = f;
        // Bloques de ejecución de 4h con fechas autopropuestas desde la fecha estimada.
        const bloques = bloquesEjecucion(campos.horas, campos.fecha_estimada, { festivos, meses });
        const fila = await insertRow('cliente_tareas', {
          ...campos,
          bloques_ejecucion: bloques,
          seguimientos: [],
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

      await sincronizarVariasAgenda(creadas.map(conCod), proyecto.consultor_1_id || null, equipo);
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

      {/* Lista de proyectos */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <input className="input !w-auto !py-1.5 !text-sm" placeholder="Buscar proyecto…" value={buscaP} onChange={e => { setBuscaP(e.target.value); setPagP(0); }} />
            <span className="text-xs font-medium text-navy-400">{proyectosFiltrados.length} proyectos</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-navy-400">Mostrar</label>
            <select className="input !w-auto !py-1.5 !text-sm" value={porPagP} onChange={e => { setPorPagP(e.target.value); setPagP(0); }}>
              {['10', '25', '50', '100', 'todos'].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                <th className="py-2">Cliente</th><th className="py-2">Proyecto</th><th className="py-2">Normas</th><th className="py-2">Modelo</th><th className="py-2">Estado</th><th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {proyectosPagina.map(p => (
                <tr key={p.id} className={`cursor-pointer hover:bg-navy-50/50 ${String(p.id) === String(sel) ? 'bg-brand-orange/5' : ''}`} onClick={() => setSel(String(p.id))}>
                  <td className="py-2 font-medium">{nombreCli(p.cliente_id)}</td>
                  <td className="py-2">{p.nombre}</td>
                  <td className="py-2 text-xs text-navy-500">{(p.normas || []).join(', ') || '—'}</td>
                  <td className="py-2 text-xs">{p.modelo || '—'}</td>
                  <td className="py-2"><span className={`chip text-[11px] font-bold ${p.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-navy-100 text-navy-500'}`}>{p.estado}</span></td>
                  <td className="py-2 text-right"><span className="text-xs font-bold text-brand-orangeDark">Abrir →</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {porPagP !== 'todos' && totalPagsP > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <button onClick={() => setPagP(p => Math.max(0, p - 1))} disabled={pagP === 0} className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-30">‹ Anterior</button>
            <span className="text-xs font-medium text-navy-400">Página {pagP + 1} de {totalPagsP}</span>
            <button onClick={() => setPagP(p => Math.min(totalPagsP - 1, p + 1))} disabled={pagP >= totalPagsP - 1} className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-30">Siguiente ›</button>
          </div>
        )}
      </div>

      {!proyecto ? (
        <p className="card text-sm font-medium text-navy-400">Selecciona un proyecto. Los proyectos se crean desde la pestaña Clientes.</p>
      ) : (
        <>
          {/* Cabecera */}
          <div className="card">
            <p className="text-xs font-bold uppercase tracking-wider text-navy-300">Cliente matriz</p>
            <p className="text-lg font-extrabold">{cliente?.empresa || '—'}</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]">
                <label className="label">Nombre del proyecto</label>
                <input className="input" value={nombreProy} onChange={e => setNombreProy(e.target.value)} />
              </div>
              <div>
                <label className="label">Estado</label>
                <select className="input !w-auto" value={estadoProy} onChange={e => setEstadoProy(e.target.value)}>
                  <option value="activo">Activo</option>
                  <option value="pausado">Pausado</option>
                  <option value="cerrado">Cerrado</option>
                </select>
              </div>
              <button onClick={guardarCabecera} className="btn-ghost !px-4 !py-2">Guardar</button>
              {msgCab && <span className="text-sm font-bold text-navy-600">{msgCab}</span>}
            </div>
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
                <label className="label">Fecha de inicio</label>
                <input type="date" className="input !w-44" value={proyecto?.fecha_inicio || ''}
                  onChange={async e => { const v = e.target.value || null; await updateRow('proyectos_cliente', proyecto.id, { fecha_inicio: v }); setProyectos(ps => ps.map(p => p.id === proyecto.id ? { ...p, fecha_inicio: v } : p)); }} />
                {proyecto?.fecha_inicio && (
                  <p className="mt-1 text-xs font-medium text-navy-400">
                    La agenda se distribuye hasta {(() => { const d = new Date(proyecto.fecha_inicio); d.setMonth(d.getMonth() + (Number(meses) || 1)); return d.toLocaleDateString('es-ES'); })()} (inicio + {meses} meses).
                  </p>
                )}
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
                <div className="flex items-center gap-3">
                  {msg && <span className="text-sm font-bold text-navy-600">{msg}</span>}
                  <button onClick={distribuirAgenda} disabled={distribuyendo} className="btn-orange !px-4 !py-2 disabled:opacity-40">
                    {distribuyendo ? 'Distribuyendo…' : '↻ Distribuir agenda'}
                  </button>
                </div>
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

              {/* Filtros de tareas distribuidas */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input className="input !w-56 !py-1.5 !text-sm" placeholder="Filtrar por tarea…" value={filtroT} onChange={e => setFiltroT(e.target.value)} />
                <select className="input !w-auto !py-1.5 !text-sm" value={filtroConsultor} onChange={e => setFiltroConsultor(e.target.value)}>
                  <option value="">Todos los consultores</option>
                  {consultores.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''}</option>)}
                </select>
                {(filtroT || filtroConsultor) && <button onClick={() => { setFiltroT(''); setFiltroConsultor(''); }} className="text-xs font-bold text-brand-orangeDark hover:underline">Limpiar filtros</button>}
                <span className="text-xs font-medium text-navy-400">Clic en una cabecera para ordenar.</span>
              </div>

              <div className="mt-3 max-h-[32rem] overflow-y-auto overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="text-left text-xs font-bold uppercase tracking-wider text-navy-300">
                      <th className="py-2 w-8"><input type="checkbox" checked={selT.size === tareasProyecto.length && tareasProyecto.length > 0} onChange={e => e.target.checked ? setSelT(new Set(tareasProyecto.map(t => t.id))) : setSelT(new Set())} /></th>
                      <th className="py-2 w-16 cursor-pointer select-none hover:text-navy-500" onClick={() => ordenarPor('codigo')}>Código{flechaOrden('codigo')}</th>
                      <th className="py-2 cursor-pointer select-none hover:text-navy-500" onClick={() => ordenarPor('titulo')}>Tarea{flechaOrden('titulo')}</th>
                      <th className="py-2 w-40 cursor-pointer select-none hover:text-navy-500" onClick={() => ordenarPor('consultor')}>Consultor{flechaOrden('consultor')}</th>
                      <th className="py-2 w-28 cursor-pointer select-none hover:text-navy-500" onClick={() => ordenarPor('fecha')}>Fecha límite{flechaOrden('fecha')}</th>
                      <th className="py-2 text-right w-16 cursor-pointer select-none hover:text-navy-500" onClick={() => ordenarPor('horas')}>Horas{flechaOrden('horas')}</th>
                      <th className="py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-50">
                    {tareasProyecto.map((t, idx) => {
                      const bloques = Array.isArray(t.bloques_ejecucion) ? t.bloques_ejecucion : [];
                      const fechaLimite = bloques.length ? bloques.map(b => b.fecha).filter(Boolean).sort().slice(-1)[0] : t.fecha_estimada;
                      const abierto = expandida === t.id;
                      const codigo = codigoTarea(codigoCli(t.cliente_id), t.num_tarea || (idx + 1));
                      return (
                      <>
                      <tr key={t.id} className={`${t.hecha ? 'opacity-60' : ''} ${selT.has(t.id) ? 'bg-brand-orange/5' : ''}`}>
                        <td className="py-1.5"><input type="checkbox" checked={selT.has(t.id)} onChange={() => toggleSelT(t.id)} /></td>
                        <td className="py-1.5 font-bold text-navy-400 text-xs">{codigo}</td>
                        <td className="py-1.5">
                          <div className="font-medium leading-snug min-w-[220px] max-w-[420px] whitespace-normal break-words">{t.titulo}</div>
                          {t.integrada && <span className="chip bg-brand-orange/15 text-[10px] font-bold text-brand-orangeDark">integrada</span>}
                        </td>
                        <td className="py-1.5">
                          <select className="input !py-1 !text-xs" value={t.consultor_id || ''} onChange={e => patchTarea(t, { consultor_id: e.target.value || null })}>
                            <option value="">—</option>
                            {consultores.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos || ''}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 text-xs">{fechaLimite || '—'}</td>
                        <td className="py-1.5 text-right">{fmtH(t.horas)}</td>
                        <td className="py-1.5 text-right">
                          <button onClick={() => setExpandida(abierto ? null : t.id)} className="text-xs font-bold text-navy-500 hover:text-brand-orange" title="Bloques de ejecución">
                            {abierto ? '▾' : '▸'} {bloques.length || trocearEnBloques(t.horas).length}
                          </button>
                        </td>
                      </tr>
                      {abierto && (
                        <tr className="bg-navy-50/40">
                          <td></td>
                          <td colSpan={6} className="py-2 pr-3">
                            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-300">Bloques de ejecución (4h por defecto, editables)</p>
                            <EditorBloques
                              tarea={t}
                              bloquesIniciales={bloques.length ? bloques : trocearEnBloques(t.horas).map(h => ({ horas: h, fecha: t.fecha_estimada }))}
                              onPersistir={guardarBloques}
                              onAdd={addBloque}
                              onQuitar={quitarBloque}
                            />
                          </td>
                        </tr>
                      )}
                      </>
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
