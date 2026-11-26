-- Firma de correo de cada persona, como TEXTO (nombre, cargo, teléfono…): va al final de los correos que manda
-- desde el Core, sobre la imagen de firma si también tiene (ver 0003_firma_correo.sql). Texto plano, hasta 600
-- caracteres; el Core lo escapa y respeta los saltos de línea. Solo agrega una columna. Se puede correr más de una vez.
alter table public.usuarios add column if not exists firma_texto text;

comment on column public.usuarios.firma_texto is
  'Firma de correo en texto plano (hasta 600 caracteres). NULL = sin texto.';
