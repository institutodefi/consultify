import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** true cuando no hay credenciales: la app funciona con datos de muestra en memoria. */
export const DEMO = !url || !anon;

export const supabase = DEMO ? null : createClient(url, anon);

// ---------------- DATOS DEMO (solo cuando DEMO === true) ----------------
export const demoDB = {
  consultores: [
    { id: 'c1', nombre: 'Carlota', nivel: 'J3', normas: ['9001','14001','27001','45001'], capacidad_clientes: 12, activo: true },
    { id: 'c2', nombre: 'Irene',   nivel: 'J2', normas: ['9001','14001'],                 capacidad_clientes: 17, activo: true },
    { id: 'c3', nombre: 'Daniela', nivel: 'J1', normas: ['9001'],                          capacidad_clientes: 8,  activo: false },
  ],
  clientes: [
    { id: 'cl1', empresa: 'Industrias Norte S.L.', cif: 'B12345678', contacto: 'María López', email: 'maria@industriasnorte.es', telefono: '+34 600 111 222' },
    { id: 'cl2', empresa: 'TechSecure S.A.',       cif: 'A87654321', contacto: 'Jorge Ruiz',  email: 'jorge@techsecure.es',      telefono: '+34 600 333 444' },
  ],
  proyectos: [
    { id: 'p1', cliente_id: 'cl1', normas: ['9001','14001'], modelo: 'Implicación', consultor_id: 'c1', estado: 'activo', fecha_inicio: '2026-02-01', fecha_auditoria: '2026-11-15', precio_mes: 975,  precio_total: null, notas: '' },
    { id: 'p2', cliente_id: 'cl1', normas: ['45001'],        modelo: 'Relación',    consultor_id: 'c2', estado: 'activo', fecha_inicio: '2026-03-01', fecha_auditoria: null,          precio_mes: 350,  precio_total: null, notas: '' },
    { id: 'p3', cliente_id: 'cl2', normas: ['27001'],        modelo: 'Apoyo',       consultor_id: 'c1', estado: 'implantación', fecha_inicio: '2026-05-10', fecha_auditoria: '2026-09-30', precio_mes: null, precio_total: 8100, notas: 'Bolsa 90 h' },
  ],
  presupuestos: [
    { id: 'pr1', email: 'maria@industriasnorte.es', normas: ['9001','14001','27001'], modelo: 'Implicación', precio: 1325, tipo: 'mes', creado: '2026-06-01T10:00:00Z' },
  ],
};

export function demoClone(table) {
  return JSON.parse(JSON.stringify(demoDB[table] || []));
}
