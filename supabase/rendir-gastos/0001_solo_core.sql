-- Rendir Gastos deja Odoo: todo el ciclo vive en el Core.
--
-- Antes una rendición terminaba «cargada a Odoo» (hr.expense) y la aprobación y el pago
-- pasaban allá. Ahora el flujo es propio:
--
--   borrador ──enviar──▶ enviada ──aprobar──▶ aprobada ──pagar──▶ pagada
--      ▲                    │
--      └──── rechazada ◀────┘ (con motivo; quien rinde corrige y vuelve a enviar)
--
-- Las rendiciones viejas en «cargada_odoo» se conservan tal cual, como históricas.
-- Quien rinde pasa a ser un usuario del Core (por correo), no una ficha de empleado de Odoo.
--
-- Se puede correr más de una vez.

alter table public.rendiciones
  add column if not exists rinde_correo   text,
  add column if not exists enviada_en     timestamptz,
  add column if not exists revisada_por   text,
  add column if not exists revisada_en    timestamptz,
  add column if not exists motivo_rechazo text,
  add column if not exists pagada_por     text,
  add column if not exists pagada_en      timestamptz,
  add column if not exists nota_pago      text;

-- El empleado de Odoo deja de ser obligatorio (las nuevas no lo tienen).
alter table public.rendiciones alter column odoo_employee_id drop not null;

-- El estado acepta el flujo nuevo. Se reemplaza la restricción que hubiera, se llame como se llame.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.rendiciones'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%estado%'
  loop
    execute format('alter table public.rendiciones drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.rendiciones
  add constraint rendiciones_estado_check
  check (estado in ('borrador', 'enviada', 'aprobada', 'rechazada', 'pagada', 'cargada_odoo'));

create index if not exists rendiciones_estado_idx on public.rendiciones (estado);
create index if not exists rendiciones_rinde_idx on public.rendiciones (lower(rinde_correo));

-- Quien rinde en las que ya existen: el correo de quien la creó.
update public.rendiciones r
set rinde_correo = lower(u.correo)
from public.usuarios u
where r.rinde_correo is null and r.creado_por::text = u.id::text;

-- La vista de la lista, con los datos del flujo nuevo.
drop view if exists public.rendiciones_resumen;
create view public.rendiciones_resumen
with (security_invoker = true) as
select
  r.id,
  r.creado_por,
  r.rinde_correo,
  r.nombre_quien_rinde,
  r.monto_asignado,
  r.titulo_rendicion,
  r.estado,
  jsonb_array_length(coalesce(r.gastos, '[]'::jsonb))                                   as cantidad_gastos,
  coalesce((select sum((g->>'total')::numeric) from jsonb_array_elements(r.gastos) g), 0) as total_gastos,
  r.enviada_en,
  r.revisada_en,
  r.motivo_rechazo,
  r.pagada_en,
  r.creado_en
from public.rendiciones r;

notify pgrst, 'reload schema';
