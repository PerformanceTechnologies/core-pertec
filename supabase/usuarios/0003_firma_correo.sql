-- Firma de correo de cada persona: se agrega al final de los correos que manda desde el Core
-- (cotizaciones, OC, solicitudes de cotización y ofertas). Texto plano, hasta 1000 caracteres.
-- Los invitados no tienen firma. Se puede correr más de una vez.
alter table public.usuarios add column if not exists firma_correo text;

comment on column public.usuarios.firma_correo is
  'Firma que el Core agrega al final de los correos que esta persona envía. Texto plano. NULL = sin firma.';
