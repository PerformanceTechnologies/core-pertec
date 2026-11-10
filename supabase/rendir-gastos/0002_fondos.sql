-- =============================================================================
--  Rendir Gastos — Fondos por rendir (rediseño)
--
--  Agrega al módulo:
--    · rg_roles          quién valida, asigna, transfiere (tesorería), revisa o administra, por empresa
--    · rg_parametros     umbral de aviso, plazo de rendición, etc., por empresa
--    · rg_fondos         el dinero que se entrega a una persona para rendir
--    · rg_aprobaciones   cada decisión de validadores y revisores
--    · rg_movimientos    el LIBRO: solo se agregan filas (nunca se editan ni se borran)
--    · rg_auditoria      cada cambio de estado de fondos e informes
--  Y a la tabla de siempre (rendiciones = los «informes»): el fondo al que pertenece, los
--  estados nuevos del cierre y el ciclo de revisión.
--
--  Las rendiciones que ya existen NO cambian: quedan como informes antiguos, sin fondo.
--  Se puede correr más de una vez.
-- =============================================================================

-- ---------- Roles del módulo --------------------------------------------------
create table if not exists public.rg_roles (
  empresa_id uuid not null,
  correo     text not null,
  rol        text not null check (rol in ('validador', 'asignador', 'tesoreria', 'revisor', 'administrador')),
  creado_en  timestamptz not null default now(),
  primary key (empresa_id, correo, rol)
);
alter table public.rg_roles enable row level security;

-- ---------- Parámetros --------------------------------------------------------
create table if not exists public.rg_parametros (
  empresa_id                uuid primary key,
  umbral_aviso_limite       numeric not null default 0.9,   -- 0,9 = avisar al 90 % del fondo
  plazo_rendicion_dias      int     not null default 30,
  max_informes_abiertos     int     not null default 1,
  bloquear_con_vencidos     boolean not null default true,
  umbral_validacion_directa numeric(18,0),                  -- null = las asignaciones directas no piden validación
  actualizado_en            timestamptz not null default now()
);
alter table public.rg_parametros enable row level security;

