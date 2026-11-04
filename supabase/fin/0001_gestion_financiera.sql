-- Gestión financiera (CRM comercial, ventas y cobranza, compras y pagos, tesorería, factoring,
-- flujo de caja, proyectos y contabilidad). Especificación: docs/finanzas/.
--
-- Reglas de esta migración:
--   · SOLO crea cosas nuevas (tablas fin_*, una función, un bucket y la aplicación). No toca ninguna
--     tabla existente: Contactos (finanzas_contactos) e Inventario (inv_productos) solo se
--     referencian por llave foránea.
--   · Toda tabla lleva empresa_id (PERTEC, Zeus Mining, Performance Service): una empresa nunca ve
--     lo de otra. El servidor filtra siempre por la empresa activa.
--   · RLS encendido y sin políticas, como el resto del Core: solo entra el servidor (service role).
--   · Las transacciones parten vacías. Solo se cargan catálogos: parámetros, categorías de
--     movimiento, plan de cuentas plantilla y el proyecto «General» de cada empresa.
--
-- Se puede correr más de una vez.

-- ── Numeración correlativa por empresa y tipo (COT-000123, OC-000045…) ─────────────────────────
create table if not exists public.fin_secuencias (
  empresa_id uuid not null references public.empresas(id),
  tipo       text not null,
  siguiente  bigint not null default 1,
  primary key (empresa_id, tipo)
);

create or replace function public.fin_siguiente_numero(p_empresa uuid, p_tipo text) returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  insert into fin_secuencias (empresa_id, tipo, siguiente) values (p_empresa, p_tipo, 2)
  on conflict (empresa_id, tipo) do update set siguiente = fin_secuencias.siguiente + 1
  returning siguiente - 1 into n;
  return n;
end $$;
revoke all on function public.fin_siguiente_numero(uuid, text) from public, anon, authenticated;

-- ── Configuración ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.fin_parametros (
  empresa_id                 uuid primary key references public.empresas(id),
  tasa_iva                   numeric(7,4) not null default 0.19,
  tolerancia_factura_oc      numeric(18,0) not null default 1000,
  plazo_pago_proveedor_dias  int not null default 30,
  plazo_aclarar_dias         int not null default 3,
  minimo_caja                numeric(18,0) not null default 0,
  tasa_mora_factoring        numeric(7,4) not null default 0.012,
  plazo_reclamo_factura_dias int not null default 8,
  plazo_tarjeta_respaldo_horas int not null default 48,
  horizonte_meses            int not null default 3 check (horizonte_meses between 1 and 12),
  condicion_pago_default     int not null default 30,
  flags                      jsonb not null default '{}'::jsonb,
  actualizado_por            text,
  actualizado_en             timestamptz not null default now()
);

create table if not exists public.fin_cuentas (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id),
  nombre             text not null,
  tipo               text not null check (tipo in ('banco', 'tarjeta', 'caja')),
  banco              text,
  numero_enmascarado text,
  saldo_banco        numeric(18,0) not null default 0,
  fecha_saldo        date,
  activa             boolean not null default true,
  orden              int not null default 0,
  creado_en          timestamptz not null default now(),
  unique (empresa_id, nombre)
);

create table if not exists public.fin_factores (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas(id),
  nombre               text not null,
  recurso_default      text not null default 'con' check (recurso_default in ('con', 'sin')),
  pct_anticipo_default numeric(7,4) not null default 0.9,
  tasa_mora_mensual    numeric(7,4) not null default 0.012,
  activo               boolean not null default true,
  unique (empresa_id, nombre)
);

create table if not exists public.fin_categorias (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id),
  nombre            text not null,
  sentido           text not null default 'ambos' check (sentido in ('ingreso', 'egreso', 'ambos')),
  requiere_proyecto boolean not null default false,
  cuenta_contable   text,
  orden             int not null default 0,
  activa            boolean not null default true,
  unique (empresa_id, nombre)
);

create table if not exists public.fin_reglas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id),
  cuenta_id      uuid references public.fin_cuentas(id) on delete cascade,
  patron         text not null,
  monto_min      numeric(18,0),
  monto_max      numeric(18,0),
  categoria_id   uuid not null references public.fin_categorias(id) on delete cascade,
  proyecto_id    uuid,
  prioridad      int not null default 100,
  activa         boolean not null default true,
  veces_aplicada int not null default 0,
  creado_por     text,
  creado_en      timestamptz not null default now()
);

