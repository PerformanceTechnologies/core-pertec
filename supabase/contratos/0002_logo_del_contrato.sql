-- El logo de la empresa de cada contrato.
--
-- Va en la base, como imagen en base64 ya reducida en el navegador (unos 200 px): es una por
-- contrato y pesa poco. `logo_actualizado` es su versión: la dirección que sirve la imagen la lleva
-- en la URL, así el navegador la guarda en caché y la vuelve a pedir solo cuando cambia.
alter table public.ct_contratos
  add column if not exists logo              text,
  add column if not exists logo_actualizado  timestamptz;
