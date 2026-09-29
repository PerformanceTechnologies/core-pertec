# 03 — DNS, correo y subdominios

**Este es el documento crítico de la migración.** La web se puede romper y se
arregla en 10 minutos. El correo roto es un incidente de negocio, y un DNS mal
migrado se lleva puesto el correo, los subdominios y la verificación de dominio
de Microsoft 365 al mismo tiempo.

---

## 1. El riesgo central, en una frase

> Si los **nameservers del dominio apuntan al servidor del cPanel** y se da de
> baja el hosting, **la zona DNS completa desaparece**: se cae la web, se cae
> el correo de Microsoft 365 (porque los MX dejan de resolverse), se caen todos
> los subdominios y se cae la verificación del dominio en M365.

Dar de baja el hosting **no es** un acto aislado. Antes hay que sacar el DNS de
ahí. Ese es el verdadero trabajo de esta migración; mover la web a Vercel es la
parte fácil.

Lo primero que hay que responder, entonces, es:

**¿Quién es autoritativo hoy sobre el dominio de IH?**

```bash
./scripts/audit-dns.sh ih.cl     # sección "Nameservers"
```

| Resultado | Significa | Qué hacer |
|-----------|-----------|-----------|
| NS = `ns1.<proveedor-cpanel>.com` | El DNS vive en el hosting. **Caso peligroso.** | Migrar la zona a un DNS neutral ANTES de tocar nada más |
| NS = Cloudflare / registrar / otro | El DNS ya está fuera del hosting | Excelente: solo hay que cambiar A/CNAME del sitio |

---

## 2. Recomendación de arquitectura: **no muevas los nameservers a Vercel**

Vercel tiene DNS propio y es tentador mover todo ahí. No lo hagas en este caso.

**Recomendación: mover la zona a Cloudflare DNS (gratis) y dejar Vercel solo
como destino de la web.**

Razones:

1. **Desacopla los dos cambios.** Migrar el DNS y migrar la web pasan a ser dos
   eventos independientes, cada uno reversible por separado. Si los juntas y
   algo falla, no sabes cuál de los dos fue.
2. **Cloudflare importa la zona y te deja revisarla antes de cambiar los NS.**
   Puedes comparar registro por registro contra el cPanel con el sitio aún
   100% arriba.
3. **Si mañana se cambia de Vercel a otra cosa**, el DNS no se mueve. La web es
   un `CNAME`; el correo nunca se entera.
4. **Vercel DNS no está pensado para ser el DNS corporativo** de una empresa con
   Microsoft 365, SRV de Teams, DKIM y subdominios de terceros.

Si por política se prefiere otro proveedor (Route 53, Azure DNS, el del
registrar), sirve igual. El punto no es Cloudflare: es **que el DNS deje de
depender del hosting que vamos a apagar.**

---

## 3. Registros que **no se tocan jamás** en esta migración

Estos son del correo y de Microsoft. Se copian **idénticos** al nuevo DNS,
mismo valor, mismo orden, misma prioridad.

### 3.1 MX — entrega de correo

```
ih.cl.   MX   0   ih-cl.mail.protection.outlook.com.
```

- Prioridad `0`, un solo registro. Si ves más de uno, o alguno apuntando al
  servidor del cPanel (`mail.ih.cl`), **eso es un hallazgo**: significa que hay
  correo local conviviendo con M365. Documéntalo antes de tocar nada.
- El valor exacto del `*.mail.protection.outlook.com` se saca del **panel de
  admin de M365**, no de la memoria.

### 3.2 SPF — quién puede enviar como @ih.cl

```
ih.cl.   TXT   "v=spf1 include:spf.protection.outlook.com -all"
```

⚠️ **Revisa si el SPF actual incluye el servidor del cPanel**, por ejemplo:

```
"v=spf1 +a +mx include:spf.protection.outlook.com include:servidor.hosting.com ~all"
```

