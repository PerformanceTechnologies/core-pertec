# CONTEXTO — Core PERTEC (core.pertec.cl)

> Documento de referencia para trabajar en el proyecto (humanos y Claude).
> **No contiene secretos**: solo nombres de variables, nunca valores.
> Generado el 2026-10-31 a partir de: repo local + GitHub, Vercel (MCP), SharePoint (MCP) y lectura completa del código.
> Estado al generarlo: `main` local = `origin/main` = producción en Vercel = commit `09250eb` (2026-10-30).
> Si algo de aquí contradice el código, **manda el código**; actualiza este archivo.

---

## 1. Qué es

Intranet de PERTEC ("Core"): un solo login con Microsoft 365 desde el que se abre un catálogo de aplicaciones internas y módulos nativos (finanzas, contratos, cotizador, inventario, gestión de la web pública, etc.). Los permisos son por usuario y por aplicación. El grupo tiene tres empresas (PERTEC, Zeus Mining, Performance Service) y el Core ya tiene selector de empresa, aunque hoy **solo PERTEC tiene datos**.

---

## 2. Mapa de la infraestructura

| Pieza | Dónde | Detalle |
|---|---|---|
| Código | GitHub `PerformanceTechnologies/core-pertec` | **Repo PÚBLICO**. Rama `main`. |
| Hosting | Vercel, team `pertec` (`team_lCdakYIqsCeuJAEnBFKnCQbu`), proyecto `core-pertec` (`prj_L8ySig9YIRPAbjpR0FOpGxEbI6zT`) | Next.js, Node 24.x, región `gru1`. Dominio `core.pertec.cl`. Cada push a `main` despliega a producción. |
| Protección | Vercel SSO activo en URLs `*.vercel.app` (no en dominios propios) | Los previews de PR piden login de Vercel. |
| Base de datos del Core | Supabase proyecto `fwvdztxxkbzxsqpqgvvg` | Acceso solo con `service_role` desde el servidor. RLS activo **sin políticas**. |
| Base de datos de pertec-web | Supabase proyecto `rvtmrzjlxovowszxmhoy` | Compartido con el sitio público pertec.cl. Lo usan Proyectos, Mantención y Página web. |
| Archivos | SharePoint `performancecl.sharepoint.com` | Sitios `COREPERTEC` (contratos), `FINANZASPERTEC` (facturas, ofertas) y el de postulaciones. |
| ERP | Odoo (Odoo.sh), instancia PERTEC | JSON-RPC. Casi todo de lectura; escribe en `hr.expense` y `res.partner`. |
| IA | Anthropic API | Modelos usados en el código: `claude-sonnet-5` (rendidor, ofertas, cotizador, resumen diario), `claude-haiku-5-5` (buscador). |
| Cron externos | GitHub Actions | `panel-odoo-sync.yml` (cada 30 min) y `finanzas-ih-cron.yml` (diario). |
| Otros proyectos Vercel del mismo team | `core-ih`, `innovationhealth`, `pertec-web`, `cotizador-web-pertec-web`, `reclutamiento`, `zeusmin-web` | No son este repo. `core-ih` es el Core de Innovation Health, del que se portaron Contratos e Inventario. |

### Acceso desde las herramientas de Claude (limitaciones detectadas)
- **Vercel MCP**: ve el team `pertec` completo. Las variables de entorno son `sensitive` (no se pueden leer valores, bien).
- **Supabase MCP**: la cuenta conectada **solo ve dos proyectos: `Operaciones IH` (inactivo) y `core` (`mlurilalnqgqbuzgsttd`)**, que contiene tablas `ih_*` → es la base de **core-ih**, NO la de core-pertec. **Ninguno de los dos proyectos de core-pertec (`fwvdzt…`, `rvtmrz…`) es accesible desde ese MCP.** Para inspeccionar o migrar la base de core-pertec hay que usar el dashboard de Supabase o conectar la cuenta correcta. No se ha tocado ninguna base de datos.
- **SharePoint (MCP de Microsoft)**: lectura OK. Existe `COREPERTEC/Documentos compartidos/CONTRATOS` (modificada 2026-10-15). Hay también un sitio `CONTRATOCENIZAS` y un repositorio RRHH que **no** son del Core.

