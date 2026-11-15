# Changelog

## 0.1.0

Erste öffentliche Version.

- Buchungsseiten (DE/EN) mit Kalender, Zeitzonen, eigenen Formularfeldern, Einwilligung und Bestätigungsmodus
- Terminseiten mit Ort, Puffern, Vorlauf, Buchungsfenster, Raster und Erinnerungen
- Verfügbarkeit mit mehreren Zeitfenstern pro Tag und Ausnahmen
- Kalender-Abgleich per CalDAV (lesen und schreiben) und ICS-Abo
- Mails über eigenes SMTP mit Kalenderdatei, editierbare Texte mit Vorschau
- Gäste verschieben und sagen ab per persönlichem Link
- Einbett-Script (inline, Popup, schwebend)
- MCP-Server mit API-Schlüsseln und OAuth 2.1 (für Connectors von KI-Assistenten), Vorschau und Bestätigung für kritische Aktionen, KI-Protokoll
- Webhooks mit HMAC-Signatur
- Datenschutz: Anonymisierung nach Frist, Auskunft und Löschung
- Anmeldung mit Passwort, Passkeys und TOTP
- Docker-Image (amd64/arm64), Caddy-Setup, Verwaltungs-Skript für viele Instanzen, automatische Backups
