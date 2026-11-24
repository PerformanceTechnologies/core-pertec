-- Clasificación de gastos e ingresos: la lista maestra de Finanzas (hoja «Lista» del Excel de cartolas Itaú 2026).
--
-- Reemplaza las 10 categorías genéricas de la migración 0001 por las 15 de Finanzas, ahora en dos niveles:
--   · fin_categorias      Categoría (8 de egreso, 9 de ingreso; Financiamiento y Traspasos Internos están en ambos lados,
--                          así que son 15 filas). afecta_resultado = false en Financiamiento y Traspasos Internos: entran y
--                          salen de caja, pero no son ingreso ni gasto y se excluyen de los totales.
--   · fin_subcategorias   Subcategoría, con clave a su categoría (75, solo de egreso). Los textos son EXACTOS a los del
--                          Excel: la clasificación histórica usa esos valores.
-- Y deja que la clasificación viaje con el documento:
--   · fin_movimientos.subcategoria_id y clasificado_por (manual, regla, rut, historial, heredado, migracion).
--   · fin_reglas.subcategoria_id y contraparte_rut (una regla puede reconocer el RUT en vez del texto de la glosa).
--   · fin_compras.subcategoria_id: quien pide la compra dice qué tipo de gasto es; el pago y el banco lo heredan.
--   · El rol «tesoreria_categorias» (mantiene la lista maestra) en Permisos de flujos.
--
-- Las 10 categorías antiguas quedan INACTIVAS (no se borran). Los movimientos que las usaban pasan a la nueva cuando
-- la equivalencia es clara (Remuneraciones, Comisión banco, Traspaso entre cuentas, Pago proveedor, Cobro cliente,
-- abonos de Factoring); los demás (Impuestos, Gasto tarjeta, Crédito o leasing, Otro, cargos de Factoring) quedan sin
-- categoría, es decir «Por aclarar», para que Tesorería los revise con la lista nueva.
--
-- Las cuentas contables son PROVISORIAS (las del plan de cuentas de la 0001): el contador las valida antes de activar la
-- contabilidad en el Core. Se puede correr más de una vez.

-- ── Esquema ────────────────────────────────────────────────────────────────────────────────────
alter table public.fin_categorias add column if not exists afecta_resultado boolean not null default true;

create table if not exists public.fin_subcategorias (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id),
  categoria_id      uuid not null references public.fin_categorias(id) on delete cascade,
  nombre            text not null,
  cuenta_contable   text,
  orden             int not null default 0,
  activa            boolean not null default true,
  creado_en         timestamptz not null default now(),
  unique (categoria_id, nombre)
);
create index if not exists fin_subcategorias_empresa_idx on public.fin_subcategorias (empresa_id, categoria_id, orden);
alter table public.fin_subcategorias enable row level security;

alter table public.fin_movimientos add column if not exists subcategoria_id uuid references public.fin_subcategorias(id);
alter table public.fin_movimientos add column if not exists clasificado_por text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_movimientos_clasificado_por_check') then
    alter table public.fin_movimientos add constraint fin_movimientos_clasificado_por_check
      check (clasificado_por is null or clasificado_por in ('manual', 'regla', 'rut', 'historial', 'heredado', 'migracion'));
  end if;
end $$;
create index if not exists fin_movimientos_rut_idx on public.fin_movimientos (empresa_id, contraparte_rut) where contraparte_rut is not null;

alter table public.fin_reglas add column if not exists subcategoria_id uuid references public.fin_subcategorias(id) on delete cascade;
alter table public.fin_reglas add column if not exists contraparte_rut text;
alter table public.fin_reglas alter column patron set default '';

alter table public.fin_compras add column if not exists subcategoria_id uuid references public.fin_subcategorias(id);

alter table public.fin_flujo_personas drop constraint if exists fin_flujo_personas_rol_check;
alter table public.fin_flujo_personas add constraint fin_flujo_personas_rol_check check (rol in (
  'compras_aprobador', 'compras_visador', 'compras_recepcion', 'compras_pagador',
  'ventas_facturador', 'ventas_cobrador',
  'tesoreria_conciliador', 'tesoreria_factoring', 'tesoreria_categorias',
  'remuneraciones_ver'
));

-- ── La lista maestra, por empresa ──────────────────────────────────────────────────────────────
do $$
declare
  e record;
  c record;
