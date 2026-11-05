-- Muro: reacciones (👍 ❤️ 😂 🎉 😮) a publicaciones y respuestas.
--
-- Una fila por persona, mensaje y emoji: reaccionar de nuevo con el mismo la quita.
--
-- Se puede correr más de una vez.

create table if not exists public.muro_reacciones (
  mensaje_id uuid not null references public.muro_mensajes(id) on delete cascade,
  correo text not null,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🎉', '😮')),
  creado_en timestamptz not null default now(),
  primary key (mensaje_id, correo, emoji)
);

alter table public.muro_reacciones enable row level security;