---

## 3. Stack

- **Next.js 16.2.10** (App Router, Turbopack) + **React 19.2.4** + **TypeScript 5** + **Tailwind 4**.
- `AGENTS.md` avisa: *"Esta versión de Next.js tiene cambios incompatibles; lee `node_modules/next/dist/docs/` antes de escribir código"*. Ejemplo ya presente: el middleware es `proxy.ts` (no `middleware.ts`).
- Auth: **NextAuth v5 beta** con Microsoft Entra ID. Sesión JWT de 30 días.
- Datos: `@supabase/supabase-js`. Archivos/correo: `@microsoft/microsoft-graph-client` + `@azure/identity`.
- IA: `@anthropic-ai/sdk`.
- Gráficos: ApexCharts (Panel Odoo) y Recharts.
- Documentos: `exceljs`, `write-excel-file`, `pdf-lib`, `pdf-parse`, `pdfjs-dist`, `react-pdf`, `sharp`, `@napi-rs/canvas`.
- Navegador headless (scraper SII y PDFs): `playwright-core` + `@sparticuz/chromium-min` (en Vercel).
- Scripts: `tsx`. Tests: scripts sueltos `scripts/probar-*.mts` (no hay runner de tests ni script `test` en `package.json`).
- Comandos: `npm run dev` (puerto **3010** según `.claude/launch.json`; primero copia el worker de pdfjs a `public/pdfjs/`), `npm run build`, `npm run lint`.

---

## 4. Estructura del repo

```
app/
  (protegido)/        páginas que exigen login; layout force-dynamic que relee usuario/permisos en CADA carga
    aplicaciones/ usuarios/ buzon/ mi-dia/ proyectos/ reclutamiento/ panel-odoo/
    finanzas/ (sii, facturas-historicas, facturas-ih)  rendir-gastos/  cotizador/  ofertas/
    contratos/[contrato]/…   inventario/   pagina-web/
  api/                route handlers: auth, cron/*, finanzas*, cotizador, ofertas, rendidor, proyectos, mantencion, pagina-web, consulta…
  ingresar/           login
auth.ts               NextAuth + Entra ID + refresh de tokens Graph
proxy.ts              solo corre en /contratos: pone la cabecera con el contrato activo
lib/                  lógica de servidor por módulo (ver §6)
components/           UI por módulo
supabase/             migraciones SQL por módulo (se aplican A MANO, ver §9)
scripts/              exploración SII, pruebas, sincronizaciones
.github/workflows/    finanzas-ih-cron.yml, panel-odoo-sync.yml
vercel.json           crons nativos
next.config.ts        outputFileTracingIncludes (Chromium, pdf-parse…): crítico
```

---

## 5. Permisos y roles

- **Entrada**: el correo del perfil Entra (`email` / `preferred_username` / `upn`) debe existir en la tabla `usuarios` y estar `activo`. Si no, "Tu cuenta no está autorizada".
- **Rol del Core**: `admin` | `usuario`. El admin entra a todo.
- **Por aplicación**: tabla `usuario_aplicaciones` (`aplicacion_id`, `rol_extra`). Un usuario no-admin solo ve las apps asignadas.
- **Guards** (`lib/autorizacion.ts`): `exigirAdmin()`, `exigirAccesoApp(slug)`, `verificarAccesoAppApi(slug)`, `puedeVerApp(usuario, slug)`. **Hay que llamarlos también dentro de cada Server Action** (se pueden invocar sin pasar por la UI).
- **`rol_extra` es una columna COMPARTIDA** por todos los módulos (valores `admin`/`usuario`/`visualizador`) con un CHECK. Rendir Gastos debe guardar exactamente `"admin"`; `"administrador"` rompió el guardado.
- **Finanzas**: además hay permiso fino por subpanel (`usuario_finanzas_subpanel_acceso`). Sin filas = ve todo, **excepto** `facturas-ih` que es denegado por defecto.
- **Panel Odoo**: visibilidad por módulo (`usuario_odoo_modulos`); solo admin sincroniza a mano.
- **Multiempresa**: cookie `core-empresa` es solo una preferencia; se valida siempre contra `usuario_empresas` (admin = todas; sin asignación = solo `pertec`).