-- Perfil financiero de un contacto por empresa (el contacto vive en Contactos y no se toca).
create table if not exists public.fin_perfiles (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references public.empresas(id),
  contacto_id            uuid not null references public.finanzas_contactos(id),
  condicion_venta_dias   int,
  condicion_compra_dias  int,
  requiere_oc            boolean not null default true,
  requiere_edp           boolean not null default false,
  requiere_hes           boolean not null default false,
  contacto_cobranza      text,
  correo_cobranza        text,
  telefono_cobranza      text,
  referencia_exigida     text,
  notas                  text,
  actualizado_en         timestamptz not null default now(),
  unique (empresa_id, contacto_id)
);

-- ── Proyectos ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.fin_proyectos (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id),
  codigo             text not null,
  nombre             text not null,
  mandante_id        uuid references public.finanzas_contactos(id),
  tipo               text not null default 'contrato' check (tipo in ('contrato', 'spot', 'arriendo', 'interno')),
  descripcion        text,
  jefe_proyecto      text,
  fecha_inicio       date,
  fecha_termino      date,
  presupuesto_costos numeric(18,0),
  costo_mano_obra    numeric(18,0),
  estado             text not null default 'activo' check (estado in ('activo', 'cerrado')),
  es_general         boolean not null default false,
  creado_por         text,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create unique index if not exists fin_proyectos_general_uidx on public.fin_proyectos (empresa_id) where es_general;

-- ── CRM ─────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.fin_oportunidades (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id),
  codigo          text not null,
  nombre          text not null,
  cliente_id      uuid references public.finanzas_contactos(id),
  proyecto_id     uuid references public.fin_proyectos(id),
  tipo            text not null default 'servicio' check (tipo in ('servicio', 'arriendo', 'venta')),
  etapa           text not null default 'prospecto' check (etapa in ('prospecto', 'calificada', 'cotizacion', 'negociacion', 'ganada', 'perdida')),
  monto_estimado  numeric(18,0) not null default 0,
  probabilidad    int not null default 10 check (probabilidad between 0 and 100),
  fecha_cierre    date,
  responsable     text,
  origen          text,
  motivo_perdida  text,
  descripcion     text,
  orden           double precision not null default 0,
  creado_por      text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (empresa_id, codigo)
);

-- Actividades y comentarios de cualquier registro (seguimiento comercial, gestión de cobranza…).
create table if not exists public.fin_actividades (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id),
  entidad_tipo text not null,
  entidad_id   uuid not null,
  tipo         text not null default 'nota' check (tipo in ('llamada', 'reunion', 'correo', 'nota', 'tarea')),
  texto        text not null,
  fecha        date not null default current_date,
  vencimiento  date,
  hecha        boolean not null default true,
  creado_por   text,
  creado_en    timestamptz not null default now()
);
create index if not exists fin_actividades_entidad_idx on public.fin_actividades (empresa_id, entidad_tipo, entidad_id, creado_en desc);

-- ── Ventas ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.fin_cotizaciones (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas(id),
  numero              text not null,
  version             int not null default 1,
  padre_id            uuid references public.fin_cotizaciones(id),
  oportunidad_id      uuid references public.fin_oportunidades(id),
  cliente_id          uuid references public.finanzas_contactos(id),
  proyecto_id         uuid references public.fin_proyectos(id),
  titulo              text not null,
  fecha               date not null default current_date,
  validez_dias        int not null default 30,
  tipo                text not null default 'servicio' check (tipo in ('servicio', 'arriendo', 'venta')),
  condicion_pago_dias int,
  requiere_oc         boolean not null default true,
  requiere_edp        boolean not null default false,
  requiere_hes        boolean not null default false,
  estado              text not null default 'borrador' check (estado in ('borrador', 'enviada', 'aceptada', 'rechazada', 'vencida', 'anulada', 'reemplazada')),
  fecha_envio         date,
  fecha_aceptacion    date,
  oc_cliente_numero   text,
  motivo              text,
  neto                numeric(18,0) not null default 0,
  iva                 numeric(18,0) not null default 0,
  total               numeric(18,0) not null default 0,
  notas               text,
  plantilla_id        uuid,
  creado_por          text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  unique (empresa_id, numero, version)
);

