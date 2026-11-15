# Sicherheit

## Lücken melden

Bitte melde Sicherheitslücken **vertraulich** über „Report a vulnerability“ (GitHub Security Advisories) in diesem Repository, nicht als öffentliches Issue. Wir antworten in der Regel innerhalb von 72 Stunden.

## Was termind zum Schutz tut

- **Anmeldung:** Passwörter mit Argon2id, optional Passkeys (WebAuthn) und TOTP. Sitzungen als zufällige Tokens, in der Datenbank nur als SHA-256-Hash. Cookies `HttpOnly`, `SameSite=Lax`, unter HTTPS `Secure`. Begrenzung von Anmeldeversuchen.
- **CSRF:** Schreibende Anfragen mit Cookie müssen von der eigenen Origin kommen.
- **Ersteinrichtung:** nur mit einmaligem Einrichtungslink aus dem Server-Log (oder `SETUP_TOKEN`), atomar gegen doppelte Inhaber.
- **Getrennte Zugänge:** Die Oberfläche und `/api` akzeptieren nur die Sitzung (Cookie), `/mcp` nur Bearer-Tokens. Sicherheitseinstellungen sind per API oder KI nicht erreichbar.
- **API-Schlüssel & OAuth:** nur gehasht gespeichert; OAuth 2.1 mit PKCE (S256), exakter Prüfung der Rücksprungadresse, rotierenden Refresh-Tokens und Sperre bei Code-Wiederverwendung. Zugangstokens sind an den MCP-Endpunkt gebunden.
- **KI-Aktionen:** Was Gäste erreicht (Mails), Daten nach außen gibt (Webhooks) oder löscht, braucht eine zweite, ausdrückliche Bestätigung. Alle Zugriffe stehen im Protokoll.
- **Gespeicherte Geheimnisse** (SMTP-, CalDAV-Passwörter, Webhook-Geheimnisse) sind mit AES-256-GCM verschlüsselt.
- **SSRF-Schutz:** Kalender-, Webhook- und Client-Metadaten-Adressen dürfen nicht auf interne Netze zeigen. Geprüft wird beim Verbindungsaufbau (gegen DNS-Rebinding), inklusive IPv4-gemappter IPv6-Adressen. Für Heimnetze abschaltbar mit `ALLOW_PRIVATE_HOSTS=true` (gilt nie für anonym auslösbare Abrufe).
- **Ressourcen:** Anfragen max. 256 KB, Antworten fremder Server begrenzt, Rate-Limits auf öffentlichen Endpunkten, begrenzte Speicherstrukturen, Kalender-Auswertung mit Rechenbudget.
- **Injection:** Kalenderdateien und Mails escapen alle Fremdeingaben (keine Zeilen- oder Header-Injection), Links nur mit http(s).
- **Prompt-Injection:** Gastangaben werden in MCP-Antworten als Fremddaten gekennzeichnet; kritische Aktionen brauchen eine Bestätigung. Ein vollständiger Schutz gegen manipulierte KI-Assistenten ist nicht möglich, daher die Vorschau immer selbst lesen.
- **Header:** strenge Content-Security-Policy ohne Inline-Skripte, HSTS, `nosniff`, `Referrer-Policy: no-referrer`. Nur Buchungsseiten dürfen in fremde Seiten eingebettet werden, Admin und Zustimmungsseite nie.
- **Container:** läuft als unprivilegierter Nutzer, mit schreibgeschütztem Dateisystem und ohne Linux-Capabilities (siehe `deploy/`).
- **Datensparsamkeit:** keine Cookies und keine externen Ressourcen für Gäste, automatische Anonymisierung nach Frist.

## Betriebshinweise

- termind immer hinter HTTPS betreiben (Caddy in `deploy/` erledigt das automatisch) und `PUBLIC_URL` mit `https://` setzen.
- `TRUST_PROXY=true` nur setzen, wenn ein eigener Reverse-Proxy davor sitzt.
- Den Ordner `/data` sichern; er enthält Datenbank, Backups und den Schlüssel `secret.key`. Ohne diesen Schlüssel sind gespeicherte Passwörter (SMTP, CalDAV) nicht mehr lesbar.