---

## 6. Módulos

| Módulo | Ruta / slug | Qué hace | Datos clave |
|---|---|---|---|
| **Finanzas SII** | `/finanzas/sii` | Scraper Playwright del RCV del SII de PERTEC, detecta reclamos de ventas y avisa por correo | `facturas_sii`, `finanzas_sii_ejecuciones` |
| **Facturas históricas** | `/finanzas/facturas-historicas` | Busca XML de ventas y PDF de compras en SharePoint | `facturas_venta_historico`, `facturas_compra_historico` |
| **Facturas IH** | `/finanzas/facturas-ih` (oculta del menú) | RCV + Portal MIPYME + BHE de IH e IL; respaldos en SharePoint. Corre en GitHub Actions | `finanzas_ih_documentos`, `finanzas_ih_ejecuciones` |
| **Rendir Gastos** | `/rendir-gastos` | IA lee boletas, genera Excel con respaldos y los carga como `hr.expense` en Odoo | `rendiciones`, bucket `rendiciones-respaldos` |
| **Cotizador** | `/cotizador` | Motor de costos/remuneraciones, modo obra, ECO-1 en PDF, importación de propuesta con IA, clientes desde Odoo | `cotizaciones`, `parametros_legales_sets`, `cotizador_catalogo_cargos`, `cotizador_empresas` |
| **Ofertas técnicas** | `/ofertas` | Sube borrador, la IA lo transcribe, editor, emisión a PDF → SharePoint → correo | `ofertas_documentos`, `ofertas_maestros`, 5 buckets |
| **Contratos** | `/contratos/[contrato]/…` | Portado de core-ih: acreditación de personas y vehículos, logística, gastos de arranque, dashboard, reporte PDF, carpetas SharePoint | tablas `ct_*` |
| **Inventario** | `/inventario` | Stock de doble entrada tipo Odoo, 100% propio | tablas `inv_*` + 4 funciones PL/pgSQL |
| **Panel Odoo** | `/panel-odoo` (oculto del menú) | Caché en Supabase de 9 módulos de Odoo con gráficos | `panel_odoo_*` |
| **Proyectos / Mantención** | `/proyectos` (oculto del menú) | Gantt, objetivos, gastos; checklists de equipos | Supabase de **pertec-web** |
| **Reclutamiento** | `/reclutamiento` | Postulaciones del formulario público, desde una lista de SharePoint | Lista SharePoint |
| **Página web** | `/pagina-web` | Reemplaza `pertec.cl/admin`: catálogo, casos, solicitudes, contacto | Supabase de **pertec-web** (`equipos`, `casos`, `solicitudes`, `config`) |
| **Mi Día / Resumen diario** | `/mi-dia` | IA resume 72 h de correo + calendario por persona; se envía por correo | `resumen_diario`, `graph_credenciales` |
| **Buzón** | campana del menú | Avisos por módulo, con idempotencia por `clave` | `notificaciones`, `notificaciones_vistas` |
| **Buscador IA** | Ctrl+K, `/api/consulta` | Herramientas fijas de solo lectura; límite 12/min y 200/día por usuario | `consulta_ia_usos` |
| **Usuarios / Aplicaciones** | `/usuarios`, `/aplicaciones` | Administración (solo admin) | `usuarios`, `aplicaciones` |

El menú lateral (`lib/menu-modelo.ts`) se agrupa así: **Finanzas · CRM · Contratos · Página web · Inventario · Otras**. Las rutas `/proyectos`, `/panel-odoo` y `/mi-dia` están ocultas del menú (Mi Día vive arriba a la derecha).

