# Changelog

## 1.0.0 – 2026-11-16

### Neu

- Einrichtung: Feld für den Einrichtungscode (Code oder ganzer Link), früh geprüft. Der Link wird bis zur Einrichtung alle 10 Minuten neu ins Log geschrieben. `SETUP_TOKEN` bleibt optional
- Mail-Assistent mit Anbieter-Vorlagen und „Verbindung testen“ vor dem Speichern, Fehler in Klartext
- Checkliste „Erste Schritte“ mit Fortschritt, Willkommens- und Abschlusskarte, Dialog nach der ersten Terminseite
- Einbetten auch für die Profilseite, mit Anleitung für WordPress, Wix und Jimdo
- „Passwort vergessen?“ per Mail-Link, 10 Ersatzcodes für die Zwei-Faktor-Anmeldung, Notfallbefehl `reset-password <email> [--disable-2fa]`
- Direkt-Knöpfe „Bestätigen“ und „Ablehnen“ in der Anfrage-Mail (sichere Einmal-Links, ausgeführt erst nach Klick auf der Seite)
- Termine verschieben und selbst eintragen (auch ohne Mail an den Gast und außerhalb der Verfügbarkeit), Karte „Heute“, Filter nach Terminseite und Zeitraum, Reiter „Abgesagt“, frühere Termine eines Gasts
- Gäste: Kalender-Knöpfe „Apple / Outlook (.ics)“ und „Google Kalender“, freundliche Fehlerseiten, Ausweg bei gerade vergebener Zeit
- Mail-Platzhalter `{tag}` („heute“, „morgen“, „am Donnerstag, …“) und eigene Texte für Absage-Varianten
- MCP: `list_bookings` kennt die Ansicht „cancelled“, „past“ zeigt keine Abgesagten mehr

### Verbessert

- Verständliche deutsche Fehlermeldungen, die stehen bleiben, bis du sie schließt. Rückgängig bei Ausnahmen
- Rückfrage vor dem Entfernen von Kalendern, Webhooks, Schlüsseln, Zugängen und Passkeys
- Einstellungen neu geordnet, selten Gebrauchtes in der Gruppe „Erweitert“. Fachbegriffe in Klartext mit ?-Erklärungen
- Barrierefreiheit: größere Touch-Flächen, Bedienung per Tastatur, bessere Kontraste
- Zeitzonen-Auswahl mit Klarnamen. Profil und Verfügbarkeit teilen eine Zeitzone
- Gastseiten: Zeitzone sichtbar, Zeiten als Start–Ende, überarbeitete Seite zum Verwalten (Rückfrage, „Bisher“, vergangene und abgesagte Termine), Ladeplatzhalter, Formularfehler am Feld, Dunkelmodus nach Systemeinstellung (eingebettet bleibt es hell, mit `?theme=dark` erzwingbar)
- Mails: Gastgeber genannt, Datum und Uhrzeit im Betreff, Zeiten in der Zeitzone des Gasts, „Zum Kalender hinzufügen“, „Bisher“ bei Verschiebungen, genau ein Kalenderteil pro Mail
- Antworten auf Mails gehen an die richtige Person: Gast-Mails an dich bzw. die Adresse „Antworten an“, Mails an dich an den Gast
- Mail-Vorschau breiter, mit Handy-Ansicht
- Gastgeber-Alltag: Notiz speichert automatisch, Warnung bei ungespeicherten Änderungen, Speichern-Leiste und „Meine Seite“ samt Vorschau auch auf dem Handy

### Sicherheit

- „Passwort vergessen“-Link: 30 Minuten gültig, einmalig, beendet alle Sitzungen. Limits: 3 Anfragen pro Stunde je Adresse, 10 in 15 Minuten je IP
- Direkt-Knöpfe in Mails verfallen nach 7 Tagen, bei Terminbeginn und bei jeder Änderung der Anfrage
- Das gespeicherte SMTP-Passwort gilt nur noch für denselben Server, Port, dieselbe Verschlüsselung und denselben Benutzer

### Hinweise für Betreiber

- **Vor dem Update ein Backup machen.** Die Datenbank-Migrationen 0004 und 0005 laufen beim Start automatisch
- Mailserver in privaten Netzen (auch `127.0.0.1`) werden wie Kalender-Adressen abgelehnt, beim Speichern, Testen und Versenden. Wer ein lokales Mail-Relay nutzt, setzt `ALLOW_PRIVATE_HOSTS=true` (in `.env` und in `docker-compose.yml` unter `environment`)
- Hinter einem Reverse Proxy muss `TRUST_PROXY=true` gesetzt sein (im mitgelieferten Setup schon der Fall)
- Notfallbefehl bei Aussperrung: `docker compose exec termind node server/index.js reset-password <email> [--disable-2fa]`

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
