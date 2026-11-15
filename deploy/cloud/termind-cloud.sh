#!/usr/bin/env bash
# termind-cloud – viele termind-Instanzen auf einem Server betreiben.
#
# Jede Instanz läuft in einem eigenen Container mit eigener Datenbank.
# Ein gemeinsamer Caddy holt automatisch HTTPS-Zertifikate für alle Domains.
#
#   termind-cloud init <acme-email>          Grundgerüst und Caddy starten
#   termind-cloud create <name> <domain>     neue Instanz anlegen
#   termind-cloud list                       alle Instanzen mit Status
#   termind-cloud update <name>|--all        neues Image ziehen und neu starten
#   termind-cloud backup <name>|--all        Backup nach $BASE/backups/<name>/
#   termind-cloud restore <name> <backup>    Backup zurückspielen (.tar.gz, .db.gz oder .db)
#   termind-cloud logs <name>                Logs ansehen
#   termind-cloud delete <name>              Instanz stoppen und Daten archivieren
#
# Umgebungsvariablen:
#   TERMIND_BASE    Ablage (Standard /srv/termind)
#   TERMIND_IMAGE   Image (Standard ghcr.io/gh-samk/termind:latest)
#   TERMIND_MEMORY  Speicherlimit pro Instanz (Standard 256m)
#   RCLONE_REMOTE   optional, z. B. "hetzner:termind-backups" – Backups werden dorthin kopiert
#   BACKUP_KEEP     wie viele lokale Backups je Instanz bleiben (Standard 14)

set -euo pipefail

BASE="${TERMIND_BASE:-/srv/termind}"
IMAGE="${TERMIND_IMAGE:-ghcr.io/gh-samk/termind:latest}"
MEMORY="${TERMIND_MEMORY:-256m}"
NETWORK="termind-net"
KEEP="${BACKUP_KEEP:-14}"

die() { echo "Fehler: $*" >&2; exit 1; }
info() { echo "→ $*"; }

need() { command -v "$1" >/dev/null 2>&1 || die "$1 wird benötigt"; }
need docker
docker compose version >/dev/null 2>&1 || die "docker compose (v2) wird benötigt"

valid_name() {
  [[ "$1" =~ ^[a-z0-9][a-z0-9-]{1,30}$ ]] || die "Name nur aus a-z, 0-9 und Bindestrich (2–31 Zeichen)"
  case "$1" in caddy | net | backups | archive | instances) die "Der Name $1 ist reserviert" ;; esac
}
valid_domain() { [[ "$1" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$ ]] || die "Ungültige Domain: $1"; }
inst_dir() { echo "$BASE/instances/$1"; }
exists() { [[ -f "$(inst_dir "$1")/compose.yml" ]]; }
names() { [[ -d "$BASE/instances" ]] && find "$BASE/instances" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort || true; }

caddy_reload() {
  docker exec termind-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1
}

