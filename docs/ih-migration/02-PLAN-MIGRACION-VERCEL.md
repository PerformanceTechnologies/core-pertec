# 02 — Migración de la web a Vercel

---

## 1. La pregunta que define todo el proyecto: ¿qué es el sitio hoy?

Antes de hablar de Vercel hay que saber qué estamos moviendo. El script de
auditoría lo responde (`php-versiones-vhost.json`, `db-mysql-bases.json`,
`Fileman::list_files` sobre `public_html`).

| Lo que encontremos | Viabilidad en Vercel | Esfuerzo |
|---|---|---|
| **HTML/CSS/JS estático** | Directo. Vercel es ideal | Días |
| **PHP a medida, sin base de datos** | Hay que reescribirlo (Vercel no corre PHP) | Semanas |
| **PHP a medida, con MySQL** | Reescritura + migrar la base | Semanas |
| **WordPress** | ⚠️ **Vercel no corre WordPress.** Ver §2 | Mes(es) |
| **Joomla / Drupal / PrestaShop** | Igual que WordPress, y peor | Mes(es) |
| **Next.js / React ya existente** | Directo, casi trivial | Días |

### El indicador rápido

- ¿Existe `wp-config.php` en `public_html`? → **es WordPress**
- ¿Hay una base MySQL con tablas `wp_*`? → **es WordPress**
- ¿`public_html` tiene solo `.html` y `assets/`? → **es estático, es el caso fácil**

---

## 2. Si es WordPress: hay que tomar una decisión antes de seguir

Vercel **no ejecuta PHP**. No es una limitación que se pueda sortear con
configuración. Las salidas reales son cuatro:

| Opción | En qué consiste | Cuándo tiene sentido |
|--------|-----------------|----------------------|
| **A. Rehacer el sitio en Next.js** | Se rescata el contenido y el diseño, se escribe de nuevo | El sitio es institucional, pocas páginas, y ya se quería renovar |
| **B. WordPress headless** | WP sigue vivo (en otro hosting o WP Cloud) solo como admin de contenido; Vercel consume su API y renderiza | Hay gente de IH que publica contenido a diario y no se les puede quitar el editor |
| **C. Exportar a estático** | Se congela el sitio como HTML y se sube a Vercel | El sitio casi no cambia. **Se pierden los formularios y el buscador**, hay que rehacerlos aparte |
| **D. No migrar a Vercel** | WordPress gestionado (WP Engine, Kinsta, SiteGround) | Si el objetivo real era solo salir de este hosting, esto es más barato y rápido que todo lo anterior |

> **Hay que ser honesto en este punto:** si el sitio de IH es un WordPress
> institucional y el objetivo es "salir del cPanel", la opción D cumple el
> objetivo en una semana y sin reescribir nada. Vercel se justifica si además
> se quiere modernizar el front, tener previews por rama y despliegue continuo
> desde Git. Vale la pena decidirlo **con los datos del inventario a la vista**,
> no antes.

---

## 3. Lo que Vercel **no** tiene y el cPanel sí

Cada línea de esta tabla es una pieza que hay que reemplazar explícitamente. Es
la causa número uno de migraciones que "funcionan" y a los tres días empiezan a
fallar.

| Del cPanel | En Vercel | Reemplazo |
|------------|-----------|-----------|
| **MySQL** | No existe | Supabase (Postgres) — ya en uso en PERTEC · PlanetScale (MySQL) · Neon |
| **Correo saliente** (`mail()`, SMTP local) | No existe | Resend · SES · SMTP de M365 (ver `03-PLAN-DNS-Y-CORREO.md` §6) |
| **Disco persistente** (`/uploads`, PDFs, imágenes subidas) | Filesystem **efímero y de solo lectura** | Vercel Blob · Supabase Storage · S3 |
| **Cron jobs** | — | Vercel Cron (`vercel.json`) |
| **`.htaccess`** (rewrites, redirects, headers, auth básica) | — | `redirects` / `rewrites` / `headers` en `vercel.json` o middleware |
| **PHP** | — | Reescritura |
| **FTP** | — | Git push |
| **Certificados SSL del cPanel** | Automáticos | Nada que hacer, salvo el CAA (§8 del doc 03) |
| **Logs de Apache / AWStats** | — | Vercel Analytics · Log Drains |
| **Buzones IMAP/POP** | No existe | Microsoft 365 |

