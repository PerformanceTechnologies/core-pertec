-- Remuneraciones (Gestión financiera › Remuneraciones, solo Performance Technologies): permiso para verlas.
--
-- Reusa la tabla de «Permisos de flujos» (fin_flujo_personas), pero con la regla contraria a los demás roles:
-- un flujo sin nadie asignado queda abierto a cualquiera con la app, y los sueldos NO. Aquí, sin nadie asignado
-- solo entra el administrador del Core. Esa regla vive en lib/fin/remuneraciones-acceso.ts.
--
-- Solo agrega el valor 'remuneraciones_ver' al CHECK de la columna rol: sin esta migración, asignar la
-- persona falla (el administrador del Core igual puede ver la pestaña). Se puede correr más de una vez.

alter table public.fin_flujo_personas drop constraint if exists fin_flujo_personas_rol_check;
alter table public.fin_flujo_personas add constraint fin_flujo_personas_rol_check check (rol in (
  'compras_aprobador', 'compras_visador', 'compras_recepcion', 'compras_pagador',
  'ventas_facturador', 'ventas_cobrador',
  'tesoreria_conciliador', 'tesoreria_factoring',
  'remuneraciones_ver'
));

notify pgrst, 'reload schema';
