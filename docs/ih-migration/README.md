# Migración IH — cPanel → Vercel

Análisis, inventario y plan de corte para sacar el sitio de IH del hosting
cPanel actual y llevarlo a Vercel, **sin tocar el correo de Microsoft 365, sin
perder subdominios y sin que el sitio se caiga un solo minuto.**

---

## Regla número uno

> **En el hosting no se hace ningún cambio.** El cPanel se mantiene activo y
> sirviendo el sitio hasta el día en que IH autorice darlo de baja. Toda la
> auditoría es de solo lectura, y el rollback en cualquier fase consiste en
> volver a apuntar al cPanel, que sigue ahí, intacto.

La única excepción propuesta —bajar el TTL del DNS 48 h antes del corte— está
explicada y requiere autorización explícita: ver
[`04-PLAN-DE-CORTE.md`](04-PLAN-DE-CORTE.md) §1.

---

## Estado actual

| | |
|---|---|
| Inventario | 🔴 **vacío** — faltan credenciales y acceso de red |
| Plan DNS y correo | 🟢 escrito, pendiente de datos reales |
| Plan Vercel | 🟢 escrito, pendiente de saber qué es el sitio |
| Plan de corte | 🟢 escrito |
| Fecha de corte | ⬜ sin definir |

**Siguiente paso:** entregar lo que pide
[`00-DATOS-REQUERIDOS.md`](00-DATOS-REQUERIDOS.md).

---

## Los documentos

| Archivo | Qué contiene |
|---------|--------------|
| [`00-DATOS-REQUERIDOS.md`](00-DATOS-REQUERIDOS.md) | Qué credenciales y accesos hacen falta, y cómo obtenerlos |
| [`01-INVENTARIO.md`](01-INVENTARIO.md) | Plantilla del inventario. Se llena con la salida de los scripts |
| [`02-PLAN-MIGRACION-VERCEL.md`](02-PLAN-MIGRACION-VERCEL.md) | Qué se puede y qué no se puede llevar a Vercel, y qué hay que reemplazar |
| [`03-PLAN-DNS-Y-CORREO.md`](03-PLAN-DNS-Y-CORREO.md) | **El documento crítico.** DNS, Microsoft 365, SPF/DKIM/DMARC, subdominios |
| [`04-PLAN-DE-CORTE.md`](04-PLAN-DE-CORTE.md) | Fases, día del corte, verificaciones, riesgos y rollback |

---

## Los scripts

Ambos son **de solo lectura**. `audit-cpanel.sh` además valida cada llamada
contra una lista blanca de funciones de lectura y rechaza cualquier nombre que
contenga un verbo de escritura, antes de salir a la red.

```bash
# Inventario de la cuenta cPanel (vía API token sobre HTTPS)
export CPANEL_HOST="servidor.proveedor.com"
export CPANEL_PORT="2083"
export CPANEL_USER="usuarioih"
export CPANEL_TOKEN="..."
./scripts/audit-cpanel.sh ./salida-cpanel

# Fotografía del DNS público (no necesita credenciales)
./scripts/audit-dns.sh ih.cl ./salida-dns
```

La salida de `audit-dns.sh` sirve dos veces: para el inventario inicial y para
**diffear antes/después del corte** y confirmar que no se perdió ningún registro.

> `salida-*/` está en `.gitignore`: puede contener datos de la infraestructura
> de IH y no debe commitearse.

---

## Los tres hallazgos que ya condicionan el proyecto

**1. SSH no es viable desde el entorno de Claude.** La salida de red es un proxy
HTTP sin túnel TCP crudo, y el cliente `ssh` no está instalado. Por eso el plan
usa la **API de cPanel sobre HTTPS (puerto 2083)**, que entrega la misma
información que íbamos a sacar por SSH: zona DNS, cuentas de correo, bases de
datos, cron, SSL, subdominios. No se pierde nada del análisis.

**2. El riesgo real no es la web, es el DNS.** Si los nameservers del dominio
apuntan al servidor del cPanel, dar de baja el hosting borra la zona completa y
con ella el correo de Microsoft 365. La recomendación es **mover el DNS a un
proveedor neutral (Cloudflare) antes que nada**, y dejar Vercel únicamente como
destino de la web — no como DNS corporativo.

**3. Si el sitio es WordPress, Vercel no lo corre.** No es configurable: Vercel
no ejecuta PHP. Hay cuatro salidas posibles y una de ellas es no usar Vercel.
Esa decisión se toma con el inventario a la vista, no antes:
[`02-PLAN-MIGRACION-VERCEL.md`](02-PLAN-MIGRACION-VERCEL.md) §2.
