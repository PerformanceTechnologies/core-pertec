-- Facturación electrónica (emisión de DTE vía proveedor, hoy SimpleFactura), recibidos del SII y cesión electrónica.
--
-- Diseño (docs/finanzas/FACTURACION_ELECTRONICA.md):
--   · fin_dte_emisiones: cada documento que el Core manda a emitir (factura 33, exenta 34, guía 52, ND 56, NC 61).
--     Nace como borrador, pasa a «enviando» al llamar al proveedor y termina «emitido» (con folio) o «error».
--     La clave_idempotencia es única: un doble clic, un reintento o dos pestañas no pueden emitir dos veces.
--     Al emitir, se crea la fila en fin_documentos (origen 'api_dte') y se liga a sus hitos, igual que el registro manual:
--     el resto de Gestión financiera (saldo, cobranza, flujo, factoring, contabilidad) no distingue de dónde vino.
--     EN CERTIFICACIÓN (pruebas con la clave demo) NO se crea fin_documentos ni se tocan hitos, saldos, flujo ni
--     contabilidad: lo de prueba vive solo en fin_dte_emisiones, marcado como prueba. Así probar no ensucia los libros.
--   · fin_documentos gana track_id, estado SII y ambiente (certificación/producción) para lo emitido por API.
--   · fin_dte_recibidos: bandeja de lo que el SII dice que le facturaron a la empresa (lo trae el proveedor). Desde ahí
--     se acepta o reclama (Ley 19.983, 8 días) y se registra en Compras (ligado a su compra u OC).
--   · fin_dte_cesiones: cada cesión electrónica (AEC) mandada al SII, ligada a la factura y, cuando existe, a la fila
--     de fin_cesiones de la operación de factoring.
--   · fin_factores gana los datos que pide el AEC del cesionario (RUT, dirección, correo).
--
-- Solo crea y agrega (ningún drop de datos, ningún update masivo). RLS encendido y sin políticas: solo el servidor.
-- Se puede correr más de una vez.

-- ── Emisiones ────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.fin_dte_emisiones (
  id                         uuid primary key default gen_random_uuid(),
  empresa_id                 uuid not null references public.empresas(id),
  tipo_dte                   int  not null check (tipo_dte in (33, 34, 52, 56, 61)),
  estado                     text not null default 'borrador' check (estado in ('borrador', 'enviando', 'emitido', 'error', 'descartado')),
  ambiente                   text not null check (ambiente in ('certificacion', 'produccion')),
  proveedor                  text not null default 'simplefactura',
  -- El documento completo tal como lo armó el editor (lib/fin/dte/modelo.ts › DocumentoDte).
  documento                  jsonb not null,
  contraparte_id             uuid references public.finanzas_contactos(id),
  receptor_rut               text not null default '',
  receptor_nombre            text,
  fecha_emision              date not null,
  neto                       numeric(18,0) not null default 0,
  exento                     numeric(18,0) not null default 0,
  iva                        numeric(18,0) not null default 0,
  total                      numeric(18,0) not null default 0,
  -- De dónde nació: hitos facturados, documento que corrige (NC/ND) o compra/hito de la guía.
  hito_ids                   uuid[] not null default '{}',
  documento_referenciado_id  uuid references public.fin_documentos(id),
  -- Lo que devolvió el proveedor.
  folio                      text,
  track_id                   text,
  documento_id               uuid references public.fin_documentos(id),
  error                      text,
  intentos                   int not null default 0,
  respuesta                  jsonb,
  clave_idempotencia         text not null,
  creado_por                 text,
  creado_en                  timestamptz not null default now(),
  enviado_por                text,
  enviado_en                 timestamptz,
  emitido_en                 timestamptz,
  actualizado_en             timestamptz not null default now(),
  unique (empresa_id, clave_idempotencia)
);
create index if not exists fin_dte_emisiones_estado_idx on public.fin_dte_emisiones (empresa_id, estado, creado_en desc);
create index if not exists fin_dte_emisiones_documento_idx on public.fin_dte_emisiones (documento_id);

