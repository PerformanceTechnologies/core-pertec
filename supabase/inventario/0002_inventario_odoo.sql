-- Inventario: lo que le faltaba para trabajar como Odoo.
--
-- 1. Costo promedio (AVCO). Cada recepción recalcula el costo del producto
--    ponderando lo que había con lo que entra, como "Average Cost" en Odoo. Los
--    productos que prefieran costo fijo se dejan en 'estandar'.
-- 2. Sin stock negativo. Reservar o validar una salida que pide más de lo que
--    hay disponible en el origen se rechaza con el nombre del producto.
-- 3. Lotes y series obligatorios. Un producto con seguimiento no se mueve sin
--    lote, y una serie se mueve de a una unidad.
-- 4. Entregas parciales con backorder. Al validar se puede indicar cuánto se
--    hizo de cada línea; lo que falta queda en una transferencia nueva, ligada a
--    la original, igual que el "Crear entrega parcial" de Odoo.
--
-- Se puede correr más de una vez.

alter table public.inv_productos
  add column if not exists metodo_costo text not null default 'promedio';

do $$ begin
  alter table public.inv_productos
    add constraint inv_productos_metodo_costo_chk check (metodo_costo in ('estandar', 'promedio'));
exception when duplicate_object then null; end $$;

comment on column public.inv_productos.metodo_costo is
  'estandar: el costo se escribe a mano. promedio: cada recepción lo recalcula (AVCO).';

alter table public.inv_transferencias
  add column if not exists backorder_de uuid references public.inv_transferencias (id) on delete set null;

comment on column public.inv_transferencias.backorder_de is
  'Si esta transferencia es el saldo pendiente de otra validada en forma parcial, apunta a esa.';

-- Revisa que una línea pueda salir de su origen interno. p_reservado_propio es
-- lo que la misma transferencia ya tiene reservado ahí (cuando viene de "listo"),
-- que no cuenta como comprometido por otro.
create or replace function public.inv_revisar_salida(
  p_producto uuid, p_ubicacion uuid, p_lote uuid, p_cantidad numeric, p_reservado_propio numeric
) returns void language plpgsql as $$
declare v_cant numeric; v_res numeric; v_nombre text; v_tipo text;
begin
  select nombre, tipo into v_nombre, v_tipo from public.inv_productos where id = p_producto;
  -- Consumibles y servicios no controlan cantidad a mano.
  if v_tipo <> 'almacenable' then return; end if;

  select coalesce(sum(cantidad), 0), coalesce(sum(reservado), 0) into v_cant, v_res
  from public.inv_quants
  where producto_id = p_producto and ubicacion_id = p_ubicacion
    and (p_lote is null or lote_id = p_lote);

  if v_cant - (v_res - p_reservado_propio) < p_cantidad then
    raise exception 'Stock insuficiente de "%": se piden %, hay % disponibles',
      v_nombre, p_cantidad, greatest(v_cant - (v_res - p_reservado_propio), 0);
  end if;
end $$;

-- Revisa lote/serie de una línea.
create or replace function public.inv_revisar_seguimiento(p_producto uuid, p_lote uuid, p_cantidad numeric)
returns void language plpgsql as $$
declare v_seg text; v_nombre text;
begin
  select seguimiento, nombre into v_seg, v_nombre from public.inv_productos where id = p_producto;
  if v_seg in ('lote', 'serie') and p_lote is null then
    raise exception '"%" se controla por %: indica el % en la línea',
      v_nombre, case v_seg when 'lote' then 'lote' else 'número de serie' end,
      case v_seg when 'lote' then 'lote' else 'número de serie' end;
  end if;
  if v_seg = 'serie' and p_cantidad <> 1 then
    raise exception '"%" se controla por número de serie: cada línea mueve exactamente 1 unidad', v_nombre;
  end if;
end $$;

create or replace function public.inv_reservar_transferencia(p_id uuid) returns void language plpgsql as $$
declare m record;
begin
  update public.inv_transferencias set estado = 'listo', actualizado_en = now()
    where id = p_id and estado = 'borrador';
  if not found then raise exception 'La transferencia no está en borrador'; end if;

  for m in
    select mv.*, uo.tipo as origen_tipo
    from public.inv_movimientos mv
    join public.inv_ubicaciones uo on uo.id = mv.ubicacion_origen_id
    where mv.transferencia_id = p_id and mv.estado = 'borrador'
  loop
    perform public.inv_revisar_seguimiento(m.producto_id, m.lote_id, m.cantidad);
    if m.origen_tipo = 'interna' then
      perform public.inv_revisar_salida(m.producto_id, m.ubicacion_origen_id, m.lote_id, m.cantidad, 0);
      perform public.inv_mover_quant(m.producto_id, m.ubicacion_origen_id, m.lote_id, 0, m.cantidad);
    end if;
  end loop;
end $$;

-- La versión vieja (un solo argumento) queda reemplazada por esta.
drop function if exists public.inv_validar_transferencia(uuid);

-- Valida una transferencia. p_hechas es opcional: {"<id movimiento>": cantidad}.
-- Sin él, se hace todo lo planeado. Si alguna línea queda corta, el saldo pasa
-- a una transferencia nueva (backorder) que se devuelve; si no, devuelve null.
create or replace function public.inv_validar_transferencia(p_id uuid, p_hechas jsonb default null)
returns uuid language plpgsql as $$
declare
  m record; t record; tipo record;
  v_costo numeric; v_hecha numeric; v_resto numeric; v_reserva numeric;
  v_a_mano numeric; v_costo_actual numeric; v_backorder uuid; v_algo boolean := false;
