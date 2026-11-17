-- Banco automático (Itaú Corporate vía Emisso Connect): los movimientos y saldos llegan solos cada mañana.
--
-- · fin_cuentas.origen_externo vincula una cuenta del Core con la del banco («emisso:itau_corporate:<n° cuenta>»).
--   La crea la sincronización la primera vez; después se puede renombrar sin perder el vínculo.
-- · fin_movimientos.clave_externa es la identidad del movimiento en el banco. NO se usa la huella (que incluye la
--   glosa): si Itaú corrige la glosa, la fila se actualiza en vez de duplicarse, y su conciliación no se pierde.
--   contraparte_rut sale de la glosa de las transferencias recibidas («TRANSF. DE <RUT> …»).
-- · fin_saldos_diarios guarda una foto por cuenta, moneda y día: cuenta corriente, cuenta dólar y línea de crédito.
--   numeric(18,2) porque la cuenta dólar trae centavos.
-- · fin_banco_sincronizaciones deja constancia de cada corrida (lo que el resumen y Tesorería muestran).
--
-- Se puede correr más de una vez.

alter table public.fin_cuentas add column if not exists origen_externo text;
create unique index if not exists fin_cuentas_origen_externo_key on public.fin_cuentas (empresa_id, origen_externo) where origen_externo is not null;

alter table public.fin_movimientos add column if not exists clave_externa text;
alter table public.fin_movimientos add column if not exists contraparte_rut text;
create unique index if not exists fin_movimientos_clave_externa_key on public.fin_movimientos (empresa_id, clave_externa) where clave_externa is not null;

create table if not exists public.fin_saldos_diarios (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id),
  origen         text not null,
  numero_cuenta  text not null,
  moneda         text not null,
  dia            date not null,
  cuenta_id      uuid references public.fin_cuentas(id) on delete set null,
  saldo_total    numeric(18,2),
  retenciones    numeric(18,2),
  disponible     numeric(18,2),
  disponible_linea numeric(18,2),
  observado_en   timestamptz not null,
  creado_en      timestamptz not null default now(),
  unique (empresa_id, origen, numero_cuenta, moneda, dia)
);

create table if not exists public.fin_banco_sincronizaciones (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id),
  origen         text not null,
  ok             boolean not null,
  nuevos         int not null default 0,
  actualizados   int not null default 0,
  omitidos       int not null default 0,
  saldos         int not null default 0,
  datos_al       timestamptz,
  mensaje        text,
  creado_en      timestamptz not null default now()
);
create index if not exists fin_banco_sincronizaciones_empresa_idx on public.fin_banco_sincronizaciones (empresa_id, creado_en desc);

alter table public.fin_saldos_diarios enable row level security;
alter table public.fin_banco_sincronizaciones enable row level security;

notify pgrst, 'reload schema';
