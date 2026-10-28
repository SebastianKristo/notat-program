#!/usr/bin/env bash
# Marg – Proxmox VE helper script
# Kjør på Proxmox-verten (som root):
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/notat-program/HEAD/scripts/proxmox-install.sh)"
#
# Lager en Debian 12 LXC-container med Docker og starter Marg-backenden. Ingen spørsmål:
# ID, lagring, nettverk og passord velges automatisk. Ollama og oppdateringer styres fra appen
# (Innstillinger). Alt kan likevel overstyres med miljøvariabler:
#   CTID, CT_NAME, STORAGE, BRIDGE, IP (dhcp | 192.168.1.50/24), GATEWAY, DISK_GB, RAM_MB, CORES,
#   DOMAIN (tom = http på port 80), REPO_URL, BRANCH, GITHUB_TOKEN (for privat repo)
set -euo pipefail

GN=$'\033[32m'; RD=$'\033[31m'; BL=$'\033[36m'; YW=$'\033[33m'; CL=$'\033[0m'
msg() { echo -e " ${BL}➜${CL} $*"; }
ok()  { echo -e " ${GN}✔${CL} $*"; }
die() { echo -e " ${RD}✖ $*${CL}" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Kjør som root på Proxmox-verten."
command -v pct >/dev/null || die "Fant ikke 'pct'. Dette skriptet må kjøres på en Proxmox VE-vert."

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
CT_NAME="${CT_NAME:-marg}"
DISK_GB="${DISK_GB:-16}"
RAM_MB="${RAM_MB:-4096}"
CORES="${CORES:-2}"
BRIDGE="${BRIDGE:-vmbr0}"
IP="${IP:-dhcp}"
DOMAIN="${DOMAIN:-}"
REPO_URL="${REPO_URL:-https://github.com/SebastianKristo/notat-program.git}"
BRANCH="${BRANCH:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
# Lagring med plass til containere (rootdir) og mest ledig plass
STORAGE="${STORAGE:-$(pvesm status --content rootdir --enabled 2>/dev/null | awk 'NR>1 && $3=="active" {print $6, $1}' | sort -rn | awk 'NR==1 {print $2}')}"
[[ -n "$STORAGE" ]] || die "Fant ingen lagring som støtter containere."
[[ "$IP" != "dhcp" && -z "${GATEWAY:-}" ]] && GATEWAY=$(ip route | awk '/default/ {print $3; exit}')
pct status "$CTID" &>/dev/null && die "Container $CTID finnes allerede."

echo -e "\n  ${GN}Marg${CL} → container $CTID ($CT_NAME) på $STORAGE, $CORES kjerner, ${RAM_MB} MB, ${DISK_GB} GB, $BRIDGE/$IP\n"

msg "Henter Debian 12-mal …"
pveam update >/dev/null || true
TEMPLATE=$(pveam available --section system | awk '/debian-12-standard/ {print $2}' | sort -V | tail -1)
[[ -n "$TEMPLATE" ]] || die "Fant ingen Debian 12-mal."
TSTORE=$(pvesm status --content vztmpl --enabled | awk 'NR>1 && $3=="active" {print $1; exit}')
[[ -n "$TSTORE" ]] || die "Ingen lagring støtter containermaler (vztmpl)."
pveam list "$TSTORE" | grep -q "$TEMPLATE" || pveam download "$TSTORE" "$TEMPLATE" >/dev/null
ok "Mal: $TEMPLATE"

NET="name=eth0,bridge=$BRIDGE,ip=$IP"
[[ "$IP" != "dhcp" ]] && NET+=",gw=$GATEWAY"

msg "Oppretter container …"
pct create "$CTID" "$TSTORE:vztmpl/$TEMPLATE" \
  --hostname "$CT_NAME" --cores "$CORES" --memory "$RAM_MB" --swap 1024 \
  --rootfs "$STORAGE:$DISK_GB" --net0 "$NET" \
  --unprivileged 1 --features nesting=1,keyctl=1 \
  --onboot 1 --ostype debian --tags marg --description "Marg – self-hosted notatapp" >/dev/null
pct start "$CTID"
ok "Container $CTID startet"

msg "Venter på nettverk …"
for _ in $(seq 1 30); do pct exec "$CTID" -- getent hosts deb.debian.org &>/dev/null && break; sleep 2; done
pct exec "$CTID" -- getent hosts deb.debian.org &>/dev/null || die "Containeren fikk ikke nettverk."

PG_PASS=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32 || true)
MARG_SECRET=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48 || true)

msg "Installerer Docker og Marg (tar noen minutter) …"
pct exec "$CTID" -- env REPO_URL="$REPO_URL" BRANCH="$BRANCH" GITHUB_TOKEN="$GITHUB_TOKEN" DOMAIN="${DOMAIN:-:80}" PG_PASS="$PG_PASS" MARG_SECRET="$MARG_SECRET" bash -euo pipefail -c '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git >/dev/null
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
  systemctl enable --now docker >/dev/null
  if [ -n "$GITHUB_TOKEN" ]; then
    git config --global credential.helper store
    printf "https://x-access-token:%s@github.com\n" "$GITHUB_TOKEN" > ~/.git-credentials && chmod 600 ~/.git-credentials
  fi
  git clone -q --depth 50 ${BRANCH:+-b "$BRANCH"} "$REPO_URL" /opt/marg
  cd /opt/marg
  docker run --rm -v /opt/marg:/app -w /app node:22-alpine sh -c "npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null"
  cat > server/.env <<ENV
DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$PG_PASS
MARG_SECRET=$MARG_SECRET
ALLOW_SIGNUP=false
MARG_DIR=/opt/marg
ENV
  chmod 600 server/.env
  # Oppdateringstjenesten trenger git-tilgang til et privat repo også
  [ -f ~/.git-credentials ] && git -C /opt/marg config credential.helper "store --file=/opt/marg/.git/credentials" && cp ~/.git-credentials /opt/marg/.git/credentials
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

CT_IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')
URL="http://$CT_IP"; [[ -n "$DOMAIN" ]] && URL="https://$DOMAIN"
for _ in $(seq 1 30); do pct exec "$CTID" -- curl -fsS -m 3 http://localhost/api/health >/dev/null 2>&1 && break; sleep 2; done

cat <<DONE

 ${GN}Ferdig!${CL}  Container $CTID ($CT_NAME) – $CT_IP

   Åpne Marg-appen → trykk M-logoen → serveradresse ${GN}$URL${CL} → Opprett konto.
   Første konto blir administrator. Under Innstillinger setter du opp Marg AI
   (Ollama på Mac mini, Gemini, Claude), sikkerhetskopi til SMB og oppdaterer serveren.

   ${YW}Ollama på Mac-en må lytte på nettverket:${CL} launchctl setenv OLLAMA_HOST 0.0.0.0  (start Ollama på nytt)

DONE
