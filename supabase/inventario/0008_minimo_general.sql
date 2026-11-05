-- Inventario: aviso de stock bajo general.
--
-- Un solo mínimo (y hasta cuánto comprar) que vale para TODOS los productos almacenables que no
-- tengan su propio mínimo en la ficha. Con 0 no avisa. Una sola fila (id = 1).
--
-- Se puede correr más de una vez.

create table if not exists public.inv_configuracion (
  id int primary key default 1 check (id = 1),
  minimo_general numeric not null default 0 check (minimo_general >= 0),
  maximo_general numeric not null default 0 check (maximo_general >= 0),
  actualizado_en timestamptz not null default now()
);

insert into public.inv_configuracion (id) values (1) on conflict (id) do nothing;

alter table public.inv_configuracion enable row level security;
