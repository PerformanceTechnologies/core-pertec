#!/usr/bin/env bash
# =============================================================================
# audit-cpanel.sh — Inventario READ-ONLY de una cuenta cPanel
# =============================================================================
#
#  REGLA INVIOLABLE DE ESTE PROYECTO:
#  Este script NO modifica absolutamente nada en el hosting. Solo lee.
#  El sitio debe seguir 100% operativo hasta el dia del corte.
#
#  Como lo garantiza:
#    - Solo hace peticiones GET.
#    - Cada funcion de la API pasa por una lista blanca (ALLOWLIST) de
#      funciones de lectura. Cualquier funcion fuera de esa lista se rechaza
#      antes de salir a la red.
#    - Rechaza explicitamente cualquier nombre de funcion que contenga verbos
#      de escritura (add, set, del, remove, create, edit, update, install,
#      restore, disable, enable, suspend, terminate, kill, purge, reset).
#
#  Uso:
#    export CPANEL_HOST="servidor.ejemplo.com"   # host del cPanel (sin https://)
#    export CPANEL_PORT="2083"                   # 2083 = cPanel SSL (default)
#    export CPANEL_USER="usuarioih"              # usuario cPanel
#    export CPANEL_TOKEN="XXXXXXXXXXXXXXXX"      # API token (Security > Manage API Tokens)
#    ./scripts/audit-cpanel.sh ./salida
#
#  Salida: un archivo .json por cada consulta dentro del directorio indicado,
#  mas un resumen legible en RESUMEN.txt.
#
#  El token debe crearse en cPanel > Security > Manage API Tokens.
#  Si el panel permite restringir el token, dejarlo SOLO de lectura.
# =============================================================================

set -uo pipefail

OUT_DIR="${1:-./salida-cpanel}"

: "${CPANEL_HOST:?Falta CPANEL_HOST}"
: "${CPANEL_USER:?Falta CPANEL_USER}"
: "${CPANEL_TOKEN:?Falta CPANEL_TOKEN}"
CPANEL_PORT="${CPANEL_PORT:-2083}"

BASE="https://${CPANEL_HOST}:${CPANEL_PORT}"
AUTH="Authorization: cpanel ${CPANEL_USER}:${CPANEL_TOKEN}"

mkdir -p "$OUT_DIR"

# --- Lista blanca de funciones de lectura -----------------------------------
# UAPI: "Modulo::funcion". API2: "api2:Modulo::funcion".
ALLOWLIST=(
  # Dominios y subdominios
  "DomainInfo::list_domains"
  "DomainInfo::domains_data"
  "DomainInfo::single_domain_data"
  "api2:SubDomain::listsubdomains"
  "api2:Park::listparkeddomains"
  "api2:Park::listaddondomains"
  # DNS (zona completa tal como la sirve el cPanel)
  "DNS::parse_zone"
  "DNS::has_local_authority"
  "api2:ZoneEdit::fetchzone_records"
  # Correo
  "Email::list_pops"
  "Email::list_pops_with_disk"
  "Email::list_forwarders"
  "Email::list_domain_forwarders"
  "Email::list_auto_responders"
  "Email::list_mxs"
  "Email::get_mail_routing_status"
  "Email::list_mail_filters"
  "Email::list_system_filters"
  # Bases de datos
  "Mysql::list_databases"
  "Mysql::list_users"
  "Mysql::list_routines"
  "Mysql::get_server_information"
  "Mysql::get_restrictions"
  "Postgresql::list_databases"
  "Postgresql::list_users"
  # PHP / aplicaciones
  "LangPHP::php_get_vhost_versions"
  "LangPHP::php_get_installed_versions"
  "LangPHP::php_get_system_default_version"
  # Cron
  "Cron::list_lines"
  "Cron::get_email"
  # SSL
  "SSL::installed_hosts"
  "SSL::list_certs"
  # FTP y accesos
  "Ftp::list_ftp"
  "Ftp::list_ftp_with_disk"
  "SSH::list_keys"
  # Redirecciones y .htaccess
  "api2:Mime::listredirects"
  # Recursos y respaldos
  "ResourceUsage::get_usages"
  "Quota::get_quota_info"
  "StatsBar::get_stats"
  "Backup::list_backups"
  "Backup::get_backup_config"
  # Archivos (solo listado y lectura)
  "Fileman::list_files"
  "Fileman::get_file_content"
)

# Verbos de escritura. Se comparan como PALABRA COMPLETA contra cada segmento
# del nombre de la funcion (separado por "_"), no como subcadena: asi
# "php_get_installed_versions" pasa (es lectura) y "add_pop" no.
FORBIDDEN_TOKENS=(
  add set del delete remove create edit update modify change
  install uninstall restore disable enable suspend unsuspend
  terminate kill purge reset write upload move copy rename
  chmod save import repair optimize destroy put post
)

is_allowed() {
  local fn="$1"
  for a in "${ALLOWLIST[@]}"; do
    [[ "$a" == "$fn" ]] && return 0
  done
  return 1
}