-- ── Lo emitido por API en fin_documentos ─────────────────────────────────────────────────────────
alter table public.fin_documentos add column if not exists track_id           text;
alter table public.fin_documentos add column if not exists estado_sii_detalle text;
alter table public.fin_documentos add column if not exists estado_sii_en      timestamptz;
alter table public.fin_documentos add column if not exists ambiente           text check (ambiente is null or ambiente in ('certificacion', 'produccion'));
alter table public.fin_documentos add column if not exists emision_id         uuid references public.fin_dte_emisiones(id);
-- Acuse y reclamo de los recibidos (ACD, ERM, RCD, RFP, RFT) y de lo que el cliente hizo con lo emitido.
alter table public.fin_documentos add column if not exists acuse              text;
alter table public.fin_documentos add column if not exists acuse_en           timestamptz;

-- ── Recibidos (bandeja del SII) ──────────────────────────────────────────────────────────────────
create table if not exists public.fin_dte_recibidos (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id),
  ambiente          text not null check (ambiente in ('certificacion', 'produccion')),
  tipo_dte          int  not null,
  folio             text not null,
  rut_emisor        text not null,
  razon_social      text,
  fecha_emision     date,
  fecha_recepcion   timestamptz,
  neto              numeric(18,0) not null default 0,
  exento            numeric(18,0) not null default 0,
  iva               numeric(18,0) not null default 0,
  total             numeric(18,0) not null default 0,
  -- Respuesta al SII (ACD/ERM acepta; RCD/RFP/RFT reclama) y quién la dio.
  accion            text check (accion is null or accion in ('ACD', 'ERM', 'RCD', 'RFP', 'RFT')),
  accion_en         timestamptz,
  accion_por        text,
  accion_motivo     text,
  -- Cuando se registra en Compras, el documento que nació.
  documento_id      uuid references public.fin_documentos(id),
  contraparte_id    uuid references public.finanzas_contactos(id),
  descartado        boolean not null default false,
  datos             jsonb not null default '{}'::jsonb,
  sincronizado_en   timestamptz not null default now(),
  unique (empresa_id, ambiente, tipo_dte, folio, rut_emisor)
);
create index if not exists fin_dte_recibidos_fecha_idx on public.fin_dte_recibidos (empresa_id, fecha_emision desc);

-- ── Cesiones electrónicas (AEC) ──────────────────────────────────────────────────────────────────
create table if not exists public.fin_dte_cesiones (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references public.empresas(id),
  ambiente               text not null check (ambiente in ('certificacion', 'produccion')),
  -- En producción, la factura del Core; en certificación (pruebas) no hay fin_documentos: se cede la emisión de prueba.
  documento_id           uuid references public.fin_documentos(id),
  emision_id             uuid references public.fin_dte_emisiones(id),
  tipo_dte               int  not null default 33,
  folio                  text not null,
  cesion_id              uuid references public.fin_cesiones(id) on delete set null,
  factor_id              uuid references public.fin_factores(id),
  monto                  numeric(18,0) not null,
  cesionario_rut         text not null,
  cesionario_nombre      text not null,
  cesionario_direccion   text,
  cesionario_correo      text,
  cedente_correo         text,
  vencimiento            date,
  estado                 text not null default 'enviando' check (estado in ('enviando', 'cedida', 'error', 'rechazada')),
  track_id               text,
  error                  text,
  respuesta              jsonb,
  clave_idempotencia     text not null,
  creado_por             text,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),
  unique (empresa_id, clave_idempotencia)
);
create index if not exists fin_dte_cesiones_documento_idx on public.fin_dte_cesiones (documento_id);

-- ── Datos del factor para el AEC ─────────────────────────────────────────────────────────────────
alter table public.fin_factores add column if not exists rut       text;
alter table public.fin_factores add column if not exists direccion text;
alter table public.fin_factores add column if not exists correo    text;

