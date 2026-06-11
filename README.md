# Consultify · Web completa (landing + app)

Stack: **Netlify** (hosting + functions) · **Supabase** (auth + base de datos) · **Brevo** (CRM/leads).

## Estructura

```
public-site/          Landing estática trilingüe (ES/EN/AR) — raíz del dominio
app/                  App React (Vite + Tailwind): /app/calculadora, /app/acceso,
                      /app/clientes/*, /app/consultores/*
netlify/functions/    brevo-lead.mjs — envía leads de la calculadora a Brevo
supabase/schema.sql   Esquema completo con RLS (perfiles, normas, consultores,
                      clientes, proyectos, presupuestos)
scripts/merge-static.mjs  Une landing + app en dist/ tras el build
netlify.toml          Build, redirects SPA, www→apex, headers de seguridad
```

## Despliegue (recomendado: Git → Netlify)

> Las Netlify Functions **no funcionan con drag & drop**; conecta el repo.

1. Sube este directorio a un repo (GitHub/GitLab).
2. En Netlify: **Add new site → Import from Git**. El `netlify.toml` ya define build y publish.
3. **Site configuration → Environment variables**:
   - `VITE_SUPABASE_URL` — URL del proyecto `consultify`
   - `VITE_SUPABASE_ANON_KEY` — anon/public key
   - `BREVO_API_KEY` — clave API v3 de Brevo (solo servidor)
   - `BREVO_LIST_ID` — (opcional) ID de lista de Brevo para los leads
4. En Supabase: **SQL Editor → New query** → pega y ejecuta `supabase/schema.sql`.
5. Roles: los registros nuevos son `cliente`. Para ascender a consultor/admin,
   instrucciones al final del schema.sql (UPDATE sobre `perfiles`).

Sin las variables de Supabase la app arranca en **modo DEMO** con datos de muestra.

## Agenda de consultores (nuevo)

Pestaña **Agenda** en la zona de consultores (`/app/consultores/agenda`):

- Horas de convenio por mes (XIX Convenio Consultorías): L–V menos festivos,
  8 h/día (40 h/sem) y 7,2 h/día en agosto (intensiva 36 h/sem). Tope 1.800 h/año.
- Vacaciones: 23 días marcables con clic en el calendario (botón "Marcar vacaciones").
- Tareas con **responsable** (reasignable), **fecha/horas previstas** y
  **fecha/horas reales**, botón "Copiar previsto → real", límite 9 h/día.
- **Reloj anual predictivo**: arco naranja = previstas, arco navy = reales,
  aguja = proyección a fin de año, marca roja = tope 1.800 h.
- Gráfico mensual objetivo / previstas / reales y KPI de desviación.
- Requiere ejecutar `supabase/agenda.sql` (festivos 2026 de Madrid sembrados
  y editables — 2026 es año de ajuste). Sin credenciales funciona en modo DEMO.

## Calculadora — criterios (verificados 42/42 contra la tabla maestra)

- 9 normas (9001, 14001, 27001, 45001, 9004, 42001, 56001, 21001, UNE 93200)
- Tarifas internas J2=40/J3=55/Senior=75 €/h · margen 60 % · IVA 21 %
- Modelos: Apoyo (bolsa prepago 100 %, regla 60 días), Relación (2h/sist),
  Implicación (4h/sist + 2h presencial/cliente), Compromiso (6h+2h),
  Implantación (Implicación × 0,6)
- Coordinación +10 % (J3 ≤4 sistemas, Senior ≥5) · redondeo ceil por nivel
- Catálogo: paso 25 € con suelo 350 €/mes (recurrentes), paso 100 € (Apoyo)
- Acompañamiento a auditoría: 600 €/jornada, siempre aparte
- Recurrentes: permanencia mínima 12 meses
