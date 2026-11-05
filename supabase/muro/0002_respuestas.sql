-- Muro: respuestas a una publicación.
--
-- Una respuesta es un mensaje más, con `respuesta_a` apuntando a la publicación (un solo nivel:
-- no hay respuestas a respuestas). Si se borra la publicación de la base, se van sus respuestas.
--
-- Se puede correr más de una vez.

alter table public.muro_mensajes
  add column if not exists respuesta_a uuid references public.muro_mensajes(id) on delete cascade;

create index if not exists muro_mensajes_respuesta on public.muro_mensajes (respuesta_a, creado_en);