cmd_init() {
  local email="${1:-}"
  [[ "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "Aufruf: init <acme-email>"
  mkdir -p "$BASE"/{instances,backups,caddy/sites,archive}
  chmod 700 "$BASE"/backups "$BASE"/archive
  docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null
  cat >"$BASE/caddy/Caddyfile" <<EOF
{
	email $email
}

import /etc/caddy/sites/*.caddy
EOF
  cat >"$BASE/caddy/compose.yml" <<EOF
services:
  caddy:
    image: caddy:2-alpine
    container_name: termind-caddy
    restart: unless-stopped
    ports: ["80:80", "443:443", "443:443/udp"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./sites:/etc/caddy/sites:ro
      - caddy-data:/data
      - caddy-config:/config
    networks: [$NETWORK]
networks:
  $NETWORK:
    external: true
volumes:
  caddy-data:
  caddy-config:
EOF
  # leere Site-Datei, damit der Import nicht fehlschlägt
  [[ -n "$(ls -A "$BASE/caddy/sites")" ]] || echo "# Instanzen werden hier eingetragen" >"$BASE/caddy/sites/_leer.caddy"
  (cd "$BASE/caddy" && docker compose up -d)
  info "Fertig. Jetzt mit 'create <name> <domain>' Instanzen anlegen."
}

cmd_create() {
  local name="${1:-}" domain="${2:-}"
  valid_name "$name"
  valid_domain "$domain"
  [[ -f "$BASE/caddy/Caddyfile" ]] || die "Bitte zuerst 'init' ausführen"
  exists "$name" && die "Instanz $name gibt es schon"
  grep -rqs "^$domain " "$BASE/caddy/sites" && die "Domain $domain ist schon vergeben"
  local dir setup_token; dir="$(inst_dir "$name")"
  setup_token="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
  # Bei Fehlern halbfertige Instanz wieder entfernen
  trap 'rm -rf "$dir" "$BASE/caddy/sites/$name.caddy"' ERR
  mkdir -p "$dir/data"
  chown 1000:1000 "$dir/data" 2>/dev/null || true
  chmod 700 "$dir/data"
  cat >"$dir/compose.yml" <<EOF
services:
  termind:
    image: $IMAGE
    container_name: termind-$name
    restart: unless-stopped
    environment:
      PUBLIC_URL: https://$domain
      TRUST_PROXY: "true"
      SETUP_TOKEN: $setup_token
    volumes:
      - ./data:/data
    networks: [$NETWORK]
    pids_limit: 200
    cpus: 1.0
    mem_limit: $MEMORY
    read_only: true
    tmpfs: [/tmp]
    security_opt: ["no-new-privileges:true"]
    cap_drop: [ALL]
    logging:
      driver: json-file
      options: { max-size: "5m", max-file: "3" }
networks:
  $NETWORK:
    external: true
EOF
  cat >"$BASE/caddy/sites/$name.caddy" <<EOF
$domain {
	encode zstd gzip
	reverse_proxy termind-$name:3000
}
EOF
  rm -f "$BASE/caddy/sites/_leer.caddy"
  (cd "$dir" && docker compose up -d)
  caddy_reload
  trap - ERR
  info "Instanz $name läuft: https://$domain"
  info "Einrichtungslink (nur einmal gültig, an den Kunden geben): https://$domain/setup?token=$setup_token"
}

cmd_list() {
  printf "%-20s %-36s %s\n" NAME DOMAIN STATUS
  for n in $(names); do
    local domain status
    domain="$(awk 'NR==1{print $1}' "$BASE/caddy/sites/$n.caddy" 2>/dev/null || echo "?")"
    status="$(docker inspect -f '{{.State.Status}}{{if .State.Health}} ({{.State.Health.Status}}){{end}}' "termind-$n" 2>/dev/null || echo "gestoppt")"
    printf "%-20s %-36s %s\n" "$n" "$domain" "$status"
  done
}

each() { # each <fn> <name>|--all
  local fn="$1" target="${2:-}"
  [[ -n "$target" ]] || die "Name oder --all angeben"
  if [[ "$target" == "--all" ]]; then
    local failed=0
    for n in $(names); do "$fn" "$n" || { echo "Fehler bei $n" >&2; failed=1; }; done
    return $failed
  else valid_name "$target"; exists "$target" || die "Unbekannte Instanz $target"; "$fn" "$target"; fi
}

update_one() {
  info "Aktualisiere $1 (vorher Backup)"
  backup_one "$1" || die "Backup von $1 fehlgeschlagen, Update abgebrochen"
  (cd "$(inst_dir "$1")" && docker compose pull -q && docker compose up -d)
}
cmd_update() { docker pull -q "$IMAGE" >/dev/null; each update_one "${1:-}"; }

# Backup = Datenbank + Schlüssel (secret.key), sonst sind gespeicherte Passwörter nach einer Wiederherstellung unlesbar
backup_one() {
  local n="$1" ts dest work data
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  dest="$BASE/backups/$n"
  data="$(inst_dir "$n")/data"
  mkdir -p "$dest" && chmod 700 "$dest"
  work="$(mktemp -d)"
  if docker inspect -f '{{.State.Running}}' "termind-$n" 2>/dev/null | grep -q true; then
    docker exec "termind-$n" node server/index.js backup "/data/backups/manual-$ts.db" >/dev/null
    mv "$data/backups/manual-$ts.db" "$work/termind.db"
  else
    # Container steht: Datenbank samt WAL-Datei kopieren (enthält ggf. noch nicht übernommene Änderungen)
    cp "$data/termind.db" "$work/termind.db"
    [[ -f "$data/termind.db-wal" ]] && cp "$data/termind.db-wal" "$work/termind.db-wal"
  fi
  [[ -f "$data/secret.key" ]] && cp "$data/secret.key" "$work/secret.key"
  (cd "$work" && tar -czf "$dest/$n-$ts.tar.gz" $(ls -1 | tr '\n' ' '))
  chmod 600 "$dest/$n-$ts.tar.gz"
  rm -rf "$work"
  # alte lokale Backups aufräumen
  ls -1t "$dest"/*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
  if [[ -n "${RCLONE_REMOTE:-}" ]]; then need rclone; rclone copy "$dest/$n-$ts.tar.gz" "$RCLONE_REMOTE/$n/" --quiet; fi
  info "Backup $n → $dest/$n-$ts.tar.gz"
}
cmd_backup() { each backup_one "${1:-}"; }

cmd_restore() {
  local n="${1:-}" file="${2:-}"
  valid_name "$n"; exists "$n" || die "Unbekannte Instanz $n"
  [[ -f "$file" ]] || die "Datei nicht gefunden: $file"
  local dir work; dir="$(inst_dir "$n")"
  backup_one "$n" || echo "Hinweis: Sicherheitskopie vor dem Zurückspielen nicht möglich" >&2
  work="$(mktemp -d)"
  case "$file" in
    *.tar.gz)
      tar -C "$work" -xzf "$file"
      # nur erwartete Dateien behalten
      find "$work" -mindepth 1 ! -name termind.db ! -name termind.db-wal ! -name secret.key -exec rm -rf {} + 2>/dev/null || true
      ;;
    *.gz) gunzip -c "$file" >"$work/termind.db" ;;
    *) cp "$file" "$work/termind.db" ;;
  esac
  [[ -s "$work/termind.db" ]] || { rm -rf "$work"; die "Im Backup wurde keine Datenbank gefunden"; }
  head -c 16 "$work/termind.db" | grep -q "SQLite format 3" || { rm -rf "$work"; die "Das ist keine SQLite-Datenbank"; }
  (cd "$dir" && docker compose stop)
  # Vorhandene Dateien (auch Symlinks) erst entfernen, dann frisch schreiben
  rm -f "$dir/data/termind.db" "$dir/data/termind.db-wal" "$dir/data/termind.db-shm"
  cp "$work/termind.db" "$dir/data/termind.db"
  [[ -f "$work/termind.db-wal" ]] && cp "$work/termind.db-wal" "$dir/data/termind.db-wal"
  if [[ -f "$work/secret.key" ]]; then rm -f "$dir/data/secret.key"; cp "$work/secret.key" "$dir/data/secret.key"; fi
  chown 1000:1000 "$dir/data/termind.db" "$dir/data/termind.db-wal" "$dir/data/secret.key" 2>/dev/null || true
  chmod 600 "$dir/data/termind.db" "$dir/data/termind.db-wal" "$dir/data/secret.key" 2>/dev/null || true
  rm -rf "$work"
  (cd "$dir" && docker compose up -d)
  info "Wiederhergestellt: $n aus $file"
}

cmd_logs() { valid_name "${1:-}"; docker logs --tail 200 -f "termind-$1"; }

cmd_delete() {
  local n="${1:-}"
  valid_name "$n"; exists "$n" || die "Unbekannte Instanz $n"
  read -r -p "Instanz $n wirklich löschen? Daten werden archiviert. [ja/nein] " ok
  [[ "$ok" == "ja" ]] || die "Abgebrochen"
  backup_one "$n" || true
  (cd "$(inst_dir "$n")" && docker compose down)
  rm -f "$BASE/caddy/sites/$n.caddy"
  [[ -n "$(ls -A "$BASE/caddy/sites")" ]] || echo "# leer" >"$BASE/caddy/sites/_leer.caddy"
  caddy_reload || true
  mv "$(inst_dir "$n")" "$BASE/archive/$n-$(date -u +%Y%m%dT%H%M%SZ)"
  info "Instanz $n entfernt, Daten liegen unter $BASE/archive/"
}

case "${1:-}" in
  init) shift; cmd_init "$@" ;;
  create) shift; cmd_create "$@" ;;
  list) cmd_list ;;
  update) shift; cmd_update "$@" ;;
  backup) shift; cmd_backup "$@" ;;
  restore) shift; cmd_restore "$@" ;;
  logs) shift; cmd_logs "$@" ;;
  delete) shift; cmd_delete "$@" ;;
  *) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
