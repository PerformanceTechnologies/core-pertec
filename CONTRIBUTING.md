# Cómo trabajar en core-pertec

Reglas simples para que dos personas (y sus Claude) trabajen en paralelo sin pisarse
y sin romper lo que hoy funciona en `core.pertec.cl`. El contexto completo de la
aplicación está en [`CONTEXTO.md`](CONTEXTO.md).

## Regla de oro

**Un push a `main` publica en producción** (Vercel despliega solo). Por eso:

- Trabaja en una rama propia y mezcla con un Pull Request, no empujes directo a `main`.
- Avisa antes de tocar: `package.json`, `next.config.ts`, `vercel.json`, `proxy.ts`,
  `lib/contratos/*`, permisos (`lib/autorizacion.ts`) o cualquier SQL.
- Nunca subas `.env*` con valores, claves, tokens ni datos reales de personas o empresas.
  El repo es **público**.

## Flujo del día

```bash
git switch main
git pull --ff-only                     # partir siempre de lo último
git switch -c <tu-nombre>/<tema>       # p. ej. hugo/cotizador-iva
# ... trabajar ...
npx tsc --noEmit                       # tipos: tiene que pasar
git add <archivos>                     # a mano; evita `git add .`
git commit -m "Módulo: qué cambia, en español"
git push -u origin <tu-nombre>/<tema>
# abrir Pull Request hacia main (la plantilla trae la lista a revisar)
```

- Commits chicos y con el módulo adelante (`Cotizador: …`, `Contratos: …`), como el historial existente.
- Antes de abrir el PR: `git fetch` y `git rebase origin/main` (o merge) para resolver choques en tu máquina.
- El workflow **CI** (`.github/workflows/ci.yml`) compila el PR con `tsc` y `next build`. Si sale en rojo, no se mezcla.
- Para saber qué hizo la otra persona: `git log origin/main --since="1 week ago" --format='%h %an %s'`.

## Entorno de desarrollo

`.env.local` **no debe apuntar a las bases de producción**. En local, entrar al Core con
una base de producción reescribe las credenciales cifradas de Graph de esa persona
(`graph_credenciales`), y cualquier prueba escribe en datos reales (Página web, Rendir Gastos →
Odoo, Contratos, sincronizaciones del SII).

1. Usa un proyecto de Supabase de desarrollo (ver `supabase/README.md`) para
   `NEXT_PUBLIC_SUPABASE_URL` y `PERTEC_WEB_SUPABASE_URL`.
2. Usa llaves propias de desarrollo para `ANTHROPIC_API_KEY` (con límite de gasto) y
   `TOKEN_CIFRADO_KEY` (`openssl rand -base64 32`; distinta de la de producción).
3. Agrega `http://localhost:3010/api/auth/callback/microsoft-entra-id` como Redirect URI en la
   App Registration de Entra (o usa una App Registration aparte para desarrollo).
4. `npm install` y `npm run dev` (puerto 3010).

## Base de datos

- Todo cambio de esquema es un archivo nuevo en `supabase/<modulo>/000N_descripcion.sql`,
  idempotente (`if not exists`, `create or replace`) y revisado en el PR.
- Se aplica **primero en la base de desarrollo**, luego en producción cuando el PR se mezcla,
  y se avisa a la otra persona.
- Tablas con `CHECK` (p. ej. `facturas_sii.estado`, `rol_extra`, los módulos de Panel Odoo):
  agregar un valor nuevo exige migración o la escritura falla en producción.

## Secretos y variables

- Las variables viven en Vercel (Settings → Environment Variables, tipo *Sensitive*) y, si las
  usa un workflow, en GitHub → Settings → Secrets and variables → Actions.
- Una variable nueva se documenta en `.env.example` (sin valor) y en `CONTEXTO.md`.
- Si una clave se publica por accidente (commit, captura, chat): **rotarla de inmediato**
  en su origen (Supabase, Entra, Anthropic, Odoo, SII) y actualizar Vercel y GitHub.
  Borrar el commit no alcanza: el repo es público.

## Qué no hacer

- No uses `@/lib/supabase-admin` dentro de `lib/contratos/*` (usa `./supabase-admin`: filtra por contrato).
- No edites a mano `inv_quants` ni `inv_movimientos` (Inventario).
- No cambies `TOKEN_CIFRADO_KEY` de producción.
- No agregues crons de Vercel con más de una ejecución diaria por expresión (el plan lo rechaza y el deploy falla).