begin
  select * into t from public.inv_transferencias where id = p_id for update;
  if t.id is null then raise exception 'La transferencia no existe'; end if;
  if t.estado = 'hecho' then raise exception 'La transferencia ya está validada'; end if;
  if t.estado = 'cancelado' then raise exception 'La transferencia está cancelada'; end if;

  if not exists (select 1 from public.inv_movimientos where transferencia_id = p_id and estado = 'borrador') then
    raise exception 'La transferencia no tiene líneas que mover';
  end if;

  for m in
    select mv.*, uo.tipo as origen_tipo, ud.tipo as destino_tipo,
           pr.costo as prod_costo, pr.metodo_costo, pr.tipo as prod_tipo
    from public.inv_movimientos mv
    join public.inv_ubicaciones uo on uo.id = mv.ubicacion_origen_id
    join public.inv_ubicaciones ud on ud.id = mv.ubicacion_destino_id
    join public.inv_productos   pr on pr.id = mv.producto_id
    where mv.transferencia_id = p_id and mv.estado = 'borrador'
    order by mv.creado_en
  loop
    v_hecha := coalesce((p_hechas ->> m.id::text)::numeric, m.cantidad);
    if v_hecha < 0 or v_hecha > m.cantidad then
      raise exception 'La cantidad hecha de una línea debe estar entre 0 y %', m.cantidad;
    end if;
    v_resto := m.cantidad - v_hecha;
    v_reserva := case when t.estado = 'listo' and m.origen_tipo = 'interna' then m.cantidad else 0 end;

    if v_hecha > 0 then
      v_algo := true;
      perform public.inv_revisar_seguimiento(m.producto_id, m.lote_id, v_hecha);
      v_costo := coalesce(m.costo_unitario, m.prod_costo, 0);

      if m.origen_tipo = 'interna' then
        -- Un ajuste refleja un conteo físico: se acepta aunque haya reservas encima.
        if t.clase <> 'ajuste' then
          perform public.inv_revisar_salida(m.producto_id, m.ubicacion_origen_id, m.lote_id, v_hecha, v_reserva);
        end if;
        perform public.inv_mover_quant(m.producto_id, m.ubicacion_origen_id, m.lote_id, -v_hecha, 0);
      end if;

      -- AVCO: una entrada desde fuera (proveedor, ajuste) a stock propio
      -- repondera el costo con lo que ya había a mano en todas las internas.
      if m.destino_tipo = 'interna' and m.origen_tipo <> 'interna'
         and m.metodo_costo = 'promedio' and m.prod_tipo = 'almacenable' and m.costo_unitario is not null then
        select coalesce(sum(q.cantidad), 0) into v_a_mano
        from public.inv_quants q join public.inv_ubicaciones u on u.id = q.ubicacion_id
        where q.producto_id = m.producto_id and u.tipo = 'interna';
        -- Se relee el costo: otra línea del mismo producto pudo haberlo movido.
        select costo into v_costo_actual from public.inv_productos where id = m.producto_id;
        if v_a_mano + v_hecha > 0 then
          update public.inv_productos
            set costo = round((greatest(v_a_mano, 0) * v_costo_actual + v_hecha * m.costo_unitario)
                              / (greatest(v_a_mano, 0) + v_hecha), 4),
                actualizado_en = now()
            where id = m.producto_id;
        end if;
      end if;

      if m.destino_tipo = 'interna' then
        perform public.inv_mover_quant(m.producto_id, m.ubicacion_destino_id, m.lote_id, v_hecha, 0);
      end if;
    end if;

    -- Libera la reserva entera de la línea: el saldo se vuelve a reservar
    -- cuando se confirme el backorder.
    if v_reserva > 0 then
      perform public.inv_mover_quant(m.producto_id, m.ubicacion_origen_id, m.lote_id, 0, -v_reserva);
    end if;

    if v_resto > 0 then
      if v_backorder is null then
        select * into tipo from public.inv_tipos_operacion where id = t.tipo_operacion_id for update;
        insert into public.inv_transferencias (
          referencia, tipo_operacion_id, clase, ubicacion_origen_id, ubicacion_destino_id,
          contraparte, nota, fecha_programada, creado_por, backorder_de)
        values (
          coalesce(tipo.prefijo || lpad((tipo.correlativo + 1)::text, 5, '0'), t.referencia || '-BO'),
          t.tipo_operacion_id, t.clase, t.ubicacion_origen_id, t.ubicacion_destino_id,
          t.contraparte, 'Saldo pendiente de ' || t.referencia, t.fecha_programada, t.creado_por, t.id)
        returning id into v_backorder;
        if tipo.id is not null then
          update public.inv_tipos_operacion set correlativo = correlativo + 1 where id = tipo.id;
        end if;
      end if;
      insert into public.inv_movimientos (
        transferencia_id, producto_id, unidad_id, lote_id, ubicacion_origen_id, ubicacion_destino_id,
        cantidad, costo_unitario)
      values (v_backorder, m.producto_id, m.unidad_id, m.lote_id, m.ubicacion_origen_id, m.ubicacion_destino_id,
        v_resto, m.costo_unitario);
    end if;

    update public.inv_movimientos
      set estado = case when v_hecha > 0 then 'hecho' else 'cancelado' end,
          cantidad_hecha = v_hecha,
          costo_unitario = case when v_hecha > 0 then v_costo else m.costo_unitario end
      where id = m.id;
  end loop;

  if not v_algo then
    raise exception 'Indica una cantidad hecha mayor que cero en al menos una línea';
  end if;

  update public.inv_transferencias
    set estado = 'hecho', fecha_validacion = now(), actualizado_en = now()
    where id = p_id;

  return v_backorder;
end $$;