-- ── Datos del emisor que pide el DTE y no estaban (comuna, actividad económica, sucursal SII) ────────
alter table public.empresas add column if not exists comuna        text;
alter table public.empresas add column if not exists ciudad        text;
alter table public.empresas add column if not exists acteco        int;
alter table public.empresas add column if not exists correo_dte    text;

-- ── Sesión con SimpleFactura (token de 24 h, cifrado) ────────────────────────────────────────────
-- SimpleFactura da como máximo 10 tokens por hora por usuario. Vercel levanta instancias nuevas a cada rato: sin
-- guardar el token, cada una pediría el suyo y se toparía el límite. Se guarda cifrado (lib/cifrado.ts).
create table if not exists public.fin_dte_sesion (
  clave          text primary key,
  token_cifrado  text not null,
  expira_en      timestamptz not null,
  actualizado_en timestamptz not null default now()
);

-- ── Cuenta del proveedor por empresa (la carga el administrador del Core en Administración › Integraciones) ──────
-- Las credenciales se guardan CIFRADAS (AES-256-GCM, lib/cifrado.ts): ni la base ni la pantalla las muestran en claro.
-- emision_habilitada nace en false: con la cuenta cargada se puede probar la conexión, consultar estados y traer lo
-- recibido, pero NO emitir ni ceder hasta que el administrador la habilite.
-- carpeta_sp: carpeta de SharePoint donde se archivan los PDF/XML emitidos y recibidos de la empresa.
create table if not exists public.fin_dte_cuentas (
  empresa_id         uuid primary key references public.empresas(id) on delete cascade,
  proveedor          text not null default 'simplefactura' check (proveedor in ('simplefactura')),
  ambiente           text not null default 'certificacion' check (ambiente in ('certificacion','produccion')),
  usuario_cifrado    text,
  clave_cifrada      text,
  token_cifrado      text,
  rut_emisor_prueba  text,
  emision_habilitada boolean not null default false,
  carpeta_sp         text,
  probado_en         timestamptz,
  probado_ok         boolean,
  probado_detalle    text,
  actualizado_por    text,
  actualizado_en     timestamptz not null default now()
);
alter table public.fin_dte_cuentas enable row level security;

-- ── Archivo de documentos tributarios en SharePoint (emitidos y recibidos, PDF y XML) ─────────────────────────────
-- Una fila por documento (no por archivo): el PDF y el XML del mismo DTE comparten fila. Lo llena el ordenamiento
-- de la carpeta histórica y, de ahí en adelante, cada emisión y cada sincronización de recibidos.
create table if not exists public.fin_dte_archivo (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  clase          text not null check (clase in ('emitido','recibido')),
  tipo_dte       int,
  folio          text,
  fecha          date,
  rut_contraparte    text,
  nombre_contraparte text,
  neto           numeric,
  iva            numeric,
  exento         numeric,
  total          numeric,
  pdf_ref        text,
  xml_ref        text,
  ruta           text,
  documento_id   uuid references public.fin_documentos(id) on delete set null,
  origen         text not null default 'historico' check (origen in ('historico','emision','recibido_api','manual')),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists fin_dte_archivo_unico
  on public.fin_dte_archivo (empresa_id, clase, tipo_dte, folio, rut_contraparte);
create index if not exists fin_dte_archivo_fecha on public.fin_dte_archivo (empresa_id, clase, fecha desc);
create index if not exists fin_dte_archivo_doc   on public.fin_dte_archivo (documento_id);
alter table public.fin_dte_archivo enable row level security;

alter table public.fin_dte_sesion    enable row level security;
alter table public.fin_dte_emisiones enable row level security;
alter table public.fin_dte_recibidos enable row level security;
alter table public.fin_dte_cesiones  enable row level security;

notify pgrst, 'reload schema';
