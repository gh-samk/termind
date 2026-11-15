# Anleitung

Von der Installation bis zur KI-Verwaltung, Schritt für Schritt.

1. [Installation](#1-installation)
2. [Konto anlegen](#2-konto-anlegen)
3. [E-Mail-Versand einrichten](#3-e-mail-versand-einrichten)
4. [Verfügbarkeit festlegen](#4-verfügbarkeit-festlegen)
5. [Terminseiten anlegen](#5-terminseiten-anlegen)
6. [Termine im Alltag](#6-termine-im-alltag)
7. [Kalender verbinden](#7-kalender-verbinden)
8. [Auf der Webseite einbinden](#8-auf-der-webseite-einbinden)
9. [Mit einer KI verwalten](#9-mit-einer-ki-verwalten)
10. [Webhooks](#10-webhooks)
11. [Datenschutz](#11-datenschutz)
12. [Sicherheit](#12-sicherheit)
13. [Backups und Updates](#13-backups-und-updates)
14. [Viele Instanzen betreiben](#14-viele-instanzen-betreiben)
15. [Fehlerbehebung](#15-fehlerbehebung)

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

Damit niemand Fremdes eine frisch installierte Instanz übernimmt, geht die Ersteinrichtung nur mit einem Einrichtungscode. Es gibt zwei Fundstellen, beide im Ordner mit der `docker-compose.yml`:

```bash
# der ganze Einrichtungslink (steht im Log und wird dort alle 10 Minuten wiederholt, bis ein Konto existiert)
docker compose logs termind | grep setup

# oder nur der Code, direkt aus der Datei
docker compose exec termind cat /data/setup-token
```

Öffne den Link. Rufst du `/setup` ohne Link auf, zeigt termind ein Feld „Einrichtungscode einfügen“: Dort passt der Code oder der ganze Link. Ein falscher Code wird sofort gemeldet, bevor du etwas ausfüllst.

Wer lieber einen eigenen Code vergibt, setzt in `.env` die Zeile `SETUP_TOKEN=…` (siehe `.env.example`).

Lege dann Name, E-Mail und Passwort fest (mindestens 10 Zeichen), wähle deine Zeitzone und gib der Instanz einen Namen. Er erscheint als Absender in Mails. Danach landest du im Admin-Bereich mit einer Begrüßung samt Link zu deiner Terminseite und der Checkliste „Erste Schritte“. Sie hakt ab, was wirklich erledigt ist: Mail-Versand mit erfolgreicher Testmail, Verfügbarkeit gespeichert, erste Terminseite, Impressum und Datenschutz verlinkt, Testbuchung gemacht. Der Kalender ist freiwillig. Mit „Ausblenden“ räumst du die Liste weg, unter *Einstellungen → Profil & Marke* holst du sie zurück. Sind alle Schritte erledigt, zeigt termind eine Abschlusskarte „Geschafft – deine Buchungsseite ist startklar“.

**Einstellungen im Überblick:** Die Bereiche heißen *Profil & Marke*, *E-Mail*, *Kalender*, *Datenschutz* und *Anmeldung & Sicherheit*. Selten gebrauchtes steht in der Gruppe **Erweitert**: *KI & MCP* und *Webhooks*. Auf dem Handy wählst du den Bereich in einer Auswahlliste. Fachbegriffe wie SMTP, Connector oder API-Schlüssel erklärt termind mit einem kleinen **?** direkt daneben. Änderungen am Formular speicherst du mit der Speichern-Leiste (auf dem Handy am unteren Rand). Verlässt du die Seite mit ungespeicherten Änderungen, fragt termind vorher nach.

## 3. E-Mail-Versand einrichten

*Einstellungen → E-Mail*. termind verschickt alle Mails über dein eigenes Postfach.

Wähle bei **Mein Anbieter** deinen Anbieter: termind trägt Server, Port und Verschlüsselung für dich ein und zeigt einen Hinweis, z. B. ob ein App-Passwort nötig ist. Der Benutzername ist meist deine volle E-Mail-Adresse. Er und die Absender-Adresse werden mit deiner Anmelde-Adresse vorbelegt. Wechselst du die Verschlüsselung, passt termind den Port an (SSL/TLS → 465, STARTTLS → 587), außer du hast einen eigenen Port eingetragen.

| Anbieter | Server | Port | Verschlüsselung | Hinweis |
| --- | --- | --- | --- | --- |
| mailbox.org | smtp.mailbox.org | 465 | SSL/TLS | Mit Zwei-Faktor-Anmeldung ein eigenes Passwort für Programme anlegen |
| IONOS | smtp.ionos.de | 587 | STARTTLS | |
| Strato | smtp.strato.de | 465 | SSL/TLS | |
| Hetzner (KonsoleH / Webhosting) | mail.your-server.de | 587 | STARTTLS | |
| All-Inkl | individuell | 587 | STARTTLS | Server steht im Kundenbereich (KAS) beim E-Mail-Konto |
| GMX | mail.gmx.net | 587 | STARTTLS | Abruf per POP3/IMAP und SMTP erst in GMX erlauben |
| WEB.DE | smtp.web.de | 587 | STARTTLS | Abruf per POP3/IMAP und SMTP erst in WEB.DE erlauben |
| T-Online | securesmtp.t-online.de | 587 | STARTTLS | Eigenes E-Mail-Passwort im Kundencenter einrichten |
| Gmail / Google Workspace | smtp.gmail.com | 587 | STARTTLS | App-Passwort nötig |
| Microsoft 365 / Outlook | smtp.office365.com | 587 | STARTTLS | SMTP-Versand fürs Postfach muss erlaubt sein, ggf. App-Passwort |

Mit **Verbindung testen** prüfst du Server, Port und Anmeldung mit den Werten im Formular, bevor du speicherst (es wird keine Mail verschickt; höchstens 10 Tests in 10 Minuten). Mit **Testmail an mich** schickst du nach dem Speichern eine echte Mail. Klappt etwas nicht, erklärt termind es in einem Satz, zum Beispiel „Benutzername oder Passwort falsch“, „Server nicht erreichbar“ oder „Verschlüsselung passt nicht zum Port“. Das Passwort wird verschlüsselt gespeichert und nie wieder angezeigt. Lässt du das Feld später leer, bleibt das gespeicherte Passwort nur bei gleichem Server, Port, gleicher Verschlüsselung und gleichem Benutzer erhalten, sonst fragt termind danach. Verschlüsselung „unverschlüsselt“ gibt es nur für eigene Server im lokalen Netz.

**Mail-Texte:** Unter *Einstellungen → E-Mail → Texte der Mails* formulierst du Betreff und Einleitung jeder Mail auf Deutsch und Englisch, mit Live-Vorschau. Platzhalter: `{vorname}`, `{gast}`, `{gastgeber}`, `{termin}`, `{datum}`, `{uhrzeit}`, `{tag}` („heute“, „morgen“ oder „am Donnerstag, 20. November 2026“, aus Sicht des Empfängers), `{ort}`. Die Vorschau lässt sich auf „Handy“ umschalten. Unter dem Text ergänzt termind automatisch Termin-Details und Knöpfe. Die Kalenderdatei hängt genau einmal an der Mail.

Damit Mails nicht im Spam landen, sollten SPF, DKIM und DMARC deiner Absender-Domain stimmen. Das richtest du bei deinem Mail-Anbieter ein.

## 4. Verfügbarkeit festlegen

*Verfügbarkeit*: Pro Wochentag legst du ein oder mehrere Zeitfenster fest (z. B. 9–12:30 und 14–17 Uhr). Mit dem Kopier-Symbol überträgst du einen Tag auf alle aktiven Tage.

**Zeitzone:** Für dich gibt es eine Zeitzone. Du wählst sie bei der Einrichtung, in *Einstellungen → Profil & Marke* oder hier (die Auswahl zeigt Klarnamen wie „Berlin“ statt Kürzel), und sie gilt für Verfügbarkeit, Terminliste und Profil. Wer eine ändert, stellt die andere mit um (solange du nur einen Verfügbarkeitsplan hast). Deine Zeiten, z. B. 9–17 Uhr, gelten danach in der neuen Zeitzone; bestehende Termine bleiben, wie sie sind. Gäste sehen die Zeiten in ihrer eigenen Zeitzone.

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
- **Bestätigung:** Gäste schicken eine Anfrage, du bestätigst oder lehnst sie ab (siehe [Termine im Alltag](#6-termine-im-alltag)).
- **Erinnerungen:** z. B. 24 Stunden und 1 Stunde vorher.

Deine Profilseite mit allen Terminseiten liegt unter `https://DEINE-DOMAIN/DEIN-NAME`. Den Teil hinter der Domain änderst du unter *Einstellungen → Profil & Marke*. Alte Links funktionieren danach nicht mehr. Über „Meine Seite“ (Symbol oben im Admin-Bereich) öffnest du deine Seite. Beim Bearbeiten einer Terminseite siehst du eine Vorschau, auf dem Handy über den Knopf „Vorschau“.

## 6. Termine im Alltag

Der Bereich *Termine* ist deine Startseite im Admin-Bereich.

**Karte „Heute“:** Oben siehst du den nächsten Termin des Tages mit Uhrzeit, Ort und, bei Videocalls, einem Knopf zum Beitreten. Darunter steht, was danach kommt.

**Reiter:** *Bevorstehend*, *Anfragen* (mit Zahl der offenen Anfragen), *Vergangen* und *Abgesagt*. Im Reiter *Abgesagt* liegen abgesagte und abgelehnte Termine, getrennt von den vergangenen. Mit der Suche findest du Termine nach Name oder E-Mail. Mit den Filtern grenzt du nach Terminseite (wenn du mehrere hast) und Zeitraum (Von/Bis) ein. „Filter zurücksetzen“ macht alles wieder frei.

**Einen Termin öffnen:** Klick auf eine Zeile. Du siehst Zeit, Gast, Ort, Antworten aus dem Formular, die Zeitzone des Gasts und frühere Termine dieses Gasts. Die **interne Notiz** speichert sich von selbst. Darunter steht „Wird gespeichert …“ oder „Gespeichert“. Der Gast sieht die Notiz nie.

**Anfragen bestätigen oder ablehnen:** Bei Terminseiten mit Bestätigung landen neue Anfragen im Reiter *Anfragen*. Dort klickst du auf *Bestätigen* oder *Ablehnen*. Das geht auch direkt aus der Mail: Die Anfrage-Mail enthält die Knöpfe **Bestätigen** und **Ablehnen**. Ein Klick darauf öffnet eine Seite in termind, die den Termin zeigt. Erst ein Klick auf dieser Seite führt die Aktion aus. So löst kein Mail-Programm sie aus Versehen aus. Die Links gelten höchstens 7 Tage und bis zum Beginn des Termins. Sie sind nur einmal nutzbar und verfallen, sobald sich an der Anfrage etwas ändert (bestätigt, abgelehnt, abgesagt oder verschoben). Dann hilft der Bereich *Termine*.

**Termin verschieben:** Im geöffneten Termin auf *Verschieben*. Wähle eine freie Zeit oder mit „Andere Zeit eingeben“ eine beliebige, auch außerhalb deiner Verfügbarkeit. Du kannst eine Nachricht für den Gast dazuschreiben. Mit *Verschieben & Mail senden* bekommt der Gast eine Mail mit der neuen Zeit (und der alten unter „Bisher“) samt aktualisiertem Kalendereintrag.

**Termin selbst eintragen:** Oben rechts auf *Termin eintragen*. Wähle Terminseite und Zeit, gib Name und E-Mail des Gasts ein und optional eine interne Notiz. Mit dem Schalter „Gast per Mail benachrichtigen“ entscheidest du, ob der Gast eine Bestätigung bekommt. Schaltest du ihn aus, wird nur eingetragen, ohne Mail (z. B. für einen Termin, den ihr am Telefon ausgemacht habt). Auch hier kannst du über „Andere Zeit eingeben“ eine Zeit außerhalb deiner Verfügbarkeit wählen.

**Absagen:** Im geöffneten Termin auf *Absagen* (bei Anfragen: *Ablehnen*). Termind fragt nach, ob du wirklich absagen willst, und lässt dich eine persönliche Nachricht für den Gast schreiben. Danach geht eine Mail raus.

**Was Gäste sehen:** Gäste bekommen mit der Bestätigung einen Link, über den sie verschieben oder absagen können. Die Seite zeigt Zeiten in der Zeitzone des Gasts (mit Hinweis) und als Start–Ende. Wird eine Zeit in der Zwischenzeit vergeben, sagt die Seite das und lässt den Gast direkt eine andere Zeit wählen. Vor dem Verschieben („Von … auf … verschieben?“) und vor dem Absagen fragt sie nach. Beim Verschieben steht die alte Zeit unter „Bisher“. Bei vergangenen oder abgesagten Terminen steht ein passender Hinweis. Mit den Knöpfen „Apple / Outlook (.ics)“ und „Google Kalender“ tragen Gäste den Termin in ihren Kalender ein. Fehler erscheinen am betroffenen Feld und in verständlichen Sätzen. Die Gastseiten folgen dem Dunkelmodus des Geräts. Eingebettet bleiben sie hell, außer du setzt `data-theme="dark"` (siehe Kapitel 8).

**Mails an Gast und an dich:** Betreffe enthalten Datum und Uhrzeit. Gäste sehen die Zeiten in ihrer eigenen Zeitzone und den Namen des Gastgebers. Antworten auf Mails an Gäste gehen an dich (oder an die Adresse unter „Antworten an“ im Mail-Versand). Antworten auf Mails an dich gehen an den Gast. Bei Verschiebungen steht die alte Zeit unter „Bisher“. Die Mails haben einen Knopf „Zum Kalender hinzufügen“ und es gibt eigene Texte für verschiedene Absagen.

## 7. Kalender verbinden

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

Entfernst du eine Kalenderverbindung, fragt termind vorher nach („Kalenderverbindung entfernen?“). Abgeglichen wird alle 5 Minuten. Ist ein Kalender nicht erreichbar, zeigt termind einen Hinweis. Die zuletzt bekannten belegten Zeiten bleiben dann vorsichtshalber bestehen.

> Nextcloud im eigenen Heimnetz? Dann `ALLOW_PRIVATE_HOSTS=true` setzen, sonst blockiert termind interne Adressen.

## 8. Auf der Webseite einbinden

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

Wohin mit dem Code? In WordPress fügst du ihn mit einem Block „Individuelles HTML“ ein, bei Wix über „Einbetten → Code einbetten“, bei Jimdo mit einem „Widget/HTML“-Element. Der Code für deine ganze Profilseite (alle Terminseiten zur Auswahl, `data-termind="lena"`) steht unter *Einstellungen → Profil & Marke* („Deine Profilseite einbetten“), der für eine einzelne Terminseite in deren Einstellungen. Nach der allerersten Terminseite zeigt termind dir den Link und regt eine Testbuchung an.

Optionale Angaben am Element: `data-theme="light|dark"`, `data-lang="de|en"`, `data-color="#1d6f63"`. Eingebettete Seiten bleiben hell, auch wenn das Gerät des Besuchers dunkel eingestellt ist. Mit `data-theme="dark"` erzwingst du das dunkle Design.

## 9. Mit einer KI verwalten

termind hat einen eingebauten MCP-Server. Damit kann ein KI-Assistent Termine lesen, freie Zeiten finden, buchen, verschieben, Terminseiten pflegen und mehr.

**KI-Assistenten mit Connector-Unterstützung (z. B. ChatGPT):** In den Einstellungen des Assistenten einen eigenen Connector hinzufügen, Adresse `https://DEINE-DOMAIN/mcp`. Danach öffnet sich termind im Browser. Melde dich an und wähle *Nur lesen* oder *Verwalten*.

**Desktop-Clients, Entwickler-Werkzeuge, n8n:** In termind unter *Einstellungen → KI & MCP* einen API-Schlüssel erstellen (Entfernen von Schlüsseln und Zugängen fragt termind vorher nach). Ein Konfigurationsbeispiel für MCP-Clients zeigt termind direkt nach dem Erstellen an.

Beispiele für Aufträge an die KI:

- „Welche Termine habe ich diese Woche?“
- „Finde nächste Woche drei freie Zeiten für ein Erstgespräch.“
- „Trag mich vom 23.12. bis 2.1. als Urlaub ein.“
- „Verschieb den Termin mit Clara auf Donnerstag 10 Uhr und schreib ihr, dass mir etwas dazwischengekommen ist.“

Alles, was Gäste per Mail erreicht, Daten an fremde Adressen schickt oder etwas löscht, zeigt die KI dir zuerst als Vorschau. Ausgeführt wird erst nach deiner Zustimmung. Die Terminliste kennt auch die Ansichten „abgesagt“ und „vergangen“ (ohne abgesagte). Unter *Einstellungen → KI & MCP* (Gruppe *Erweitert*) siehst du das **KI-Protokoll** mit allem, was ein Assistent getan hat, und kannst Zugänge jederzeit entziehen.

## 10. Webhooks

*Einstellungen → Webhooks*: Bei Ereignissen (gebucht, angefragt, bestätigt, verschoben, abgesagt, abgelehnt) schickt termind eine signierte JSON-Nachricht an deine Adresse, z. B. an n8n, Make oder Zapier. Wie du die Signatur prüfst, steht direkt auf der Seite. Fehlgeschlagene Zustellungen werden automatisch wiederholt. Beim Entfernen eines Webhooks fragt termind nach. Die Seite findest du in der Gruppe *Erweitert*.

## 11. Datenschutz

*Einstellungen → Datenschutz*:

- Links zu Impressum und Datenschutzerklärung, sichtbar auf jeder Buchungsseite
- Einwilligungs-Häkchen beim Buchen
- **Aufbewahrungsfrist:** Vergangene Termine werden danach anonymisiert (Standard: 12 Monate)
- **Auskunft und Löschung** pro E-Mail-Adresse (Art. 15 und 17 DSGVO)

termind setzt für Gäste keine Cookies und lädt nichts von fremden Servern. Schriften und Code kommen von deinem Server.

## 12. Sicherheit

*Einstellungen → Anmeldung & Sicherheit*:

- **Passkeys** für die Anmeldung per Face ID, Touch ID oder Windows Hello (nur unter HTTPS)
- **Zwei-Faktor-Anmeldung** mit einer Authenticator-App. Beim Einschalten erzeugt termind 10 **Ersatzcodes** (einmalig sichtbar, als Datei oder zum Kopieren). Mit einem davon meldest du dich einmal ohne App an: Im Code-Schritt auf „Ersatzcode verwenden“ klicken. Du siehst, wie viele noch übrig sind, und kannst nach Eingabe deines Passworts neue erzeugen (die alten verfallen)
- **Passwort vergessen?** Auf der Anmeldeseite schickt termind einen Link zum Festlegen eines neuen Passworts (30 Minuten gültig, nur einmal verwendbar). Danach werden alle Geräte abgemeldet. Die Zwei-Faktor-Anmeldung bleibt bestehen. Das setzt voraus, dass der Mail-Versand eingerichtet ist. Pro E-Mail-Adresse sind höchstens 3 Anfragen pro Stunde möglich, pro Adresse des Besuchers 10 in 15 Minuten. Die Antwort ist immer dieselbe, egal ob es das Konto gibt
- Beim Ändern des Passworts werden alle anderen Sitzungen beendet.
- Passkeys entfernst du erst nach einer Rückfrage.
- Kommst du nicht mehr hinein und hast keinen Mail-Versand, hilft der Notfallbefehl in [Fehlerbehebung](#ausgesperrt).

## 13. Backups und Updates

termind sichert die Datenbank täglich nach `/data/backups` und behält die letzten 7 Kopien. Zusätzlich solltest du regelmäßig den ganzen Ordner `/data` an einen anderen Ort kopieren. **Wichtig ist `secret.key`**: Ohne ihn sind gespeicherte Passwörter nach einer Wiederherstellung nicht lesbar.

Manuelles Backup:

```bash
docker compose exec termind node server/index.js backup
```

**Update auf eine neue Version (z. B. 0.2.0):**

1. Sichere vorher: `docker compose exec termind node server/index.js backup` und kopiere den Ordner `/data` an einen anderen Ort.
2. Dann:

```bash
docker compose pull && docker compose up -d
```

Datenbank-Änderungen laufen beim Start automatisch (Version 0.2.0 bringt zwei davon mit). Eine Rückkehr zu einer älteren Version ist danach nur mit dem Backup möglich. Prüfe nach dem Start, ob die Anmeldeseite lädt und der Mail-Versand noch funktioniert (*Einstellungen → E-Mail → Testmail an mich*).

**Nur für Betreiber mit lokalem Mail-Server:** Ab 0.2.0 verbindet sich termind nicht mehr mit Mail-Servern in privaten Netzen (auch nicht `127.0.0.1`), solange `ALLOW_PRIVATE_HOSTS=true` fehlt. Setze es vor dem Update in der `.env` und in der `docker-compose.yml` unter `environment` (siehe `.env.example`).

## 14. Viele Instanzen betreiben

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

## 15. Fehlerbehebung

| Problem | Lösung |
| --- | --- |
| Einrichtungsseite sagt „Einrichtungslink nötig“ | Link aus `docker compose logs termind` verwenden |
| Mails kommen nicht an | Testmail senden. Hinweis auf der Termine-Seite beachten, dann *Jetzt erneut senden* |
| Kalender „getrennt“ | App-Passwort erneuern: *Einstellungen → Kalender → Neu anmelden* |
| Passkey lässt sich nicht anlegen | termind muss über HTTPS laufen, `PUBLIC_URL` muss stimmen |
| Der Connector im KI-Assistenten schlägt fehl | `PUBLIC_URL` muss die echte https-Adresse sein, die von außen erreichbar ist |
| Falsche Uhrzeiten | Zeitzone unter *Einstellungen → Profil & Marke* oder *Verfügbarkeit* prüfen |
| Link „Bestätigen“ oder „Ablehnen“ in der Mail geht nicht mehr | Der Link ist abgelaufen oder die Anfrage wurde schon bearbeitet oder geändert. Bearbeite sie im Bereich *Termine*, Reiter *Anfragen* |
| Notiz zu einem Termin „Nicht gespeichert“ | Auf „Erneut versuchen“ klicken. Prüfe deine Verbindung zum Server |
| Passwort vergessen | Auf der Anmeldeseite „Passwort vergessen?“ (braucht eingerichteten Mail-Versand), sonst siehe unten |
| Ausgesperrt | siehe „Ausgesperrt“ unten |
| „Dieser Mailserver liegt in einem internen Netz“ | termind verbindet sich aus Sicherheitsgründen nicht mit Servern im eigenen Netz (private, Loopback- und Link-Local-Adressen). Betreibst du ein lokales Relay, setze `ALLOW_PRIVATE_HOSTS=true` in der `.env` und in `docker-compose.yml` unter `environment`. Das gilt auch für Kalender im lokalen Netz |
| Alle Besucher teilen sich ein Versuchslimit („Zu viele Versuche“) | Läuft termind hinter einem Reverse Proxy (z. B. Caddy), muss `TRUST_PROXY=true` gesetzt sein, sonst sieht termind nur die Adresse des Proxys. Im mitgelieferten `docker-compose.yml` ist das gesetzt |

### Ausgesperrt

**Passwort vergessen, Mail-Versand nicht eingerichtet:** Auf dem Server erzeugst du einen Link zum Festlegen eines neuen Passworts. Es wird kein Passwort im Terminal eingegeben oder angezeigt.

```bash
docker compose exec termind node server/index.js reset-password du@example.de
```

Der Befehl beendet alle Sitzungen dieses Kontos und gibt einen Link aus (30 Minuten gültig, nur einmal verwendbar). Öffne ihn im Browser und lege das neue Passwort fest. Die Adresse im Link kommt aus `PUBLIC_URL`.

**Handy verloren und keine Ersatzcodes mehr:** Schalte zusätzlich die Zwei-Faktor-Anmeldung aus (Passkeys bleiben bestehen). Danach kannst du sie nach der Anmeldung neu einrichten und bekommst neue Ersatzcodes.

```bash
docker compose exec termind node server/index.js reset-password du@example.de --disable-2fa
```

Ohne Docker (Entwicklung): `npx tsx server/index.ts reset-password du@example.de`.
