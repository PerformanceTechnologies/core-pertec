-- =============================================================================================
--  Gestión financiera · 0007 · Integridad de cobros, pagos y conciliaciones
--
--  Red de seguridad en la base para lo que la app ya revisa, pero que un doble clic o dos
--  personas a la vez pueden colar entre la lectura y la escritura:
--
--    1. Nadie aplica a una factura más de lo que vale. Antes de insertar en fin_cobro_aplicaciones
--       o fin_pago_aplicaciones se bloquea la fila del documento (select ... for update), así dos
--       aplicaciones al mismo documento van en fila, y se rechaza si lo ya aplicado por cobros/pagos
--       NO anulados (los pagos programados también reservan su monto) más lo nuevo pasa del total
--       del documento, rebajado por sus notas de crédito (61) y subido por sus notas de débito (56)
--       vigentes.
--    2. Un movimiento del banco se concilia una sola vez: índice único en fin_conciliaciones
--       (movimiento_id). Los traspasos ligan cada lado con su propia fila, así que caben igual.
--       Si ya hay movimientos conciliados dos veces, el índice NO se crea (avisa con un NOTICE):
--       hay que limpiar esos duplicados y volver a correr este archivo.
--
--  Se puede correr más de una vez: usa create or replace, drop trigger if exists y crea el índice
--  solo si no existe.
-- =============================================================================================

-- ── 1. Tope de lo aplicado a un documento ─────────────────────────────────────────────────────
create or replace function public.fin_tope_aplicacion()
returns trigger
language plpgsql
as $$
declare
  v_total    numeric(18,0);
  v_estado   text;
  v_notas    numeric(18,0);
  v_cobros   numeric(18,0);
  v_pagos    numeric(18,0);
  v_tope     numeric(18,0);
begin
  if new.monto is null or new.monto <= 0 then
    raise exception 'El monto aplicado debe ser mayor que cero.' using errcode = 'check_violation';
  end if;

  -- Bloquea el documento: la siguiente aplicación al mismo documento espera a que esta termine.
  select d.total, d.estado
    into v_total, v_estado
    from public.fin_documentos d
   where d.id = new.documento_id
     for update;

  if not found then
    raise exception 'El documento % no existe.', new.documento_id using errcode = 'foreign_key_violation';
  end if;
  if v_estado = 'anulado' then
    raise exception 'El documento está anulado: no se le aplican cobros ni pagos.' using errcode = 'check_violation';
  end if;

  -- NC rebaja lo que se debe; ND lo sube (misma regla que cargarVista en lib/fin/datos.ts).
  select coalesce(sum(case when n.tipo_dte = 61 then n.total else -n.total end), 0)
    into v_notas
    from public.fin_documentos n
   where n.documento_referenciado_id = new.documento_id
     and n.estado = 'vigente'
     and n.tipo_dte in (61, 56);

  select coalesce(sum(a.monto), 0)
    into v_cobros
    from public.fin_cobro_aplicaciones a
    join public.fin_cobros c on c.id = a.cobro_id
   where a.documento_id = new.documento_id
     and c.estado <> 'anulado';

  select coalesce(sum(a.monto), 0)
    into v_pagos
    from public.fin_pago_aplicaciones a
    join public.fin_pagos p on p.id = a.pago_id
   where a.documento_id = new.documento_id
     and p.estado <> 'anulado';

  v_tope := v_total - v_notas;
  if v_cobros + v_pagos + new.monto > v_tope then
    raise exception 'La aplicación (%) deja el documento sobre su total: ya aplicado %, total vigente %.',
      new.monto, v_cobros + v_pagos, v_tope
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists fin_cobro_aplicaciones_tope on public.fin_cobro_aplicaciones;
create trigger fin_cobro_aplicaciones_tope
  before insert on public.fin_cobro_aplicaciones
  for each row execute function public.fin_tope_aplicacion();

drop trigger if exists fin_pago_aplicaciones_tope on public.fin_pago_aplicaciones;
create trigger fin_pago_aplicaciones_tope
  before insert on public.fin_pago_aplicaciones
  for each row execute function public.fin_tope_aplicacion();

-- ── 2. Un movimiento, una conciliación ────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'fin_conciliaciones_movimiento_uidx'
  ) then
    return;
  end if;
  if exists (
    select 1 from public.fin_conciliaciones
     group by movimiento_id having count(*) > 1
  ) then
    raise notice 'fin_conciliaciones tiene movimientos conciliados más de una vez: limpia esos duplicados y vuelve a correr este archivo para crear el índice único.';
    return;
  end if;
  create unique index fin_conciliaciones_movimiento_uidx on public.fin_conciliaciones (movimiento_id);
end;
$$;