create table if not exists public.fin_cotizacion_lineas (
  id              uuid primary key default gen_random_uuid(),
  cotizacion_id   uuid not null references public.fin_cotizaciones(id) on delete cascade,
  orden           int not null default 0,
  producto_id     uuid references public.inv_productos(id),
  descripcion     text not null,
  cantidad        numeric(14,4) not null default 1,
  unidad          text,
  precio_unitario numeric(18,2) not null default 0,
  descuento_pct   numeric(7,4) not null default 0,
  exento          boolean not null default false,
  meses           int,
  neto_linea      numeric(18,0) not null default 0
);

-- El hito facturable: una fila de «Ventas y CxC» (un EDP, un hito, un mes de arriendo, un spot).
create table if not exists public.fin_hitos (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references public.empresas(id),
  codigo                text not null,
  cotizacion_id         uuid references public.fin_cotizaciones(id),
  cliente_id            uuid references public.finanzas_contactos(id),
  proyecto_id           uuid references public.fin_proyectos(id),
  descripcion           text not null,
  tipo                  text not null default 'servicio' check (tipo in ('servicio', 'arriendo', 'venta')),
  periodo               text,
  periodo_desde         date,
  periodo_hasta         date,
  fecha_aceptacion      date,
  neto                  numeric(18,0) not null default 0,
  oc_cliente_numero     text,
  oc_cliente_fecha      date,
  estado_trabajo        text check (estado_trabajo in ('pendiente', 'en_curso', 'terminado')),
  guia_despacho         text,
  requiere_edp          boolean not null default false,
  edp_fecha_aprobacion  date,
  requiere_hes          boolean not null default false,
  hes_numero            text,
  fecha_estimada_pago   date,
  condicion_pago_dias   int,
  comentario            text,
  anulado               boolean not null default false,
  motivo_anulacion      text,
  orden                 int not null default 0,
  creado_por            text,
  creado_en             timestamptz not null default now(),
  actualizado_por       text,
  actualizado_en        timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index if not exists fin_hitos_proyecto_idx on public.fin_hitos (empresa_id, proyecto_id);

-- Documentos tributarios emitidos y recibidos (facturas, NC, ND, guías). Hoy se cargan a mano.
create table if not exists public.fin_documentos (
  id                        uuid primary key default gen_random_uuid(),
  empresa_id                uuid not null references public.empresas(id),
  direccion                 text not null check (direccion in ('emitido', 'recibido')),
  tipo_dte                  int not null,
  folio                     text not null,
  fecha_emision             date not null,
  fecha_recepcion           date,
  contraparte_id            uuid references public.finanzas_contactos(id),
  rut_contraparte           text not null default '',
  razon_social              text,
  neto                      numeric(18,0) not null default 0,
  exento                    numeric(18,0) not null default 0,
  iva                       numeric(18,0) not null default 0,
  otros_impuestos           numeric(18,0) not null default 0,
  total                     numeric(18,0) not null default 0,
  fecha_vencimiento         date,
  referencias               text,
  documento_referenciado_id uuid references public.fin_documentos(id),
  origen                    text not null default 'manual' check (origen in ('manual', 'importado_rcv', 'api_dte')),
  estado_sii                text,
  estado                    text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  motivo_anulacion          text,
  creado_por                text,
  creado_en                 timestamptz not null default now(),
  unique (empresa_id, direccion, tipo_dte, folio, rut_contraparte)
);
create index if not exists fin_documentos_fecha_idx on public.fin_documentos (empresa_id, direccion, fecha_emision);

create table if not exists public.fin_documento_hitos (
  documento_id  uuid not null references public.fin_documentos(id) on delete cascade,
  hito_id       uuid not null references public.fin_hitos(id),
  neto_aplicado numeric(18,0) not null default 0,
  primary key (documento_id, hito_id)
);

create table if not exists public.fin_cobros (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id),
  numero        text not null,
  cliente_id    uuid references public.finanzas_contactos(id),
  fecha         date not null,
  monto         numeric(18,0) not null,
  medio         text not null default 'transferencia',
  cuenta_id     uuid references public.fin_cuentas(id),
  movimiento_id uuid,
  referencia    text,
  estado        text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  creado_por    text,
  creado_en     timestamptz not null default now(),
  unique (empresa_id, numero)
);