---

## 7. Integraciones

### SharePoint / Microsoft Graph — dos formas de autenticarse
1. **App-only** (App Registration con `AZURE_*`): postulaciones, facturas históricas, Facturas IH, ofertas (guardar PDF). Requiere `Sites.Selected` concedido por un administrador del sitio.
2. **Delegado por usuario**: Contratos (SharePoint), Mi Día/Resumen diario (correo y agenda), envío de ofertas. El refresh token de cada persona se guarda **cifrado** (AES-256-GCM, `TOKEN_CIFRADO_KEY`) en `graph_credenciales` y Microsoft lo rota en cada uso. Scopes: `User.Read Calendars.Read Mail.Read Mail.Send offline_access` (+ `Files.ReadWrite.All Sites.ReadWrite.All` para Contratos).
3. **Correo del sistema** (`lib/notificaciones.ts`): otra App Registration ("PERTEC Web – Envío de correos", `MS_*`) con permiso de aplicación `Mail.Send`. Remitente fijo y destinatarios fijos (`soporte@`, `finanzas@`).

Sitios y carpetas: `COREPERTEC` → carpeta `CONTRATOS`; `FINANZAS PERTEC` → `FINANZAS/HISTORICO DE SII` y `OFERTAS TECNICAS/<año>/`.

### Odoo
Cliente en `lib/panel-odoo/odoo-cliente.ts` (`odooSearchRead`, `odooCampos`, `odooCreate`). Compañías hardcodeadas: 1 Performance Technologies, 2 Performance Service, 3 Zeus Mining. Rendir Gastos usa IDs fijos de la instancia PERTEC (`CURRENCY_CLP=45`, `TIPO_ID_RUT=4`, `COUNTRY=46`).

### SII
Scraping con Playwright usando RUT del representante legal y Clave Tributaria. El SII invalida sesiones: las corridas son **secuenciales**.

---

## 8. Crons

**Vercel (`vercel.json`, todos `GET` con `Authorization: Bearer CRON_SECRET`)**

| Ruta | UTC |
|---|---|
| `/api/cron/cotizador-parametros` (UF/UTM) | 06:00 diario |
| `/api/cron/limpieza` | domingo 07:00 |
| `/api/cron/finanzas-sii` | 11:00, 14:00, 17:00, 21:00 |
| `/api/cron/finanzas-historico` (ventas / `?tipo=compra`) | 09:15 / 09:20 |
| `/api/cron/resumen-diario` | 10:15, 10:35, 10:55, 11:30, 13:30, 15:30, 17:30 |

**GitHub Actions** (no están en `vercel.json`)
- `panel-odoo-sync.yml`: cada 30 min, matriz de 9 módulos, hace `curl` a `core.pertec.cl/api/cron/panel-odoo?modulo=X` (secret `CRON_SECRET` en GitHub).
- `finanzas-ih-cron.yml`: 10:10 UTC diario + disparo manual con `cargaInicial`. Corre `scripts/sincronizar-finanzas-ih.mts` en Node 22 (pasaba el límite de 60 s de Vercel). El botón "Actualizar" de la pantalla lo dispara con `GITHUB_ACTIONS_TOKEN`.

---

## 9. Base de datos

