// ════════════════════════════════════════════════════════════════
// PUENTE Planificador (cliente_tareas) → Agenda (agenda_tareas)
// Cada BLOQUE de ejecución de la tarea se vuelca como un evento de agenda.
// Sin duplicar: se borran los reflejos previos de la tarea y se recrean.
// Solo se envían columnas que existen en agenda_tareas.
// ════════════════════════════════════════════════════════════════
import { listTable, insertRow, deleteRow } from './data.js';
import { trocearEnBloques, codigoTarea } from './planCliente.js';

function tipoDeTarea(t) {
  if (t.tipo) return t.tipo;
  const b = (t.bloque || '').toUpperCase();
  if (b.startsWith('PM') || /COORDINAC/i.test(t.proceso || '')) return 'coordinacion';
  return 'produccion';
}

// Bloques de ejecución: usa los guardados (bloques_ejecucion) o trocea en 4h.
function bloquesDe(ct) {
  if (Array.isArray(ct.bloques_ejecucion) && ct.bloques_ejecucion.length) {
    return ct.bloques_ejecucion.map(b => ({ horas: Number(b.horas) || 0, fecha: b.fecha || ct.fecha_estimada }));
  }
  const trozos = trocearEnBloques(ct.horas);
  return trozos.map(h => ({ horas: h, fecha: ct.fecha_estimada }));
}

export async function sincronizarTareaAgenda(ct, consultor1Id, consultores = []) {
  const consultorId = ct.consultor_id || consultor1Id || null;

  // Borrar reflejos previos de esta tarea (se recrean por bloque).
  let previos = [];
  try {
    const todas = await listTable('agenda_tareas');
    previos = todas.filter(a => String(a.origen_cliente_tarea_id) === String(ct.id));
  } catch { /* noop */ }
  for (const p of previos) { try { await deleteRow('agenda_tareas', p.id); } catch { /* noop */ } }

  if (!consultorId) return null;

  const bloques = bloquesDe(ct).filter(b => b.horas > 0 && b.fecha);
  if (!bloques.length) return null;

  const tipo = tipoDeTarea(ct);
  const codCli = ct.codigo_cliente || 'CLI';
  const nT = ct.num_tarea || 1;
  const creados = [];
  for (let i = 0; i < bloques.length; i++) {
    const b = bloques[i];
    const cod = codigoTarea(codCli, nT, bloques.length > 1 ? i + 1 : null);
    const payload = {
      consultor_id: consultorId,
      fecha_prevista: b.fecha,
      horas_previstas: Math.min(9, Math.max(0.5, Number(b.horas) || 0)),
      titulo: `${cod} · ${ct.titulo}`,
      codigo: cod,
      descripcion: `${ct.norma_id || ''} · ${ct.proceso || ''}`.trim(),
      tipo,
      estado: ct.hecha ? 'completada' : 'pendiente',
      origen_cliente_tarea_id: ct.id,
    };
    try { creados.push(await insertRow('agenda_tareas', payload)); }
    catch (e) { console.error('insert agenda bloque', ct.id, e); throw e; }
  }
  return creados;
}

export async function sincronizarVariasAgenda(lista, consultor1Id, consultores = []) {
  let n = 0;
  for (const ct of lista) {
    try { const r = await sincronizarTareaAgenda(ct, consultor1Id, consultores); if (r) n++; }
    catch (e) { console.error('sync agenda', ct.id, e); }
  }
  return n;
}

export async function borrarReflejoAgenda(clienteTareaId) {
  try {
    const todas = await listTable('agenda_tareas');
    const reflejos = todas.filter(a => String(a.origen_cliente_tarea_id) === String(clienteTareaId));
    for (const r of reflejos) await deleteRow('agenda_tareas', r.id);
  } catch { /* noop */ }
}