create table if not exists public.fin_cobro_aplicaciones (
  cobro_id     uuid not null references public.fin_cobros(id) on delete cascade,
  documento_id uuid not null references public.fin_documentos(id),
  monto        numeric(18,0) not null,
  primary key (cobro_id, documento_id)
);

-- ── Compras ─────────────────────────────────────────────────────────────────────────────────────
-- Una fila de «Compras y CxP»: la solicitud con su aprobación, visado, OC y recepción.
create table if not exists public.fin_compras (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas(id),
  codigo               text not null,
  proyecto_id          uuid references public.fin_proyectos(id),
  proveedor_id         uuid references public.finanzas_contactos(id),
  descripcion          text not null,
  neto_cotizado        numeric(18,0),
  fecha_requerida      date,
  solicitante          text,
  prioridad            text not null default 'normal' check (prioridad in ('baja', 'normal', 'alta')),
  aprobado_por         text,
  fecha_aprobacion     date,
  visado_por           text,
  fecha_visado         date,
  oc_numero            text,
  oc_fecha             date,
  oc_enviada_fecha     date,
  condicion_pago_dias  int,
  recepcion            text check (recepcion in ('si', 'parcial', 'no')),
  recepcion_fecha      date,
  recepcion_por        text,
  recepcion_obs        text,
  diferencia_aprobada  boolean not null default false,
  estado_override      text check (estado_override in ('anulada', 'rechazada')),
  motivo               text,
  comentario           text,
  creado_por           text,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index if not exists fin_compras_proyecto_idx on public.fin_compras (empresa_id, proyecto_id);

create table if not exists public.fin_compra_lineas (
  id                uuid primary key default gen_random_uuid(),
  compra_id         uuid not null references public.fin_compras(id) on delete cascade,
  orden             int not null default 0,
  producto_id       uuid references public.inv_productos(id),
  descripcion       text not null,
  cantidad          numeric(14,4) not null default 1,
  precio_unitario   numeric(18,2) not null default 0,
  neto_linea        numeric(18,0) not null default 0,
  cantidad_recibida numeric(14,4) not null default 0
);

-- Factura de proveedor (fin_documentos recibido) ligada a su compra/OC.
create table if not exists public.fin_documento_compras (
  documento_id uuid not null references public.fin_documentos(id) on delete cascade,
  compra_id    uuid not null references public.fin_compras(id),
  monto        numeric(18,0) not null default 0,
  primary key (documento_id, compra_id)
);

create table if not exists public.fin_pagos (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas(id),
  numero           text not null,
  proveedor_id     uuid references public.finanzas_contactos(id),
  fecha_programada date,
  fecha_pago       date,
  monto            numeric(18,0) not null,
  cuenta_id        uuid references public.fin_cuentas(id),
  medio            text not null default 'transferencia',
  movimiento_id    uuid,
  referencia       text,
  estado           text not null default 'programado' check (estado in ('programado', 'pagado', 'anulado')),
  creado_por       text,
  creado_en        timestamptz not null default now(),
  unique (empresa_id, numero)
);

create table if not exists public.fin_pago_aplicaciones (
  pago_id      uuid not null references public.fin_pagos(id) on delete cascade,
  documento_id uuid not null references public.fin_documentos(id),
  monto        numeric(18,0) not null,
  primary key (pago_id, documento_id)
);

-- ── Tesorería ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.fin_importaciones (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas(id),
  cuenta_id        uuid not null references public.fin_cuentas(id),
  archivo          text not null,
  filas_total      int not null default 0,
  filas_nuevas     int not null default 0,
  filas_duplicadas int not null default 0,
  importado_por    text,
  creado_en        timestamptz not null default now()
);

create table if not exists public.fin_movimientos (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas(id),
  cuenta_id        uuid not null references public.fin_cuentas(id),
  fecha            date not null,
  glosa            text not null,
  monto            numeric(18,0) not null,
  numero_documento text,
  huella           text not null,
  categoria_id     uuid references public.fin_categorias(id),
  proyecto_id      uuid references public.fin_proyectos(id),
  contacto_id      uuid references public.finanzas_contactos(id),
  responsable      text,
  tiene_respaldo   boolean not null default false,
  documento_ref    text,
  rendicion_ref    text,
  regla_id         uuid references public.fin_reglas(id) on delete set null,
  importacion_id   uuid references public.fin_importaciones(id),
  comentario       text,
  creado_por       text,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  unique (empresa_id, huella)
);
create index if not exists fin_movimientos_fecha_idx on public.fin_movimientos (empresa_id, fecha desc);

-- Un movimiento puede cubrir varios cobros/pagos (una nómina) y al revés.
create table if not exists public.fin_conciliaciones (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id),
  movimiento_id uuid not null references public.fin_movimientos(id) on delete cascade,
  entidad_tipo  text not null check (entidad_tipo in ('cobro', 'pago', 'factoring', 'traspaso', 'otro')),
  entidad_id    uuid,
  monto         numeric(18,0) not null default 0,
  creado_en     timestamptz not null default now()
);

