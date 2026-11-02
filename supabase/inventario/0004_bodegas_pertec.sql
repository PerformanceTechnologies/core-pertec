-- Inventario: las bodegas reales de PERTEC.
--
--   · Bodega Amunátegui (principal): es la «Bodega Central» de la migración 0001
--     con otro nombre. Se renombra en vez de crear otra para que el stock, los
--     movimientos y las operaciones que ya tenga sigan en su lugar.
--   · Bodega Calama y Bodega Enea: nuevas, cada una con su ubicación de stock y
--     sus operaciones de recepción, entrega y transferencia interna.
--
-- Se puede correr más de una vez (todo se busca por código).

-- 1. La principal: Bodega Central → Bodega Amunátegui.
update public.inv_almacenes set nombre = 'Bodega Amunátegui', codigo = 'AMU' where codigo = 'BC';
update public.inv_ubicaciones set nombre = 'Bodega Amunátegui / Stock', codigo = 'AMU-STOCK' where codigo = 'BC-STOCK';

-- 2. Calama y Enea, con su stock y sus operaciones.
do $$
declare
  b record;
  v_almacen uuid;
  v_stock   uuid;
  v_prov    uuid;
  v_cli     uuid;
begin
  select id into v_prov from public.inv_ubicaciones where tipo = 'proveedor' order by creado_en limit 1;
  select id into v_cli  from public.inv_ubicaciones where tipo = 'cliente'   order by creado_en limit 1;

  for b in select * from (values ('Bodega Calama', 'CAL'), ('Bodega Enea', 'ENE')) as t(nombre, codigo) loop
    select id into v_almacen from public.inv_almacenes where codigo = b.codigo;
    if v_almacen is null then
      insert into public.inv_almacenes (nombre, codigo) values (b.nombre, b.codigo) returning id into v_almacen;
    end if;

    select id into v_stock from public.inv_ubicaciones where codigo = b.codigo || '-STOCK';
    if v_stock is null then
      insert into public.inv_ubicaciones (nombre, codigo, tipo, almacen_id, es_stock_principal)
        values (b.nombre || ' / Stock', b.codigo || '-STOCK', 'interna', v_almacen, true)
        returning id into v_stock;
    end if;

    insert into public.inv_tipos_operacion (nombre, codigo, clase, almacen_id, ubicacion_origen_id, ubicacion_destino_id, prefijo)
    select x.nombre, x.codigo, x.clase, v_almacen, x.origen, x.destino, x.prefijo
    from (values
      ('Recepciones ' || b.nombre,             b.codigo || '-REC', 'recepcion', v_prov,  v_stock, b.codigo || '/REC'),
      ('Entregas ' || b.nombre,                b.codigo || '-ENT', 'entrega',   v_stock, v_cli,   b.codigo || '/ENT'),
      ('Transferencias internas ' || b.nombre, b.codigo || '-INT', 'interna',   v_stock, v_stock, b.codigo || '/INT')
    ) as x(nombre, codigo, clase, origen, destino, prefijo)
    where x.origen is not null and x.destino is not null
      and not exists (select 1 from public.inv_tipos_operacion t where t.codigo = x.codigo);
  end loop;
end $$;

-- 3. Las operaciones de la principal dicen de qué bodega son, como las nuevas.
update public.inv_tipos_operacion set nombre = 'Recepciones Bodega Amunátegui' where codigo = 'BC-REC' and nombre = 'Recepciones';
update public.inv_tipos_operacion set nombre = 'Entregas Bodega Amunátegui' where codigo = 'BC-ENT' and nombre = 'Entregas';
update public.inv_tipos_operacion set nombre = 'Transferencias internas Bodega Amunátegui' where codigo = 'BC-INT' and nombre = 'Transferencias internas';
