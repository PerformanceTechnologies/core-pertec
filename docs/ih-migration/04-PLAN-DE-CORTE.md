# 04 — Plan de corte y baja del hosting

> **Regla del proyecto:** el hosting cPanel se mantiene **activo, intacto y
> sirviendo el sitio** hasta el día en que se decida darlo de baja. Durante toda
> la migración no se hace ningún cambio en él.

---

## 1. La única excepción a "no tocar nada"

Hay **un** cambio en el cPanel que conviene autorizar, y hay que hacerlo con
conocimiento de causa:

**Bajar el TTL de los registros DNS a 300 segundos, 48 horas antes del corte.**

- **Qué hace:** le dice al mundo que cachee las respuestas DNS por 5 minutos en
  vez de 4, 12 o 24 horas.
- **Riesgo:** prácticamente nulo. No cambia ningún valor, solo su vigencia.
- **Por qué importa:** si algo sale mal el día del corte, el rollback tarda
  **5 minutos** en vez de **hasta 24 horas**. Sin esto no hay vuelta atrás
  rápida.

Si no se autoriza, se asume que un error el día del corte deja el sitio o el
correo degradado por hasta un día completo. **Es una decisión de negocio, y hay
que tomarla explícitamente.**

Fuera de esto: **nada más se toca en el cPanel.**

---

## 2. Fases

| # | Fase | Toca el cPanel | Riesgo | Duración |
|---|------|----------------|--------|----------|
| 0 | Inventario y auditoría | ❌ solo lectura | Nulo | 1–2 días |
| 1 | Decisión de arquitectura | ❌ | Nulo | 1 día |
| 2 | Desarrollo del sitio nuevo | ❌ | Nulo | Depende del §2 del doc 02 |
| 3 | Zona DNS espejo en el nuevo proveedor | ❌ | Nulo | 1 día |
| 4 | Validación sobre `*.vercel.app` y `nuevo.ih.cl` | ❌ | Nulo | 2–3 días |
| 5 | Bajar TTL | ⚠️ **único cambio** | Muy bajo | 5 min + 48 h espera |
| 6 | Cambio de nameservers en el registrar | ❌ | **Medio — correo** | 24–48 h propagación |
| 7 | Apuntar apex/www a Vercel | ❌ | Bajo | 5 min + propagación |
| 8 | Cuarentena y monitoreo | ❌ | Nulo | 30 días mínimo |
| 9 | Baja del hosting | ✅ definitivo | — | — |

**Las fases 6 y 7 van separadas, con días de por medio.** Juntarlas es
tentador y es exactamente cómo se pierde la trazabilidad de qué falló.

---

## 3. Día del corte de DNS (Fase 6)

**Cuándo:** martes o miércoles por la mañana. Nunca viernes, nunca antes de
feriado, nunca en cierre de mes.

**Quién tiene que estar disponible:** quien administre el registrar, quien
administre Microsoft 365, y alguien de IH que pueda confirmar que le llega el
correo.

### Antes de empezar

- [ ] Checklist de paridad DNS (doc 03 §11) completo, sin ninguna fila pendiente
- [ ] Export de los registros DNS desde el admin de M365, comparado uno a uno
- [ ] TTL bajo y propagado (48 h)
- [ ] Captura del estado actual: `./scripts/audit-dns.sh ih.cl ./antes/`
- [ ] Backup completo del cPanel descargado y **verificado que abre**
- [ ] Dump de las bases de datos descargado y verificado
- [ ] Valores DNS anteriores anotados en papel para el rollback

### Ejecución

1. Cambiar los nameservers en el **registrar**.
2. Esperar 30 minutos.
3. Correr `./scripts/audit-dns.sh ih.cl ./despues/` y **diffear contra
   `./antes/`**. Lo único que debe cambiar son los NS.
4. Verificar los cuatro flujos de correo (doc 03 §10).
5. Confirmar que el sitio sigue resolviendo al cPanel — en esta fase la web
   **todavía no se mueve**.
6. Monitorear 24–48 h.

> Si algo falla: volver los nameservers al valor anterior en el registrar. Con
> TTL bajo, se normaliza en minutos.

---

## 4. Día del corte de la web (Fase 7)

Solo cuando la Fase 6 lleve al menos 48 h estable.

1. Agregar el dominio en el proyecto de Vercel.
2. Cambiar en el DNS nuevo:
   - `A @` → la IP que indique Vercel (o `ALIAS`/`ANAME` al target de Vercel)
   - `CNAME www` → `cname.vercel-dns.com`
