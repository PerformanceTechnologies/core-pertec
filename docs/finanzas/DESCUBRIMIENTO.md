# Gestión financiera · Descubrimiento (Fase 0)

Qué había en el Core antes de construir el módulo y cómo se ajustó el plan de la especificación
(`PERTEC_Core_Finanzas_Spec.md`) a lo que existe. Fuente funcional: `Finanzas_PERTEC_v2_Punto_de_partida.xlsx`.

## Stack real

| Tema | Lo que hay | Cómo lo usa Gestión financiera |
|---|---|---|
| Framework | Next.js 16 (App Router; `params` y `searchParams` son promesas), React 19, TypeScript estricto | Páginas de servidor bajo `app/(protegido)/gestion-financiera/`, Server Actions por área |
| Estilos | Tailwind v4 con tokens propios (`naranjo`, `tinta`, `gris`, `borde`, `superficie`, `fondo`, `banda-contraste`…) y `lib/estilos.ts` (`TARJETA`) | Mismos tokens; nada de colores ad-hoc salvo los tonos de estado (verde/ámbar/rojo) que ya usan Inventario y Contratos |
| Íconos | `@tabler/icons-react`; catálogo del menú en `lib/iconos.tsx` | Ícono `cash` para la aplicación |
| Base de datos | Supabase (PostgreSQL) con `supabaseAdmin` (service role) desde el servidor. RLS activado **sin políticas** en las tablas del Core: el cliente nunca consulta directo | Igual: todas las tablas `fin_*` con RLS activado y sin políticas; el filtro por empresa se hace en el servidor |
| Migraciones | SQL a mano por módulo en `supabase/<modulo>/000N_*.sql`, que el usuario pega en el editor SQL de Supabase | `supabase/fin/0001_gestion_financiera.sql` |
| Autenticación y permisos | `exigirAccesoApp(slug)` (páginas) y `verificarAccesoAppApi(slug)` (rutas API), con la tabla `aplicaciones` y los permisos por usuario | Aplicación `gestion-financiera`; sin roles financieros por ahora |
| Multiempresa | Tabla `empresas` (slugs `pertec`, `zeus`, `performance-service`), empresa activa en una cookie validada por `contextoDeEmpresa(usuarioId, rol)` | `contextoFin()` exige que la empresa activa sea una de las tres y filtra todo por `empresa_id` |
| Contactos | `finanzas_contactos`: ficha tributaria **global** (sin empresa) | Clientes y proveedores salen de ahí (solo lectura); el perfil financiero es por empresa (`fin_perfiles`) |
| Inventario | `inv_productos`, `inv_unidades`: compartido entre empresas | Solo lectura: productos para las líneas de cotización |
| Pruebas | Scripts `scripts/probar-*.mts` con `node:assert`, corridos con `tsx` | `probar-fin` (regresión contra el Excel) y `probar-fin-contable` |
| Subidas | Límite de 4 MB para Server Actions (`LIMITE_SUBIDA`) | Cartolas y adjuntos van por route handlers |
| Menú | `lib/menu-modelo.ts` (módulos → submódulos) y `lib/modulos-resumen.ts` (cartillas de la portada de cada módulo) | Ítem «Gestión financiera» en Finanzas, justo después de Contactos, con su cartilla |

## Módulos existentes que **no** se tocan

- **Cotizador** (`/cotizador`) y **Ofertas**: el cotizador financiero es nuevo e independiente (decisión del usuario).
- **Proyectos** (`/proyectos`, en pausa) y **Contratos**: el módulo de proyectos financiero es nuevo (`fin_proyectos`). Contratos se integrará más adelante.
- **Rendición de gastos**, **Contactos**, **Inventario**: solo lectura.

## Plan ajustado

1. Reglas del Excel en TypeScript puro (`lib/fin/reglas.ts`) con pruebas de regresión, en vez de funciones SQL.
2. Una migración aditiva con todas las tablas `fin_*` y los catálogos de las tres empresas.
3. Pantallas: Resumen (dashboard), Comercial (pipeline y cotizaciones), Ventas y cobranza, Compras y pagos, Tesorería (banco diario, factoring, flujo), Proyectos, Contabilidad, Rutinas y Configuración.
4. Sin formatos imprimibles ni emisión DTE: botones visibles y deshabilitados con su motivo.

## Riesgos detectados

- El proyecto Supabase es compartido: la migración solo crea objetos `fin_*`, un bucket privado `finanzas` y una fila en `aplicaciones` (si no existe).
- Al no haber políticas RLS, la seguridad depende de que **toda** consulta pase por `contextoFin()` / `exigirDeEmpresa()`. Se revisó acción por acción (ver DECISIONES.md, D2).
