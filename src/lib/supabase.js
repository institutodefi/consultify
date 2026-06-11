// ═══════════════════════════════════════════════════════════════════
// CLIENTE SUPABASE + helpers de consultores y proyectos
// ═══════════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const fail = (e) => { console.error(e); throw e; };

/** Capacidad productiva: h/sem × 4,33 sem × (30/35 producción) × (11/12 vacaciones) */
export const horasProduccionMes = (horasSem) =>
  Math.round(horasSem * 4.33 * (30 / 35) * (11 / 12));

export const db = {
  // ── Consultores ───────────────────────────────────────────────────
  async getConsultores() {
    const { data, error } = await supabase
      .from('consultores').select('*').eq('activo', true).order('nombre');
    if (error) fail(error);
    return data ?? [];
  },

  async crearConsultor(c) {
    const { data, error } = await supabase.from('consultores').insert(c).select().single();
    if (error) fail(error);
    return data;
  },

  async actualizarConsultor(id, cambios) {
    const { data, error } = await supabase.from('consultores').update(cambios).eq('id', id).select().single();
    if (error) fail(error);
    return data;
  },

  // Soft delete: conserva el histórico de proyectos
  async borrarConsultor(id) {
    const { error } = await supabase.from('consultores').update({ activo: false }).eq('id', id);
    if (error) fail(error);
  },

  // ── Proyectos ─────────────────────────────────────────────────────
  async getProyectos() {
    const { data, error } = await supabase
      .from('proyectos').select('*').order('created_at', { ascending: false });
    if (error) fail(error);
    return data ?? [];
  },

  async crearProyecto(p) {
    const { data, error } = await supabase.from('proyectos').insert(p).select().single();
    if (error) fail(error);
    return data;
  },

  async actualizarProyecto(id, cambios) {
    const { data, error } = await supabase.from('proyectos').update(cambios).eq('id', id).select().single();
    if (error) fail(error);
    return data;
  },

  async borrarProyecto(id) {
    const { error } = await supabase.from('proyectos').delete().eq('id', id);
    if (error) fail(error);
  },
};