begin
  for e in select id from public.empresas where slug in ('pertec', 'zeus', 'performance-service') loop

    -- Categorías: (nombre, sentido, pide proyecto, afecta resultado, cuenta por omisión, orden)
    insert into public.fin_categorias (empresa_id, nombre, sentido, requiere_proyecto, afecta_resultado, cuenta_contable, orden, activa)
    values
      (e.id, 'Personal y Dotación',      'egreso',  false, true,  '5.3.01', 1,  true),
      (e.id, 'Backoffice y Admin',       'egreso',  false, true,  '5.3.01', 2,  true),
      (e.id, 'Operaciones y Proyectos',  'egreso',  true,  true,  '5.1.01', 3,  true),
      (e.id, 'Impuestos y Cotizaciones', 'egreso',  false, true,  '5.5.01', 4,  true),
      (e.id, 'Costos Financieros',       'egreso',  false, true,  '5.4.02', 5,  true),
      (e.id, 'Inversión',                'egreso',  false, true,  null,     6,  true),
      (e.id, 'Financiamiento',           'ambos',   false, false, '2.2.01', 7,  true),
      (e.id, 'Traspasos Internos',       'ambos',   false, false, '1.1.02', 8,  true),
      (e.id, 'Servicios',                'ingreso', false, true,  '4.1.01', 11, true),
      (e.id, 'Proyecto Spot',            'ingreso', false, true,  '4.1.01', 12, true),
      (e.id, 'Arriendos',                'ingreso', false, true,  '4.1.02', 13, true),
      (e.id, 'Ventas',                   'ingreso', false, true,  '4.1.03', 14, true),
      (e.id, 'Otros Ingresos',           'ingreso', false, true,  '4.2.01', 15, true),
      (e.id, 'Intereses Ganados',        'ingreso', false, true,  '4.2.01', 16, true),
      (e.id, 'Devolución Impuestos',     'ingreso', false, true,  '4.2.01', 17, true)
    on conflict (empresa_id, nombre) do update set afecta_resultado = excluded.afecta_resultado;

    -- Subcategorías: (categoría, nombre, cuenta propia o null = la de la categoría, orden)
    for c in
      select * from (values
        ('Personal y Dotación', 'Remuneraciones', '2.1.06', 1),
        ('Personal y Dotación', 'Finiquitos', '2.1.06', 2),
        ('Personal y Dotación', 'Traslado / Pasajes', null, 3),
        ('Personal y Dotación', 'Alojamiento', null, 4),
        ('Personal y Dotación', 'Alimentación', null, 5),
        ('Personal y Dotación', 'EPP', null, 6),
        ('Personal y Dotación', 'Exámenes', null, 7),
        ('Personal y Dotación', 'Indumentaria / Uniformes', null, 8),
        ('Personal y Dotación', 'Capacitación', null, 9),
        ('Backoffice y Admin', 'Software y Suscripciones', null, 1),
        ('Backoffice y Admin', 'Telecomunicaciones / Internet', null, 2),
        ('Backoffice y Admin', 'Servicios Básicos Admin', null, 3),
        ('Backoffice y Admin', 'Arriendo Oficina', null, 4),
        ('Backoffice y Admin', 'Gastos Comunes / Edificio', null, 5),
        ('Backoffice y Admin', 'Servicios Contables', null, 6),
        ('Backoffice y Admin', 'Asesorías Legales y Notariales', null, 7),
        ('Backoffice y Admin', 'Boletas Honorarios Admin', null, 8),
        ('Backoffice y Admin', 'Seguros Admin', null, 9),
        ('Backoffice y Admin', 'Servicios de Seguridad Admin', null, 10),
        ('Backoffice y Admin', 'Leasing Admin', null, 11),
        ('Backoffice y Admin', 'Gastos de Gestión', null, 12),
        ('Backoffice y Admin', 'Insumos de Oficina', null, 13),
        ('Backoffice y Admin', 'Marketing y Publicidad', null, 14),
        ('Backoffice y Admin', 'Mantención y Reparaciones', null, 15),
        ('Backoffice y Admin', 'Fondo por Rendir', '1.1.08', 16),
        ('Backoffice y Admin', 'Otros Gastos Admin', null, 17),
        ('Operaciones y Proyectos', 'Proveedores / Subcontratos', null, 1),
        ('Operaciones y Proyectos', 'Boletas Honorarios Operacional', null, 2),
        ('Operaciones y Proyectos', 'Ayudantes / Conductores', null, 3),
        ('Operaciones y Proyectos', 'Repuestos / Insumos', null, 4),
        ('Operaciones y Proyectos', 'Acreditación', null, 5),
        ('Operaciones y Proyectos', 'Arriendo Maquinaria', null, 6),
        ('Operaciones y Proyectos', 'Arriendo Vehículo', null, 7),
        ('Operaciones y Proyectos', 'Leasing Operacional', null, 8),
        ('Operaciones y Proyectos', 'Seguros Operacional', null, 9),
        ('Operaciones y Proyectos', 'Servicios de Seguridad Operacional', null, 10),
        ('Operaciones y Proyectos', 'Estudios', null, 11),
        ('Operaciones y Proyectos', 'Servicios Básicos', null, 12),
        ('Operaciones y Proyectos', 'Transporte / Carga', null, 13),
        ('Operaciones y Proyectos', 'Vehículos (Autorenta/Combustible)', null, 14),
        ('Operaciones y Proyectos', 'Mantención y Reparación Vehículos', null, 15),
        ('Operaciones y Proyectos', 'Desmovilización', null, 16),
        ('Operaciones y Proyectos', 'Bodega', null, 17),
        ('Operaciones y Proyectos', 'Otros Gastos Operacionales', null, 18),
        ('Impuestos y Cotizaciones', 'Leyes Sociales (Previred)', '2.1.07', 1),
        ('Impuestos y Cotizaciones', 'Retención Honorarios (F29)', '2.1.05', 2),
        ('Impuestos y Cotizaciones', 'Impuesto Único 2ª Categoría', '2.1.05', 3),
        ('Impuestos y Cotizaciones', 'IVA Neto (F29)', '2.1.04', 4),
        ('Impuestos y Cotizaciones', 'IVA Bancario (Crédito Fiscal)', '1.1.05', 5),
        ('Impuestos y Cotizaciones', 'PPM', '1.1.06', 6),
        ('Impuestos y Cotizaciones', 'Declaración Renta (F22)', '2.1.08', 7),
        ('Impuestos y Cotizaciones', 'Patente / Permisos Municipales', null, 8),
        ('Impuestos y Cotizaciones', 'Contribuciones', null, 9),
        ('Impuestos y Cotizaciones', 'Timbres y Estampillas', null, 10),
        ('Impuestos y Cotizaciones', 'Multas e Intereses', null, 11),
        ('Impuestos y Cotizaciones', 'Otros Impuestos', null, 12),
        ('Costos Financieros', 'Comisión Factoring', '5.4.01', 1),
        ('Costos Financieros', 'Intereses Factoring por Mora', '5.4.01', 2),
        ('Costos Financieros', 'Intereses Bancarios', null, 3),
        ('Costos Financieros', 'Comisiones Bancarias', null, 4),
        ('Costos Financieros', 'Mantención Cuentas Bancarias', null, 5),
        ('Costos Financieros', 'Diferencia de Cambio', null, 6),
        ('Costos Financieros', 'Otros Costos Financieros', null, 7),
        ('Inversión', 'Compra de Maquinaria / Activos', '1.2.01', 1),
        ('Inversión', 'Costos Licitación', '5.3.01', 2),
        ('Inversión', 'Costos Nuevos Negocios', '5.3.01', 3),
        ('Inversión', 'Préstamos Otorgados', null, 4),
        ('Financiamiento', 'Anticipo Factoring', '2.1.03', 1),
        ('Financiamiento', 'Préstamos Relacionadas', null, 2),
        ('Financiamiento', 'Créditos Bancarios (Capital)', null, 3),
        ('Financiamiento', 'Aportes / Retiros de Socios', '3.1.01', 4),
        ('Traspasos Internos', 'Pago Tarjeta de Crédito', '2.1.02', 1),
        ('Traspasos Internos', 'Compra / Venta de Divisas', null, 2),
        ('Traspasos Internos', 'Traspaso Deuda Internacional TC', null, 3),
        ('Traspasos Internos', 'Traspaso entre Cuentas', null, 4)
      ) as t(categoria, nombre, cuenta, orden)
    loop
      insert into public.fin_subcategorias (empresa_id, categoria_id, nombre, cuenta_contable, orden)
      select e.id, k.id, c.nombre, c.cuenta, c.orden
      from public.fin_categorias k
      where k.empresa_id = e.id and k.nombre = c.categoria
      on conflict (categoria_id, nombre) do nothing;
    end loop;
  end loop;
