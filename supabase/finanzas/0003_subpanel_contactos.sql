-- Herramientas Finanzas: el subpanel «contactos» también se puede asignar a una persona.
--
-- La lista de subpaneles permitidos en la base no tenía «contactos» (se agregó al Core después),
-- así que guardar a alguien con ese subpanel marcado fallaba con
-- «violates check constraint usuario_finanzas_subpanel_acceso_subpanel_slug_check».
-- Tiene que coincidir con SUBPANELES_FINANZAS de lib/finanzas-subpaneles.ts.
--
-- Se puede correr más de una vez.

alter table public.usuario_finanzas_subpanel_acceso
  drop constraint if exists usuario_finanzas_subpanel_acceso_subpanel_slug_check;

alter table public.usuario_finanzas_subpanel_acceso
  add constraint usuario_finanzas_subpanel_acceso_subpanel_slug_check
  check (subpanel_slug in ('sii', 'contactos', 'facturas-historicas', 'facturas-ih'));
