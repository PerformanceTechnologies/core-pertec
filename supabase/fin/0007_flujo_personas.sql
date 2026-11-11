-- Permisos de flujos: quién puede ejecutar cada paso de los flujos de Finanzas (compras y pagos,
-- ventas y cobranza, tesorería). Lo asigna el administrador global desde Gestión financiera ›
-- «Permisos de flujos».
--
-- Reglas:
--  · Varias personas por rol: basta con que UNA de ellas actúe (titular y suplentes).
--  · Rol sin nadie asignado = cualquiera con la app puede (no bloquea nada al desplegar).
--  · El administrador global siempre puede.
-- Se puede correr más de una vez.

create table if not exists public.fin_flujo_personas (
  empresa_id   uuid not null references public.empresas(id),
  rol          text not null check (rol in (
    'compras_aprobador', 'compras_visador', 'compras_recepcion', 'compras_pagador',
    'ventas_facturador', 'ventas_cobrador',
    'tesoreria_conciliador', 'tesoreria_factoring'
  )),
  usuario_id   uuid not null references public.usuarios(id) on delete cascade,
  asignado_por text,
  creado_en    timestamptz not null default now(),
  primary key (empresa_id, rol, usuario_id)
);

alter table public.fin_flujo_personas enable row level security;

notify pgrst, 'reload schema';
