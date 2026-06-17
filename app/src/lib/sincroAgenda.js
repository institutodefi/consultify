// ════════════════════════════════════════════════════════════════
// PUENTE Planificador (cliente_tareas) → Agenda (agenda_tareas)
// Sincroniza sin duplicar usando agenda_tareas.origen_cliente_tarea_id.
// - Tarea del cliente con fecha_estimada y consultor → se refleja en agenda.
// - Si ya existe el reflejo, se actualiza (fecha, horas, consultor, tipo).
// - Si la tarea pierde fecha o consultor, se elimina su reflejo.
// El consultor es el de la tarea; si no tiene, el consultor_1 del cliente.
// ════════════════════════════════════════════════════════════════
import { listTable, insertRow, updateRow, deleteRow } from './data.js';
import { EFICIENCIA } from './calcEngine.js';

// Mapea el "tipo" de agenda a partir del bloque/proceso de la tarea del cliente.
function tipoDeTarea(t) {
  if (t.tipo) return t.tipo; // si ya viene marcado
  const b = (t.bloque || '').toUpperCase();
  if (b.startsWith('PM') || /COORDINAC/i.test(t.proceso || '')) return 'coordinacion';
  return 'produccion'; // las tareas de norma son producción (facturables)
}

/**
 * Sincroniza UNA tarea de cliente con la agenda.
 * @param ct        fila de cliente_tareas (ya guardada, con id)
 * @param consultor1Id  consultor_1 del cliente (fallback)
 * @param consultores   lista de consultores (para nivel/eficiencia)
 */
export async function sincronizarTareaAgenda(ct, consultor1Id, consultores = []) {
  const consultorId = ct.consultor_id || consultor1Id || null;

  // Buscar reflejo existente
  let reflejo = null;
  try {
    const todas = await listTable('agenda_tareas');
    reflejo = todas.find(a => String(a.origen_cliente_tarea_id) === String(ct.id)) || null;
  } catch { /* tabla puede no existir en algún entorno */ }

  // Sin fecha o sin consultor → no debe haber reflejo
  if (!ct.fecha_estimada || !consultorId) {
    if (reflejo) await deleteRow('agenda_tareas', reflejo.id);
    return null;
  }

  const nivel = consultores.find(c => String(c.id) === String(consultorId))?.nivel || 'J2';
  const coef = EFICIENCIA[nivel] ?? 1;
  const horas = Number(ct.horas) || 0;

  const payload = {
    consultor_id: consultorId,
    titulo: ct.titulo,
    descripcion: `${ct.norma_id} · ${ct.proceso || ''}`,
    fecha_prevista: ct.fecha_estimada,
    horas_base: horas,
    horas_previstas: horas,
    horas_consultor: Math.round(horas * coef * 100) / 100,
    fecha_efectiva: ct.fecha_real || null,
    horas_reales: ct.fecha_real ? horas : null,
    tipo: tipoDeTarea(ct),
    hora_inicio: '09:00',
    estado: ct.hecha ? 'completada' : 'pendiente',
    origen_cliente_tarea_id: ct.id,
  };

  if (reflejo) return updateRow('agenda_tareas', reflejo.id, payload);
  return insertRow('agenda_tareas', payload);
}

// Sincroniza varias (en serie para no saturar).
export async function sincronizarVariasAgenda(lista, consultor1Id, consultores = []) {
  let n = 0;
  for (const ct of lista) {
    try { await sincronizarTareaAgenda(ct, consultor1Id, consultores); n++; }
    catch (e) { console.error('sync agenda', ct.id, e); }
  }
  return n;
}

// Borra el reflejo en agenda de una tarea de cliente (al eliminarla).
export async function borrarReflejoAgenda(clienteTareaId) {
  try {
    const todas = await listTable('agenda_tareas');
    const reflejo = todas.find(a => String(a.origen_cliente_tarea_id) === String(clienteTareaId));
    if (reflejo) await deleteRow('agenda_tareas', reflejo.id);
  } catch { /* noop */ }
}
