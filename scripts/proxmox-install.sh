#!/usr/bin/env bash
# Marg – Proxmox VE helper script
# Kjør på Proxmox-verten (som root):
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/notat-program/HEAD/scripts/proxmox-install.sh)"
# Lager en Debian 12 LXC-container med Docker og starter Marg-backenden (Caddy, API, Postgres, backup).
# AI går mot en eksisterende Ollama på nettverket (f.eks. en Mac mini).
# Alle valg kan settes med miljøvariabler for å hoppe over spørsmålene, f.eks. CTID=120 DOMAIN=notes.kristo.no.
set -euo pipefail

YW=$'\033[33m'; GN=$'\033[32m'; RD=$'\033[31m'; BL=$'\033[36m'; CL=$'\033[0m'
msg()  { echo -e " ${BL}➜${CL} $*"; }
ok()   { echo -e " ${GN}✔${CL} $*"; }
die()  { echo -e " ${RD}✖ $*${CL}" >&2; exit 1; }
ask()  { # ask VAR "Spørsmål" default
  local var=$1 q=$2 def=$3
  if [[ -n "${!var:-}" ]]; then return; fi
  read -r -p "  ${YW}?${CL} $q [${def}]: " ans </dev/tty || true
  printf -v "$var" '%s' "${ans:-$def}"
}