- **Migraciones**: archivos `supabase/<modulo>/000N_*.sql`. **No hay Supabase CLI ni historial automático**: se pegan a mano en el SQL Editor. Hoy están versionadas solo: buzón, consulta-ia, contratos (0001, 0002), empresas, inventario, pagina-web, resumen-diario. **Las tablas más antiguas (usuarios, aplicaciones, facturas_sii, panel_odoo_*, cotizaciones, rendiciones, ofertas…) no tienen su SQL en el repo**: solo existen en la base. Antes de cambiar una de ellas, leer su esquema real en Supabase.
- **Core** (`fwvdzt…`): `usuarios, usuario_aplicaciones, aplicaciones, usuario_empresas, empresas, usuario_odoo_modulos, usuario_finanzas_subpanel_acceso, graph_credenciales, resumen_diario, prioridades_descartadas, notificaciones, notificaciones_vistas, consulta_ia_usos, facturas_sii, finanzas_sii_ejecuciones, facturas_venta_historico, facturas_compra_historico, facturas_historico_ejecuciones, finanzas_ih_documentos, finanzas_ih_ejecuciones, panel_odoo_{facturas,ventas,compras,crm_leads,gastos,fondos_gasto,flota,flota_documentos,proyectos,tareas,bodegas,bodega_stock,contabilidad_mensual,modulos_orden,sync_ejecuciones}, cotizaciones, parametros_legales_sets, cotizador_catalogo_cargos, cotizador_empresas, ofertas_documentos, ofertas_maestros, rendiciones (+vista rendiciones_resumen), inv_*, ct_*`.
- **pertec-web** (`rvtmrz…`): `proyectos, objetivos, objetivo_comentarios, gastos, checklists, checklist_items, checklist_runs, checklist_run_items, equipos_mantenimiento, equipos, casos, solicitudes, config`.
- **Buckets** Core: `rendiciones-respaldos, ofertas-imagenes, ofertas-logos, ofertas-maestros, ofertas-emitidas, logos`. pertec-web: `gastos, equipos, casos`.

---

## 10. Variables de entorno

Solo nombres. Plantilla: `.env.example`. Local: `.env.local` (ignorado por git). Producción: Vercel → Settings → Environment Variables (todas `sensitive`).

| Grupo | Variables |
|---|---|
| Login | `AUTH_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER` |
| Supabase Core | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Supabase pertec-web | `PERTEC_WEB_SUPABASE_URL`, `PERTEC_WEB_SUPABASE_SERVICE_ROLE_KEY` |
| Graph app-only | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `SHAREPOINT_SITE_ID`, `SHAREPOINT_FACTURAS_SITE_ID`, `SHAREPOINT_OFERTAS_SITE_ID` (opcional) |
| Correo del sistema | `MS_CLIENT_SECRET` (obligatoria), `MS_TENANT_ID`, `MS_CLIENT_ID` |
| SII | `SII_RUT_REPRESENTANTE`, `SII_CLAVE_TRIBUTARIA`, `SII_RUT_EMPRESA`, `SII_RUT_EMPRESA_IH`, `SII_RUT_EMPRESA_IL`, `SII_CLAVE_EMPRESA_IH` |
| Odoo | `ODOO_URL`, `ODOO_DB`, `ODOO_LOGIN`, `ODOO_API_KEY` |
| Crons | `CRON_SECRET` (mismo valor en Vercel y en GitHub Secrets), `GITHUB_ACTIONS_TOKEN` |
| Cifrado / IA | `TOKEN_CIFRADO_KEY`, `ANTHROPIC_API_KEY` |
| Contratos (opcionales, tienen valor por omisión en código) | `SHAREPOINT_CONTRATOS_SITIO`, `SHAREPOINT_CONTRATOS_CARPETA`, `SHAREPOINT_CONTRATOS_CARPETAS_OCULTAS`, `SHAREPOINT_CARPETA_ACREDITACION`, `SHAREPOINT_CARPETA_LOGISTICA`, `SHAREPOINT_CARPETA_GASTOS`, `SHAREPOINT_CARPETA_VEHICULOS` |

**Diferencias detectadas (revisar, no corregidas):**
- `.env.local` **no tiene** `ANTHROPIC_API_KEY`, `TOKEN_CIFRADO_KEY` ni `GITHUB_ACTIONS_TOKEN` → en local fallan IA (rendidor, ofertas, cotizador, buscador, resumen), login-con-Graph-cifrado y el botón de actualizar Facturas IH. Pídelos o genéralos aparte (no reutilizar los de producción sin decidirlo).
- En **Vercel no existen** `MS_TENANT_ID` ni `MS_CLIENT_ID` (el código cae a `AZURE_TENANT_ID`/issuer y a un client id por omisión: funciona, pero conviene saberlo). Las `SHAREPOINT_CONTRATOS_*` tampoco están: el código usa sus valores por omisión.
- `.env.local` incluye `VERCEL_OIDC_TOKEN` (lo trae `vercel env pull`; caduca).
- `ODOO_*` en Vercel existen para producción y preview.