-- ---------- Fondos ------------------------------------------------------------
create table if not exists public.rg_fondos (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null,
  codigo             text not null,
  rendidor_correo    text not null,
  rendidor_nombre    text,
  origen             text not null check (origen in ('solicitud', 'directa')),
  motivo             text,
  centro_costo       text,
  fecha_estimada     date,
  monto_solicitado   numeric(18,0),
  monto_autorizado   numeric(18,0),
  es_fijo            boolean not null default false,
  monto_fijo         numeric(18,0),
  -- Lo que Tesorería tiene que transferir ahora: el fondo completo, o en una reposición solo la diferencia.
  monto_por_transferir numeric(18,0),
  estado             text not null check (estado in (
                       'en_validacion', 'rechazado', 'validado', 'por_transferir', 'activo',
                       'devolucion_pendiente', 'cerrado', 'cerrado_con_saldo', 'anulado')),
  solicitado_por     text,
  asignado_por       text,
  asignado_en        timestamptz,
  activado_en        timestamptz,
  vence_en           date,
  cerrado_en         timestamptz,
  motivo_rechazo     text,
  motivo_anulacion   text,
  -- Devolución de saldo informada por quien rinde, a la espera de que Tesorería la confirme.
  devolucion_monto      numeric(18,0),
  devolucion_referencia text,
  devolucion_informada_en timestamptz,
  ciclo              int not null default 1,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index if not exists rg_fondos_empresa_estado on public.rg_fondos (empresa_id, estado);
create index if not exists rg_fondos_rendidor on public.rg_fondos (empresa_id, rendidor_correo);
alter table public.rg_fondos enable row level security;

-- ---------- Aprobaciones (validaciones de solicitudes y revisiones de informes) ---
create table if not exists public.rg_aprobaciones (
  id          uuid primary key default gen_random_uuid(),
  entidad     text not null check (entidad in ('fondo', 'informe')),
  entidad_id  uuid not null,
  aprobador   text not null,
  decision    text not null check (decision in ('aprueba', 'rechaza', 'observa')),
  comentario  text,
  fecha       timestamptz not null default now()
);
create index if not exists rg_aprobaciones_entidad on public.rg_aprobaciones (entidad, entidad_id);
alter table public.rg_aprobaciones enable row level security;

-- ---------- Libro de movimientos (solo se agrega) ------------------------------
create table if not exists public.rg_movimientos (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null,
  fondo_id            uuid not null references public.rg_fondos(id),
  informe_id          uuid,
  boleta_id           text,          -- id del gasto dentro del informe
  tipo                text not null check (tipo in ('TRANSFERENCIA_FONDO', 'GASTO', 'REEMBOLSO', 'DEVOLUCION_SALDO', 'REPOSICION', 'AJUSTE', 'ANULACION')),
  monto               numeric(18,0) not null check (monto >= 0),
  signo               smallint not null check (signo in (1, -1)),
  saldo_resultante    numeric(18,0) not null,
  usuario             text not null,
  fecha               timestamptz not null default now(),
  referencia_banco    text,
  comprobante         text,
  estado_conciliacion text not null default 'no_aplica' check (estado_conciliacion in ('pendiente', 'conciliado', 'no_aplica')),
  movimiento_banco_id uuid,          -- enlace futuro a la cartola
  compra_id           uuid,          -- enlace futuro al módulo de compras
  motivo              text
);
create index if not exists rg_movimientos_fondo on public.rg_movimientos (fondo_id, fecha);
create index if not exists rg_movimientos_conciliacion on public.rg_movimientos (empresa_id, estado_conciliacion);
alter table public.rg_movimientos enable row level security;

-- El libro no se toca: solo se puede marcar la conciliación (estado y enlace al banco).
create or replace function public.rg_movimientos_inmutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'El libro de movimientos no se borra: registra un contra-asiento.';
  end if;
  if (new.fondo_id, new.informe_id, new.boleta_id, new.tipo, new.monto, new.signo, new.saldo_resultante, new.usuario, new.fecha)
     is distinct from
     (old.fondo_id, old.informe_id, old.boleta_id, old.tipo, old.monto, old.signo, old.saldo_resultante, old.usuario, old.fecha) then
    raise exception 'El libro de movimientos no se edita: registra un contra-asiento.';
  end if;
  return new;
end $$;
drop trigger if exists rg_movimientos_inmutable on public.rg_movimientos;
create trigger rg_movimientos_inmutable before update or delete on public.rg_movimientos
  for each row execute function public.rg_movimientos_inmutable();

-- ---------- Auditoría de estados ---------------------------------------------
create table if not exists public.rg_auditoria (
  id          uuid primary key default gen_random_uuid(),
  entidad     text not null check (entidad in ('fondo', 'informe')),
  entidad_id  uuid not null,
  desde       text,
  hacia       text not null,
  usuario     text not null,
  comentario  text,
  fecha       timestamptz not null default now()
);
create index if not exists rg_auditoria_entidad on public.rg_auditoria (entidad, entidad_id, fecha);
alter table public.rg_auditoria enable row level security;

-- ---------- Informes (la tabla de siempre) -------------------------------------
alter table public.rendiciones
  add column if not exists fondo_id       uuid references public.rg_fondos(id),
  add column if not exists empresa_id     uuid,
  add column if not exists ciclo_revision int not null default 0,
  add column if not exists cerrada_en     timestamptz;
create index if not exists rendiciones_fondo on public.rendiciones (fondo_id);

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.rendiciones'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%estado%'
  loop
    execute format('alter table public.rendiciones drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.rendiciones
  add constraint rendiciones_estado_check
  check (estado in ('borrador', 'enviada', 'aprobada', 'rechazada', 'pagada', 'cargada_odoo',
                    'reembolso_pendiente', 'reembolsada', 'cerrada', 'anulada'));

-- La vista de la lista, ahora con el fondo.
drop view if exists public.rendiciones_resumen;
create view public.rendiciones_resumen
with (security_invoker = true) as
select
  r.id,
  r.creado_por,
  r.rinde_correo,
  r.nombre_quien_rinde,
  r.monto_asignado,
  r.titulo_rendicion,
  r.estado,
  jsonb_array_length(coalesce(r.gastos, '[]'::jsonb))                                   as cantidad_gastos,
  coalesce((select sum((g->>'total')::numeric) from jsonb_array_elements(r.gastos) g), 0) as total_gastos,
  r.enviada_en,
  r.revisada_en,
  r.motivo_rechazo,
  r.pagada_en,
  r.creado_en,
  r.fondo_id,
  r.empresa_id
from public.rendiciones r;

notify pgrst, 'reload schema';
