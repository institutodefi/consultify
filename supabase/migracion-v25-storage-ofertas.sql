-- ============================================================
-- migracion-v25-storage-ofertas.sql
-- 1) Crea el bucket público 'ofertas' en Supabase Storage
-- 2) Política de lectura pública + escritura solo service_role
-- 3) Columnas url_pdf / url_pptx en presupuestos para el enlace de descarga
-- ============================================================

-- 1) Bucket público 'ofertas' (idempotente)
insert into storage.buckets (id, name, public)
values ('ofertas', 'ofertas', true)
on conflict (id) do update set public = true;

-- 2) Políticas de Storage para el bucket 'ofertas'
--    Lectura pública (cualquiera con el enlace puede descargar la oferta)
drop policy if exists "ofertas_public_read" on storage.objects;
create policy "ofertas_public_read"
  on storage.objects for select
  using (bucket_id = 'ofertas');

--    La escritura la hace la función con service_role (que ignora RLS),
--    por lo que NO añadimos política de insert para anon/authenticated:
--    así nadie sube archivos al bucket salvo el backend.

-- 3) Columnas de enlace en presupuestos (idempotente)
alter table presupuestos add column if not exists url_pdf  text;
alter table presupuestos add column if not exists url_pptx text;
