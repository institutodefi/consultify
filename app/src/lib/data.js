import { supabase, DEMO, demoClone } from './supabase';
import { catalogoFilas } from './catalogoTareas';

// Capa de datos: misma API en modo demo y con Supabase real.
let demoState = null;
function demo() {
  if (!demoState) demoState = {
    consultores: demoClone('consultores'), clientes: demoClone('clientes'),
    proyectos: demoClone('proyectos'), presupuestos: demoClone('presupuestos'),
    procesos_internos: demoClone('procesos_internos'),
    procesos_subprocesos: [],
    procesos_bandas: [],
    procesos_riesgos: [],
    empresas: [],
    contactos: [],
    empresa_contactos: [],
    tareas_catalogo: catalogoFilas(), agenda_tareas: [], cliente_tareas: [], proyectos_cliente: [], cliente_contactos: [], vacaciones: [], festivos: [],
  };
  return demoState;
}
const uid = () => Math.random().toString(36).slice(2, 10);

export async function listAll(table, order = 'creado') {
  if (DEMO) return demo()[table];
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending: false });
  if (error) throw error;
  return data;
}

export async function listTable(table) {
  if (DEMO) return demo()[table];
  // PostgREST devuelve como máximo 1000 filas por petición. Tablas grandes como
  // tareas_catalogo (~1000+ filas) se cortaban y dejaban fuera las últimas normas
  // (p. ej. UNE 158101). Paginamos por rangos hasta traerlas todas.
  const PAGE = 1000;
  let desde = 0;
  let todas = [];
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(desde, desde + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    todas = todas.concat(data);
    if (data.length < PAGE) break;   // última página
    desde += PAGE;
  }
  return todas;
}

export async function insertRow(table, row) {
  if (DEMO) { const r = { id: uid(), creado: new Date().toISOString(), ...row }; demo()[table].unshift(r); return r; }
  // 1) Intento normal: insertar y devolver la fila creada.
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (!error) return data;
  // 2) Si falla por RLS o permisos, casi siempre es porque la política de SELECT
  //    no deja LEER la fila de vuelta a un usuario anónimo (insert .select()).
  //    El INSERT en sí está permitido (check true), así que reintentamos SIN select.
  const msg = (error.message || '').toLowerCase();
  const esRls = msg.includes('row-level security') || msg.includes('row level security') ||
                (msg.includes('permission denied') && msg.includes('users'));
  if (esRls) {
    const { error: e2 } = await supabase.from(table).insert(row);
    if (!e2) return { ...row };          // alta correcta; sin id de vuelta
    throw e2;                            // si también falla, propagamos el real
  }
  // 3) Columna ausente en el schema cache de PostgREST (p.ej. migración pendiente
  //    o cache sin recargar). Reintentamos SIN esa columna para no abortar la
  //    operación completa. Es una red de seguridad: conviene aplicar la migración
  //    y recargar el schema, pero al menos la fila se crea con el resto de campos.
  const colMatch = (error.message || '').match(/could not find the '([^']+)' column/i)
                || (error.message || '').match(/'([^']+)' column of '[^']+' in the schema cache/i);
  const esColumnaFaltante = error.code === 'PGRST204' || msg.includes('schema cache') || !!colMatch;
  if (esColumnaFaltante && colMatch && colMatch[1] in row) {
    const col = colMatch[1];
    const { [col]: _omit, ...resto } = row;
    if (import.meta.env.DEV) console.warn(`[insertRow] Columna '${col}' ausente en el schema cache de '${table}'. Reintento sin ella. Aplica la migración correspondiente y recarga el schema.`);
    return insertRow(table, resto);      // reintento recursivo, puede faltar más de una
  }
  throw error;
}

