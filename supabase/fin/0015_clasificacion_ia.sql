-- Clasificación con IA: Claude sugiere la categoría y la subcategoría de los movimientos del banco que ni las reglas ni
-- los movimientos anteriores reconocen, y el Core mide cuánto acierta.
--
--   · fin_movimientos.sugerencia_ia   lo que propuso la IA: { categoria_id, subcategoria_id, confianza (0 a 1), motivo,
--                                      modelo, en }. Se calcula una vez por movimiento (no en cada carga de pantalla).
--   · fin_movimientos.ia_revisado_en  cuándo lo revisó la IA (también si no se atrevió a sugerir: así no se repite).
--   · fin_movimientos.ia_resultado    al clasificarlo una persona: «aceptada» si eligió lo mismo que la IA, «corregida»
--                                      si eligió otra cosa. De ahí sale el % de acierto.
--   · clasificado_por admite «ia» (cuando se acepta la sugerencia o, si se activó, cuando se aplica sola).
-- La opción «aplicar sola cuando la seguridad sea alta» vive en fin_parametros.flags (ia_auto, ia_umbral): apagada por
-- omisión. Se puede correr más de una vez.

alter table public.fin_movimientos add column if not exists sugerencia_ia jsonb;
alter table public.fin_movimientos add column if not exists ia_revisado_en timestamptz;
alter table public.fin_movimientos add column if not exists ia_resultado text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_movimientos_ia_resultado_check') then
    alter table public.fin_movimientos add constraint fin_movimientos_ia_resultado_check
      check (ia_resultado is null or ia_resultado in ('aceptada', 'corregida'));
  end if;
end $$;

alter table public.fin_movimientos drop constraint if exists fin_movimientos_clasificado_por_check;
alter table public.fin_movimientos add constraint fin_movimientos_clasificado_por_check
  check (clasificado_por is null or clasificado_por in ('manual', 'regla', 'rut', 'historial', 'heredado', 'migracion', 'ia'));

create index if not exists fin_movimientos_ia_pendientes_idx on public.fin_movimientos (empresa_id)
  where categoria_id is null and ia_revisado_en is null;

notify pgrst, 'reload schema';
