-- Leads (CRM) y cotización profesional: cambios de base.
--
--   1. La aplicación «Leads» (antes «Comercial», dentro de Gestión financiera). Los datos siguen en las
--      mismas tablas fin_* (oportunidades, cotizaciones, proyectos, hitos): Leads es otra puerta, no otra base.
--      Quien ya tenía Gestión financiera recibe Leads para no perder su Comercial.
--   2. Datos de cada empresa para el encabezado y el pie del PDF de la cotización.
--   3. Contacto del lead y próximo paso; atención, plazo de entrega y forma de pago de la cotización;
--      a quién y cuándo se envió.
--
-- Se puede correr más de una vez.

-- ── 1. La aplicación ────────────────────────────────────────────────────────────────────────────
insert into public.aplicaciones (nombre, slug, url, tipo, icono, color, descripcion, estado, orden)
select 'Leads', 'leads', '/leads', 'interna', 'target', 'naranjo',
       'Oportunidades en tablero, cotizaciones en PDF con envío por correo y seguimiento comercial.',
       'activa', 13
where not exists (select 1 from public.aplicaciones where slug = 'leads');

insert into public.usuario_aplicaciones (usuario_id, aplicacion_id)
select ua.usuario_id, l.id
  from public.usuario_aplicaciones ua
  join public.aplicaciones f on f.id = ua.aplicacion_id and f.slug = 'gestion-financiera'
  join public.aplicaciones l on l.slug = 'leads'
on conflict do nothing;

-- ── 2. Datos de la empresa para el PDF ─────────────────────────────────────────────────────────
alter table public.empresas add column if not exists direccion          text;
alter table public.empresas add column if not exists giro               text;
alter table public.empresas add column if not exists telefono           text;
alter table public.empresas add column if not exists correo_comercial   text;
alter table public.empresas add column if not exists web                text;
alter table public.empresas add column if not exists datos_bancarios    text;
alter table public.empresas add column if not exists pie_cotizacion     text;
-- Prefijo del correlativo: COT-000001 en PERTEC, y el que cada empresa quiera en las otras.
alter table public.empresas add column if not exists prefijo_cotizacion text not null default 'COT'
  check (prefijo_cotizacion ~ '^[A-Z0-9]{2,6}$');

-- ── 3. Leads y cotizaciones ────────────────────────────────────────────────────────────────────
alter table public.fin_oportunidades add column if not exists contacto_nombre    text;
alter table public.fin_oportunidades add column if not exists contacto_correo    text;
alter table public.fin_oportunidades add column if not exists contacto_telefono  text;
alter table public.fin_oportunidades add column if not exists proximo_paso       text;
alter table public.fin_oportunidades add column if not exists proximo_paso_fecha date;

alter table public.fin_cotizaciones add column if not exists atencion       text;
alter table public.fin_cotizaciones add column if not exists correo_atencion text;
alter table public.fin_cotizaciones add column if not exists plazo_entrega  text;
alter table public.fin_cotizaciones add column if not exists forma_pago     text;
alter table public.fin_cotizaciones add column if not exists enviada_a      text;
alter table public.fin_cotizaciones add column if not exists enviada_en     timestamptz;

notify pgrst, 'reload schema';
