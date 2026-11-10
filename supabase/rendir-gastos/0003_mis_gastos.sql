-- =============================================================================
--  Rendir Gastos — «Mis gastos»: boletas sueltas que después se asocian a un informe.
--
--  Cada persona tiene una «bolsa» (una fila de rendiciones con tipo = 'bolsa') donde sube y
--  la IA lee sus boletas sin informe. Desde ahí las pasa a un informe. La bolsa no aparece en
--  las listas de informes.
--
--  De paso, el total de la lista ya no suma las boletas rechazadas en la revisión.
--  Se puede correr más de una vez.
-- =============================================================================

alter table public.rendiciones
  add column if not exists tipo text not null default 'informe';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rendiciones_tipo_check') then
    alter table public.rendiciones add constraint rendiciones_tipo_check check (tipo in ('informe', 'bolsa'));
  end if;
end $$;

create index if not exists rendiciones_bolsa on public.rendiciones (rinde_correo) where tipo = 'bolsa';

drop view if exists public.rendiciones_resumen;
create view public.rendiciones_resumen
with (security_invoker = true) as
select
  r.id, r.creado_por, r.rinde_correo, r.nombre_quien_rinde, r.monto_asignado,
  r.titulo_rendicion, r.estado,
  jsonb_array_length(coalesce(r.gastos, '[]'::jsonb)) as cantidad_gastos,
  coalesce((select sum((g->>'total')::numeric) from jsonb_array_elements(r.gastos) g
            where coalesce(g->'revision'->>'estado', 'cargada') <> 'rechazada'), 0) as total_gastos,
  r.enviada_en, r.revisada_en, r.motivo_rechazo, r.pagada_en, r.creado_en,
  r.fondo_id, r.empresa_id
from public.rendiciones r
where r.tipo = 'informe';

notify pgrst, 'reload schema';
