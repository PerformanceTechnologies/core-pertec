-- Buzón: notificaciones personales.
--
-- Hasta acá cada notificación era de un módulo y la veían todos los que lo tenían.
-- Los avisos de Tareas (te asignaron, cambió el estado, nueva nota, vence hoy) son
-- de UNA persona: con destinatario (su correo, en minúsculas) solo la ve ella,
-- también si es admin. Sin destinatario, todo sigue como antes.
--
-- Se puede correr más de una vez.

alter table public.notificaciones add column if not exists destinatario text;

create index if not exists notificaciones_destinatario_fecha
  on public.notificaciones (destinatario, creado_en desc);

comment on column public.notificaciones.destinatario is
  'Correo (minúsculas) de la única persona que la ve. null = la ven todos los del módulo.';