-- ── Factoring ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.fin_operaciones_factoring (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id),
  numero         text not null,
  factor_id      uuid not null references public.fin_factores(id),
  recurso        text not null default 'con' check (recurso in ('con', 'sin')),
  fecha_cesion   date not null,
  pct_anticipo   numeric(7,4) not null default 0.9,
  tasa_mora      numeric(7,4) not null default 0.012,
  costo_total    numeric(18,0) not null default 0,
  fecha_anticipo date,
  creado_por     text,
  creado_en      timestamptz not null default now(),
  unique (empresa_id, numero)
);

create table if not exists public.fin_cesiones (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references public.empresas(id),
  operacion_id           uuid not null references public.fin_operaciones_factoring(id) on delete cascade,
  documento_id           uuid not null references public.fin_documentos(id),
  nominal                numeric(18,0) not null,
  costo_asignado         numeric(18,0) not null default 0,
  fecha_pago_cliente     date,
  factor_confirma_fecha  date,
  mora_cobrada           numeric(18,0),
  excedente_fecha        date,
  excedente_monto        numeric(18,0),
  unique (documento_id)
);

-- ── Flujo de caja: partidas que se escriben a mano (remuneraciones, impuestos, créditos…) ──────
create table if not exists public.fin_flujo_partidas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id),
  mes         date not null,
  concepto    text not null check (concepto in ('anticipos_factoring', 'otros_ingresos', 'remuneraciones', 'impuestos', 'creditos_leasing', 'pago_tarjeta')),
  monto       numeric(18,0) not null default 0,
  comentario  text,
  unique (empresa_id, mes, concepto)
);

-- ── Contabilidad ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.fin_cuentas_contables (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id),
  codigo      text not null,
  nombre      text not null,
  tipo        text not null check (tipo in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto')),
  imputable   boolean not null default true,
  activa      boolean not null default true,
  unique (empresa_id, codigo)
);

create table if not exists public.fin_periodos (
  empresa_id  uuid not null references public.empresas(id),
  anio        int not null,
  mes         int not null check (mes between 1 and 12),
  estado      text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  cerrado_por text,
  cerrado_en  timestamptz,
  motivo      text,
  primary key (empresa_id, anio, mes)
);

create table if not exists public.fin_asientos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id),
  numero       text not null,
  fecha        date not null,
  glosa        text not null,
  origen_tipo  text not null,
  origen_id    uuid,
  estado       text not null default 'contabilizado' check (estado in ('borrador', 'contabilizado', 'anulado')),
  creado_por   text,
  creado_en    timestamptz not null default now(),
  unique (empresa_id, numero)
);
create unique index if not exists fin_asientos_origen_uidx on public.fin_asientos (empresa_id, origen_tipo, origen_id) where estado <> 'anulado' and origen_id is not null;

