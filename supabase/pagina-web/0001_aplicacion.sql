-- Página web: administrar pertec.cl desde el Core.
--
-- Lo que se podía hacer en pertec.cl/admin —catálogo de equipos y servicios, casos
-- de éxito, solicitudes que llegan del formulario y los datos de contacto— ahora se
-- hace en el Core, en «Página web → Configuración» del menú.
--
-- Esta migración es SOLO la app en el catálogo del Core, para que aparezca en el menú
-- y se pueda asignar por usuario en Usuarios (el admin del Core entra siempre). Los
-- datos NO viven en esta base: son las tablas del Supabase de pertec-web (equipos,
-- casos, solicitudes, config), a las que el Core ya llega con
-- PERTEC_WEB_SUPABASE_URL / PERTEC_WEB_SUPABASE_SERVICE_ROLE_KEY, igual que Proyectos.
-- No se toca ninguna tabla del sitio.
insert into public.aplicaciones (nombre, slug, url, tipo, icono, color, descripcion, estado, orden)
select 'Página web', 'pagina-web', '/pagina-web', 'interna', 'settings', 'naranjo',
       'Catálogo, casos de éxito, solicitudes y datos de contacto de pertec.cl.',
       'activa', 55
where not exists (select 1 from public.aplicaciones where slug = 'pagina-web');
