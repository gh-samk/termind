# Changelog

## Unveröffentlicht

- Einrichtung: Anbieter-Vorlagen für den Mail-Versand, „Verbindung testen“ vor dem Speichern, verständliche Fehlermeldungen
- Einrichtungscode einfügen und früh prüfen, Link wird bis zur Einrichtung alle 10 Minuten neu ins Log geschrieben
- Checkliste „Erste Schritte“ mit echten Kriterien, Begrüßung, Dialog nach der ersten Terminseite, Einbetten auch für die Profilseite
- Ausgesperrt-Schutz: „Passwort vergessen?“ per Mail-Link, Ersatzcodes für die Zwei-Faktor-Anmeldung, Notfallbefehl `reset-password`
- Hinweis für Betreiber mit lokalem Mail-Relay: Mailserver in privaten Netzen (auch 127.0.0.1) werden jetzt wie Kalender-Adressen abgelehnt, beim Speichern, Testen und Versenden. Mit `ALLOW_PRIVATE_HOSTS=true` bleibt es erlaubt. Das gespeicherte SMTP-Passwort gilt nur noch für denselben Server und Benutzer
- Zeitzonen-Auswahl mit lesbaren Namen; Profil und Verfügbarkeit teilen eine Zeitzone

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
