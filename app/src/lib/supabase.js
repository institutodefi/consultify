import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Fuerza autenticación real: si es 'true', nunca se entra en modo DEMO aunque falten credenciales. */
const FORCE_AUTH = String(import.meta.env.VITE_FORCE_AUTH || '').toLowerCase() === 'true';

/** true cuando no hay credenciales Y no se fuerza auth: la app funciona con datos de muestra en memoria. */
export const DEMO = (!url || !anon) && !FORCE_AUTH;

/** true si se pidió auth real pero faltan credenciales: la app debe mostrar aviso y no dejar entrar. */
export const AUTH_MISCONFIG = (!url || !anon) && FORCE_AUTH;

export const supabase = (!url || !anon) ? null : createClient(url, anon);

// ---------------- DATOS DEMO (solo cuando DEMO === true) ----------------
export const demoDB = {
  consultores: [
    { id: 'c1', nombre: 'Carlota', apellidos: '', rol: 'consultor', email: 'carlota@tuconsultor.com', nivel: 'J3', normas: ['9001','14001','27001','45001'], capacidad_clientes: 12, activo: true },
    { id: 'c2', nombre: 'Irene',   apellidos: '', rol: 'director',   email: 'irene@tuconsultor.com',   nivel: 'J2', normas: ['9001','14001'],                 capacidad_clientes: 17, activo: true },
    { id: 'c3', nombre: 'Daniela', apellidos: '', rol: 'consultor', email: 'daniela@tuconsultor.com', nivel: 'J1', normas: ['9001'],                          capacidad_clientes: 8,  activo: false },
  ],
  clientes: [
    { id: 'cl1', codigo: 'CL-0001', empresa: 'Industrias Norte S.L.', cif: 'B12345678', contacto: 'María López', email: 'maria@industriasnorte.es', telefono: '+34 600 111 222' },
    { id: 'cl2', codigo: 'CL-0002', empresa: 'TechSecure S.A.',       cif: 'A87654321', contacto: 'Jorge Ruiz',  email: 'jorge@techsecure.es',      telefono: '+34 600 333 444' },
  ],
  proyectos: [
    { id: 'p1', cliente_id: 'cl1', normas: ['9001','14001'], modelo: 'Implicación', consultor_id: 'c1', estado: 'activo', fecha_inicio: '2026-02-01', fecha_auditoria: '2026-11-15', precio_mes: 975,  precio_total: null, notas: '' },
    { id: 'p2', cliente_id: 'cl1', normas: ['45001'],        modelo: 'Relación',    consultor_id: 'c2', estado: 'activo', fecha_inicio: '2026-03-01', fecha_auditoria: null,          precio_mes: 350,  precio_total: null, notas: '' },
    { id: 'p3', cliente_id: 'cl2', normas: ['27001'],        modelo: 'Apoyo',       consultor_id: 'c1', estado: 'implantación', fecha_inicio: '2026-05-10', fecha_auditoria: '2026-09-30', precio_mes: null, precio_total: 8100, notas: 'Bolsa 90 h' },
  ],
  cliente_empresas: [
    { id: 'e1', cliente_id: 'cl1', cif: 'B12345678', razon_social: 'Industrias Norte S.L.' },
    { id: 'e2', cliente_id: 'cl1', cif: 'B99887766', razon_social: 'Norte Logística S.L.U.' },
    { id: 'e3', cliente_id: 'cl2', cif: 'A87654321', razon_social: 'TechSecure S.A.' },
  ],
  empresa_centros: [
    { id: 'ct1', empresa_id: 'e1', nombre: 'Fábrica Alcobendas', direccion: 'Pol. Ind. Norte, nave 12' },
    { id: 'ct2', empresa_id: 'e1', nombre: 'Oficinas centrales', direccion: 'C/ Mayor 1, Madrid' },
    { id: 'ct3', empresa_id: 'e3', nombre: 'Sede Madrid', direccion: 'P.º Castellana 200' },
  ],
  empresa_normas: [
    { id: 'en1', empresa_id: 'e1', norma_id: '9001',  alcance: 'Diseño y fabricación de componentes metálicos.' },
    { id: 'en2', empresa_id: 'e1', norma_id: '14001', alcance: 'Diseño y fabricación de componentes metálicos.' },
    { id: 'en3', empresa_id: 'e3', norma_id: '27001', alcance: 'Servicios de ciberseguridad gestionada.' },
  ],
  procesos_internos: [
    { id: 'pi1', nombre: 'Reunión de equipo', codigo: 'PI-REU', descripcion: 'Reuniones internas', color: '#0A2A6C', activo: true, orden: 10 },
    { id: 'pi2', nombre: 'Formación interna', codigo: 'PI-FORM', descripcion: 'Formación del equipo', color: '#0e7490', activo: true, orden: 20 },
    { id: 'pi3', nombre: 'Mejora de metodología', codigo: 'PI-MET', descripcion: 'Plantillas y herramientas', color: '#7c3aed', activo: true, orden: 30 },
  ],
  presupuestos: [
    { id: 'pr1', email: 'maria@industriasnorte.es', normas: ['9001','14001','27001'], modelo: 'Implicación', precio: 1325, tipo: 'mes', creado: '2026-06-01T10:00:00Z' },
  ],
};

export function demoClone(table) {
  return JSON.parse(JSON.stringify(demoDB[table] || []));
}
