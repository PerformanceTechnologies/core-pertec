-- Flota: documentación de cada vehículo, como en el Odoo de PERTEC.
--
--   flo_tipos_documento  la lista de documentos que se pide a todo vehículo, en dos secciones:
--                        «Documentos base del vehículo» y «Acreditación» (faena/minera).
--   flo_documentos       lo que tiene cada vehículo de esa lista (o uno agregado a mano):
--                        archivo en el bucket privado «flota», fecha de vencimiento y si
--                        «no aplica» para ese vehículo.
--
-- Las fechas de revisión técnica, permiso de circulación y SOAP que ya tenía cada vehículo
-- se copian a sus documentos. Se puede correr más de una vez.

create table if not exists public.flo_tipos_documento (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(trim(nombre)) > 0),
  seccion    text not null check (seccion in ('base', 'acreditacion')),
  -- Si vence (pide fecha). Los que no vencen solo piden el archivo.
  vence      boolean not null default true,
  orden      int not null default 0,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now(),
  unique (seccion, nombre)
);

create table if not exists public.flo_documentos (
  id              uuid primary key default gen_random_uuid(),
  vehiculo_id     uuid not null references public.flo_vehiculos(id) on delete cascade,
  tipo_id         uuid references public.flo_tipos_documento(id) on delete set null,
  seccion         text not null check (seccion in ('base', 'acreditacion')),
  nombre          text not null check (length(trim(nombre)) > 0),
  vence           date,
  archivo_ruta    text,
  archivo_nombre  text,
  no_aplica       boolean not null default false,
  notas           text,
  actualizado_por text,
  actualizado_en  timestamptz not null default now(),
  creado_en       timestamptz not null default now()
);
-- Un vehículo tiene a lo más una fila por tipo de la lista.
create unique index if not exists flo_documentos_tipo_uidx on public.flo_documentos (vehiculo_id, tipo_id) where tipo_id is not null;
create index if not exists flo_documentos_vehiculo_idx on public.flo_documentos (vehiculo_id);

alter table public.flo_tipos_documento enable row level security;
alter table public.flo_documentos      enable row level security;

insert into storage.buckets (id, name, public, file_size_limit)
values ('flota', 'flota', false, 4194304)
on conflict (id) do nothing;

-- La lista que usa PERTEC en Odoo.
insert into public.flo_tipos_documento (seccion, orden, nombre, vence) values
  ('base', 1,  'Padrón o certificado de inscripción del vehículo', false),
  ('base', 2,  'Permiso de circulación vigente', true),
  ('base', 3,  'SOAP vigente', true),
  ('base', 4,  'Revisión técnica vigente o certificado de homologación, según corresponda', true),
  ('base', 5,  'Certificado de gases/contaminantes, cuando aplique', true),
  ('base', 6,  'Certificado de anotaciones vigentes', true),
  ('base', 7,  'Factura/contrato/leasing', false),
  ('base', 8,  'Autorización de ingreso del vehículo/equipo a faena', true),
  ('base', 9,  'Check list preoperacional diario o por turno', true),
  ('base', 10, 'Registro de mantenciones preventivas y correctivas', false),
  ('base', 11, 'Plan de mantención según fabricante', false),
  ('base', 12, 'Certificación o inspección de elementos críticos', true),
  ('base', 13, 'Permiso interno de circulación o "pase vehicular" de la minera', true),
  ('base', 14, 'Procedimiento de trabajo seguro', false),
  ('acreditacion', 1, 'Autorización de ingreso del vehículo/equipo a faena', true),
  ('acreditacion', 2, 'Check list preoperacional diario o por turno', true),
  ('acreditacion', 3, 'Registro de mantenciones preventivas y correctivas', false),
  ('acreditacion', 4, 'Plan de mantención según fabricante', false),
  ('acreditacion', 5, 'Certificación o inspección de elementos críticos', true),
  ('acreditacion', 6, 'Permiso interno de circulación o "pase vehicular" de la minera', true),
  ('acreditacion', 7, 'Procedimiento de trabajo seguro', false)
on conflict (seccion, nombre) do nothing;

-- Las fechas que ya estaban en la ficha pasan a sus documentos.
insert into public.flo_documentos (vehiculo_id, tipo_id, seccion, nombre, vence)
select v.id, t.id, t.seccion, t.nombre,
       case t.nombre
         when 'Permiso de circulación vigente' then v.permiso_circulacion_vence
         when 'SOAP vigente' then v.soap_vence
         else v.revision_tecnica_vence
       end
from public.flo_vehiculos v
join public.flo_tipos_documento t on t.seccion = 'base' and t.nombre in (
  'Permiso de circulación vigente', 'SOAP vigente',
  'Revisión técnica vigente o certificado de homologación, según corresponda')
where case t.nombre
        when 'Permiso de circulación vigente' then v.permiso_circulacion_vence
        when 'SOAP vigente' then v.soap_vence
        else v.revision_tecnica_vence
      end is not null
on conflict (vehiculo_id, tipo_id) where tipo_id is not null do nothing;

notify pgrst, 'reload schema';
