-- Nóminas de pago masivo del banco (Itaú Corporate vía Emisso Connect): quién recibió cuánto en cada nómina.
--
-- · fin_banco_nominas: una fila por nómina del banco (proveedores y remuneraciones). movimiento_id es el cargo
--   de Tesorería que la pagó: lo liga el cron por monto exacto y unos días de desfase (Itaú registra el cargo
--   hasta 3 días después de la fecha de pago); si hay dos candidatos iguales no liga ninguno.
-- · fin_banco_nomina_lineas: los pagos individuales, con RUT y nombre del beneficiario. Sirve para validar el
--   líquido de BUK persona por persona (Remuneraciones) y, más adelante, para conciliar Compras y pagos por RUT.
--   El RUT y el nombre de las personas NO se muestran en la pestaña Remuneraciones: solo en el desglose, que exige
--   permiso y deja registro.
-- · fin_banco_sincronizaciones.nominas: cuántas nóminas leyó cada corrida.
--
-- Se puede correr más de una vez.

create table if not exists public.fin_banco_nominas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id),
  origen         text not null,
  id_nomina      text not null,
  fecha_pago     date,
  fecha_creacion date not null,
  descripcion    text,
  estado         text not null,
  moneda         text not null default 'CLP',
  monto          numeric(18,2) not null,
  movimiento_id  uuid references public.fin_movimientos(id) on delete set null,
  leida_en       timestamptz not null default now(),
  creado_en      timestamptz not null default now(),
  unique (empresa_id, origen, id_nomina)
);
create index if not exists fin_banco_nominas_pago_idx on public.fin_banco_nominas (empresa_id, fecha_pago);
create index if not exists fin_banco_nominas_movimiento_idx on public.fin_banco_nominas (movimiento_id) where movimiento_id is not null;

create table if not exists public.fin_banco_nomina_lineas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id),
  nomina_id       uuid not null references public.fin_banco_nominas(id) on delete cascade,
  id_linea        text not null,
  beneficiario    text,
  beneficiario_rut text not null default '',
  monto           numeric(18,2) not null,
  moneda          text not null default 'CLP',
  estado          text not null,
  unique (nomina_id, id_linea)
);
create index if not exists fin_banco_nomina_lineas_rut_idx on public.fin_banco_nomina_lineas (empresa_id, beneficiario_rut);

alter table public.fin_banco_sincronizaciones add column if not exists nominas int not null default 0;

alter table public.fin_banco_nominas enable row level security;
alter table public.fin_banco_nomina_lineas enable row level security;

notify pgrst, 'reload schema';
