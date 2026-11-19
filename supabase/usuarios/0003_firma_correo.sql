-- Firma de correo de cada persona, como IMAGEN: se incrusta al final de los correos que manda desde
-- el Core (cotizaciones, OC, solicitudes de cotización y ofertas). Se guarda el PNG ya achicado por
-- el servidor (máx. 600 × 240 px), en base64. Los invitados no tienen firma. Se puede correr más de una vez.
alter table public.usuarios add column if not exists firma_imagen text;

comment on column public.usuarios.firma_imagen is
  'Firma de correo: PNG en base64 (lo normaliza el Core). NULL = sin firma.';
