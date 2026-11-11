-- Modo invitado: personas de fuera de PERTEC con acceso solo a los módulos que se les asignen.
-- Entran con su correo y un código de 6 dígitos que les llega por mail (no usan Microsoft).
-- Se puede correr más de una vez.
alter table public.usuarios add column if not exists tipo text not null default 'interno';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usuarios_tipo_check') then
    alter table public.usuarios add constraint usuarios_tipo_check check (tipo in ('interno', 'invitado'));
  end if;
end $$;

-- El código vigente de cada invitado (guardado con hash; vence a los 10 minutos).
create table if not exists public.codigos_acceso (
  correo     text primary key,
  hash       text not null,
  expira_en  timestamptz not null,
  intentos   int not null default 0,
  creado_en  timestamptz not null default now()
);
alter table public.codigos_acceso enable row level security;
notify pgrst, 'reload schema';