cat <<'BANNER'

   __  __
  |  \/  | __ _ _ __ __ _
  | |\/| |/ _` | '__/ _` |
  | |  | | (_| | | | (_| |
  |_|  |_|\__,_|_|  \__, |   Proxmox-installasjon
                    |___/

BANNER

[[ $EUID -eq 0 ]] || die "Kjør som root på Proxmox-verten."
command -v pct >/dev/null || die "Fant ikke 'pct'. Dette skriptet må kjøres på en Proxmox VE-vert."

ask CTID       "Container-ID"                        "$(pvesh get /cluster/nextid)"
ask CT_NAME    "Vertsnavn"                           "marg"
ask DISK_GB    "Disk (GB)"                           "16"
ask RAM_MB     "Minne (MB)"                          "4096"
ask CORES      "CPU-kjerner"                         "2"
ask STORAGE    "Lagring for rootfs"                  "local-lvm"
ask BRIDGE     "Nettverksbro"                        "vmbr0"
ask IP         "IP (dhcp eller f.eks. 192.168.1.50/24)" "dhcp"
[[ "$IP" != "dhcp" ]] && ask GATEWAY "Gateway" "$(ip route | awk '/default/ {print $3; exit}')"
ask DOMAIN     "Domene for Marg (DNS må peke hit, port 80/443)" "notes.kristo.no"
ask OLLAMA_URL "Ollama-adresse (Mac mini)"           "http://mac-mini.local:11434"
ask DEFAULT_MODEL "Standardmodell (tom = første tilgjengelige)" "-"
[[ "$DEFAULT_MODEL" == "-" ]] && DEFAULT_MODEL=""
ask ALLOW_SIGNUP "Tillat registrering for alle (true/false)" "false"
ask REPO_URL   "Git-repo"                            "https://github.com/SebastianKristo/notat-program.git"
ask BRANCH     "Branch (tom = standard)"            "-"
[[ "$BRANCH" == "-" ]] && BRANCH=""
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
if [[ -z "$GITHUB_TOKEN" ]]; then
  read -r -s -p "  ${YW}?${CL} GitHub-token (bare for privat repo, Enter for å hoppe over): " GITHUB_TOKEN </dev/tty || true; echo
fi

pct status "$CTID" &>/dev/null && die "Container $CTID finnes allerede."

msg "Henter Debian 12-mal …"
pveam update >/dev/null
TEMPLATE=$(pveam available --section system | awk '/debian-12-standard/ {print $2}' | sort -V | tail -1)
[[ -n "$TEMPLATE" ]] || die "Fant ingen Debian 12-mal."
TSTORE=$(pvesm status --content vztmpl | awk 'NR>1 {print $1; exit}')
[[ -n "$TSTORE" ]] || die "Ingen lagring støtter containermaler (vztmpl)."
pveam list "$TSTORE" | grep -q "$TEMPLATE" || pveam download "$TSTORE" "$TEMPLATE" >/dev/null
ok "Mal: $TEMPLATE"

NET="name=eth0,bridge=$BRIDGE,ip=$IP"
[[ "$IP" != "dhcp" ]] && NET+=",gw=$GATEWAY"

msg "Oppretter container $CTID …"
pct create "$CTID" "$TSTORE:vztmpl/$TEMPLATE" \
  --hostname "$CT_NAME" --cores "$CORES" --memory "$RAM_MB" --swap 2048 \
  --rootfs "$STORAGE:$DISK_GB" --net0 "$NET" \
  --unprivileged 1 --features nesting=1,keyctl=1 \
  --onboot 1 --ostype debian --description "Marg – self-hosted notatapp" >/dev/null
pct start "$CTID"
ok "Container startet"

msg "Venter på nettverk …"
for _ in $(seq 1 30); do pct exec "$CTID" -- getent hosts deb.debian.org &>/dev/null && break; sleep 2; done
pct exec "$CTID" -- getent hosts deb.debian.org &>/dev/null || die "Containeren fikk ikke nettverk."

PG_PASS=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)
CLONE_URL="$REPO_URL"
[[ -n "$GITHUB_TOKEN" ]] && CLONE_URL="${REPO_URL/https:\/\//https://x-access-token:${GITHUB_TOKEN}@}"

msg "Installerer Docker og Marg i containeren (dette tar noen minutter) …"
pct exec "$CTID" -- env CLONE_URL="$CLONE_URL" BRANCH="$BRANCH" DOMAIN="$DOMAIN" PG_PASS="$PG_PASS" OLLAMA_URL="$OLLAMA_URL" DEFAULT_MODEL="$DEFAULT_MODEL" ALLOW_SIGNUP="$ALLOW_SIGNUP" bash -euo pipefail -c '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git >/dev/null
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
  systemctl enable --now docker >/dev/null
  git clone -q --depth 1 ${BRANCH:+-b "$BRANCH"} "$CLONE_URL" /opt/marg
  git -C /opt/marg remote set-url origin "$(echo "$CLONE_URL" | sed -E "s#https://[^@]+@#https://#")"
  cd /opt/marg
  docker run --rm -v /opt/marg:/app -w /app node:22-alpine sh -c "npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null"
  cat > server/.env <<ENV
DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$PG_PASS
ALLOW_SIGNUP=$ALLOW_SIGNUP
OLLAMA_URL=$OLLAMA_URL
OLLAMA_DEFAULT_MODEL=$DEFAULT_MODEL
ENV
  chmod 600 server/.env
  cd server && docker compose up -d --build >/dev/null 2>&1
  cat > /usr/local/bin/marg-update <<UPD
#!/usr/bin/env bash
set -e
cd /opt/marg && git pull --ff-only
docker run --rm -v /opt/marg:/app -w /app node:22-alpine sh -c "npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null"
cd server && docker compose up -d --build
UPD
  chmod +x /usr/local/bin/marg-update
'
ok "Marg kjører"

if pct exec "$CTID" -- curl -fsS -m 5 "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then ok "Ollama svarer på $OLLAMA_URL"
else echo -e " ${YW}!${CL} Fikk ikke kontakt med Ollama på $OLLAMA_URL fra containeren. Se neste steg 2."; fi

CT_IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')
cat <<DONE

 ${GN}Ferdig!${CL}
   Container:     $CTID ($CT_NAME) – IP $CT_IP
   Adresse:       https://$DOMAIN
   Filer:         /opt/marg   (hemmeligheter i /opt/marg/server/.env)
   Oppdatere:     pct exec $CTID -- marg-update
   Logger:        pct exec $CTID -- bash -c "cd /opt/marg/server && docker compose logs -f"

 ${YW}Neste steg:${CL}
   1. Pek DNS for $DOMAIN mot ruteren din og videresend port 80 og 443 til $CT_IP.
   2. Ollama på Mac-en må lytte på nettverket. Kjør på Mac-en:
        launchctl setenv OLLAMA_HOST 0.0.0.0   # og start Ollama-appen på nytt
      Endre senere i /opt/marg/server/.env (OLLAMA_URL) og kjør marg-update.
   3. Åpne Marg-appen → trykk M-logoen → serveradresse https://$DOMAIN → Opprett konto.

DONE
