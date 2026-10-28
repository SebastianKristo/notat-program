# Marg

Privat skrive- og notatapp (Notion-lignende) med blokkeditor, database, kalender, innboks og «Spør AI» mot egen Ollama-server.

- Web/kjerne: React + Vite (`src/`)
- iOS/iPadOS og Android: Capacitor
- macOS: Electron (DMG)

```bash
npm install
npm run dev        # utvikling i nettleser
npm run dist:mac   # DMG (på macOS)
```

GitHub Actions (`.github/workflows/release.yml`) bygger APK, IPA og DMG på hver push og publiserer dem som en GitHub-release.

## Backend (Docker Compose)

`server/` inneholder API (Node + Postgres/pgvector), Ollama for AI, Caddy for HTTPS og nattlig `pg_dump`-backup.

```bash
npm install && npm run build      # web-klienten serveres også av Caddy fra ../dist
cd server
cp .env.example .env              # sett DOMAIN og POSTGRES_PASSWORD
docker compose up -d --build
```

- Pek DNS for `DOMAIN` mot serveren; Caddy henter TLS-sertifikat automatisk.
- `ollama-pull` laster ned modellene i `OLLAMA_MODELS` ved oppstart.
- Første bruker kan registrere seg fra appen (M-logoen → Opprett konto). Deretter er registrering stengt, med mindre `ALLOW_SIGNUP=true`.
- Endepunkter: `/api/health`, `/api/register`, `/api/login`, `/api/logout`, `/api/workspace` (GET/PUT med versjonskontroll), `/api/history`, `/api/models`, `/api/ai` (strømmer fra Ollama).

## Proxmox

Kjør på Proxmox-verten som root. Skriptet lager en Debian 12 LXC med Docker, bygger appen og starter hele backenden:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/notat-program/HEAD/scripts/proxmox-install.sh)"
```

Er repoet privat, kopier `scripts/proxmox-install.sh` til verten og kjør `GITHUB_TOKEN=<token> bash proxmox-install.sh`.
Alle spørsmål kan forhåndsutfylles med miljøvariabler (`CTID`, `DOMAIN`, `RAM_MB`, `DISK_GB`, `IP`, `MODELS` …).
Oppdatering senere: `pct exec <CTID> -- marg-update`.
