-- Repositorio Legal: los antecedentes legales de las sociedades del grupo.
--
-- No crea tablas: la base del módulo es SharePoint («ARCHIVOS CORE/ANTECEDENTES LEGALES»). Solo
-- registra la aplicación para que aparezca en el menú y se pueda asignar con su rol
-- (usuario_aplicaciones.rol_extra: visualizador, usuario, especial o admin; ya permitidos por el CHECK).

insert into public.aplicaciones (nombre, slug, url, tipo, icono, color, descripcion, estado, orden)
select 'Repositorio Legal', 'repositorio-legal', '/repositorio-legal', 'interna', 'scale', 'naranjo',
       'Antecedentes legales por sociedad: escrituras, vigencias, SII y más, con alertas de vencimiento.',
       'activa', 48
where not exists (select 1 from public.aplicaciones where slug = 'repositorio-legal');

notify pgrst, 'reload schema';
