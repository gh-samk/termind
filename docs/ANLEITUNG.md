# Anleitung

Von der Installation bis zur KI-Verwaltung, Schritt für Schritt.

1. [Installation](#1-installation)
2. [Konto anlegen](#2-konto-anlegen)
3. [E-Mail-Versand einrichten](#3-e-mail-versand-einrichten)
4. [Verfügbarkeit festlegen](#4-verfügbarkeit-festlegen)
5. [Terminseiten anlegen](#5-terminseiten-anlegen)
6. [Kalender verbinden](#6-kalender-verbinden)
7. [Auf der Webseite einbinden](#7-auf-der-webseite-einbinden)
8. [Mit einer KI verwalten](#8-mit-einer-ki-verwalten)
9. [Webhooks](#9-webhooks)
10. [Datenschutz](#10-datenschutz)
11. [Sicherheit](#11-sicherheit)
12. [Backups und Updates](#12-backups-und-updates)
13. [Viele Instanzen betreiben](#13-viele-instanzen-betreiben)
14. [Fehlerbehebung](#14-fehlerbehebung)

---

## 1. Installation

Du brauchst:

- einen kleinen Linux-Server (1 vCPU und 512 MB RAM reichen; termind selbst braucht rund 45 MB)
- Docker mit Compose v2
- eine Domain oder Subdomain, deren DNS-Eintrag (A/AAAA) auf den Server zeigt, z. B. `termine.example.de`
- offene Ports 80 und 443

```bash
git clone https://github.com/gh-samk/termind.git
cd termind/deploy/single
cp .env.example .env
nano .env               # DOMAIN=termine.example.de und ACME_EMAIL=du@example.de
docker compose up -d
```

Caddy holt das HTTPS-Zertifikat automatisch bei Let's Encrypt.

## 2. Konto anlegen

Damit niemand Fremdes eine frisch installierte Instanz übernimmt, geht die Ersteinrichtung nur mit einem einmaligen Link aus dem Log:

```bash
docker compose logs termind | grep setup
```

Öffne den Link, lege Name, E-Mail und Passwort fest (mindestens 10 Zeichen) und gib der Instanz einen Namen. Er erscheint als Absender in Mails. Danach landest du im Admin-Bereich mit einer kurzen Liste „Erste Schritte“.

## 3. E-Mail-Versand einrichten

*Einstellungen → E-Mail*. termind verschickt alle Mails über dein eigenes Postfach. Typische Werte:

| Anbieter | Server | Port | Verschlüsselung |
| --- | --- | --- | --- |
| mailbox.org | smtp.mailbox.org | 587 | STARTTLS |
| Hetzner (KonsoleH) | mail.your-server.de | 587 | STARTTLS |
| Strato | smtp.strato.de | 465 | SSL/TLS |
| IONOS | smtp.ionos.de | 587 | STARTTLS |
| Google Workspace | smtp.gmail.com | 587 | STARTTLS (App-Passwort nötig) |
| Microsoft 365 | smtp.office365.com | 587 | STARTTLS |

Mit „Testmail an mich“ prüfst du die Verbindung. Das Passwort wird verschlüsselt gespeichert und nie wieder angezeigt.

**Mail-Texte:** Unter *Einstellungen → E-Mail → Texte der Mails* formulierst du Betreff und Einleitung jeder Mail auf Deutsch und Englisch, mit Live-Vorschau. Platzhalter: `{vorname}`, `{gast}`, `{gastgeber}`, `{termin}`, `{datum}`, `{uhrzeit}`, `{ort}`.

Damit Mails nicht im Spam landen, sollten SPF, DKIM und DMARC deiner Absender-Domain stimmen. Das richtest du bei deinem Mail-Anbieter ein.

## 4. Verfügbarkeit festlegen

*Verfügbarkeit*: Pro Wochentag legst du ein oder mehrere Zeitfenster fest (z. B. 9–12:30 und 14–17 Uhr). Mit dem Kopier-Symbol überträgst du einen Tag auf alle aktiven Tage.

**Ausnahmen** sind Urlaub, Feiertage oder Tage mit anderen Zeiten. Bestehende Termine und belegte Zeiten aus verbundenen Kalendern spart termind automatisch aus.

## 5. Terminseiten anlegen

Eine Terminseite ist ein buchbarer Termintyp, z. B. „Erstgespräch, 30 Minuten, Videocall“. Einstellungen:

- **Ort:**
  - *Eigener Raum pro Termin* erzeugt aus einer Vorlage wie `https://meet.jit.si/firma-{id}` für jede Buchung einen eigenen Raum.
  - Außerdem gibt es einen festen Video-Link, vor Ort mit Adresse, „Ich rufe an“ oder „Gast ruft an“.
- **Zeiten & Regeln:**
  - Mindestvorlauf, also wie kurzfristig gebucht werden darf
  - Buchungsfenster, also wie weit im Voraus gebucht werden darf
  - Puffer vor und nach dem Termin
  - Raster der Startzeiten
- **Buchungsformular:** eigene Fragen (Text, Auswahl, Telefon, Häkchen), wahlweise als Pflichtfeld.
- **Bestätigung:** Gäste schicken eine Anfrage, du bestätigst oder lehnst mit einem Klick ab.
- **Erinnerungen:** z. B. 24 Stunden und 1 Stunde vorher.

Deine Profilseite mit allen Terminseiten liegt unter `https://DEINE-DOMAIN/DEIN-NAME`. Den Teil hinter der Domain änderst du unter *Einstellungen → Profil & Marke*.

## 6. Kalender verbinden

*Einstellungen → Kalender → Verbinden*.

**CalDAV (lesen und schreiben):** Funktioniert mit Nextcloud, iCloud, mailbox.org, Fastmail, Posteo und jedem anderen CalDAV-Server. Lege dafür in deinem Kalender ein eigenes **App-Passwort** an.

| Dienst | Server-Adresse |
| --- | --- |
| Nextcloud | `https://cloud.example.de/remote.php/dav` |
| iCloud | `https://caldav.icloud.com` (App-Passwort auf appleid.apple.com) |
| mailbox.org | `https://dav.mailbox.org` |
| Fastmail | `https://caldav.fastmail.com` |

Pro Kalender entscheidest du, ob seine Termine als belegt zählen und in welchen Kalender neue Buchungen eingetragen werden. Verschieben und Absagen werden dort automatisch nachgezogen.

**ICS-Link (nur lesen):** Für Google, Outlook oder Proton. Die private ICS-Adresse findest du in den Kalendereinstellungen des Anbieters.

Abgeglichen wird alle 5 Minuten. Ist ein Kalender nicht erreichbar, zeigt termind einen Hinweis. Die zuletzt bekannten belegten Zeiten bleiben dann vorsichtshalber bestehen.

> Nextcloud im eigenen Heimnetz? Dann `ALLOW_PRIVATE_HOSTS=true` setzen, sonst blockiert termind interne Adressen.

## 7. Auf der Webseite einbinden

Im Editor jeder Terminseite unter *Auf deiner Webseite einbetten* kopierst du den passenden Code:

```html
<script src="https://termine.example.de/embed.js" defer></script>

<!-- direkt im Text -->
<div data-termind="lena/erstgespraech"></div>

<!-- als Button mit Popup -->
<button data-termind="lena/erstgespraech" data-mode="popup">Termin buchen</button>

<!-- schwebender Button unten rechts -->
<div data-termind="lena" data-mode="floating" data-label="Termin buchen"></div>
```

In WordPress fügst du den Code mit einem Block „Individuelles HTML“ ein.

## 8. Mit einer KI verwalten

termind hat einen eingebauten MCP-Server. Damit kann ein KI-Assistent Termine lesen, freie Zeiten finden, buchen, verschieben, Terminseiten pflegen und mehr.

**KI-Assistenten mit Connector-Unterstützung (z. B. ChatGPT):** In den Einstellungen des Assistenten einen eigenen Connector hinzufügen, Adresse `https://DEINE-DOMAIN/mcp`. Danach öffnet sich termind im Browser. Melde dich an und wähle *Nur lesen* oder *Verwalten*.

**Desktop-Clients, Entwickler-Werkzeuge, n8n:** In termind unter *Einstellungen → KI & MCP* einen API-Schlüssel erstellen. Ein Konfigurationsbeispiel für MCP-Clients zeigt termind direkt nach dem Erstellen an.

Beispiele für Aufträge an die KI:

- „Welche Termine habe ich diese Woche?“
- „Finde nächste Woche drei freie Zeiten für ein Erstgespräch.“
- „Trag mich vom 23.12. bis 2.1. als Urlaub ein.“
- „Verschieb den Termin mit Clara auf Donnerstag 10 Uhr und schreib ihr, dass mir etwas dazwischengekommen ist.“

Alles, was Gäste per Mail erreicht, Daten an fremde Adressen schickt oder etwas löscht, zeigt die KI dir zuerst als Vorschau. Ausgeführt wird erst nach deiner Zustimmung. Unter *Einstellungen → KI & MCP* siehst du das **KI-Protokoll** mit allem, was ein Assistent getan hat, und kannst Zugänge jederzeit entziehen.

## 9. Webhooks

*Einstellungen → Webhooks*: Bei Ereignissen (gebucht, angefragt, bestätigt, verschoben, abgesagt, abgelehnt) schickt termind eine signierte JSON-Nachricht an deine Adresse, z. B. an n8n, Make oder Zapier. Wie du die Signatur prüfst, steht direkt auf der Seite. Fehlgeschlagene Zustellungen werden automatisch wiederholt.

## 10. Datenschutz

*Einstellungen → Datenschutz*:

- Links zu Impressum und Datenschutzerklärung, sichtbar auf jeder Buchungsseite
- Einwilligungs-Häkchen beim Buchen
- **Aufbewahrungsfrist:** Vergangene Termine werden danach anonymisiert (Standard: 12 Monate)
- **Auskunft und Löschung** pro E-Mail-Adresse (Art. 15 und 17 DSGVO)

termind setzt für Gäste keine Cookies und lädt nichts von fremden Servern. Schriften und Code kommen von deinem Server.

## 11. Sicherheit

*Einstellungen → Anmeldung & Sicherheit*:

- **Passkeys** für die Anmeldung per Face ID, Touch ID oder Windows Hello (nur unter HTTPS)
- **Zwei-Faktor-Anmeldung** mit einer Authenticator-App
- Beim Ändern des Passworts werden alle anderen Sitzungen beendet.

## 12. Backups und Updates

termind sichert die Datenbank täglich nach `/data/backups` und behält die letzten 7 Kopien. Zusätzlich solltest du regelmäßig den ganzen Ordner `/data` an einen anderen Ort kopieren. **Wichtig ist `secret.key`**: Ohne ihn sind gespeicherte Passwörter nach einer Wiederherstellung nicht lesbar.

Manuelles Backup:

```bash
docker compose exec termind node server/index.js backup
```

Update:

```bash
docker compose pull && docker compose up -d
```

Datenbank-Änderungen laufen beim Start automatisch.

## 13. Viele Instanzen betreiben

Für Agenturen und Hosting-Angebote verwaltet `deploy/cloud/termind-cloud.sh` beliebig viele getrennte Instanzen hinter einem gemeinsamen Caddy:

```bash
sudo ./termind-cloud.sh init admin@example.de
sudo ./termind-cloud.sh create kunde1 termine.kunde1.de   # gibt den Einrichtungslink aus
sudo ./termind-cloud.sh list
sudo ./termind-cloud.sh update --all                       # sichert vorher automatisch
sudo RCLONE_REMOTE=hetzner:backups ./termind-cloud.sh backup --all
sudo ./termind-cloud.sh restore kunde1 /srv/termind/backups/kunde1/kunde1-….tar.gz
```

Jede Instanz hat ihre eigene Datenbank, ein Speicher-, CPU- und Prozesslimit, ein schreibgeschütztes Dateisystem und keine Linux-Capabilities.

## 14. Fehlerbehebung

| Problem | Lösung |
| --- | --- |
| Einrichtungsseite sagt „Einrichtungslink nötig“ | Link aus `docker compose logs termind` verwenden |
| Mails kommen nicht an | Testmail senden. Hinweis auf der Termine-Seite beachten, dann *Jetzt erneut senden* |
| Kalender „getrennt“ | App-Passwort erneuern: *Einstellungen → Kalender → Neu anmelden* |
| Passkey lässt sich nicht anlegen | termind muss über HTTPS laufen, `PUBLIC_URL` muss stimmen |
| Der Connector im KI-Assistenten schlägt fehl | `PUBLIC_URL` muss die echte https-Adresse sein, die von außen erreichbar ist |
| Falsche Uhrzeiten | Zeitzone unter *Verfügbarkeit* prüfen |
