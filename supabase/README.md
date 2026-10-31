# Base de datos (Supabase)

Tres bases distintas intervienen. Los nombres de los proyectos están en `CONTEXTO.md`;
los identificadores reales se obtienen del dashboard de Supabase o de las variables de Vercel.

| Base | Variable | Uso |
|---|---|---|
| Core | `NEXT_PUBLIC_SUPABASE_URL` | Usuarios, apps, finanzas, Panel Odoo, cotizador, ofertas, rendiciones, contratos, inventario… |
| pertec-web | `PERTEC_WEB_SUPABASE_URL` | Proyectos, mantención, página web. Compartida con el sitio público pertec.cl |
| Desarrollo | las mismas variables, en tu `.env.local` | A crear (ver abajo) |

Todas las tablas tienen RLS activo **sin políticas**: solo se accede con la `service_role`
desde el servidor (`lib/supabase-admin.ts`, `lib/pertec-web-supabase.ts`). Nunca expongas
esa llave en el navegador.

## Qué hay en esta carpeta

Migraciones por módulo: `buzon`, `consulta-ia`, `contratos`, `empresas`, `inventario`,
`pagina-web`, `resumen-diario`. Se aplican **a mano** en el SQL Editor de Supabase, en orden
numérico, y todas son idempotentes.

## Pendiente: esquema base

Las tablas originales (usuarios, aplicaciones, facturas_sii, panel_odoo_*, cotizaciones,
rendiciones, ofertas_*, finanzas_ih_*, etc.) se crearon antes de que existiera esta carpeta y
**su SQL no está en el repo**. Para poder levantar una base de desarrollo desde cero hay que
extraerlo de producción (solo lectura) y guardarlo en `supabase/esquema/`:

- tablas, columnas, claves primarias y foráneas, `CHECK`, índices;
- funciones y vistas (`pg_get_functiondef`, `pg_get_viewdef`);
- buckets de Storage y sus políticas;
- datos semilla mínimos (catálogo `aplicaciones`, `empresas`).

Hecho esto, la base de desarrollo se crea ejecutando `esquema/` y luego cada `0001…` por módulo.

## Reglas para migraciones nuevas

- Archivo nuevo `supabase/<modulo>/000N_descripcion.sql`; nunca edites uno ya aplicado.
- Idempotente: `create table if not exists`, `create or replace function`, `drop policy if exists`.
- Activa RLS en toda tabla nueva.
- Si agregas un valor a un `CHECK`, hazlo en la migración y revisa el código que lo duplica.
