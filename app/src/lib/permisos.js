// ════════════════════════════════════════════════════════════════
// PERMISOS POR ROL — fuente única de verdad para la UI
// Roles: superadmin · admin · consultor · gestion · cliente
// ════════════════════════════════════════════════════════════════

export const ROLES = ['superadmin', 'admin', 'consultor', 'gestion', 'cliente'];

export const ROL_LABEL = {
  superadmin: 'Superadministrador',
  admin: 'Administrador',
  consultor: 'Director de Proyecto (consultor)',
  gestion: 'Equipo de gestión',
  cliente: 'Cliente',
};

// Pestañas del portal interno y quién las ve
// (el orden define el orden de aparición)
export const TABS_PORTAL = [
  { to: '',              label: 'Dashboard',          roles: ['superadmin', 'admin', 'consultor', 'gestion'] },
  { to: 'proyectos',     label: 'Proyectos',          roles: ['superadmin', 'admin', 'consultor', 'gestion'] },
  { to: 'agenda',        label: 'Agenda',             roles: ['superadmin', 'admin', 'consultor'] },
  { to: 'planificador',  label: 'Planificador',        roles: ['superadmin', 'admin', 'consultor'] },
  { to: 'equipo',        label: 'Equipo',             roles: ['superadmin', 'admin'] },
  { to: 'clientes',      label: 'Clientes',           roles: ['superadmin', 'admin', 'gestion'] },
];

// Capacidades puntuales
export const can = {
  // Ver importes, márgenes, MRR, calculadora → SOLO superadmin
  verEconomico: (rol) => rol === 'superadmin',
  // Gestionar el equipo (alta/baja consultores y gestión)
  gestionarEquipo: (rol) => rol === 'superadmin' || rol === 'admin',
  // Entrar a la zona interna
  esEquipo: (rol) => ['superadmin', 'admin', 'consultor', 'gestion'].includes(rol),
};

export const tabsParaRol = (rol) => TABS_PORTAL.filter((t) => t.roles.includes(rol));
