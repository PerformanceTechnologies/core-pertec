-- Módulos separados por empresa (tanda 1): cada fila principal guarda su empresa.
-- Todo lo que ya existe queda en PERTEC. Se puede correr más de una vez.
do $$
declare
  pertec uuid := (select id from public.empresas where slug = 'pertec');
  t text;
begin
  foreach t in array array[
    'crm_tareas',
    'inv_productos', 'inv_almacenes', 'inv_ubicaciones', 'inv_transferencias',
    'flo_vehiculos', 'flo_contratos',
    'ct_contratos',
    'cotizaciones',
    'ofertas_documentos'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'No existe %, se salta', t;
      continue;
    end if;
    execute format('alter table public.%I add column if not exists empresa_id uuid references public.empresas(id)', t);
    execute format('update public.%I set empresa_id = %L where empresa_id is null', t, pertec);
    execute format('alter table public.%I alter column empresa_id set default %L', t, pertec);
    execute format('create index if not exists %I on public.%I (empresa_id)', t || '_empresa', t);
  end loop;
end $$;
