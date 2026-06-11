# Consultify · App de gestión interna v2.0

React + Vite + Tailwind CSS + Supabase + Recharts.
Cuatro pestañas: **Dashboard · Equipo · Proyectos · Agenda**.

## Novedades v2.0
- **Pestaña Agenda** con dashboard individual por consultor según el XIX
  Convenio de Consultorías: horas de convenio por mes (8 h/día, agosto
  intensivo 7,2 h/día), vacaciones (23 días) marcables en el calendario,
  tareas programables en pasado/presente/futuro y **reloj anual predictivo**
  sobre las 1.800 h.
- **Tareas v2**: responsable reasignable, fecha prevista + horas programadas,
  fecha efectiva + horas reales, botón **"Copiar previsto → real"**, control
  del límite de 9 h ordinarias/día por separado en plan y en real, KPI de
  desviación real vs plan y gráfico objetivo/previstas/reales por mes.

## Puesta en marcha

### 1 · Base de datos (3 min)
- Supabase → proyecto `consultify` → **SQL Editor** → pegar `supabase/schema.sql` → **Run**.
- Crea las 6 tablas (normas_catalogo, consultores, proyectos, festivos,
  vacaciones, tareas), siembra las 9 normas, Carlota e Irene (solo si la
  tabla está vacía) y los festivos 2026 de Madrid.
- ⚠ Si ya tenías la **agenda v1** instalada, ejecuta primero el bloque
  "UPGRADE v1 → v2" comentado al final del script.
- ⚠ Los festivos 2026 son orientativos (2026 es año de ajuste): revísalos
  contra el calendario laboral oficial; la tabla es editable.

### 2 · Credenciales (1 min)
```bash
cp .env.example .env.local
```
Pega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
(Supabase → Settings → API).

### 3 · Local (1 min)
```bash
npm install
npm run dev        # http://localhost:5173
```

### 4 · Netlify (2 min)
```bash
npm run build
```
Arrastra `dist/` a app.netlify.com → Site settings → Environment variables →
añade las 2 mismas variables → Trigger deploy.

## Lógica de negocio incorporada

| Regla | Valor |
|---|---|
| Tarifas internas | J1 30 · J2 40 · J3 55 · Senior 75 €/h |
| Margen | 60 % fijo (precio = coste × 2,5) |
| Coordinación | +10 % horas → J3 si ≤4 sistemas, Senior si ≥5 |
| Redondeo horas | Entero superior por nivel |
| Suelo recurrentes | 350 €/mes |
| Catálogo | Múltiplo de 25 € (100 € en Apoyo) + IVA 21 % |
| Apoyo | Bolsa única, 100 % anticipado, no contratable a <60 días de auditoría |
| Acompañamiento auditoría | 600 €/día aparte |
| Capacidad consultor | h/sem × 4,33 × 30/35 × 11/12 (35 h/sem → 119 h/mes) |
| Implantación | h Implicación × 0,6 |
| Presenciales | h_pres por CLIENTE/mes (no por sistema), al nivel más alto |

### Convenio (pestaña Agenda · `src/lib/jornada.js`)
| Constante | Valor |
|---|---|
| `TOPE_ANUAL` | 1.800 h efectivas/año |
| `HORAS_DIA_ESTANDAR` | 8 h (40 h/sem) |
| `HORAS_DIA_AGOSTO` | 7,2 h (intensiva 36 h/sem) |
| `MAX_HORAS_DIA` | 9 h ordinarias |
| `DIAS_VACACIONES` | 23 (22 si ≥2 meses intensiva) |

Comprobación 2026: 250 laborables → 1.983 h de convenio − 23 días de
vacaciones ≈ 1.799 h ≈ tope de 1.800 h. Si el objetivo supera el tope
(p. ej. vacaciones en agosto), la app avisa para añadir días de libre
disposición. Año fijado en `TabAgenda.jsx` (`YEAR = 2026`).

## Seguridad
Las políticas RLS son permisivas para `anon` (cualquiera con URL + anon key
lee/escribe). No compartas la URL pública. Para producción multi-usuario:
activar Supabase Auth y cambiar las políticas a `authenticated`.
