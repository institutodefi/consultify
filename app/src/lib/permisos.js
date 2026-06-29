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
// Navegación agrupada para la barra lateral.
// Orden: Mi agenda (suelta arriba) · Operación (Dashboard+Agenda) ·
//        Comercial (Planificador-oferta + Sistemas) · CRM (Clientes+Ofertas+Proyectos) · Equipo.
export const GRUPOS_PORTAL = [
  {
    label: null, // sin título: pestaña suelta
    items: [
      { to: 'mi-agenda', label: 'Mi agenda', icon: 'calendar-check', roles: ['superadmin', 'admin', 'consultor'] },
    ],
  },
  {
    label: 'Operación',
    items: [
      { to: '',       label: 'Dashboard', icon: 'layout-dashboard', roles: ['superadmin', 'admin', 'consultor', 'gestion'] },
      { to: 'agenda', label: 'Agenda',    icon: 'calendar-days',    roles: ['superadmin', 'admin', 'consultor'] },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { to: 'planificador', label: 'Generador de ofertas', icon: 'file-text', roles: ['superadmin', 'admin', 'consultor'] },
      { to: 'sistemas',     label: 'Sistemas de gestión',  icon: 'shield-check', roles: ['superadmin', 'admin'] },
    ],
  },
  {
    label: 'CRM',
    items: [
      { to: 'clientes',  label: 'Clientes',  icon: 'users',    roles: ['superadmin', 'admin', 'gestion'] },
      { to: 'ofertas',   label: 'Ofertas',   icon: 'receipt',  roles: ['superadmin', 'admin', 'gestion'] },
      { to: 'proyectos', label: 'Proyectos', icon: 'folder-kanban', roles: ['superadmin', 'admin', 'gestion', 'consultor'] },
    ],
  },
  {
    label: 'Organización',
    items: [
      { to: 'equipo', label: 'Equipo', icon: 'user-cog', roles: ['superadmin', 'admin'] },
    ],
  },
];

// Lista plana (compatibilidad con código existente)
export const TABS_PORTAL = GRUPOS_PORTAL.flatMap((g) => g.items);

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

// Grupos visibles para el rol (filtra items y descarta grupos vacíos)
export const gruposParaRol = (rol) =>
  GRUPOS_PORTAL
    .map((g) => ({ ...g, items: g.items.filter((it) => it.roles.includes(rol)) }))
    .filter((g) => g.items.length > 0);
