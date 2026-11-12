-- Buzón por empresa: cada notificación recuerda en qué empresa se generó (Zeus, PERTEC, …).
-- Sin empresa = aviso general (o anterior a esto): se ve en todas.
-- Se puede correr más de una vez.
alter table public.notificaciones add column if not exists empresa_id uuid references public.empresas(id);
create index if not exists notificaciones_empresa on public.notificaciones (empresa_id);
