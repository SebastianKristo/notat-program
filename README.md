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