---

## 4. Migración del contenido y de los datos

### 4.1 Archivos

```
cPanel → Backup → Download a Home Directory Backup     (no altera el sitio)
```

Del backup interesa:
- `public_html/` completo — código y assets
- `public_html/wp-content/uploads/` si es WordPress — **suele ser lo más
  pesado y lo que más se olvida**
- `.htaccess` de cada directorio — ahí están escondidas redirecciones que nadie
  documentó y que sostienen el SEO

### 4.2 Bases de datos

```
cPanel → phpMyAdmin → Exportar   (o Backup → Download a MySQL Database Backup)
```

Del `db-mysql-bases.json` sale la lista. Para cada base: tamaño, uso real y si
hay más de una aplicación compartiéndola.

Si se va a Postgres (Supabase), la conversión MySQL→Postgres **no es
automática**: cambian tipos (`tinyint(1)`→`boolean`, `datetime`→`timestamptz`),
`AUTO_INCREMENT`→`identity`, y el manejo de mayúsculas en nombres de tabla.
Presupuestar ese trabajo.

### 4.3 Redirecciones y SEO — lo que se rompe en silencio

Esta es la parte que más daño hace y que nadie nota hasta un mes después, cuando
cae el tráfico orgánico.

- [ ] Extraer **todas** las reglas de `.htaccess` (incluidos los de
      subdirectorios) y de `redirecciones.json`
- [ ] Traducirlas a `vercel.json`
- [ ] Inventariar las URLs actuales indexadas (Search Console → *Páginas*) y
      verificar que cada una responde 200 o 301 en el sitio nuevo — **nunca 404**
- [ ] Mantener `robots.txt` y `sitemap.xml`
- [ ] Si las URLs cambian de forma (ej. `/producto.php?id=5` → `/productos/5`),
      **cada** URL vieja necesita su 301

Ejemplo de `vercel.json`:

```json
{
  "redirects": [
    { "source": "/producto.php", "destination": "/productos", "permanent": true },
    { "source": "/nosotros.html", "destination": "/nosotros", "permanent": true }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
      ]
    }
  ]
}
```

---

## 5. Puesta en marcha en Vercel, sin tocar el dominio

Todo esto se hace con el sitio actual 100% arriba:

1. Repo en GitHub (`PerformanceTechnologies/…`) con el sitio nuevo.
2. Importar en Vercel. Cada push genera un **preview deployment** con URL propia.
3. Variables de entorno en Vercel (base de datos, API keys del correo).
4. Validar todo sobre la URL `*.vercel.app`: navegación, formularios, correo
   saliente, rendimiento, móvil.
5. **Opcional y muy recomendable:** publicar el sitio nuevo en un subdominio de
   prueba (`nuevo.ih.cl`) para que IH lo revise en su propio dominio, con HTTPS
   real, antes del corte. Es un registro DNS nuevo que no afecta al sitio actual.
6. Recién entonces se agrega el dominio productivo en Vercel y se cambian los
   registros (ver `04-PLAN-DE-CORTE.md`).

---

## 6. Decisiones abiertas

Se resuelven con el inventario en la mano:

- [ ] ¿Qué es el sitio hoy y cuál de las cuatro opciones del §2 se toma?
- [ ] ¿Base de datos → Supabase (coherente con el resto de PERTEC) u otra?
- [ ] ¿Proveedor de correo transaccional?
- [ ] ¿Se rediseña o se replica el diseño actual tal cual?
- [ ] ¿Quién publica contenido en IH y con qué herramienta lo hará después?
- [ ] ¿Plan de Vercel? (Hobby no permite uso comercial; para una empresa, Pro)
