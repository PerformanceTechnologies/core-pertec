-- La empresa Zeus se llama siempre "Zeus Mining", nunca "Zeus" a secas.
--
-- 0001 la sembró como 'Zeus'. Ya se corrigió ahí para una base nueva, pero una
-- base donde 0001 ya corrió conserva el nombre viejo: esto lo corrige. Se busca
-- por slug, que no cambia (el nombre se puede corregir; el slug no se toca), y
-- correrla dos veces no hace nada distinto.
--
-- Es el mismo nombre que ya usan el cotizador ("ZEUS MINING") y el panel de
-- Odoo ("Zeus Mining").
update public.empresas
set nombre = 'Zeus Mining'
where slug = 'zeus'
  and nombre is distinct from 'Zeus Mining';
