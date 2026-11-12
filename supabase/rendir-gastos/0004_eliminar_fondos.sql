-- =============================================================================
--  Rendir Gastos — eliminar un fondo (solo para limpiar pruebas; lo ejecuta el administrador del Core).
--
--  El libro de movimientos es inmutable (un trigger impide borrarlo). Esta función es la ÚNICA forma
--  de borrar: abre una excepción solo dentro de su propia transacción, elimina el fondo con TODO lo que
--  cuelga de él (movimientos, aprobaciones, auditoría, informes y sus gastos) y deja una huella en
--  rg_auditoria. Se llama desde el servidor con la llave de servicio; nadie más puede ejecutarla.
--
--  Se puede correr más de una vez.
-- =============================================================================

create or replace function public.rg_movimientos_inmutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    -- Solo rg_eliminar_fondo() levanta esta bandera, y solo dentro de su transacción.
    if current_setting('rg.eliminar_fondo', true) = 'si' then
      return old;
    end if;
    raise exception 'El libro de movimientos no se borra: registra un contra-asiento.';
  end if;
  if (new.fondo_id, new.informe_id, new.boleta_id, new.tipo, new.monto, new.signo, new.saldo_resultante, new.usuario, new.fecha)
     is distinct from
     (old.fondo_id, old.informe_id, old.boleta_id, old.tipo, old.monto, old.signo, old.saldo_resultante, old.usuario, old.fecha) then
    raise exception 'El libro de movimientos no se edita: registra un contra-asiento.';
  end if;
  return new;
end $$;

create or replace function public.rg_eliminar_fondo(p_fondo uuid, p_usuario text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_codigo   text;
  v_informes uuid[];
  v_movs     int;
begin
  select codigo into v_codigo from public.rg_fondos where id = p_fondo;
  if v_codigo is null then
    raise exception 'El fondo no existe.';
  end if;
  select coalesce(array_agg(id), '{}') into v_informes from public.rendiciones where fondo_id = p_fondo;

  perform set_config('rg.eliminar_fondo', 'si', true);   -- true = solo esta transacción
  delete from public.rg_movimientos where fondo_id = p_fondo;
  get diagnostics v_movs = row_count;
  delete from public.rg_aprobaciones where (entidad = 'fondo' and entidad_id = p_fondo) or (entidad = 'informe' and entidad_id = any(v_informes));
  delete from public.rg_auditoria   where (entidad = 'fondo' and entidad_id = p_fondo) or (entidad = 'informe' and entidad_id = any(v_informes));
  delete from public.rendiciones where fondo_id = p_fondo;
  delete from public.rg_fondos where id = p_fondo;
  perform set_config('rg.eliminar_fondo', '', true);

  insert into public.rg_auditoria (entidad, entidad_id, desde, hacia, usuario, comentario)
  values ('fondo', p_fondo, null, 'eliminado', lower(p_usuario),
          'Eliminado ' || v_codigo || ' con ' || coalesce(array_length(v_informes, 1), 0) || ' informe(s) y ' || v_movs || ' movimiento(s)');

  return jsonb_build_object('codigo', v_codigo, 'informes', coalesce(array_length(v_informes, 1), 0), 'movimientos', v_movs);
end $$;
revoke all on function public.rg_eliminar_fondo(uuid, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