3. Esperar la emisión del certificado (minutos). Si falla → revisar CAA.
4. Verificar:
   - [ ] `https://ih.cl` y `https://www.ih.cl` cargan, con candado válido
   - [ ] Redirección `www` ↔ apex coherente y consistente
   - [ ] Las 20 URLs más visitadas responden 200 o 301, ninguna 404
   - [ ] Formulario de contacto envía y **llega a la bandeja correcta**
   - [ ] El correo sigue funcionando (se vuelve a verificar, sí, otra vez)
   - [ ] Móvil
   - [ ] Search Console sin picos de error

**Rollback:** volver el `A`/`CNAME` al valor del cPanel. El hosting sigue
activo y sirviendo el sitio viejo, así que el rollback es inmediato y total.
**Ese es todo el motivo por el que el hosting no se da de baja antes.**

---

## 5. Cuarentena (Fase 8) — mínimo 30 días

Durante este mes el cPanel sigue pagado y encendido. Es el seguro.

- [ ] Revisar los **logs de acceso del cPanel** semanalmente. Si algo todavía
      golpea el servidor viejo, hay un consumidor que no inventariamos: un
      cron externo, una integración, un enlace duro, un proveedor
- [ ] Revisar buzones locales del cPanel por correo atrapado (doc 03 §4)
- [ ] Confirmar que nadie usa `webmail.ih.cl` ni FTP
- [ ] Verificar que el SEO no cayó (Search Console, posiciones)
- [ ] Recién al final: sacar del SPF el `include:` del hosting viejo

---

## 6. Baja del hosting (Fase 9)

Solo si **todas** estas condiciones se cumplen:

- [ ] 30 días sin tráfico real al cPanel
- [ ] DNS 100% fuera del hosting y estable
- [ ] Correo verificado funcionando, sin incidentes en el período
- [ ] Backup completo guardado en **dos** lugares distintos, fuera del hosting,
      y **probado** (que el zip abra y el dump importe)
- [ ] Todas las cuentas de correo locales migradas o descartadas por escrito
- [ ] Ningún subdominio de terceros apuntando todavía al servidor
- [ ] Aprobación explícita de IH, por escrito

> **Antes de cancelar, descargar el backup una última vez.** Muchos proveedores
> borran los datos el mismo día de la baja, sin período de gracia.

---

## 7. Matriz de riesgos

| Riesgo | Impacto | Prob. | Mitigación |
|--------|---------|-------|------------|
| Se pierde un registro DNS del correo | 🔴 Correo caído | Media | Checklist de paridad + export de M365 + diff antes/después |
| NS movidos antes de espejar la zona | 🔴 Todo caído | Baja | Fase 3 obligatoria antes de Fase 6 |
| `Email Routing` en `local` con MX en M365 | 🟠 Correo perdido silenciosamente | **Alta** | Auditar antes; revisar buzones locales |
| SPF supera 10 lookups al agregar el proveedor nuevo | 🟠 Correo a spam | Media | Contar lookups antes de agregar |
| CAA bloquea Let's Encrypt | 🟠 Sitio sin HTTPS | Baja | Verificar en Fase 0 |
| Se pierden redirecciones del `.htaccess` | 🟠 Caída de tráfico orgánico | **Alta** | Extraer todos los `.htaccess` y traducirlos |
| Cuenta de correo solo-cPanel en uso real | 🟠 Correo perdido | Media | `list_pops_with_disk` + validar con IH |
| Cron job del cPanel no inventariado | 🟡 Proceso que deja de correr | Media | `Cron::list_lines` |
| Subdominio de un tercero olvidado | 🟡 Servicio caído | Media | Cruce de las 3 fuentes (doc 03 §7) |
| Uploads no migrados | 🟡 Imágenes rotas | Media | Backup de `uploads/` + object storage |
| TTL alto sin bajar | 🟠 Rollback de 24 h | Alta si no se autoriza | Fase 5 |

---

## 8. Rollback, resumido

| Fase donde falla | Cómo se revierte | Tiempo |
|------------------|------------------|--------|
| 6 (nameservers) | Volver NS en el registrar | 5 min – 2 h |
| 7 (web) | Volver `A`/`CNAME` al cPanel | 5–15 min |
| 8 (cuarentena) | El cPanel sigue vivo; se revierte el DNS | 15 min |
| 9 (post-baja) | ❌ **No hay rollback.** Por eso la fase 8 es obligatoria | — |