end $$;

-- ── Lo ya clasificado con las 10 categorías antiguas ───────────────────────────────────────────
-- Equivalencias claras (categoría antigua → categoría y subcategoría nuevas). Lo demás queda por aclarar.

-- Movimientos con equivalencia clara.
with q(antigua, categoria, subcategoria, solo_abonos) as (values
  ('Remuneraciones',         'Personal y Dotación',     'Remuneraciones',             false),
  ('Comisión banco',         'Costos Financieros',      'Comisiones Bancarias',       false),
  ('Traspaso entre cuentas', 'Traspasos Internos',      'Traspaso entre Cuentas',     false),
  ('Pago proveedor',         'Operaciones y Proyectos', 'Proveedores / Subcontratos', false),
  ('Factoring',              'Financiamiento',          'Anticipo Factoring',         true)
)
update public.fin_movimientos m
set categoria_id = nueva.id, subcategoria_id = sub.id, clasificado_por = 'migracion', regla_id = null, actualizado_en = now()
from public.fin_categorias vieja
join q on q.antigua = vieja.nombre
join public.fin_categorias nueva on nueva.empresa_id = vieja.empresa_id and nueva.nombre = q.categoria
join public.fin_subcategorias sub on sub.categoria_id = nueva.id and sub.nombre = q.subcategoria
where m.categoria_id = vieja.id and (not q.solo_abonos or m.monto > 0);

