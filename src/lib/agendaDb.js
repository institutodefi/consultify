// ═══════════════════════════════════════════════════════════════════
// CAPA DE DATOS — AGENDA (festivos, vacaciones, tareas v2)
// Reutiliza el cliente compartido de lib/supabase.js
// ═══════════════════════════════════════════════════════════════════
import { supabase } from './supabase';

const fail = (e) => { console.error(e); throw e; };

export const agendaDb = {
  // ── Festivos ──────────────────────────────────────────────────────
  async getFestivos(year) {
    const { data, error } = await supabase
      .from('festivos').select('*')
      .gte('fecha', `${year}-01-01`).lte('fecha', `${year}-12-31`)
      .order('fecha');
    if (error) fail(error);
    return data ?? [];
  },

  // ── Vacaciones ────────────────────────────────────────────────────
  async getVacaciones(consultorId, year) {
    const { data, error } = await supabase
      .from('vacaciones').select('*')
      .eq('consultor_id', consultorId)
      .gte('fecha', `${year}-01-01`).lte('fecha', `${year}-12-31`);
    if (error) fail(error);
    return data ?? [];
  },

  async toggleVacacion(consultorId, fecha) {
    const { data, error } = await supabase
      .from('vacaciones').select('id')
      .eq('consultor_id', consultorId).eq('fecha', fecha).maybeSingle();
    if (error) fail(error);
    if (data) {
      const { error: e2 } = await supabase.from('vacaciones').delete().eq('id', data.id);
      if (e2) fail(e2);
      return false; // quitada
    }
    const { error: e3 } = await supabase.from('vacaciones').insert({ consultor_id: consultorId, fecha });
    if (e3) fail(e3);
    return true; // añadida
  },

  // ── Tareas (v2: previsto vs real, responsable reasignable) ────────
  async getTareas(consultorId, year) {
    const ini = `${year}-01-01`, fin = `${year}-12-31`;
    const { data, error } = await supabase
      .from('tareas').select('*')
      .eq('consultor_id', consultorId)
      .or(`and(fecha_prevista.gte.${ini},fecha_prevista.lte.${fin}),and(fecha_efectiva.gte.${ini},fecha_efectiva.lte.${fin})`)
      .order('fecha_prevista');
    if (error) fail(error);
    return data ?? [];
  },

  async crearTarea(tarea) {
    const { data, error } = await supabase.from('tareas').insert(tarea).select().single();
    if (error) fail(error);
    return data;
  },

  async actualizarTarea(id, cambios) {
    const { data, error } = await supabase.from('tareas').update(cambios).eq('id', id).select().single();
    if (error) fail(error);
    return data;
  },

  async borrarTarea(id) {
    const { error } = await supabase.from('tareas').delete().eq('id', id);
    if (error) fail(error);
  },
};
