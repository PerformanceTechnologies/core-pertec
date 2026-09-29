# 00 — Datos que necesito para ejecutar el análisis

Estado: **bloqueado esperando estos datos.** Todo lo demás del repo ya está escrito.

---

## A. Lo mínimo indispensable (sin esto no parte nada)

| # | Dato | Ejemplo | Dónde se obtiene |
|---|------|---------|------------------|
| 1 | **Dominio principal de IH** | `ih.cl` | Obvio, pero aún no me lo has dicho |
| 2 | **Host del cPanel** | `server42.miproveedor.com` | Barra del navegador al entrar al cPanel, o el correo de bienvenida del hosting |
| 3 | **Puerto** | `2083` (default SSL) | Igual que arriba |
| 4 | **Usuario cPanel** | `ihcl` | Esquina superior derecha del cPanel |
| 5 | **API token de solo lectura** | `ABC123...` | cPanel → **Security** → **Manage API Tokens** → *Create* |
| 6 | **Proveedor del dominio (registrar)** | NIC Chile, GoDaddy, etc. | Quién cobra la renovación del dominio |

### Cómo crear el API token (2 minutos, no altera el sitio)

1. Entra al cPanel de IH.
2. Busca **Security → Manage API Tokens**.
3. **Create** → nombre: `claude-auditoria-migracion`.
4. Si el panel ofrece restringir privilegios, **déjalo solo con permisos de
   lectura**. Si no ofrece esa opción (muchos cPanel no la tienen), créalo
   igual: los scripts de este repo bloquean por lista blanca cualquier función
   que no sea de lectura.
5. Opcional pero recomendado: ponle **fecha de expiración** a 15 días.
6. Copia el token. cPanel lo muestra **una sola vez**.

> **Al terminar la auditoría, revoca el token.** Es un botón en la misma
> pantalla. Así el acceso queda cerrado pase lo que pase.

---

## B. Habilitar la red del entorno (obligatorio)

Ahora mismo este contenedor **no puede salir a ningún host que no esté en la
lista blanca de red**. Lo comprobé: hasta una consulta DNS por HTTPS a
`dns.google` devuelve `403` del proxy.

Para que yo consulte la API de cPanel directamente, hay que agregar a los
dominios permitidos del entorno:

```
<host-del-cpanel>          ← ej. server42.miproveedor.com  (puerto 2083)
cloudflare-dns.com         ← para auditar el DNS público
dns.google                 ← resolver de respaldo
<dominio-de-ih>            ← para analizar el sitio en vivo
```

Se cambia en el menú del entorno cloud (barra de título de la sesión) →
**Edit** → *Network access*. Los niveles de acceso están documentados en
https://code.claude.com/docs/en/claude-code-on-the-web

> **SSH no va a funcionar ni con la red abierta.** La salida de este contenedor
> es un proxy HTTP: no hay túnel TCP crudo y el cliente `ssh` ni siquiera está
> instalado. Por eso el plan usa la **API de cPanel sobre HTTPS**, que entrega
> la misma información que necesitábamos del SSH.

---

## C. Lo que la API de cPanel **no** me va a dar, y hay que conseguir aparte

| Dato | Por qué falta | Cómo lo consigues |
|------|---------------|-------------------|
| **Dónde están los nameservers de verdad** | El cPanel tiene su idea de la zona, pero manda el registrar | Panel del registrar (NIC Chile / GoDaddy) → sección DNS |
| **Tenant de Microsoft 365** | Vive en Microsoft, no en el cPanel | Admin de M365 → *Settings → Domains → ih.cl* → **exportar la lista completa de registros DNS requeridos** |
| **Código fuente del sitio** | La API lista archivos, pero bajar el sitio completo por API es lento | Descarga el backup de archivos desde cPanel (*Backup → Download a Home Directory Backup*) o por FTP |
| **Dump de las bases de datos** | Igual | cPanel → *phpMyAdmin* → Exportar, o *Backup → Download a MySQL Database Backup* |
| **Quién más administra el dominio** | — | Interno de IH |

> Ojo: descargar un backup **no modifica** el hosting, solo genera un archivo.
> Es seguro y no interrumpe el sitio.

---

## D. Cómo me entregas las credenciales

No las pegues en un archivo del repo. Dos opciones, en orden de preferencia:

1. **Secrets del entorno** (recomendado): se guardan cifradas y llegan a la
   sesión como variables de entorno. Se configuran en el menú del entorno →
   *Edit* → *Environment variables / Secrets*. Nómbralas:
   `CPANEL_HOST`, `CPANEL_PORT`, `CPANEL_USER`, `CPANEL_TOKEN`.
2. **En el chat**, si prefieres rapidez. En ese caso **revoca el token apenas
   termine la auditoría** — asume que un token pegado en un chat es un token
   quemado.

---

## E. Si prefieres no darme acceso: modo manual

Corres tú los scripts y me pegas la salida. Funciona igual de bien.

```bash
export CPANEL_HOST="..." CPANEL_PORT="2083" CPANEL_USER="..." CPANEL_TOKEN="..."
./scripts/audit-cpanel.sh ./salida-cpanel

./scripts/audit-dns.sh ih.cl ./salida-dns
```

Me mandas el contenido de `salida-cpanel/` y `salida-dns/` y yo completo
`01-INVENTARIO.md` y ajusto los planes con datos reales.