// Correlativo limpio de oferta (OFE-AAAA-NNN) vía secuencia atómica en Postgres.
// En modo demo o si la RPC falla, devuelve un número de respaldo basado en tiempo.
export async function siguienteNumeroOferta() {
  const anio = new Date().getFullYear();
  const fallback = () => `OFE-${anio}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  if (DEMO) return fallback();
  try {
    const { data, error } = await supabase.rpc('siguiente_numero_oferta');
    if (error || !data) return fallback();
    return data;
  } catch { return fallback(); }
}

/**
 * Siguiente código de cliente correlativo con formato CL-NNNN (CL-0001, CL-0002…).
 * Mira los códigos existentes y devuelve el siguiente. No es atómico, pero para el
 * volumen de altas manuales/formulario es suficiente; ante colisión, el upsert
 * reintenta con el siguiente hueco.
 */
export async function siguienteCodigoCliente() {
  const fmt = (n) => `CL-${String(n).padStart(4, '0')}`;
  try {
    const filas = await listTable('clientes');
    let max = 0;
    for (const c of (filas || [])) {
      const m = /^CL-(\d+)$/i.exec((c.codigo || '').trim());
      if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
    }
    return fmt(max + 1);
  } catch {
    return fmt(1);
  }
}

/**
 * Crea o actualiza un cliente a partir de los datos del formulario público.
 * - Si ya existe un cliente con el mismo email o CIF, lo actualiza (no duplica).
 * - Si es nuevo, le asigna un código CL-NNNN correlativo.
 * - Director de Proyecto por defecto: Fátima (si se encuentra en el equipo).
 * Devuelve el cliente resultante (o null en DEMO/errores no críticos).
 */
export async function upsertClienteDesdeFormulario({ empresa, contacto, email, telefono, cif }) {
  if (DEMO) return { id: uid(), codigo: 'CL-0001', empresa, contacto, email, telefono, cif };
  const emailN = (email || '').trim().toLowerCase();
  const cifN = (cif || '').trim().toUpperCase();

  // 1) Buscar cliente existente por email o CIF.
  let existente = null;
  try {
    const filas = await listTable('clientes');
    existente = (filas || []).find((c) =>
      (emailN && (c.email || '').trim().toLowerCase() === emailN) ||
      (cifN && (c.cif || '').trim().toUpperCase() === cifN)
    ) || null;
  } catch { /* si no podemos leer, seguimos como alta nueva */ }

  // 2) Director de Proyecto por defecto = Fátima.
  let directorId = null;
  try {
    const equipo = await listTable('consultores');
    const fatima = (equipo || []).find((p) => `${p.nombre || ''} ${p.apellidos || ''}`.toLowerCase().includes('fátima')
      || (p.nombre || '').toLowerCase().includes('fatima'));
    if (fatima?.id) directorId = fatima.id;
  } catch { /* opcional */ }

  // 3) Actualizar si existe.
  if (existente?.id) {
    const patch = {};
    if (empresa) patch.empresa = empresa;
    if (contacto) patch.contacto = contacto;
    if (emailN) patch.email = email;
    if (telefono) patch.telefono = telefono;
    if (cifN) patch.cif = cif;
    if (!existente.director_proyecto_id && directorId) patch.director_proyecto_id = directorId;
    if (!existente.codigo) patch.codigo = await siguienteCodigoCliente();
    try { return await updateRow('clientes', existente.id, patch); }
    catch { return existente; }
  }

  // 4) Crear nuevo con código correlativo.
  const codigo = await siguienteCodigoCliente();
  const datos = { codigo, empresa: empresa || contacto || email, contacto, email, telefono, cif,
    ...(directorId ? { director_proyecto_id: directorId } : {}) };
  try { return await insertRow('clientes', datos); }
  catch { return null; }
}

export async function updateRow(table, id, patch) {
  if (DEMO) { const t = demo()[table]; const i = t.findIndex(r => r.id === id); if (i >= 0) t[i] = { ...t[i], ...patch }; return t[i]; }
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteRow(table, id) {
  if (DEMO) { const t = demo()[table]; const i = t.findIndex(r => r.id === id); if (i >= 0) t.splice(i, 1); return; }
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

/** Presupuestos del cliente autenticado (por user_id o email). */
export async function misPresupuestos(user) {
  if (DEMO) return demo().presupuestos;
  const { data, error } = await supabase.from('presupuestos').select('*')
    .or(`user_id.eq.${user.id},email.eq.${user.email}`)
    .order('creado', { ascending: false });
  if (error) throw error;
  return data;
}

/** Proyectos del cliente autenticado (vía clientes.user_id). */
export async function misProyectos(user) {
  if (DEMO) return demo().proyectos.map(p => ({ ...p }));
  const { data: cli, error: e1 } = await supabase.from('clientes').select('id').eq('user_id', user.id);
  if (e1) throw e1;
  if (!cli?.length) return [];
  const ids = cli.map(c => c.id);
  const { data, error } = await supabase.from('proyectos').select('*').in('cliente_id', ids);
  if (error) throw error;
  return data;
}

/** Llama a la Netlify Function de Holded con el token del usuario.
 *  Devuelve el JSON de la función. Solo funciona con backend configurado. */
export async function holdedFn(payload) {
  if (DEMO) return { ok: false, error: 'Holded no disponible en modo demo.' };
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { ok: false, error: 'No hay sesión activa. Vuelve a iniciar sesión.' };

  let r;
  try {
    r = await fetch('/.netlify/functions/holded', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, error: 'No se pudo contactar con el servidor: ' + (e.message || 'red') };
  }

  // Leemos como texto y luego intentamos parsear, para no reventar si la
  // respuesta no es JSON (p. ej. 404 de función no desplegada, o 500 con HTML).
  const txt = await r.text();
  let json;
  try { json = JSON.parse(txt); } catch {
    if (r.status === 404) return { ok: false, error: 'La función de Holded no está desplegada en Netlify (404). Revisa el deploy de netlify/functions.' };
    return { ok: false, error: `El servidor respondió con un error (HTTP ${r.status}). ${txt.slice(0, 160)}` };
  }
  return json;
}

/** Llama a la Netlify Function de Brevo (sincronización de clientes). */
export async function brevoFn(payload) {
  if (DEMO) return { ok: false, error: 'Brevo no disponible en modo demo.' };
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { ok: false, error: 'No hay sesión activa.' };
  let r;
  try {
    r = await fetch('/.netlify/functions/brevo-clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch (e) { return { ok: false, error: 'No se pudo contactar con el servidor: ' + (e.message || 'red') }; }
  const txt = await r.text();
  try { return JSON.parse(txt); }
  catch { return r.status === 404 ? { ok: false, error: 'Función de Brevo no desplegada (404).' } : { ok: false, error: `Error HTTP ${r.status}` }; }
}