Si el sitio web envía correo (formularios de contacto, notificaciones), hoy
probablemente sale por el servidor del cPanel y por eso está en el SPF. **Al
migrar a Vercel ese envío deja de existir** y hay que reemplazarlo por un
servicio de correo transaccional (ver §6). El `include:` del hosting se elimina
**solo después** de que el envío nuevo esté funcionando, no antes.

### 3.3 DKIM — firma criptográfica

```
selector1._domainkey.ih.cl.   CNAME   selector1-ih-cl._domainkey.<tenant>.onmicrosoft.com.
selector2._domainkey.ih.cl.   CNAME   selector2-ih-cl._domainkey.<tenant>.onmicrosoft.com.
```

Puede haber además un selector del cPanel (`default._domainkey`). Ese sí se
puede retirar cuando se apague el hosting, pero **después**, nunca durante.

### 3.4 DMARC

```
_dmarc.ih.cl.   TXT   "v=DMARC1; p=none; rua=mailto:..."
```

Cópialo tal cual. Si la política es `p=reject` o `p=quarantine`, cualquier error
en SPF/DKIM durante la migración **rebota correo de verdad**. Con `p=reject` el
margen de error es cero.

### 3.5 Verificación de dominio de Microsoft

```
ih.cl.   TXT   "MS=msXXXXXXXX"
```

Si este TXT desaparece, Microsoft puede **desverificar el dominio** y con eso se
caen los buzones. Es un registro que parece basura y es crítico.

### 3.6 Autodiscover y servicios de M365

```
autodiscover.ih.cl.            CNAME   autodiscover.outlook.com.
enterpriseregistration.ih.cl.  CNAME   enterpriseregistration.windows.net.
enterpriseenrollment.ih.cl.    CNAME   enterpriseenrollment.manage.microsoft.com.
_sipfederationtls._tcp.ih.cl.  SRV     100 1 5061 sipfed.online.lync.com.
_sip._tls.ih.cl.               SRV     100 1 443  sipdir.online.lync.com.
lyncdiscover.ih.cl.            CNAME   webdir.online.lync.com.
```

Sin `autodiscover`, Outlook de escritorio y los móviles dejan de configurarse
solos. Los SRV de Lync/Teams pueden no existir en tenants nuevos.

> **Fuente de verdad:** Microsoft 365 Admin → *Settings → Domains → ih.cl →
> DNS records*. Esa pantalla lista **exactamente** lo que M365 espera. Expórtala
> y úsala como checklist. No confíes en esta lista genérica.

---

## 4. Trampa específica de cPanel: el *Email Routing*

Este es el error que más veces rompe el correo en migraciones desde cPanel.

Una cuenta cPanel puede tener el correo configurado como:

- **Local Mail Exchanger** — "el correo de este dominio lo entrego yo mismo"
- **Remote Mail Exchanger** — "el correo de este dominio va a otro servidor (M365)"
- **Automatically Detect** — mira el MX y decide

Si los MX públicos apuntan a Microsoft 365 **pero el cPanel está en modo
`local`**, ocurre esto: cualquier correo enviado **desde una cuenta del
servidor** hacia `@ih.cl` (típicamente el formulario de contacto de la web) se
entrega en un buzón local del cPanel que nadie lee, en vez de llegar a
Microsoft 365.

**Consecuencia práctica:** puede haber correo que "se perdió" durante meses
acumulado en buzones locales. Vale la pena revisarlo antes de apagar el
servidor: puede haber cotizaciones perdidas ahí dentro.

El script `audit-cpanel.sh` lo consulta:

```
correo-mx.json   →   Email::list_mxs   →   campo "alwaysaccept" / "detected"
```

| Valor | Lectura |
|-------|---------|
| `alwaysaccept: 1` / `local` | **Hallazgo.** Hay entrega local activa. Revisar buzones locales |
| `alwaysaccept: 0` / `remote` | Correcto. Todo el correo va a M365 |

**No lo cambies.** Documéntalo. Cambiarlo altera la entrega de correo en
producción y la regla es no tocar el hosting.

---

## 5. Cuentas de correo que viven en el cPanel

Aunque los MX apunten a Microsoft, el cPanel casi siempre tiene cuentas POP/IMAP
creadas. El script las lista (`correo-cuentas.json`). Para cada una hay que
decidir:

