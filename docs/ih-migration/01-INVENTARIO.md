# 01 — Inventario del hosting de IH

> **Estado: VACÍO.** Se completa al ejecutar `scripts/audit-cpanel.sh` y
> `scripts/audit-dns.sh`. Todo lo que aparece abajo entre `___` es un dato que
> todavía no tenemos.
>
> Ningún plan de este repo debería ejecutarse con este documento incompleto.

---

## 1. Identificación

| Campo | Valor |
|-------|-------|
| Dominio principal | `___` |
| Host del cPanel | `___` |
| Usuario cPanel | `___` |
| Proveedor de hosting | `___` |
| Registrar del dominio | `___` |
| Vencimiento del dominio | `___` |
| Vencimiento del hosting | `___` |
| Tenant de Microsoft 365 | `___` |
| Fecha de la auditoría | `___` |

---

## 2. Stack del sitio

*(fuente: `php-versiones-vhost.json`, `Fileman::list_files` sobre `public_html`)*

| Campo | Valor |
|-------|-------|
| Tecnología | `___` (estático / PHP a medida / WordPress / otro) |
| Versión de PHP | `___` |
| CMS y versión | `___` |
| Plugins/temas relevantes | `___` |
| Tamaño de `public_html` | `___` |
| Tamaño de `uploads` | `___` |
| ¿Envía correo? ¿cómo? | `___` |
| ¿Tiene formularios? | `___` |
| ¿Tiene login de usuarios? | `___` |
| ¿Tiene pasarela de pago? | `___` |
| Ruta de decisión (doc 02 §2) | `___` |

---

## 3. Dominios y subdominios

*(fuente: `dominios-*.json`, `subdominios.json`, `zona-dns-*.json`, `dns-*.txt`)*

| Subdominio | Tipo | Apunta a | ¿Qué es? | Destino tras la migración |
|------------|------|----------|----------|---------------------------|
| | | | | |

Clasificación (doc 03 §7): web propia · servicio de terceros · verificación ·
infraestructura del hosting · histórico.

---

## 4. Zona DNS completa

*(fuente: `zona-dns-<dominio>.json` — la zona **entera**, sin filtrar)*

| Tipo | Nombre | TTL | Valor | Crítico | Destino |
|------|--------|-----|-------|---------|---------|
| | | | | | |

**Nameservers actuales:** `___`
**¿El cPanel es autoritativo?** `___` ← si es *sí*, leer doc 03 §1

---

## 5. Correo

*(fuente: `correo-*.json`)*

**Routing del cPanel (`Email::list_mxs`):** `___` ← ver doc 03 §4

### Cuentas en el cPanel

| Cuenta | Disco usado | ¿Existe en M365? | ¿En uso real? | Acción |
|--------|-------------|------------------|---------------|--------|
| | | | | |

### Reenvíos y autorespondedores

| Origen | Destino | Acción |
|--------|---------|--------|
| | | |

### Registros de correo en producción

| Registro | Valor actual | Crítico |
|----------|--------------|---------|
| MX | `___` | 🔴 |
| SPF | `___` | 🔴 |
| DMARC | `___` | 🔴 |
| DKIM selector1 | `___` | 🔴 |
| DKIM selector2 | `___` | 🔴 |
| TXT `MS=` | `___` | 🔴 |
| autodiscover | `___` | 🟠 |

**¿El SPF incluye el servidor del hosting?** `___`
**Lookups DNS que consume el SPF (máx. 10):** `___`

---

## 6. Bases de datos

*(fuente: `db-mysql-*.json`)*

| Base | Motor / versión | Tamaño | Tablas | Usada por | Destino |
|------|-----------------|--------|--------|-----------|---------|
| | | | | | |

| Usuario MySQL | Bases a las que accede | Destino |
|---------------|------------------------|---------|
| | | |

---

## 7. Cron jobs

*(fuente: `cron-tareas.json`)*

| Schedule | Comando | ¿Qué hace? | ¿Sigue siendo necesario? | Destino |
|----------|---------|------------|--------------------------|---------|
| | | | | |

---

## 8. Redirecciones y `.htaccess`

*(fuente: `redirecciones.json` + los `.htaccess` del backup)*

| Origen | Destino | Tipo | Traducido a `vercel.json` |
|--------|---------|------|---------------------------|
| | | | ⬜ |

---

## 9. Certificados SSL

*(fuente: `ssl-instalados.json`)*

| Dominio | Emisor | Vence | ¿Lo reemplaza Vercel? |
|---------|--------|-------|-----------------------|
| | | | |

**Registro CAA:** `___` ← ver doc 03 §8

---

## 10. Accesos y recursos

| Campo | Valor |
|-------|-------|
| Cuentas FTP | `___` |
| Claves SSH | `___` |
| Disco usado / cuota | `___` |
| Ancho de banda mensual | `___` |
| Último backup disponible | `___` |

---

## 11. Hallazgos

> Todo lo inesperado va aquí. Un hallazgo no documentado el día 1 es un
> incidente el día del corte.

| # | Hallazgo | Severidad | Implicancia | Estado |
|---|----------|-----------|-------------|--------|
| 1 | | | | |

---

## 12. Bloqueantes para el corte

Ninguna fase posterior a la 4 arranca con algo pendiente aquí.

- [ ] Zona DNS inventariada completa y cruzada con las 3 fuentes
- [ ] Export de registros DNS desde el admin de M365 obtenido
- [ ] `Email Routing` del cPanel verificado
- [ ] Cuentas de correo solo-cPanel resueltas
- [ ] Decisión de arquitectura del sitio tomada (doc 02 §2)
- [ ] Reemplazo del correo saliente definido
- [ ] Redirecciones extraídas y traducidas
- [ ] CAA verificado
- [ ] Backup completo descargado **y probado**
- [ ] Ventana de corte acordada con IH
