-- =============================================================================
--  Contratos: el sistema de contratos de core-ih, como plantilla para muchos contratos
-- =============================================================================
--
-- Es el esquema final de core-ih (33 migraciones) con dos cambios de fondo:
--
--  1. CADA DATO ES DE UN CONTRATO. Personas, vehículos, partidas, catálogos, plazos y
--     responsables llevan `contrato_id`. Lo que se identifica por el id de un archivo de
--     SharePoint (estados, comentarios, revisión) no lo necesita: ese id no se repite.
--
--  2. LO ÚNICO ES ÚNICO DENTRO DEL CONTRATO. La misma persona (RUT) o el mismo vehículo
--     (patente) pueden estar en dos contratos, y la numeración (#1, #2…) parte de cero en
--     cada uno.
--
-- Prefijo `ct_`: separa estas tablas de las del resto de core-pertec, que no llevan prefijo.
-- Todas con RLS activo y sin políticas: solo se llega con la service role desde el servidor.
--
-- Se corre UNA vez, en el SQL Editor de Supabase de core-pertec. Es idempotente.

-- -----------------------------------------------------------------------------
--  El contrato
-- -----------------------------------------------------------------------------

create table if not exists public.ct_contratos (
  id                  uuid primary key default gen_random_uuid(),
  -- Lo que va en la dirección: /contratos/<slug>. Se genera del nombre al crearlo.
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre              text not null check (char_length(trim(nombre)) between 1 and 120),
  cliente             text,
  numero              text,
  fecha_inicio        date,
  administrador       text,
  -- La dotación de personas que exige el contrato (la de vehículos va en ct_vehiculos_contrato).
  dotacion_requerida  integer check (dotacion_requerida is null or dotacion_requerida >= 0),
  -- Su carpeta en SharePoint, dentro de la carpeta raíz de contratos.
  carpeta             text not null,
  carpeta_item_id     text,
  carpeta_url         text,
  activo              boolean not null default true,
  creado_por          uuid references public.usuarios(id) on delete set null,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

alter table public.ct_contratos enable row level security;

-- Numeración por contrato: el siguiente número de ESE contrato, no un contador global.
-- Con un candado por contrato y tabla para que dos altas simultáneas no tomen el mismo.
create or replace function public.ct_numerar_por_contrato()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext(tg_table_name || ':' || new.contrato_id::text));
    execute format('select coalesce(max(numero), 0) + 1 from public.%I where contrato_id = $1', tg_table_name)
      into new.numero
      using new.contrato_id;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
--  Documentos generales (SharePoint)
-- -----------------------------------------------------------------------------

create table if not exists public.ct_responsables_externos (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references public.ct_contratos(id) on delete cascade,
  nombre       text not null,
  activo       boolean not null default true,
  orden        integer not null default 0
);
create unique index if not exists ct_responsables_externos_nombre
  on public.ct_responsables_externos (contrato_id, lower(trim(nombre)));
alter table public.ct_responsables_externos enable row level security;

create table if not exists public.ct_contratos_estados (
  item_id                 text primary key,
  ruta                    text not null,
  estado                  text not null default 'pendiente'
                            check (estado in ('pendiente', 'subido', 'no_aplica')),
  nota                    text,
  responsable_id          uuid references public.usuarios(id) on delete set null,
  responsable_externo_id  uuid references public.ct_responsables_externos(id) on delete set null,
  actualizado_por         uuid references public.usuarios(id) on delete set null,
  actualizado_en          timestamptz not null default now(),
  constraint ct_contratos_estados_un_responsable
    check (responsable_id is null or responsable_externo_id is null)
);
create index if not exists ct_contratos_estados_ruta on public.ct_contratos_estados (ruta);
create index if not exists ct_contratos_estados_responsable on public.ct_contratos_estados (responsable_id);
create index if not exists ct_contratos_estados_resp_externo on public.ct_contratos_estados (responsable_externo_id);
alter table public.ct_contratos_estados enable row level security;

create table if not exists public.ct_contratos_comentarios (
  item_id       text primary key,
  ruta          text not null,
  comentario    text not null,
  autor_id      uuid references public.usuarios(id) on delete set null,
  autor_nombre  text not null,
  creado_en     timestamptz not null default now()
);
create index if not exists ct_contratos_comentarios_ruta on public.ct_contratos_comentarios (ruta);
alter table public.ct_contratos_comentarios enable row level security;

create table if not exists public.ct_contratos_archivo_estados (
  item_id                 text primary key,
  ruta                    text not null,
  estado                  text not null check (estado in ('borrador', 'en_revision', 'validado')),
  actualizado_por         uuid references public.usuarios(id) on delete set null,
  actualizado_por_nombre  text,
  actualizado_en          timestamptz not null default now()
);
create index if not exists ct_contratos_archivo_estados_ruta on public.ct_contratos_archivo_estados (ruta);
alter table public.ct_contratos_archivo_estados enable row level security;

create table if not exists public.ct_contratos_plazos (
  contrato_id             uuid not null references public.ct_contratos(id) on delete cascade,
  modulo                  text not null check (modulo in
                            ('documentos-generales', 'acreditacion', 'acreditacion-vehiculos', 'logistica', 'gastos')),
  fecha_limite            date not null,
  actualizado_por         uuid references public.usuarios(id) on delete set null,
  actualizado_por_nombre  text,
  actualizado_en          timestamptz not null default now(),
  primary key (contrato_id, modulo)
);
alter table public.ct_contratos_plazos enable row level security;

create table if not exists public.ct_modulos_responsables (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid not null references public.ct_contratos(id) on delete cascade,
  modulo        text not null check (modulo in ('acreditacion', 'acreditacion-vehiculos', 'logistica', 'gastos')),
  usuario_id    uuid not null references public.usuarios(id) on delete cascade,
  asignado_por  uuid references public.usuarios(id) on delete set null,
  creado_en     timestamptz not null default now(),
  constraint ct_modulos_responsables_unico unique (contrato_id, modulo, usuario_id)
);
create index if not exists ct_modulos_responsables_usuario on public.ct_modulos_responsables (usuario_id);
alter table public.ct_modulos_responsables enable row level security;

-- -----------------------------------------------------------------------------
--  Acreditación Personas
-- -----------------------------------------------------------------------------

create table if not exists public.ct_acreditacion_tipos (
  id                 uuid primary key default gen_random_uuid(),
  contrato_id        uuid not null references public.ct_contratos(id) on delete cascade,
  codigo             text not null,
  nombre             text not null,
  grupo              text not null,
  orden              integer not null,
  tiene_vencimiento  boolean not null default false,
  activo             boolean not null default true,
  constraint ct_acreditacion_tipos_codigo unique (contrato_id, codigo)
);
alter table public.ct_acreditacion_tipos enable row level security;

create table if not exists public.ct_acreditacion_cargos (
  id                  uuid primary key default gen_random_uuid(),
  contrato_id         uuid not null references public.ct_contratos(id) on delete cascade,
  nombre              text not null check (char_length(trim(nombre)) between 1 and 80),
  activo              boolean not null default true,
  cantidad_requerida  integer check (cantidad_requerida is null or cantidad_requerida >= 0),
  creado_en           timestamptz not null default now()
);
create unique index if not exists ct_acreditacion_cargos_nombre_unico
  on public.ct_acreditacion_cargos (contrato_id, lower(trim(nombre)));
alter table public.ct_acreditacion_cargos enable row level security;

create table if not exists public.ct_acreditacion_cargo_tipos (
  cargo_id  uuid not null references public.ct_acreditacion_cargos(id) on delete cascade,
  tipo_id   uuid not null references public.ct_acreditacion_tipos(id) on delete cascade,
  primary key (cargo_id, tipo_id)
);
alter table public.ct_acreditacion_cargo_tipos enable row level security;

create table if not exists public.ct_acreditacion_personas (
  id                              uuid primary key default gen_random_uuid(),
  contrato_id                     uuid not null references public.ct_contratos(id) on delete cascade,
  numero                          integer,
  nombre                          text not null,
  rut                             text not null,
  cargo_id                        uuid not null references public.ct_acreditacion_cargos(id) on delete restrict,
  faena                           text,
  turno                           text,
  activo                          boolean not null default true,
  sin_contrato                    boolean not null default false,
  fecha_ingreso                   date,
  fecha_termino_1                 date,
  fecha_termino_2                 date,
  indefinido                      boolean not null default false,
  estado_civil                    text,
  fecha_nacimiento                date,
  nacionalidad                    text,
  correo                          text,
  telefono                        text,
  direccion                       text,
  comuna                          text,
  region                          text,
  contacto_emergencia_nombre      text,
  contacto_emergencia_parentesco  text,
  contacto_emergencia_telefono    text,
  banco                           text,
  tipo_cuenta                     text,
  numero_cuenta                   text,
  prevision_salud                 text,
  afp                             text,
  talla_polera                    text,
  talla_chaqueta                  text,
  talla_pantalon                  text,
  numero_zapato                   text,
  estado_web_control              text not null default 'sin_cargar'
                                    check (estado_web_control in
                                      ('sin_cargar', 'falta_contratos_examenes', 'falta_un_documento', 'al_dia')),
  wc_acreditado                   boolean not null default false,
  creado_en_buk                   boolean not null default false,
  numero_pase                     text,
  estado_pase                     text,
  observaciones                   text,
  carpeta_item_id                 text,
  carpeta_url                     text,
  creado_por                      uuid references public.usuarios(id) on delete set null,
  creado_en                       timestamptz not null default now(),
  actualizado_en                  timestamptz not null default now()
);
create unique index if not exists ct_acreditacion_personas_rut on public.ct_acreditacion_personas (contrato_id, rut);
create unique index if not exists ct_acreditacion_personas_numero on public.ct_acreditacion_personas (contrato_id, numero);
create index if not exists ct_acreditacion_personas_cargo on public.ct_acreditacion_personas (cargo_id);
drop trigger if exists ct_acreditacion_personas_numerar on public.ct_acreditacion_personas;
create trigger ct_acreditacion_personas_numerar
  before insert on public.ct_acreditacion_personas
  for each row execute function public.ct_numerar_por_contrato();
alter table public.ct_acreditacion_personas enable row level security;

create table if not exists public.ct_acreditacion_documentos (
  id                      uuid primary key default gen_random_uuid(),
  persona_id              uuid not null references public.ct_acreditacion_personas(id) on delete cascade,
  tipo_id                 uuid not null references public.ct_acreditacion_tipos(id) on delete restrict,
  estado                  text not null default 'pendiente'
                            check (estado in ('pendiente', 'cargado', 'observado', 'no_aplica')),
  requerido_extra         boolean not null default false,
  item_id                 text,
  archivo_nombre          text,
  archivo_url             text,
  cantidad_archivos       integer not null default 0,
  fecha_emision           date,
  fecha_vencimiento       date,
  nota                    text,
  actualizado_por         uuid references public.usuarios(id) on delete set null,
  actualizado_por_nombre  text,
  actualizado_en          timestamptz not null default now(),
  constraint ct_acreditacion_documentos_unico unique (persona_id, tipo_id)
);
create index if not exists ct_acreditacion_documentos_persona on public.ct_acreditacion_documentos (persona_id);
create index if not exists ct_acreditacion_documentos_vencimiento
  on public.ct_acreditacion_documentos (fecha_vencimiento) where fecha_vencimiento is not null;
alter table public.ct_acreditacion_documentos enable row level security;

create table if not exists public.ct_acreditacion_archivos (
  id                 uuid primary key default gen_random_uuid(),
  documento_id       uuid not null references public.ct_acreditacion_documentos(id) on delete cascade,
  persona_id         uuid not null references public.ct_acreditacion_personas(id) on delete cascade,
  item_id            text not null unique,
  nombre             text not null,
  url                text not null,
  subido_por         uuid references public.usuarios(id) on delete set null,
  subido_por_nombre  text,
  subido_en          timestamptz not null default now()
);
create index if not exists ct_acreditacion_archivos_documento on public.ct_acreditacion_archivos (documento_id, subido_en);
create index if not exists ct_acreditacion_archivos_persona on public.ct_acreditacion_archivos (persona_id);
alter table public.ct_acreditacion_archivos enable row level security;

create table if not exists public.ct_acreditacion_historial (
  id              bigint generated always as identity primary key,
  persona_id      uuid not null references public.ct_acreditacion_personas(id) on delete cascade,
  accion          text not null,
  detalle         text,
  usuario_id      uuid references public.usuarios(id) on delete set null,
  usuario_nombre  text not null,
  creado_en       timestamptz not null default now()
);
create index if not exists ct_acreditacion_historial_persona
  on public.ct_acreditacion_historial (persona_id, creado_en desc);
alter table public.ct_acreditacion_historial enable row level security;

-- -----------------------------------------------------------------------------
--  Logística y Gastos de arranque
-- -----------------------------------------------------------------------------

create table if not exists public.ct_arranque_categorias (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references public.ct_contratos(id) on delete cascade,
  modulo       text not null check (modulo in ('logistica', 'gastos')),
  nombre       text not null,
  orden        integer not null default 0,
  activo       boolean not null default true,
  presupuesto  bigint check (presupuesto is null or presupuesto >= 0),
  creado_en    timestamptz not null default now()
);
create unique index if not exists ct_arranque_categorias_nombre
  on public.ct_arranque_categorias (contrato_id, modulo, lower(nombre));
alter table public.ct_arranque_categorias enable row level security;

create table if not exists public.ct_arranque_partidas (
  id                      uuid primary key default gen_random_uuid(),
  contrato_id             uuid not null references public.ct_contratos(id) on delete cascade,
  numero                  integer,
  modulo                  text not null check (modulo in ('logistica', 'gastos')),
  categoria_id            uuid not null references public.ct_arranque_categorias(id) on delete restrict,
  descripcion             text not null,
  proveedor               text,
  referencia              text,
  estado                  text not null,
  fecha                   date,
  cantidad                integer not null default 1 check (cantidad >= 1),
  modalidad               text not null default 'cotizacion'
                            check (modalidad in ('cotizacion', 'compra_directa', 'otra_via')),
  monto_presupuestado     bigint check (monto_presupuestado is null or monto_presupuestado >= 0),
  monto_comprometido      bigint check (monto_comprometido is null or monto_comprometido >= 0),
  monto_real              bigint check (monto_real is null or monto_real >= 0),
  enlace                  text,
  notas                   text,
  responsable_id          uuid references public.usuarios(id) on delete set null,
  responsable_externo_id  uuid references public.ct_responsables_externos(id) on delete set null,
  partida_vinculada_id    uuid references public.ct_arranque_partidas(id) on delete set null,
  carpeta_item_id         text,
  carpeta_url             text,
  creado_por              text,
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now(),
  constraint ct_arranque_partidas_estado check (
    (modulo = 'logistica' and estado in ('por_solicitar', 'solicitado', 'confirmado', 'ejecutado', 'cancelado'))
    or
    (modulo = 'gastos' and estado in
      ('presupuestado', 'cotizando', 'cotizada', 'aprobado', 'comprometido', 'pagado', 'anulado'))
  ),
  constraint ct_arranque_partidas_un_responsable
    check (responsable_id is null or responsable_externo_id is null)
);
create unique index if not exists ct_arranque_partidas_numero on public.ct_arranque_partidas (contrato_id, numero);
create index if not exists ct_arranque_partidas_modulo_estado on public.ct_arranque_partidas (contrato_id, modulo, estado);
create index if not exists ct_arranque_partidas_categoria on public.ct_arranque_partidas (categoria_id);
create index if not exists ct_arranque_partidas_responsable on public.ct_arranque_partidas (responsable_id);
create index if not exists ct_arranque_partidas_resp_externo on public.ct_arranque_partidas (responsable_externo_id);
create index if not exists ct_arranque_partidas_vinculada
  on public.ct_arranque_partidas (partida_vinculada_id) where partida_vinculada_id is not null;
drop trigger if exists ct_arranque_partidas_numerar on public.ct_arranque_partidas;
create trigger ct_arranque_partidas_numerar
  before insert on public.ct_arranque_partidas
  for each row execute function public.ct_numerar_por_contrato();
alter table public.ct_arranque_partidas enable row level security;

-- El vínculo es entre Logística y Gastos DEL MISMO contrato.
create or replace function public.ct_arranque_validar_vinculo()
returns trigger
language plpgsql
as $$
declare
  v_modulo    text;
  v_contrato  uuid;
begin
  if new.partida_vinculada_id is null then
    return new;
  end if;
  if new.partida_vinculada_id = new.id then
    raise exception 'Una partida no puede vincularse consigo misma.';
  end if;
  select modulo, contrato_id into v_modulo, v_contrato
    from public.ct_arranque_partidas where id = new.partida_vinculada_id;
  if v_modulo is null then
    raise exception 'La partida a vincular no existe.';
  end if;
  if v_contrato <> new.contrato_id then
    raise exception 'Solo se puede vincular con una partida del mismo contrato.';
  end if;
  if v_modulo = new.modulo then
    raise exception 'El vínculo es entre Logística y Gastos: elige una partida del otro módulo.';
  end if;
  return new;
end;
$$;
drop trigger if exists ct_arranque_partidas_vinculo on public.ct_arranque_partidas;
create trigger ct_arranque_partidas_vinculo
  before insert or update of partida_vinculada_id, modulo on public.ct_arranque_partidas
  for each row execute function public.ct_arranque_validar_vinculo();

create table if not exists public.ct_arranque_cotizaciones (
  id                   uuid primary key default gen_random_uuid(),
  partida_id           uuid not null references public.ct_arranque_partidas(id) on delete cascade,
  proveedor            text not null,
  descripcion          text,
  cantidad             integer not null default 1 check (cantidad >= 1),
  moneda               text not null default 'CLP' check (moneda in ('CLP', 'UF', 'USD')),
  precio_unitario      numeric(14, 2) check (precio_unitario is null or precio_unitario >= 0),
  tipo_cambio          numeric(14, 4) not null default 1 check (tipo_cambio > 0),
  total_clp            bigint check (total_clp is null or total_clp >= 0),
  plazo_entrega_dias   integer check (plazo_entrega_dias is null or plazo_entrega_dias >= 0),
  garantia             text,
  condiciones_pago     text,
  vigencia_hasta       date,
  respuesta_esperada   date,
  estado               text not null default 'solicitada'
                         check (estado in ('solicitada', 'recibida', 'aprobada', 'descartada')),
  motivo_decision      text,
  por_confirmar        text,
  notas                text,
  carpeta_item_id      text,
  carpeta_url          text,
  aprobado_por         uuid references public.usuarios(id) on delete set null,
  aprobado_por_nombre  text,
  aprobado_en          timestamptz,
  creado_por           text,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  constraint ct_arranque_cotizaciones_precio check (
    estado in ('solicitada', 'descartada') or (precio_unitario is not null and total_clp is not null)
  )
);
create index if not exists ct_arranque_cotizaciones_partida on public.ct_arranque_cotizaciones (partida_id);
create unique index if not exists ct_arranque_cotizaciones_una_aprobada
  on public.ct_arranque_cotizaciones (partida_id) where estado = 'aprobada';
alter table public.ct_arranque_cotizaciones enable row level security;

create table if not exists public.ct_gastos_presupuesto (
  contrato_id      uuid primary key references public.ct_contratos(id) on delete cascade,
  monto_original   bigint check (monto_original is null or monto_original >= 0),
  monto_vigente    bigint check (monto_vigente is null or monto_vigente >= 0),
  actualizado_por  uuid references public.usuarios(id) on delete set null,
  actualizado_en   timestamptz not null default now()
);
alter table public.ct_gastos_presupuesto enable row level security;

create table if not exists public.ct_gastos_presupuesto_historial (
  id              bigint generated always as identity primary key,
  contrato_id     uuid not null references public.ct_contratos(id) on delete cascade,
  monto_anterior  bigint,
  monto_nuevo     bigint,
  motivo          text,
  usuario_id      uuid references public.usuarios(id) on delete set null,
  usuario_nombre  text not null,
  creado_en       timestamptz not null default now()
);
create index if not exists ct_gastos_presupuesto_historial_contrato
  on public.ct_gastos_presupuesto_historial (contrato_id, creado_en desc);
alter table public.ct_gastos_presupuesto_historial enable row level security;

create table if not exists public.ct_gastos_aprobadores (
  contrato_id    uuid not null references public.ct_contratos(id) on delete cascade,
  usuario_id     uuid not null references public.usuarios(id) on delete cascade,
  designado_por  uuid references public.usuarios(id) on delete set null,
  creado_en      timestamptz not null default now(),
  primary key (contrato_id, usuario_id)
);
alter table public.ct_gastos_aprobadores enable row level security;

-- Los tipos de cambio son del mundo, no de un contrato.
create table if not exists public.ct_gastos_tipos_de_cambio (
  moneda           text primary key check (moneda in ('UF', 'USD')),
  valor            numeric(14, 4) not null check (valor > 0),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
alter table public.ct_gastos_tipos_de_cambio enable row level security;

create or replace function public.ct_gastos_aprobar_cotizacion(
  p_cotizacion  uuid,
  p_usuario     uuid,
  p_nombre      text,
  p_motivo      text
) returns void
language plpgsql
as $$
declare
  v_partida  uuid;
  v_total    bigint;
  v_estado   text;
begin
  select partida_id, total_clp, estado
    into v_partida, v_total, v_estado
    from public.ct_arranque_cotizaciones
   where id = p_cotizacion
   for update;
  if not found then
    raise exception 'La cotización ya no existe.';
  end if;
  if v_estado not in ('recibida', 'aprobada') or v_total is null then
    raise exception 'Solo se puede aprobar una cotización recibida, con su precio.';
  end if;
  update public.ct_arranque_cotizaciones
     set estado = 'recibida', actualizado_en = now()
   where partida_id = v_partida and estado = 'aprobada' and id <> p_cotizacion;
  update public.ct_arranque_cotizaciones
     set estado = 'aprobada',
         motivo_decision = nullif(trim(coalesce(p_motivo, '')), ''),
         aprobado_por = p_usuario,
         aprobado_por_nombre = p_nombre,
         aprobado_en = now(),
         actualizado_en = now()
   where id = p_cotizacion;
  update public.ct_arranque_partidas
     set monto_comprometido = v_total,
         estado = case
           when estado in ('presupuestado', 'cotizando', 'cotizada') then 'aprobado'
           else estado
         end,
         actualizado_en = now()
   where id = v_partida;
end;
$$;
revoke execute on function public.ct_gastos_aprobar_cotizacion(uuid, uuid, text, text)
  from public, anon, authenticated;

-- Los cursos y exámenes de una persona (van después de las partidas: un curso puede llevar su factura).
create table if not exists public.ct_acreditacion_cursos (
  id                  uuid primary key default gen_random_uuid(),
  persona_id          uuid not null references public.ct_acreditacion_personas(id) on delete cascade,
  tipo                text not null default 'curso' check (tipo in ('curso', 'examen')),
  curso               text not null,
  estado              text not null default 'reservado' check (estado in ('reservado', 'realizado', 'cancelado')),
  fecha               date,
  hora                time,
  lugar               text,
  resultado           text,
  nota                text,
  documento_tipo_id   uuid references public.ct_acreditacion_tipos(id) on delete set null,
  partida_gasto_id    uuid references public.ct_arranque_partidas(id) on delete set null,
  factura_plazo_dias  integer check (factura_plazo_dias is null or factura_plazo_dias between 1 and 365),
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  constraint ct_acreditacion_cursos_resultado_valido check (
    resultado is null or (resultado in ('aprobado', 'reprobado') and estado = 'realizado')
  ),
  constraint ct_acreditacion_cursos_hora_con_fecha check (hora is null or fecha is not null)
);
create unique index if not exists ct_acreditacion_cursos_reserva_unica
  on public.ct_acreditacion_cursos (persona_id, tipo, lower(trim(curso))) where estado = 'reservado';
create index if not exists ct_acreditacion_cursos_reservados
  on public.ct_acreditacion_cursos (fecha) where estado = 'reservado';
create unique index if not exists ct_acreditacion_cursos_gasto_unico
  on public.ct_acreditacion_cursos (partida_gasto_id) where partida_gasto_id is not null;
create index if not exists ct_acreditacion_cursos_documento
  on public.ct_acreditacion_cursos (documento_tipo_id) where documento_tipo_id is not null;
alter table public.ct_acreditacion_cursos enable row level security;

-- -----------------------------------------------------------------------------
--  Acreditación Vehículos
-- -----------------------------------------------------------------------------

create table if not exists public.ct_vehiculos_contrato (
  contrato_id         uuid primary key references public.ct_contratos(id) on delete cascade,
  dotacion_requerida  integer check (dotacion_requerida is null or dotacion_requerida >= 0),
  actualizado_en      timestamptz not null default now()
);
alter table public.ct_vehiculos_contrato enable row level security;

create table if not exists public.ct_vehiculos_tipos (
  id                 uuid primary key default gen_random_uuid(),
  contrato_id        uuid not null references public.ct_contratos(id) on delete cascade,
  codigo             text not null,
  nombre             text not null,
  grupo              text not null,
  orden              integer not null,
  tiene_vencimiento  boolean not null default false,
  activo             boolean not null default true,
  constraint ct_vehiculos_tipos_codigo unique (contrato_id, codigo)
);
alter table public.ct_vehiculos_tipos enable row level security;

create table if not exists public.ct_vehiculos_categorias (
  id                  uuid primary key default gen_random_uuid(),
  contrato_id         uuid not null references public.ct_contratos(id) on delete cascade,
  nombre              text not null check (char_length(trim(nombre)) between 1 and 80),
  activo              boolean not null default true,
  cantidad_requerida  integer check (cantidad_requerida is null or cantidad_requerida >= 0),
  creado_en           timestamptz not null default now()
);
create unique index if not exists ct_vehiculos_categorias_nombre_unico
  on public.ct_vehiculos_categorias (contrato_id, lower(trim(nombre)));
alter table public.ct_vehiculos_categorias enable row level security;

create table if not exists public.ct_vehiculos_categoria_tipos (
  categoria_id  uuid not null references public.ct_vehiculos_categorias(id) on delete cascade,
  tipo_id       uuid not null references public.ct_vehiculos_tipos(id) on delete cascade,
  primary key (categoria_id, tipo_id)
);
alter table public.ct_vehiculos_categoria_tipos enable row level security;

create table if not exists public.ct_vehiculos (
  id                  uuid primary key default gen_random_uuid(),
  contrato_id         uuid not null references public.ct_contratos(id) on delete cascade,
  numero              integer,
  patente             text not null,
  categoria_id        uuid not null references public.ct_vehiculos_categorias(id) on delete restrict,
  activo              boolean not null default true,
  marca               text,
  modelo              text,
  anio                text,
  color               text,
  vin                 text,
  propietario         text,
  conductor           text,
  faena               text,
  gps                 text,
  fecha_ingreso       date,
  estado_web_control  text not null default 'sin_cargar'
                        check (estado_web_control in ('sin_cargar', 'en_revision', 'observado', 'al_dia')),
  wc_acreditado       boolean not null default false,
  observaciones       text,
  carpeta_item_id     text,
  carpeta_url         text,
  creado_por          uuid references public.usuarios(id) on delete set null,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create unique index if not exists ct_vehiculos_patente on public.ct_vehiculos (contrato_id, patente);
create unique index if not exists ct_vehiculos_numero on public.ct_vehiculos (contrato_id, numero);
create index if not exists ct_vehiculos_categoria on public.ct_vehiculos (categoria_id);
drop trigger if exists ct_vehiculos_numerar on public.ct_vehiculos;
create trigger ct_vehiculos_numerar
  before insert on public.ct_vehiculos
  for each row execute function public.ct_numerar_por_contrato();
alter table public.ct_vehiculos enable row level security;

create table if not exists public.ct_vehiculos_documentos (
  id                      uuid primary key default gen_random_uuid(),
  vehiculo_id             uuid not null references public.ct_vehiculos(id) on delete cascade,
  tipo_id                 uuid not null references public.ct_vehiculos_tipos(id) on delete restrict,
  estado                  text not null default 'pendiente'
                            check (estado in ('pendiente', 'cargado', 'observado', 'no_aplica')),
  requerido_extra         boolean not null default false,
  item_id                 text,
  archivo_nombre          text,
  archivo_url             text,
  cantidad_archivos       integer not null default 0,
  fecha_emision           date,
  fecha_vencimiento       date,
  nota                    text,
  actualizado_por         uuid references public.usuarios(id) on delete set null,
  actualizado_por_nombre  text,
  actualizado_en          timestamptz not null default now(),
  constraint ct_vehiculos_documentos_unico unique (vehiculo_id, tipo_id)
);
create index if not exists ct_vehiculos_documentos_vehiculo on public.ct_vehiculos_documentos (vehiculo_id);
create index if not exists ct_vehiculos_documentos_vencimiento
  on public.ct_vehiculos_documentos (fecha_vencimiento) where fecha_vencimiento is not null;
alter table public.ct_vehiculos_documentos enable row level security;

create table if not exists public.ct_vehiculos_archivos (
  id                 uuid primary key default gen_random_uuid(),
  documento_id       uuid not null references public.ct_vehiculos_documentos(id) on delete cascade,
  vehiculo_id        uuid not null references public.ct_vehiculos(id) on delete cascade,
  item_id            text not null unique,
  nombre             text not null,
  url                text not null,
  subido_por         uuid references public.usuarios(id) on delete set null,
  subido_por_nombre  text,
  subido_en          timestamptz not null default now()
);
create index if not exists ct_vehiculos_archivos_documento on public.ct_vehiculos_archivos (documento_id, subido_en);
create index if not exists ct_vehiculos_archivos_vehiculo on public.ct_vehiculos_archivos (vehiculo_id);
alter table public.ct_vehiculos_archivos enable row level security;

create table if not exists public.ct_vehiculos_historial (
  id              bigint generated always as identity primary key,
  vehiculo_id     uuid not null references public.ct_vehiculos(id) on delete cascade,
  accion          text not null,
  detalle         text,
  usuario_id      uuid references public.usuarios(id) on delete set null,
  usuario_nombre  text not null,
  creado_en       timestamptz not null default now()
);
create index if not exists ct_vehiculos_historial_vehiculo on public.ct_vehiculos_historial (vehiculo_id, creado_en desc);
alter table public.ct_vehiculos_historial enable row level security;

-- -----------------------------------------------------------------------------
--  Vistas (con security_invoker: respetan RLS como una consulta directa)
-- -----------------------------------------------------------------------------

create or replace view public.ct_acreditacion_uso_tipos_v with (security_invoker = true) as
select tipo_id, count(*)::integer as personas
from public.ct_acreditacion_documentos
group by tipo_id;

create or replace view public.ct_acreditacion_uso_cargos_v with (security_invoker = true) as
select cargo_id, count(*)::integer as personas
from public.ct_acreditacion_personas
group by cargo_id;

-- Lo que vence en 30 días o ya venció, por contrato.
create or replace view public.ct_acreditacion_alertas_v with (security_invoker = true) as
select p.contrato_id, p.id as persona_id, 'documento'::text as tipo, d.tipo_id::text as referencia,
       d.fecha_vencimiento as fecha
from public.ct_acreditacion_documentos d
join public.ct_acreditacion_personas p on p.id = d.persona_id and p.activo
join public.ct_acreditacion_tipos t on t.id = d.tipo_id and t.activo
where d.estado = 'cargado'
  and d.fecha_vencimiento is not null
  and d.fecha_vencimiento <= (timezone('America/Santiago', now()))::date + 30
  and (
    d.requerido_extra
    or exists (
      select 1 from public.ct_acreditacion_cargo_tipos ct
      where ct.cargo_id = p.cargo_id and ct.tipo_id = d.tipo_id
    )
  )
union all
select p.contrato_id, p.id, 'contrato'::text, null::text,
       coalesce(p.fecha_termino_2, p.fecha_termino_1)
from public.ct_acreditacion_personas p
where p.activo
  and not p.indefinido
  and coalesce(p.fecha_termino_2, p.fecha_termino_1) is not null
  and coalesce(p.fecha_termino_2, p.fecha_termino_1) <= (timezone('America/Santiago', now()))::date + 30;

create or replace view public.ct_vehiculos_uso_tipos_v with (security_invoker = true) as
select tipo_id, count(*)::integer as vehiculos
from public.ct_vehiculos_documentos
group by tipo_id;

create or replace view public.ct_vehiculos_uso_categorias_v with (security_invoker = true) as
select categoria_id, count(*)::integer as vehiculos
from public.ct_vehiculos
group by categoria_id;

create or replace view public.ct_vehiculos_alertas_v with (security_invoker = true) as
select v.contrato_id, v.id as vehiculo_id, d.tipo_id::text as referencia, d.fecha_vencimiento as fecha
from public.ct_vehiculos_documentos d
join public.ct_vehiculos v on v.id = d.vehiculo_id and v.activo
join public.ct_vehiculos_tipos t on t.id = d.tipo_id and t.activo
where d.estado = 'cargado'
  and d.fecha_vencimiento is not null
  and d.fecha_vencimiento <= (timezone('America/Santiago', now()))::date + 30
  and (
    d.requerido_extra
    or exists (
      select 1 from public.ct_vehiculos_categoria_tipos ct
      where ct.categoria_id = v.categoria_id and ct.tipo_id = d.tipo_id
    )
  );

-- -----------------------------------------------------------------------------
--  La plantilla: lo que trae cada contrato nuevo
-- -----------------------------------------------------------------------------
--
-- Los catálogos con los que partió DCH en core-ih: tipos de documento de personas y de
-- vehículos, cargos con sus exigencias, tipos de vehículo y las categorías de Logística y
-- Gastos. Cada contrato recibe su propia copia y la ajusta sin tocar los demás.
--
-- Idempotente: si el contrato ya tiene algo de un catálogo, ese catálogo no se vuelve a sembrar.

create or replace function public.ct_preparar_contrato(p_contrato uuid)
returns void
language plpgsql
as $$
begin
  insert into public.ct_vehiculos_contrato (contrato_id) values (p_contrato) on conflict do nothing;
  insert into public.ct_gastos_presupuesto (contrato_id) values (p_contrato) on conflict do nothing;

  if not exists (select 1 from public.ct_acreditacion_tipos where contrato_id = p_contrato) then
    insert into public.ct_acreditacion_tipos (contrato_id, codigo, nombre, grupo, orden, tiene_vencimiento) values
      (p_contrato, 'contrato_anexo',             'Contrato laboral + anexo',           'Contractual',              1,  false),
      (p_contrato, 'firma_riosh',                'Firma RIOSH',                        'Contractual',              2,  false),
      (p_contrato, 'odi_irl',                    'ODI - IRL',                          'Contractual',              3,  false),
      (p_contrato, 'finiquito_anterior',         'Finiquito anterior',                 'Contractual',              4,  false),
      (p_contrato, 'cedula',                     'Cédula de identidad',                'Identidad y antecedentes', 5,  false),
      (p_contrato, 'foto',                       'Foto',                               'Identidad y antecedentes', 6,  false),
      (p_contrato, 'antecedentes',               'Antecedentes',                       'Identidad y antecedentes', 7,  true),
      (p_contrato, 'certificado_titulo',         'Certificado de título',              'Identidad y antecedentes', 8,  false),
      (p_contrato, 'cv',                         'CV actualizado',                     'Identidad y antecedentes', 9,  false),
      (p_contrato, 'consentimiento_oh_drogas',   'Consentimiento Control OH y Drogas', 'Salud ocupacional',        10, false),
      (p_contrato, 'examen_preocupacional',      'Examen preocupacional',              'Salud ocupacional',        11, true),
      (p_contrato, 'examen_ayd',                 'Examen A&D',                         'Salud ocupacional',        12, true),
      (p_contrato, 'examen_audiometria',         'Examen audiometría',                 'Salud ocupacional',        13, true),
      (p_contrato, 'rx_torax',                   'RX Tórax',                           'Salud ocupacional',        14, true),
      (p_contrato, 'induccion_trabajador_nuevo', 'Inducción trabajador nuevo',         'Inducciones',              15, false),
      (p_contrato, 'induccion_manejo_defensivo', 'Inducción manejo defensivo',         'Inducciones',              16, false),
      (p_contrato, 'cotizaciones',               '12 últimas cotizaciones',            'Previsional',              17, false),
      (p_contrato, 'registro_epp',               'Registro de entrega de EPP',         'Seguros y EPP',            18, false),
      (p_contrato, 'poliza_muerte_accidental',   'Póliza de muerte y accidental',      'Seguros y EPP',            19, true),
      (p_contrato, 'poliza_complementario',      'Póliza seguro complementario',       'Seguros y EPP',            20, true),
      (p_contrato, 'licencia_conducir',          'Licencia de conducir',               'Conducción',               21, true),
      (p_contrato, 'hoja_vida_conductor',        'Hoja de vida del conductor',         'Conducción',               22, true),
      (p_contrato, 'licencia_interna',           'Licencia interna',                   'Conducción',               23, true),
      (p_contrato, 'carta_compromiso_conductor', 'Carta compromiso conductor',         'Conducción',               24, false),
      (p_contrato, 'psicosensotecnico',          'Psicosensotécnico riguroso',         'Conducción',               25, true);
  end if;

  if not exists (select 1 from public.ct_acreditacion_cargos where contrato_id = p_contrato) then
    insert into public.ct_acreditacion_cargos (contrato_id, nombre) values
      (p_contrato, 'Administrador de Contrato'),
      (p_contrato, 'Supervisor(a)'),
      (p_contrato, 'Activador');

    insert into public.ct_acreditacion_cargo_tipos (cargo_id, tipo_id)
    select c.id, t.id
    from public.ct_acreditacion_cargos c
    join public.ct_acreditacion_tipos t on t.contrato_id = c.contrato_id
    where c.contrato_id = p_contrato
      and c.nombre = 'Administrador de Contrato'
      and t.codigo not in ('licencia_interna', 'carta_compromiso_conductor');

    insert into public.ct_acreditacion_cargo_tipos (cargo_id, tipo_id)
    select c.id, t.id
    from public.ct_acreditacion_cargos c
    join public.ct_acreditacion_tipos t on t.contrato_id = c.contrato_id
    where c.contrato_id = p_contrato
      and c.nombre in ('Supervisor(a)', 'Activador')
      and t.codigo in (
        'contrato_anexo', 'firma_riosh', 'odi_irl', 'consentimiento_oh_drogas',
        'certificado_titulo', 'cedula', 'finiquito_anterior',
        'induccion_trabajador_nuevo', 'induccion_manejo_defensivo', 'foto', 'cv'
      );
  end if;

  if not exists (select 1 from public.ct_vehiculos_tipos where contrato_id = p_contrato) then
    insert into public.ct_vehiculos_tipos (contrato_id, codigo, nombre, grupo, orden, tiene_vencimiento) values
      (p_contrato, 'padron',                 'Padrón / certificado de inscripción',        'Identificación y propiedad', 1,  false),
      (p_contrato, 'permiso_circulacion',    'Permiso de circulación',                     'Identificación y propiedad', 2,  true),
      (p_contrato, 'contrato_arriendo',      'Contrato de arriendo o título de propiedad', 'Identificación y propiedad', 3,  false),
      (p_contrato, 'fotografias',            'Fotografías del vehículo',                   'Identificación y propiedad', 4,  false),
      (p_contrato, 'soap',                   'Seguro obligatorio (SOAP)',                  'Seguros',                    5,  true),
      (p_contrato, 'seguro_rc',              'Seguro de responsabilidad civil',            'Seguros',                    6,  true),
      (p_contrato, 'seguro_complementario',  'Póliza de seguro complementario',            'Seguros',                    7,  true),
      (p_contrato, 'revision_tecnica',       'Revisión técnica',                           'Revisiones',                 8,  true),
      (p_contrato, 'certificado_gases',      'Certificado de emisiones (gases)',           'Revisiones',                 9,  true),
      (p_contrato, 'certificado_mantencion', 'Certificado de mantención',                  'Revisiones',                 10, true),
      (p_contrato, 'inspeccion_seguridad',   'Inspección de seguridad',                    'Revisiones',                 11, true),
      (p_contrato, 'certificado_gps',        'Certificado de GPS / monitoreo',             'Equipamiento y seguridad',   12, false),
      (p_contrato, 'equipamiento_seguridad', 'Checklist de equipamiento de seguridad',     'Equipamiento y seguridad',   13, true),
      (p_contrato, 'licencia_conductor',     'Licencia del conductor asignado',            'Conductor',                  14, true),
      (p_contrato, 'credencial_conduccion',  'Autorización de conducción en faena',        'Conductor',                  15, true);
  end if;

  if not exists (select 1 from public.ct_vehiculos_categorias where contrato_id = p_contrato) then
    insert into public.ct_vehiculos_categorias (contrato_id, nombre) values
      (p_contrato, 'Camioneta'),
      (p_contrato, 'Camión'),
      (p_contrato, 'Bus / minibús'),
      (p_contrato, 'Furgón'),
      (p_contrato, 'Equipo móvil');

    insert into public.ct_vehiculos_categoria_tipos (categoria_id, tipo_id)
    select c.id, t.id
    from public.ct_vehiculos_categorias c
    join public.ct_vehiculos_tipos t on t.contrato_id = c.contrato_id
    where c.contrato_id = p_contrato
      and not (c.nombre = 'Equipo móvil'
               and t.codigo in ('soap', 'revision_tecnica', 'certificado_gases', 'permiso_circulacion'));
  end if;

  if not exists (select 1 from public.ct_arranque_categorias where contrato_id = p_contrato) then
    insert into public.ct_arranque_categorias (contrato_id, modulo, nombre, orden) values
      (p_contrato, 'logistica', 'Traslado de personal',               1),
      (p_contrato, 'logistica', 'Alojamiento',                        2),
      (p_contrato, 'logistica', 'Alimentación',                       3),
      (p_contrato, 'logistica', 'Transporte de equipos y materiales', 4),
      (p_contrato, 'logistica', 'Vehículos y combustible',            5),
      (p_contrato, 'logistica', 'Instalaciones de faena',             6),
      (p_contrato, 'logistica', 'Bodega e insumos',                   7),
      (p_contrato, 'logistica', 'Comunicaciones y TI',                8),
      (p_contrato, 'gastos',    'EPP y uniformes',                    1),
      (p_contrato, 'gastos',    'Exámenes y salud ocupacional',       2),
      (p_contrato, 'gastos',    'Acreditaciones y cursos',            3),
      (p_contrato, 'gastos',    'Equipos y herramientas',             4),
      (p_contrato, 'gastos',    'Arriendos',                          5),
      (p_contrato, 'gastos',    'Garantías y pólizas',                6),
      (p_contrato, 'gastos',    'Gastos administrativos y legales',   7),
      (p_contrato, 'gastos',    'Otros',                              8);
  end if;
end;
$$;
revoke execute on function public.ct_preparar_contrato(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
--  En el menú: «Contratos», justo debajo de Panel Odoo
-- -----------------------------------------------------------------------------

do $$
declare
  v_orden integer;
begin
  if exists (select 1 from public.aplicaciones where slug = 'contratos') then
    return;
  end if;
  select orden into v_orden from public.aplicaciones where slug = 'panel-odoo';
  v_orden := coalesce(v_orden, 0);

  update public.aplicaciones set orden = orden + 1 where orden > v_orden;

  insert into public.aplicaciones (nombre, slug, url, tipo, icono, color, descripcion, estado, orden)
  values (
    'Contratos',
    'contratos',
    '/contratos',
    'interna',
    'clipboard-check',
    'naranjo',
    'Cada contrato con sus documentos en SharePoint, acreditación de personas y vehículos, logística y gastos de arranque.',
    'activa',
    v_orden + 1
  );
end
$$;
