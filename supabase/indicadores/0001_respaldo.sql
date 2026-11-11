-- Indicadores económicos (UF, dólar, UTM…): el último valor que se leyó bien.
-- Si la fuente externa falla, el Core muestra estos en vez de un error.
-- Se puede correr más de una vez.
create table if not exists public.indicadores_respaldo (
  id             text primary key default 'ultimo',
  datos          jsonb not null,
  fuente         text not null,
  actualizado_en timestamptz not null default now()
);
alter table public.indicadores_respaldo enable row level security;
notify pgrst, 'reload schema';