| Situación | Acción |
|-----------|--------|
| Cuenta duplicada, la real está en M365 | Solo confirmar que nadie la usa. Se pierde al apagar |
| Cuenta que solo existe en cPanel y **sí se usa** | 🔴 **Bloqueante.** Hay que crear el buzón en M365 y migrar el contenido antes del corte |
| Cuenta de sistema (`info@` usada por el formulario web) | Reemplazar por el servicio transaccional nuevo |
| Reenvíos (`forwarders`) | Recrear como reglas en M365 o como alias |
| Autorespondedores | Recrear en M365 si se siguen necesitando |

> Revisa el **uso de disco por cuenta** (`list_pops_with_disk`). Una cuenta con
> 4 GB de correo es una cuenta que alguien está usando de verdad, diga lo que
> diga el inventario oficial.

---

## 6. El correo que envía la web

Casi con certeza el sitio actual manda correo con `mail()` de PHP o por SMTP a
`localhost`. **Eso no existe en Vercel**: las funciones serverless no tienen MTA
local.

Opciones, en orden de simplicidad:

1. **Resend** — integración nativa con Vercel, dominio verificado con sus propios
   DKIM (`resend._domainkey`). Lo más rápido.
2. **SMTP de Microsoft 365** — reusa el tenant existente, pero requiere una
   cuenta con licencia y autenticación moderna (OAuth2); el SMTP básico está
   deshabilitado por defecto.
3. **Amazon SES / SendGrid / Postmark** — si el volumen lo justifica.

Cualquiera que elijas **agrega registros DNS nuevos** (DKIM propio, a veces un
`include:` en el SPF). Esos sí son registros nuevos y hay que planificarlos.

⚠️ **El SPF solo admite 10 lookups DNS.** Si ya tiene varios `include:` y le
sumas uno más, puede pasarse del límite y **todo el SPF empieza a fallar**,
incluido el de Microsoft. Cuéntalos antes de agregar.

---

## 7. Subdominios: el inventario que nadie tiene

Hay que cruzar **tres fuentes**, porque ninguna sola es completa:

| Fuente | Qué ve | Qué se le escapa |
|--------|--------|------------------|
| `DNS::parse_zone` del cPanel | La zona completa como la sirve el hosting | Nada, si el cPanel es autoritativo |
| `SubDomain::listsubdomains` | Subdominios con carpeta web en esta cuenta | Los que solo son registros DNS |
| `audit-dns.sh` (DoH) | Lo que el DNS público responde | Subdominios que nadie consulta |

Para cada subdominio encontrado hay que clasificarlo:

- [ ] **Apunta a este cPanel y es una web** → ¿se migra a Vercel, se descarta o se redirige?
- [ ] **Apunta a un tercero** (`CNAME` a un SaaS, HubSpot, Shopify, Zendesk, un ERP) → **se copia idéntico al nuevo DNS.** Es un servicio vivo que no tiene nada que ver con esta migración
- [ ] **Es de verificación** (`_acme-challenge`, `google-site-verification`, `_github-challenge`) → copiar; alguno puede romper una verificación si falta
- [ ] **Es `mail`, `webmail`, `cpanel`, `whm`, `ftp`** → infraestructura del hosting. **Mueren con el hosting.** Confirmar que nadie los usa (mucha gente tiene `webmail.ih.cl` guardado en favoritos)
- [ ] **Es histórico / no responde** → candidato a eliminar, previo aviso

---

## 8. CAA: el detalle que rompe el HTTPS

```
ih.cl.   CAA   0 issue "letsencrypt.org"
```

Si existe un registro CAA restrictivo, **Vercel no va a poder emitir el
certificado** del dominio y el sitio queda sin HTTPS al momento del corte.
Vercel emite con Let's Encrypt. Revisa el CAA (`audit-dns.sh` lo consulta) y, si
restringe a otra CA, hay que ampliarlo **antes** del día del corte.

---

## 9. Orden de ejecución del DNS

