# Respaldos de Supabase

Respaldo **diario y cifrado** de las dos bases de Supabase (la del Core y la compartida con el sitio público) y de
sus archivos de Storage. Corre en GitHub Actions (`.github/workflows/respaldo-supabase.yml`) y deja el resultado
en una carpeta de SharePoint.

## Cómo está pensado

El repositorio es **público**, y los *artifacts* de un repo público los puede descargar cualquiera con una cuenta
de GitHub. Por eso:

- Nada del respaldo queda en GitHub: ni como artifact ni en los registros.
- Todo se **cifra con age** antes de salir del runner, usando una **llave pública** que sí está en el workflow.
  Con esa llave solo se puede cifrar. La **llave privada** (la única que descifra) no está en GitHub ni en el repo:
  la guarda quien administra los respaldos, en su gestor de contraseñas.
- El destino es una carpeta de SharePoint, vía Microsoft Graph con los mismos permisos de aplicación que el Core ya
  usa para guardar PDF. Aunque la carpeta fuera visible para más gente, el contenido no se puede leer.

Cada día y por proyecto (`core-pertec` y `pertec-web`) se genera `<proyecto>_AAAA-MM-DD.tar.gz.age` más su
`.sha256`, con:

| Contenido | Detalle |
|---|---|
| `db/public.dump` | `pg_dump` en formato custom del esquema `public` (esquema + datos) |
| `db/schema.sql` | El mismo esquema, legible |
| `db/auth.sql` | Solo en `pertec-web`: usuarios del login de Supabase (con hashes de contraseña) |
| `db/storage_*.json`, `db/cron_job.json` | Metadatos de Storage y tareas de cron |
| `db/conteos_en_vivo.json` | Filas por tabla en el momento del respaldo |
| `storage/<bucket>/…` | Todos los archivos de Storage |
| `SHA256SUMS` | Huella de cada archivo |

El workflow **falla** (y avisa) si el volcado no trae los datos de todas las tablas o si faltan archivos de
Storage respecto a lo que la base registra. Retención: 30 días, y nunca menos de 7 respaldos por proyecto
(`scripts/respaldo/probar-retencion.mjs` prueba esa regla).

## Secrets necesarios (GitHub → Settings → Secrets and variables → Actions)

Ya existen y los usa: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `SHAREPOINT_FACTURAS_SITE_ID`,
`MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Hay que agregar:

| Secret | Qué es |
|---|---|
| `SUPABASE_CORE_DB_URL` | Cadena de conexión de la base del Core, modo **Session pooler** |
| `SUPABASE_WEB_DB_URL` | Ídem, para la base compartida con el sitio público |
| `PERTEC_WEB_SUPABASE_URL` | URL de la API de esa segunda base |
| `PERTEC_WEB_SUPABASE_SERVICE_ROLE_KEY` | Su llave de servicio |

La cadena de conexión se copia desde Supabase → el proyecto → **Connect** → *Session pooler*. Hay que usar el
pooler y no la conexión directa: la directa solo habla IPv6 y los runners de GitHub no. Tiene la forma
`postgresql://postgres.<ref>:<contraseña>@<region>.pooler.supabase.com:5432/postgres`.

**Cargar un secret sin que el valor pase por ningún chat**: en tu propia terminal,

```bash
gh secret set SUPABASE_CORE_DB_URL --repo <dueño>/core-pertec
```

`gh` pide el valor y no lo muestra ni lo guarda en el historial. Repite con cada secret.

## Primera ejecución y control

1. Con los secrets cargados: *Actions → Respaldo Supabase → Run workflow*.
2. Revisar que ambos proyectos queden en verde y que aparezcan los archivos en SharePoint
   (`RESPALDOS SUPABASE/<proyecto>/`).
3. Descargar uno, **descifrarlo y verificarlo** (ver abajo). Un respaldo que nunca se probó no es un respaldo.
4. Repetir esa prueba de restauración cada trimestre.

Si una ejecución falla llega un correo a soporte (y GitHub avisa por su cuenta). El último respaldo bueno sigue en
SharePoint. Ojo: GitHub puede retrasar o descartar ejecuciones programadas en horas de mucha carga, y pausa los
workflows programados de un repo sin actividad durante 60 días.

## Restaurar

Requiere la llave privada de age y el programa `age` (en Windows: `winget install FiloSottile.age`).

```bash
age -d -i age-llave-privada.txt -o respaldo.tar.gz core-pertec_AAAA-MM-DD.tar.gz.age
```

```bash
tar -xzf respaldo.tar.gz
```

Dentro de `core-pertec/`:

1. **Verificar**: `cd core-pertec && sha256sum -c SHA256SUMS`.
2. **Base** (en un proyecto Supabase nuevo o vacío, con su cadena de conexión):
   `pg_restore --no-owner --no-privileges --clean --if-exists --dbname "<cadena>" db/public.dump`
   (el esquema legible está en `db/schema.sql`; los roles `anon`, `authenticated` y `service_role` ya existen en
   cualquier proyecto de Supabase).
3. **Usuarios del login** (solo `pertec-web`): `psql "<cadena>" -f db/auth.sql`.
4. **Archivos**: volver a subir cada carpeta de `storage/<bucket>/` a un bucket del mismo nombre (y las mismas
   opciones de público o privado que figuran en `db/storage_buckets.json`).
5. Apuntar las variables de entorno del Core al proyecto restaurado.

## Rotar la llave de cifrado

Se genera un par nuevo con `age-keygen`, se cambia `AGE_PUBLIC_KEY` en el workflow y se guarda la privada nueva.
**Conservar la privada vieja** mientras existan respaldos cifrados con ella (30 días).

## Qué no cubre

- Una foto transaccional única de la base y de Storage a la vez (el volcado de la base sí es consistente en sí
  mismo; Storage se descarga justo después).
- Roles, configuración de Auth ni secretos de Edge Functions.
- Las variables de entorno de Vercel y los secrets de GitHub: esas viven en esos servicios.
- Supabase Pro ofrece además respaldos propios y recuperación a un punto en el tiempo; son un complemento, no un
  reemplazo, porque este respaldo vive fuera de Supabase.
