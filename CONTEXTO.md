# Core PERTEC — contexto para quien trabaja en el código

> Guía de orientación para desarrolladores (y para Claude). Describe cómo está armada la aplicación y qué
> cuidar al modificarla. **No contiene** identificadores de proyectos, cuentas, credenciales ni el estado
> de la seguridad: ese detalle vive en un documento privado, fuera de este repositorio (que es público).
> Si algo de aquí contradice el código, manda el código; actualiza este archivo.
>
> Flujo de trabajo con ramas y Pull Requests: [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## 1. Qué es

Intranet de PERTEC: un solo login con Microsoft 365 desde el que se abre un catálogo de aplicaciones internas y
módulos nativos (finanzas, contratos, cotizador, inventario, gestión de la web pública, etc.). Los permisos son
por usuario y por aplicación. El grupo tiene tres empresas y el Core ya tiene selector de empresa, aunque hoy
solo PERTEC tiene datos.

## 2. Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript** + **Tailwind 4**. `AGENTS.md` avisa que esta
  versión de Next tiene cambios incompatibles: lee `node_modules/next/dist/docs/` antes de escribir código
  (por ejemplo, el middleware es `proxy.ts`).
- Login: **NextAuth v5 (beta)** con Microsoft Entra ID.
- Datos: Supabase (`@supabase/supabase-js`). Archivos y correo: Microsoft Graph.
- IA: Anthropic. Gráficos: ApexCharts. Documentos: `exceljs`, `write-excel-file`, `pdf-lib`, `pdf-parse`,
  `pdfjs-dist`, `sharp`. Navegador headless (scraper del SII y PDFs): `playwright-core` + `@sparticuz/chromium-min`.
- Pruebas: scripts sueltos `scripts/probar-*.mts` con `tsx` (no hay runner de tests).
- Comandos: `npm run dev` (puerto 3010), `npm run build`, `npm run lint`.

## 3. Estructura

```
app/(protegido)/     páginas que exigen login; el layout se renderiza en cada carga y vuelve a leer permisos
app/api/             route handlers (auth, cron, finanzas, cotizador, ofertas, rendidor, proyectos…)
auth.ts              NextAuth + Entra ID + refresco de tokens de Graph
proxy.ts             solo corre en /contratos: fija el contrato activo en una cabecera
lib/                 lógica de servidor, una carpeta por módulo
components/          UI por módulo
supabase/            migraciones SQL por módulo (se aplican a mano)
scripts/             pruebas y sincronizaciones
.github/workflows/   crons que corren fuera de Vercel
vercel.json          crons nativos de Vercel
next.config.ts       empaquetado y archivos incluidos por ruta: crítico (ver §9)
```

## 4. Permisos

- Entra quien existe en la tabla de usuarios y está activo. Roles del Core: `admin` y `usuario`; el admin entra a todo.
- Cada app se asigna por usuario. Algunas apps tienen un rol interno adicional (`admin` / `usuario` / `visualizador`
  u otros): es una columna compartida por todos los módulos y tiene un `CHECK` en la base.
- Los guards viven en `lib/autorizacion.ts` (`exigirAdmin`, `exigirAccesoApp`, `verificarAccesoAppApi`,
  `puedeVerApp`). **Hay que llamarlos también dentro de cada Server Action y route handler**: se pueden invocar
  sin pasar por la pantalla.
- Finanzas añade permisos por subpanel; multiempresa, por empresa asignada.

## 5. Módulos

| Módulo | Ruta | Qué hace |
|---|---|---|
| Finanzas SII | `/finanzas/sii` | Lee el Registro de Compras y Ventas del SII con un navegador headless; detecta reclamos |
| Facturas históricas | `/finanzas/facturas-historicas` | Busca XML y PDF de facturas guardados en SharePoint |
| Facturas IH | `/finanzas/facturas-ih` | Sincroniza documentos de las empresas IH e IL; corre en GitHub Actions |
| Rendir Gastos | `/rendir-gastos` | La IA lee boletas, genera el Excel con respaldos y los carga como gastos en Odoo |
| Cotizador | `/cotizador` | Motor de costos y remuneraciones, modo obra, ECO-1 en PDF, importación de propuestas |
| Ofertas técnicas | `/ofertas` | Convierte un borrador en oferta editable y la emite en PDF |
| Contratos | `/contratos/[contrato]/…` | Acreditación de personas y vehículos, logística, gastos de arranque, dashboard y reportes |
| Inventario | `/inventario` | Stock de doble entrada con movimientos entre ubicaciones (en el menú se llama «Stock y bodegas»). Los productos no se eliminan: se **archivan** (`activo = false`) y se restauran desde Productos › Archivados; solo el admin del Core o quien tenga el rol «Administrador de inventario» (`rol_extra = admin` de la app) puede, y se verifica en la Server Action |
| Flota | `/flota` | Vehículos, conductores, servicios, contratos y documentos; en el menú cuelga del módulo Inventario |
| Proyectos / Mantención | `/proyectos` | Gantt, objetivos, gastos; checklists de equipos. **En pausa**: oculto de todo el Core (`lib/apps-pausadas.ts`) |
| Reclutamiento | `/reclutamiento` | Postulaciones recibidas desde el formulario público |
| Página web | `/pagina-web` | Administra catálogo, casos, solicitudes y contacto del sitio público |
| Mi Día | `/mi-dia` | Resumen diario de correo y agenda, enviado también por correo |
| Buzón / Buscador | campana y Ctrl+K | Avisos por módulo; consultas de solo lectura con IA |
| Usuarios / Aplicaciones | `/usuarios`, `/aplicaciones` | Administración (solo admin): filtros en la dirección, catálogo agrupado por módulo |
| Resumen de módulo | `/modulos/[módulo]` | Cada módulo del menú abre un resumen con las cifras de sus submódulos (`lib/modulos-resumen.ts`) |

## 6. Integraciones

- **Supabase**: dos bases separadas. Una para casi todo el Core; otra, compartida con el sitio público, para Proyectos,
  Mantención y Página web. Todas las tablas tienen RLS activo y el acceso es con la llave de servicio desde el
  servidor (`lib/supabase-admin.ts`, `lib/pertec-web-supabase.ts`).
- **Microsoft Graph**, de dos formas: con permisos de **aplicación** (leer listas y carpetas, guardar PDF) y con el
  token **delegado** de cada persona (Contratos, resumen diario, envío de ofertas). Los tokens de refresco se
  guardan cifrados (`lib/cifrado.ts`).
- **Odoo** por JSON-RPC (`lib/odoo/cliente.ts`): casi todo lectura; escribe gastos y contactos (Rendir Gastos y Cotizador).
- **SII**: scraping con Playwright. El SII invalida sesiones, así que las corridas son secuenciales.
- **Anthropic**: lectura de documentos (Rendir Gastos, Ofertas, Cotizador), resumen diario y buscador.

## 7. Crons

Todos con `Authorization: Bearer <secreto>`.
- **Vercel** (`vercel.json`): parámetros del cotizador (diario), limpieza (semanal), finanzas SII (varias veces al día),
  facturas históricas, resumen diario (varias tandas).
- **GitHub Actions**: Facturas IH (diario; GitHub puede retrasar o descartar ejecuciones programadas) y respaldos de Supabase.
- Límites de Vercel Hobby: una expresión de cron como máximo una vez al día, y un rango horario rompe el deploy.

## 8. Base de datos

- Migraciones por módulo en `supabase/<modulo>/000N_*.sql`: archivo nuevo para cada cambio, idempotente, revisado en
  el PR. Se aplican a mano; primero en una base de desarrollo.
- Tablas con `CHECK` (estados de facturas, `rol_extra`): agregar un valor exige migración, o la
  escritura falla en producción.
- Tablas nuevas: activar RLS. Revisar los requisitos de permisos (`GRANT`) que Supabase exige para tablas nuevas.

## 9. Puntos delicados al modificar

- **Contratos**: dentro de `lib/contratos/*` importa `./supabase-admin` (filtra por contrato), nunca
  `@/lib/supabase-admin`. Una tabla nueva con `contrato_id` va en `TABLAS_DE_CONTRATO`. `proxy.ts` toma el contrato de
  la URL y borra cualquier cabecera igual que mande el cliente.
- **Inventario**: el stock no se edita; solo transferencias mediante las funciones SQL (son atómicas).
- **Multiempresa**: los módulos no tienen `empresa_id`; `FiltroDeEmpresa` solo oculta lo que no es de PERTEC.
- **`next.config.ts`**: toda ruta nueva que lance Chromium o use `pdf-parse` necesita su entrada en
  `outputFileTracingIncludes` (las claves son globs: escapa `[id]` como `\\[id\\]`). Depende de detalles internos de
  varias librerías: por eso `next`, `react`, las de PDF y las de navegador se actualizan solo a mano y con prueba.
- **Server Actions**: revalidar permisos dentro de cada una.
- **Facturas IH**: los archivos de `lib/finanzas-ih` no usan el alias `@/` (corren con `tsx` en Actions). Un secreto
  nuevo debe agregarse también al YAML del workflow.
- **Cotizador**: `lib/cotizador.ts` importa submódulos directos, no el barrel. Los esquemas para la IA deben ser planos.
- **Página web**: escribe en la base del sitio público; no hay entorno de pruebas. Sus listas de categorías son una
  copia de las del sitio.
- **Odoo**: los IDs e impuestos de Rendir Gastos son de la instancia de PERTEC.
- **Estilo**: comentarios que explican el *por qué*, en español de Chile con tuteo.

## 10. Trabajar en local

```bash
npm install
cp .env.example .env.local   # completar los valores; ver .env.example
npm run dev                  # http://localhost:3010
```

- En local usa una **base de desarrollo**, no la de producción: entrar al Core reescribe las credenciales cifradas de
  Graph de esa persona y cualquier prueba escribe en datos reales.
- Al cambiar de rama que modifica dependencias, corre `npm ci`.
- Verificación mínima antes de abrir un PR: `npx tsc --noEmit` y `npm run build`.

## 11. Mantener este documento

Actualízalo cuando agregues un módulo, un cron o una convención que otra persona deba conocer. Mantenlo sin
identificadores, cuentas ni detalles de seguridad.