```
  FASE 1  ·  Inventariar
            Zona completa del cPanel + DNS público + export de M365
            → Sin tocar nada. El sitio sigue arriba.

  FASE 2  ·  Espejar en el DNS nuevo (Cloudflare)
            Importar la zona, revisar registro por registro contra el
            inventario, dejarla lista y NO cambiar los nameservers todavía.
            → El sitio sigue arriba. Cero impacto.

  FASE 3  ·  Bajar TTL en el DNS actual  ← única acción sobre el cPanel
            TTL a 300s con 48 h de anticipación, para poder revertir rápido.
            ⚠️ Requiere autorización explícita: es el ÚNICO cambio en el
               hosting antes del corte. Si no se autoriza, el rollback pasa
               de minutos a horas.

  FASE 4  ·  Cambiar nameservers en el REGISTRAR
            → El correo NO se mueve: los MX son idénticos en ambas zonas.
              Cualquiera de los dos DNS que responda, entrega igual.
            → Esperar 24-48 h de propagación. Verificar correo en profundidad.

  FASE 5  ·  Apuntar la web a Vercel
            Cambiar A/CNAME del apex y www en el DNS nuevo.
            → Un solo registro. Rollback = volver el valor anterior.

  FASE 6  ·  Verificación y cuarentena
            Sitio, correo, subdominios. Hosting cPanel SE MANTIENE ACTIVO
            al menos 30 días más como respaldo.

  FASE 7  ·  Baja del hosting
            Solo cuando el cPanel lleve 30 días sin recibir tráfico real.
```

El punto clave de la **Fase 4**: como las dos zonas DNS tienen los mismos MX, el
cambio de nameservers es transparente para el correo. Por eso se puede hacer
este paso primero y con calma, en vez de mezclarlo con el corte de la web.

---

## 10. Verificación post-corte del correo

No basta con "me llegó un correo de prueba". Hay que verificar los cuatro flujos:

- [ ] **Entrada externa** → enviar desde Gmail a `@ih.cl`, confirmar recepción
- [ ] **Salida externa** → enviar desde `@ih.cl` a Gmail. Abrir *Mostrar
      original* y confirmar `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`
- [ ] **Interna** → entre dos cuentas `@ih.cl`
- [ ] **Desde la web** → formulario de contacto del sitio nuevo en Vercel;
      confirmar que llega y que **no cae en spam**

Herramientas: enviar un correo a `check-auth@verifier.port25.com` devuelve un
informe completo de SPF/DKIM/DMARC. `mxtoolbox.com` para verificar la
propagación y que el dominio no esté en listas negras.

---

## 11. Checklist de paridad DNS (se llena con datos reales)

Antes de cambiar los nameservers, esta tabla debe estar completa y sin una sola
fila en rojo.

| Tipo | Nombre | Valor en cPanel | Valor en DNS nuevo | ¿Idéntico? | Crítico |
|------|--------|-----------------|--------------------|-----------|---------|
| MX | @ | | | ⬜ | 🔴 correo |
| TXT | @ (SPF) | | | ⬜ | 🔴 correo |
| TXT | @ (MS=) | | | ⬜ | 🔴 M365 |
| TXT | _dmarc | | | ⬜ | 🔴 correo |
| CNAME | selector1._domainkey | | | ⬜ | 🔴 correo |
| CNAME | selector2._domainkey | | | ⬜ | 🔴 correo |
| CNAME | autodiscover | | | ⬜ | 🟠 Outlook |
| CNAME | enterpriseregistration | | | ⬜ | 🟡 |
| CNAME | enterpriseenrollment | | | ⬜ | 🟡 |
| SRV | _sipfederationtls._tcp | | | ⬜ | 🟡 |
| A | @ | | | ⬜ | 🟠 web |
| CNAME | www | | | ⬜ | 🟠 web |
| CAA | @ | | | ⬜ | 🟠 HTTPS |
| … | *(un renglón por cada registro de la zona)* | | | ⬜ | |

**Regla:** la zona nueva se copia entera, no se "limpia" durante la migración.
Depurar registros viejos es un trabajo posterior, con el sitio ya estable.