# Devuelve 0 si el nombre contiene un verbo de escritura como palabra completa.
has_write_verb() {
  local func="${1##*::}"
  local seg verb
  local -a segs
  IFS='_' read -ra segs <<< "${func,,}"
  for seg in "${segs[@]}"; do
    for verb in "${FORBIDDEN_TOKENS[@]}"; do
      [[ "$seg" == "$verb" ]] && return 0
    done
  done
  return 1
}

# --- Motor de consulta -------------------------------------------------------
# call <nombre-archivo> <Modulo::funcion> [querystring extra]
call() {
  local name="$1" fn="$2" extra="${3:-}"

  if ! is_allowed "$fn"; then
    echo "  [BLOQUEADO] '$fn' no esta en la lista blanca de lectura. Se omite." >&2
    return 1
  fi
  if has_write_verb "$fn"; then
    echo "  [BLOQUEADO] '$fn' contiene un verbo de escritura. Se omite." >&2
    return 1
  fi

  local url
  if [[ "$fn" == api2:* ]]; then
    local mod="${fn#api2:}"; local module="${mod%%::*}"; local func="${mod##*::}"
    url="${BASE}/json-api/cpanel?cpanel_jsonapi_user=${CPANEL_USER}&cpanel_jsonapi_apiversion=2&cpanel_jsonapi_module=${module}&cpanel_jsonapi_func=${func}"
    [[ -n "$extra" ]] && url="${url}&${extra}"
  else
    local module="${fn%%::*}"; local func="${fn##*::}"
    url="${BASE}/execute/${module}/${func}"
    [[ -n "$extra" ]] && url="${url}?${extra}"
  fi

  printf '  %-34s ' "$name"
  local code
  code=$(curl -sS -G --max-time 45 \
           -o "${OUT_DIR}/${name}.json" \
           -w '%{http_code}' \
           -H "$AUTH" \
           -H 'Accept: application/json' \
           "$url" 2>"${OUT_DIR}/${name}.err")

  if [[ "$code" == "200" ]]; then
    echo "ok"
    rm -f "${OUT_DIR}/${name}.err"
  else
    echo "HTTP ${code}  (ver ${name}.err)"
  fi
}

echo "== Auditoria READ-ONLY de ${CPANEL_USER}@${CPANEL_HOST}:${CPANEL_PORT}"
echo "== Salida: ${OUT_DIR}"
echo

echo "-- Dominios y subdominios"
call dominios-list            "DomainInfo::list_domains"
call dominios-data            "DomainInfo::domains_data" "format=hash"
call subdominios              "api2:SubDomain::listsubdomains"
call dominios-parked          "api2:Park::listparkeddomains"
call dominios-addon           "api2:Park::listaddondomains"

echo
echo "-- Correo electronico"
call correo-cuentas           "Email::list_pops_with_disk"
call correo-reenvios          "Email::list_forwarders"
call correo-reenvios-dominio  "Email::list_domain_forwarders"
call correo-autoresponders    "Email::list_auto_responders"
call correo-mx                "Email::list_mxs"
call correo-filtros           "Email::list_mail_filters"

echo
echo "-- Bases de datos"
call db-mysql-bases           "Mysql::list_databases"
call db-mysql-usuarios        "Mysql::list_users"
call db-mysql-rutinas         "Mysql::list_routines"
call db-mysql-servidor        "Mysql::get_server_information"
call db-postgres-bases        "Postgresql::list_databases"

echo
echo "-- PHP / aplicaciones"
call php-versiones-vhost      "LangPHP::php_get_vhost_versions"
call php-versiones-instaladas "LangPHP::php_get_installed_versions"

echo
echo "-- Cron, SSL, FTP, redirecciones"
call cron-tareas              "Cron::list_lines"
call ssl-instalados           "SSL::installed_hosts"
call ftp-cuentas              "Ftp::list_ftp"
call redirecciones            "api2:Mime::listredirects"

echo
echo "-- Recursos y respaldos"
call recursos-uso             "ResourceUsage::get_usages"
call cuota-disco              "Quota::get_quota_info"
call respaldos                "Backup::list_backups"

# --- Zona DNS de cada dominio detectado -------------------------------------
echo
echo "-- Zonas DNS por dominio"
if command -v python3 >/dev/null 2>&1 && [[ -s "${OUT_DIR}/dominios-list.json" ]]; then
  mapfile -t DOMS < <(python3 - "${OUT_DIR}/dominios-list.json" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1])).get("data") or {}
except Exception:
    sys.exit(0)
out = []
if isinstance(d, dict):
    if d.get("main_domain"): out.append(d["main_domain"])
    for k in ("addon_domains", "parked_domains", "sub_domains"):
        v = d.get(k) or []
        if isinstance(v, list): out.extend(v)
for x in dict.fromkeys(out):
    if x: print(x)
PY
)
  for dom in "${DOMS[@]}"; do
    safe="${dom//[^a-zA-Z0-9._-]/_}"
    call "zona-dns-${safe}"      "DNS::parse_zone"          "zone=${dom}"
    call "dns-autoridad-${safe}" "DNS::has_local_authority" "domain=${dom}"
  done
else
  echo "  (python3 no disponible o sin lista de dominios: pedir zonas manualmente)"
fi

echo
echo "== Listo. Revisa ${OUT_DIR}/"
echo "== Ningun dato fue modificado en el hosting."
