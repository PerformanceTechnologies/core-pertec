#!/usr/bin/env bash
# =============================================================================
# audit-dns.sh — Fotografia READ-ONLY del DNS publico de un dominio
# =============================================================================
#
#  Consulta resolvers publicos por DNS-over-HTTPS (no necesita dig ni acceso
#  al hosting). Sirve para dos cosas:
#    1. Levantar el inventario completo ANTES del corte.
#    2. Comparar, DESPUES del corte, que no se perdio ningun registro.
#
#  No modifica nada. Son puras consultas.
#
#  Uso:  ./scripts/audit-dns.sh dominio.cl ./salida-dns
#
#  Importante: este script ve lo que el DNS publico expone. Registros que
#  existan en la zona del cPanel pero no esten publicados, o subdominios que
#  nadie consulte, NO aparecen aqui. Por eso hay que cruzarlo SIEMPRE con la
#  zona completa que entrega audit-cpanel.sh (DNS::parse_zone).
# =============================================================================

set -uo pipefail

DOMAIN="${1:?Uso: $0 <dominio> [dir-salida]}"
OUT_DIR="${2:-./salida-dns}"
RESOLVER="${DOH_RESOLVER:-https://cloudflare-dns.com/dns-query}"

mkdir -p "$OUT_DIR"
REPORT="${OUT_DIR}/dns-${DOMAIN}.txt"
: > "$REPORT"

q() { # q <nombre> <tipo>
  local name="$1" type="$2"
  local body
  body=$(curl -sS --max-time 20 \
           -H 'accept: application/dns-json' \
           "${RESOLVER}?name=${name}&type=${type}" 2>/dev/null)
  [[ -z "$body" ]] && { echo "    (sin respuesta)"; return; }
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$body" <<'PY'
import json, sys
try:
    d = json.loads(sys.argv[1])
except Exception:
    print("    (respuesta no valida)"); raise SystemExit
ans = d.get("Answer") or []
if not ans:
    print("    -")
for a in ans:
    print(f"    {a.get('name','')}  {a.get('TTL','')}  {a.get('data','')}")
PY
  else
    echo "    $body"
  fi
}

section() { echo; echo "### $1"; echo; }

{
echo "======================================================================"
echo " Inventario DNS publico de: ${DOMAIN}"
echo " Fecha: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo " Resolver: ${RESOLVER}"
echo "======================================================================"

section "Nameservers (quien manda en la zona)"
q "${DOMAIN}" NS
echo "  >> Si apuntan al servidor del cPanel, el DNS MUERE cuando se dé de"
echo "     baja el hosting. Ver 03-PLAN-DNS-Y-CORREO.md."

section "Apex y www (lo que se mueve a Vercel)"
echo "  A ${DOMAIN}";        q "${DOMAIN}" A
echo "  AAAA ${DOMAIN}";     q "${DOMAIN}" AAAA
echo "  CNAME www";          q "www.${DOMAIN}" CNAME
echo "  A www";              q "www.${DOMAIN}" A

section "Correo — MX (NO se debe tocar en la migracion)"
q "${DOMAIN}" MX
echo "  >> Si terminan en .mail.protection.outlook.com, el correo es"
echo "     Microsoft 365 y NO vive en el cPanel. Debe quedar idéntico."

section "Correo — SPF / TXT del apex"
q "${DOMAIN}" TXT

section "Correo — DMARC"
q "_dmarc.${DOMAIN}" TXT

section "Correo — DKIM (selectores habituales)"
for sel in selector1 selector2 default mail dkim google s1 s2 k1; do
  echo "  ${sel}._domainkey"
  q "${sel}._domainkey.${DOMAIN}" CNAME
  q "${sel}._domainkey.${DOMAIN}" TXT
done

section "Microsoft 365 — registros de servicio"
for host in autodiscover enterpriseregistration enterpriseenrollment lyncdiscover sip msoid; do
  echo "  ${host}"
  q "${host}.${DOMAIN}" CNAME
done
echo "  _sipfederationtls._tcp (SRV)"; q "_sipfederationtls._tcp.${DOMAIN}" SRV
echo "  _sip._tls (SRV)";             q "_sip._tls.${DOMAIN}" SRV
echo "  _autodiscover._tcp (SRV)";    q "_autodiscover._tcp.${DOMAIN}" SRV

section "Subdominios frecuentes (deteccion por fuerza bruta suave)"
for sub in mail webmail cpanel whm ftp smtp imap pop pop3 ns1 ns2 \
           blog tienda shop store app api dev test staging qa demo \
           intranet portal admin panel crm erp soporte ayuda docs \
           cdn static assets img media files descargas old legacy \
           vpn remote git sso login cuenta clientes; do
  a=$(curl -sS --max-time 10 -H 'accept: application/dns-json' \
        "${RESOLVER}?name=${sub}.${DOMAIN}&type=A" 2>/dev/null)
  if [[ "$a" == *'"Answer"'* ]]; then
    echo "  [ENCONTRADO] ${sub}.${DOMAIN}"
    q "${sub}.${DOMAIN}" A
    q "${sub}.${DOMAIN}" CNAME
  fi
done

section "CAA (quien puede emitir certificados)"
q "${DOMAIN}" CAA
echo "  >> Si hay CAA restrictivo, Vercel/Let's Encrypt puede fallar al emitir"
echo "     el certificado. Verificar antes del corte."

section "SOA"
q "${DOMAIN}" SOA

echo
echo "======================================================================"
echo " FIN. Este inventario debe cruzarse con la zona completa del cPanel."
echo "======================================================================"
} | tee "$REPORT"

echo
echo ">> Guardado en ${REPORT}"