create table if not exists public.fin_asiento_lineas (
  id            uuid primary key default gen_random_uuid(),
  asiento_id    uuid not null references public.fin_asientos(id) on delete cascade,
  cuenta_codigo text not null,
  debe          numeric(18,0) not null default 0,
  haber         numeric(18,0) not null default 0,
  proyecto_id   uuid,
  glosa         text
);

-- ── Transversales: adjuntos, auditoría, eventos y rutinas ────────────────────────────────────────
create table if not exists public.fin_adjuntos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id),
  entidad_tipo text not null,
  entidad_id   uuid not null,
  tipo         text not null default 'otro',
  ruta         text not null,
  nombre       text not null,
  mime         text,
  tamano       int,
  subido_por   text,
  creado_en    timestamptz not null default now()
);
create index if not exists fin_adjuntos_entidad_idx on public.fin_adjuntos (empresa_id, entidad_tipo, entidad_id);

create table if not exists public.fin_auditoria (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id),
  tabla       text not null,
  registro_id uuid,
  accion      text not null,
  detalle     text,
  antes       jsonb,
  despues     jsonb,
  motivo      text,
  usuario     text,
  creado_en   timestamptz not null default now()
);
create index if not exists fin_auditoria_registro_idx on public.fin_auditoria (empresa_id, registro_id, creado_en desc);

create table if not exists public.fin_eventos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id),
  tipo         text not null,
  entidad_tipo text not null,
  entidad_id   uuid,
  payload      jsonb not null default '{}'::jsonb,
  creado_en    timestamptz not null default now()
);

create table if not exists public.fin_rutinas (
  empresa_id uuid not null references public.empresas(id),
  tarea      text not null,
  periodo    text not null,
  hecha_por  text,
  hecha_en   timestamptz not null default now(),
  primary key (empresa_id, tarea, periodo)
);

-- ── RLS: solo el servidor ────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'fin_secuencias','fin_parametros','fin_cuentas','fin_factores','fin_categorias','fin_reglas','fin_perfiles','fin_proyectos',
    'fin_oportunidades','fin_actividades','fin_cotizaciones','fin_cotizacion_lineas','fin_hitos','fin_documentos','fin_documento_hitos',
    'fin_cobros','fin_cobro_aplicaciones','fin_compras','fin_compra_lineas','fin_documento_compras','fin_pagos','fin_pago_aplicaciones',
    'fin_importaciones','fin_movimientos','fin_conciliaciones','fin_operaciones_factoring','fin_cesiones','fin_flujo_partidas',
    'fin_cuentas_contables','fin_periodos','fin_asientos','fin_asiento_lineas','fin_adjuntos','fin_auditoria','fin_eventos','fin_rutinas'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Bucket privado de adjuntos (rutas «<empresa>/<entidad>/<uuid>.<ext>»).
insert into storage.buckets (id, name, public, file_size_limit)
values ('finanzas', 'finanzas', false, 10485760)
on conflict (id) do nothing;

