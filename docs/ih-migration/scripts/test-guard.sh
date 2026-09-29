#!/usr/bin/env bash
# Verifica que el guard de solo-lectura de audit-cpanel.sh se comporta bien:
#  1. Ninguna funcion de lectura legitima queda bloqueada por error.
#  2. Toda funcion de escritura es rechazada.
# No hace ninguna peticion de red. Correr desde la raiz del repo.

set -uo pipefail
SRC="$(dirname "$0")/audit-cpanel.sh"

eval "$(sed -n '/^ALLOWLIST=(/,/^)/p'        "$SRC")"
eval "$(sed -n '/^FORBIDDEN_TOKENS=(/,/^)/p' "$SRC")"
eval "$(sed -n '/^is_allowed()/,/^}/p'       "$SRC")"
eval "$(sed -n '/^has_write_verb()/,/^}/p'   "$SRC")"

fail=0

echo "1. Toda la ALLOWLIST debe pasar ambos filtros"
for fn in "${ALLOWLIST[@]}"; do
  is_allowed "$fn"     || { echo "   FALLO allowlist: $fn"; fail=1; }
  has_write_verb "$fn" && { echo "   FALLO falso positivo de escritura: $fn"; fail=1; }
done
[[ $fail -eq 0 ]] && echo "   ok — ${#ALLOWLIST[@]} funciones de lectura permitidas"

echo
echo "2. Las funciones de escritura deben ser rechazadas"
for bad in "Email::add_pop" "Mysql::create_database" "DNS::mass_edit_zone" \
           "Email::delete_forwarder" "Cron::add_line" "Ftp::set_quota" \
           "Backup::restore_files" "SSL::install_ssl" "Mysql::delete_user" \
           "Fileman::upload_files" "DomainInfo::remove_domain" \
           "Email::disable_spam_box" "Mysql::rename_database"; do
  if is_allowed "$bad"; then
    echo "   FALLO: '$bad' esta en la allowlist"; fail=1
  elif ! has_write_verb "$bad"; then
    echo "   AVISO: '$bad' bloqueada solo por allowlist (el filtro de verbos no la vio)"
  else
    echo "   ok — bloqueada por ambos filtros: $bad"
  fi
done

echo
if [[ $fail -eq 0 ]]; then echo "RESULTADO: guard correcto"; else echo "RESULTADO: HAY FALLOS"; exit 1; fi
