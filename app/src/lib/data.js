import { supabase, DEMO, demoClone } from './supabase';
import { catalogoFilas } from './catalogoTareas';

// Capa de datos: misma API en modo demo y con Supabase real.
let demoState = null;
function demo() {
  if (!demoState) demoState = {
    consultores: demoClone('consultores'), clientes: demoClone('clientes'),
    proyectos: demoClone('proyectos'), presupuestos: demoClone('presupuestos'),
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
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  return data;
}

export async function insertRow(table, row) {
  if (DEMO) { const r = { id: uid(), creado: new Date().toISOString(), ...row }; demo()[table].unshift(r); return r; }
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (!error) return data;
  // Caso conocido: el INSERT se ejecuta, pero la política de SELECT que devuelve
  // la fila consulta auth.users y lanza "permission denied for table users".
  // El alta SÍ se ha guardado; no reintentamos (evitamos duplicar) y devolvemos
  // la fila sin id. La solución definitiva es la migración v33 (política sin auth.users).
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('permission denied') && msg.includes('users')) {
    return { ...row };
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