-- ── Catálogos por empresa (sin transacciones) ───────────────────────────────────────────────────
do $$
declare e record;
begin
  for e in select id, slug from public.empresas where slug in ('pertec', 'zeus', 'performance-service') loop
    insert into public.fin_parametros (empresa_id, minimo_caja)
    values (e.id, case when e.slug = 'pertec' then 20000000 else 0 end)
    on conflict (empresa_id) do nothing;

    insert into public.fin_categorias (empresa_id, nombre, sentido, requiere_proyecto, cuenta_contable, orden)
    values
      (e.id, 'Cobro cliente', 'ingreso', false, '1.1.03', 1),
      (e.id, 'Pago proveedor', 'egreso', false, '2.1.01', 2),
      (e.id, 'Remuneraciones', 'egreso', false, '2.1.06', 3),
      (e.id, 'Impuestos', 'egreso', false, '2.1.04', 4),
      (e.id, 'Factoring', 'ambos', false, '2.1.03', 5),
      (e.id, 'Gasto tarjeta', 'egreso', true, '5.3.01', 6),
      (e.id, 'Comisión banco', 'egreso', false, '5.4.02', 7),
      (e.id, 'Traspaso entre cuentas', 'ambos', false, '1.1.02', 8),
      (e.id, 'Crédito o leasing', 'egreso', false, '2.2.01', 9),
      (e.id, 'Otro', 'ambos', false, '5.3.99', 10)
    on conflict (empresa_id, nombre) do nothing;

    insert into public.fin_proyectos (empresa_id, codigo, nombre, tipo, descripcion, es_general)
    values (e.id, 'PRY-0000', 'General', 'interno', 'Gastos generales de la empresa', true)
    on conflict do nothing;

    insert into public.fin_cuentas_contables (empresa_id, codigo, nombre, tipo, imputable)
    values
      (e.id, '1', 'Activo', 'activo', false),
      (e.id, '1.1.01', 'Caja', 'activo', true),
      (e.id, '1.1.02', 'Bancos', 'activo', true),
      (e.id, '1.1.03', 'Clientes', 'activo', true),
      (e.id, '1.1.04', 'Documentos cedidos en factoring', 'activo', true),
      (e.id, '1.1.05', 'IVA crédito fiscal', 'activo', true),
      (e.id, '1.1.06', 'PPM', 'activo', true),
      (e.id, '1.1.07', 'Anticipo a proveedores', 'activo', true),
      (e.id, '1.1.08', 'Fondos por rendir', 'activo', true),
      (e.id, '1.1.10', 'Existencias', 'activo', true),
      (e.id, '1.2.01', 'Activo fijo', 'activo', true),
      (e.id, '2', 'Pasivo', 'pasivo', false),
      (e.id, '2.1.01', 'Proveedores', 'pasivo', true),
      (e.id, '2.1.02', 'Tarjeta de crédito por pagar', 'pasivo', true),
      (e.id, '2.1.03', 'Obligaciones por factoring', 'pasivo', true),
      (e.id, '2.1.04', 'IVA débito fiscal', 'pasivo', true),
      (e.id, '2.1.05', 'Retenciones', 'pasivo', true),
      (e.id, '2.1.06', 'Remuneraciones por pagar', 'pasivo', true),
      (e.id, '2.1.07', 'Leyes sociales', 'pasivo', true),
      (e.id, '2.1.08', 'Impuesto renta por pagar', 'pasivo', true),
      (e.id, '2.2.01', 'Créditos y leasing', 'pasivo', true),
      (e.id, '3', 'Patrimonio', 'patrimonio', false),
      (e.id, '3.1.01', 'Capital', 'patrimonio', true),
      (e.id, '3.1.02', 'Resultados acumulados', 'patrimonio', true),
      (e.id, '3.1.03', 'Resultado del ejercicio', 'patrimonio', true),
      (e.id, '4', 'Ingresos', 'ingreso', false),
      (e.id, '4.1.01', 'Ventas de servicios', 'ingreso', true),
      (e.id, '4.1.02', 'Ingresos por arriendo', 'ingreso', true),
      (e.id, '4.1.03', 'Venta de productos', 'ingreso', true),
      (e.id, '4.2.01', 'Otros ingresos', 'ingreso', true),
      (e.id, '5', 'Costos y gastos', 'gasto', false),
      (e.id, '5.1.01', 'Costo directo de proyectos', 'gasto', true),
      (e.id, '5.2.01', 'Remuneraciones', 'gasto', true),
      (e.id, '5.3.01', 'Gastos generales', 'gasto', true),
      (e.id, '5.3.99', 'Otros gastos', 'gasto', true),
      (e.id, '5.4.01', 'Intereses y comisiones de factoring', 'gasto', true),
      (e.id, '5.4.02', 'Comisiones bancarias', 'gasto', true),
      (e.id, '5.5.01', 'Impuestos no recuperables', 'gasto', true)
    on conflict (empresa_id, codigo) do nothing;
  end loop;
end $$;

-- La aplicación, para asignarla por usuario desde Administración.
insert into public.aplicaciones (nombre, slug, url, tipo, icono, color, descripcion, estado, orden)
select 'Gestión financiera', 'gestion-financiera', '/gestion-financiera', 'interna', 'cash', 'naranjo',
       'Ventas y cobranza, compras y pagos, banco diario, factoring, flujo de caja, proyectos y contabilidad.',
       'activa', 12
where not exists (select 1 from public.aplicaciones where slug = 'gestion-financiera');

notify pgrst, 'reload schema';