---

## 11. Historial y trabajo en paralelo con Alex

- **204 commits locales → 384 en `origin/main`**. Autores: **Alex Oliva** (≈283 commits, el grueso desde agosto), Performance Technologies / PERTEC (cuenta de Hugo/Github@pertec.cl, ≈89), Hugo (5, el MVP inicial del 2026-07-08), y **Claude** (8, sesiones web/cloud).
- **Alex trabaja directamente sobre `main`** y también con Claude Code (sus commits llevan `Co-Authored-By: Claude Opus 5.5`). Cada push a `main` = deploy a producción en Vercel.
- Actividad de Alex en octubre: Contratos como plantilla multi-contrato (15–16 oct), Mi Día y buscador IA endurecido (19–22 oct), buzón (22 oct), Rendir Gastos con rol admin (27 oct), Inventario (27–28 oct), multiempresa + menú + logos (28–29 oct). El último commit de la rama es de Claude: "Página web: administrar pertec.cl desde el Core" (30 oct).
- **Ramas remotas con commits sin mergear**: `claude/ih-cpanel-vercel-migration-zflfd8` (docs de plan de migración del sitio de IH, de cPanel a Vercel: inventario vacío, esperando datos) y `claude/excel-download-0rxfba`. El resto de ~35 ramas `feature/*` y `fix/*` ya están integradas (los PRs mergeados llegan hasta el #35, de julio; desde agosto se trabaja directo en `main`) y se pueden ignorar.
- Local: quedan ramas viejas `claude/dazzling-wright-f91cfd` y `feature/panel-odoo` (atrasadas, sin commits propios) y un worktree "prunable" que apunta a `…\Proyectos\core\.claude\worktrees\…` (otra carpeta antigua).

### Flujo recomendado para no pisarse con Alex
1. Antes de empezar: `git fetch --all --prune` y `git pull --ff-only` en `main`.
2. Trabajar en una rama propia: `git switch -c hugo/<tema>` (convención vista: `feature/…`, `fix/…`).
3. Commits pequeños y en español, como el resto del historial.
4. Subir la rama y abrir PR (Vercel genera preview; requiere login de Vercel por el SSO). No empujar directo a `main` salvo acuerdo con Alex: **un push a `main` publica en producción**.
5. Avisar a Alex si se toca algo de la lista "puntos delicados" (§12): `package.json`, `next.config.ts`, `vercel.json`, `lib/contratos/*`, esquemas SQL.
6. Antes de abrir PR: `git fetch` y `git rebase origin/main` (o merge) para resolver choques localmente.

---

## 12. Puntos delicados al modificar

- **Contratos**: dentro de `lib/contratos/*` importar `./supabase-admin` (filtra por contrato automáticamente), **nunca** `@/lib/supabase-admin` → fuga de datos entre contratos. Tabla nueva con `contrato_id` ⇒ agregarla a `TABLAS_DE_CONTRATO`. `proxy.ts` toma el contrato del 2.º segmento de la URL y borra la cabecera del cliente.
- **Inventario**: el stock no se edita; solo transferencias vía las funciones PL/pgSQL (atómicas). No mover esa lógica a Node.
- **Multiempresa**: los módulos no tienen `empresa_id`; `FiltroDeEmpresa` solo oculta datos fuera de PERTEC. Para hacer un módulo "por empresa" hay que sustituir `tieneDatosCargados` por filtro real. El slug `pertec` está cableado como empresa por omisión.
- **CHECKs en la base**: `facturas_sii.estado`, `rol_extra` y `MODULOS_PANEL_ODOO` (repetido en 3 tablas). Agregar un valor exige migración, si no el código "funciona" y la escritura da 500 (pasó con `bodega`).
- **`next.config.ts` → `outputFileTracingIncludes`**: toda ruta nueva que lance Chromium o use `pdf-parse` necesita su entrada; las claves son globs (escapar `[id]` como `\\[id\\]`).
- **Límites de Vercel** (plan Hobby según los comentarios del código): una expresión de cron máx. 1 vez al día, un rango horario rompe el deploy, `vercel.json` no admite comentarios. `maxDuration` real: 300 s en finanzas-sii, resumen-diario y ofertas; 30–60 s en el resto. Cuerpo de request ≈ 4,5 MB (por eso los respaldos del rendidor suben de a uno).
- **Server Actions**: revalidar permisos dentro de cada una.
- **Facturas IH**: los archivos de `lib/finanzas-ih` no usan el alias `@/` (corren bajo `tsx` en Actions). Un secret nuevo debe agregarse también al YAML.
- **Cotizador**: `lib/cotizador.ts` importa submódulos directos, no el barrel. Los esquemas para Anthropic deben ser planos.
- **Página web**: escribe en el Supabase de producción del sitio público con service role; no hay entorno de pruebas. Las listas de categorías/tipos son una copia de las del sitio.
- **Odoo**: IDs e impuestos del Rendidor son de la instancia PERTEC.
- **Barrel/ESM**: evitar `export *` en módulos que corren bajo `tsx`.
- **Estilo del código**: comentarios largos que explican el *por qué*, textos en español de Chile con tuteo ("prueba", no "probá").

---

## 13. Trabajar en local

**Estado ya preparado (2026-10-31)**
- Carpeta: `C:\Users\HUGO\Documents\CLAUDE\Proyectos\CorePertec`, en `main` = `origin/main`, sin cambios locales (solo `blueprints/` sin versionar, que ya estaba).
- Dependencias instaladas con `npm install`; `package-lock.json` sin cambios.
- `npx tsc --noEmit` → **sin errores**.
- `npm run dev` arranca en 3010 y `/` redirige a `/ingresar` (login Microsoft). Para entrar hay que estar en la tabla `usuarios` de **la base a la que apunte `.env.local`** y la App Registration de Entra debe tener `http://localhost:3010/api/auth/callback/microsoft-entra-id` como redirect URI (no verificado).
- **Ojo**: `.env.local` apunta a las bases de **producción** (no hay base de desarrollo). Cualquier acción en local escribe en datos reales: Página web, Rendir Gastos (carga a Odoo), Contratos, sincronizaciones SII. Pruebas destructivas: con cuidado o con una base aparte.

**Primer uso en una máquina nueva**
```bash
git clone https://github.com/PerformanceTechnologies/core-pertec.git
cd core-pertec
npm install
cp .env.example .env.local   # completar con los valores (Vercel → Settings → Environment Variables)
npm run dev                  # http://localhost:3010 (según .claude/launch.json)
```
`vercel link` + `vercel env pull .env.local` trae las variables, pero las `sensitive` vienen vacías: hay que copiarlas a mano.

**Scripts útiles**: `scripts/probar-*.mts` (verificaciones por módulo, p. ej. `probar-ofertas.mts`, `probar-facturas-sii.mts`), `scripts/verificar-crons.mjs`, `scripts/verificar-tablas.mjs`, `scripts/probar-odoo.mjs`.

---

## 14. Observaciones y pendientes para decidir

1. **Repo público** (auditado el 2026-10-31): se escaneó TODO el historial (todas las ramas) buscando llaves de Anthropic, JWT/service_role de Supabase, llaves privadas, tokens de GitHub, secretos de Azure y asignaciones `*_SECRET=`/`*_KEY=` con valor: **no hay ninguna credencial publicada**. Lo único expuesto son identificadores no secretos (RUT de empresas, Client ID de Entra de la app de correo, referencias de proyectos Supabase, nombre del sitio de SharePoint) que ya estaban en `.env.example`; se reemplazaron por marcadores en la rama `hugo/orden-seguridad-ci`, pero **siguen en el historial** y eso no se puede deshacer. Hacerlo privado tiene costos, ver §16.
2. **Supabase MCP conectado a otra base** (core-ih): reconectar con la cuenta de core-pertec si se quiere inspeccionar/migrar desde Claude.
3. **SQL faltante en el repo** para las tablas originales: conviene exportar el esquema actual (`supabase db dump --schema-only` o desde el dashboard) y versionarlo.
4. **Sin pruebas automáticas ni CI** (solo los dos workflows de cron): un push a `main` publica sin pasar por `lint`/`tsc`/`build`.
5. **Sin entorno de desarrollo/staging** separado (misma base y mismas integraciones).
6. **Migración IH (cPanel → Vercel)**: documentación inicial en la rama `claude/ih-cpanel-vercel-migration-zflfd8`; inventario vacío, esperando credenciales/accesos. No está en `main`.
7. Comentarios del código mencionan un cron `finanzas-ih` en Vercel que **no existe** (corre en GitHub Actions).
8. Menciones a "Buk" (solo etiqueta "Creado en Buk" en Contratos): sin integración real.

---

## 15. Acceso a GitHub y reglas del repo (auditado 2026-10-31)

- El dueño del repo es una **cuenta personal** de GitHub llamada `PerformanceTechnologies` (no una organización).
- En el equipo de Hugo hay dos cuentas de `gh`: `hug04ntivil` (activa) y `PerformanceTechnologies` (inactiva). **`hug04ntivil` solo tiene permiso de lectura**: `git push` devuelve 403. Para subir cambios hay que (a) invitar a `hug04ntivil` como colaboradora con permiso *Write* (recomendado: identidad propia y PR), o (b) cambiar a la cuenta dueña con `gh auth switch -u PerformanceTechnologies`. Para subir archivos de `.github/workflows/` la cuenta que empuja necesita el permiso `workflow` en su token (`gh auth refresh -s workflow`).
- Los commits del repo se firman con `Performance Technologies <github@pertec.cl>` (configuración local de `.git/config`); Alex usa su nombre con ese mismo correo. Mantener ese correo ayuda a que Vercel reconozca al autor.
- `main` **no tiene protección de rama**. No hay reglas de revisión ni checks obligatorios.
- Los workflows de cron (Panel Odoo, Facturas IH) corren con éxito (último: 2026-10-31).
- Pendiente en GitHub (requiere ser dueño): activar *Secret scanning* y *Push protection* (gratis en repos públicos) y *Dependabot alerts*.

---

## 16. Hacer el repo privado: por qué no se hizo

No se cambió la visibilidad porque puede romper cosas que hoy funcionan:
- **GitHub Actions**: en repos privados de una cuenta gratuita hay una cuota mensual de minutos (2.000 min en el plan Free, a verificar en la cuenta). `panel-odoo-sync.yml` lanza 9 jobs cada 30 minutos (≈430 jobs/día; cada job se cobra como mínimo 1 minuto), muy por encima de esa cuota. En un repo público es gratis.
- **Vercel (plan Hobby)**: los repos privados en Hobby tienen restricciones sobre quién puede hacer commits que se desplieguen (la nota "Fuerza un nuevo despliegue tras hacer público el repo" del historial sugiere que ya hubo un problema así). No verificado.
- Alternativas si se quiere privado: Vercel Pro + GitHub Pro/Team, o mover los dos crons de GitHub Actions a otro planificador. Es una decisión de negocio; ver el resumen de decisiones pendientes.

---

## 17. Cómo mantener este documento

Actualizar al cerrar cada cambio relevante: módulo nuevo (tabla §6), variable nueva (§10), cron nuevo (§8), tabla/migración nueva (§9) o decisión que afecte a Alex. Corto y verificable: si una afirmación no se puede comprobar en el código o en la consola correspondiente, márcala como "no verificado".
