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

`server/` inneholder API (Node + Postgres/pgvector), Caddy, nattlig `pg_dump`-backup og en oppdateringstjeneste.

```bash
npm install && npm run build      # web-klienten serveres også av Caddy fra ../dist
cd server
cp .env.example .env              # sett POSTGRES_PASSWORD (og evt. DOMAIN for HTTPS)
docker compose up -d --build
```

Alt annet gjøres i appen under **Innstillinger** (profilknappen / ⚙️). Første konto blir administrator.
- **Marg AI:** Ollama (lokalt, f.eks. Mac mini), Google Gemini (gratis nivå) og Anthropic Claude (betalt, med månedsbudsjett). API-nøkler lagres kryptert med `MARG_SECRET`. Standardmodell, reserve til Ollama hvis en skytjeneste feiler, og «hold private sider lokalt». Ollama må lytte på nettverket: `launchctl setenv OLLAMA_HOST 0.0.0.0`.
- **Sikkerhetskopi:** til en SMB-deling (NAS) med test, tidsplan, lagringstid, AES-256-kryptering, manuell backup og gjenoppretting.
- **Serverapplikasjon:** viser versjon og nye endringer, og «Oppdater server» henter siste kode og bygger tjenestene på nytt.
- **Revisjonslogg:** innlogginger, AI-bruk, backup og endringer i innstillinger.
- **Personer og sikkerhet:** medlemmer og gjester, tofaktor (TOTP), bytte passord, aktive enheter.
- **Publisering:** sider på `/p/<adresse>` med passord, utløp, indeksering og visningstall.
- **Møtenotater:** opptak → whisper (`docker compose --profile whisper up -d`) → AI-sammendrag, beslutninger og gjøremål.
- **Marg MCP:** API-nøkler og MCP-endepunkt på `/api/mcp` for Claude og andre klienter.
- **Tilkoblinger:** webhooks med HMAC-signatur når sider endres.
- **E-post og kalender:** ICS-abonnement som vises i Kalender.
- **Import/eksport:** Notion-ZIP, Obsidian-hvelv, Markdown og JSON inn; Markdown-ZIP, JSON og PDF ut.

Vil du heller kjøre Ollama i Docker: `docker compose --profile ollama up -d` og bruk `http://ollama:11434` i innstillingene.

## Proxmox

Kjør på Proxmox-verten som root. Ingen spørsmål – ID, lagring, nettverk (DHCP) og passord velges automatisk:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/notat-program/HEAD/scripts/proxmox-install.sh)"
```

Skriptet skriver ut adressen (`http://<ip>`) til slutt. Valgfrie overstyringer: `CTID`, `IP`, `DOMAIN`, `RAM_MB`, `DISK_GB`, `STORAGE`, `BRANCH`, `GITHUB_TOKEN` (privat repo).