-- Cobros de clientes: el ingreso según lo que se facturó (hito de servicio, arriendo o venta; proyecto spot).
update public.fin_movimientos m
set categoria_id = nueva.id, subcategoria_id = null, clasificado_por = 'migracion', regla_id = null, actualizado_en = now()
from public.fin_categorias vieja, public.fin_categorias nueva
where m.categoria_id = vieja.id and vieja.nombre = 'Cobro cliente'
  and nueva.empresa_id = vieja.empresa_id
  and nueva.nombre = coalesce((
    select case when p.tipo = 'spot' then 'Proyecto Spot' when h.tipo = 'arriendo' then 'Arriendos' when h.tipo = 'venta' then 'Ventas' else 'Servicios' end
    from public.fin_cobros cb
    join public.fin_cobro_aplicaciones a on a.cobro_id = cb.id
    join public.fin_documento_hitos dh on dh.documento_id = a.documento_id
    join public.fin_hitos h on h.id = dh.hito_id
    left join public.fin_proyectos p on p.id = h.proyecto_id
    where cb.movimiento_id = m.id
    order by a.monto desc
    limit 1
  ), 'Servicios');

-- Sin equivalencia clara: vuelven a «Por aclarar» (se conserva el respaldo, el proyecto y el comentario).
update public.fin_movimientos m
set categoria_id = null, subcategoria_id = null, clasificado_por = null, regla_id = null, actualizado_en = now()
from public.fin_categorias vieja
where m.categoria_id = vieja.id
  and vieja.nombre in ('Cobro cliente', 'Pago proveedor', 'Remuneraciones', 'Impuestos', 'Factoring', 'Gasto tarjeta', 'Comisión banco', 'Traspaso entre cuentas', 'Crédito o leasing', 'Otro');

-- Reglas: las de equivalencia clara apuntan a la nueva; las demás se desactivan (se ven en Configuración).
with q(antigua, categoria, subcategoria, solo_abonos) as (values
  ('Remuneraciones',         'Personal y Dotación',     'Remuneraciones',             false),
  ('Comisión banco',         'Costos Financieros',      'Comisiones Bancarias',       false),
  ('Traspaso entre cuentas', 'Traspasos Internos',      'Traspaso entre Cuentas',     false),
  ('Pago proveedor',         'Operaciones y Proyectos', 'Proveedores / Subcontratos', false),
  ('Factoring',              'Financiamiento',          'Anticipo Factoring',         true)
)
update public.fin_reglas r
set categoria_id = nueva.id, subcategoria_id = sub.id
from public.fin_categorias vieja
join q on q.antigua = vieja.nombre and not q.solo_abonos
join public.fin_categorias nueva on nueva.empresa_id = vieja.empresa_id and nueva.nombre = q.categoria
join public.fin_subcategorias sub on sub.categoria_id = nueva.id and sub.nombre = q.subcategoria
where r.categoria_id = vieja.id;

update public.fin_reglas r
set activa = false
from public.fin_categorias vieja
where r.categoria_id = vieja.id
  and vieja.nombre in ('Cobro cliente', 'Pago proveedor', 'Remuneraciones', 'Impuestos', 'Factoring', 'Gasto tarjeta', 'Comisión banco', 'Traspaso entre cuentas', 'Crédito o leasing', 'Otro');

-- Las 10 antiguas quedan inactivas: ya no se ofrecen, pero el historial y la auditoría siguen leyéndose.
update public.fin_categorias
set activa = false, orden = 900 + orden
where nombre in ('Cobro cliente', 'Pago proveedor', 'Remuneraciones', 'Impuestos', 'Factoring', 'Gasto tarjeta', 'Comisión banco', 'Traspaso entre cuentas', 'Crédito o leasing', 'Otro')
  and activa;

notify pgrst, 'reload schema';
