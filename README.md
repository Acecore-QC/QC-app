# Acecore QC – quality checklist app

Webapp voor de bouw- en kwaliteitschecklists van de Noa Electric en Noa Hybrid.
De app is te installeren op laptop en Samsung-tablet (PWA), werkt offline en slaat alles op in één SharePoint/Teams-map:

```
QC/                                  ← de map die je in config.js instelt
└── D-086-H/                         ← één map per serienummer
    ├── build.json                   ← alle ingevulde checks (wie + wanneer)
    ├── D-086-H_QC-report.pdf        ← rapport (bij "Finalize" of "Save PDF")
    └── photos/
        ├── top_20261007-105022_x1a.jpg
        ├── bottom_20261007-105304_k9p.jpg
        └── other_….jpg
```

**Onderdelen per model**
| | Build info | Quality checklist | Final assembly | Foto's | PDF-rapport |
|---|---|---|---|---|---|
| Noa Electric | ✔ | ✔ (zonder *Hybrid only*) | – | ✔ | ✔ |
| Noa Hybrid | ✔ | ✔ | ✔ | ✔ | ✔ |

---

## 0. Eerst even proberen (demo-modus)

Zolang `clientId` in `js/config.js` leeg is, draait de app in **demo-modus**: alles wordt alleen op dat apparaat bewaard.
Zo kun je de app meteen bekijken nadat hij op GitHub Pages staat (stap 1), nog vóór de Microsoft-koppeling.

> Lokaal openen kan ook: in deze map `python -m http.server 8000` en ga naar http://localhost:8000.
> (Gewoon dubbelklikken op index.html werkt niet, browsers blokkeren dan de scripts.)

## 1. Publiceren op GitHub Pages (± 10 min)

1. Maak (als je die nog niet hebt) een GitHub-organisatie aan, bijv. `acecore-technologies`, op https://github.com.
2. Maak een nieuwe repository, bijv. `qc-app`.
3. Upload de inhoud van deze map (*Add file → Upload files*, de hele map erin slepen) en commit.
4. *Settings → Pages → Build and deployment*: Source **Deploy from a branch**, Branch **main**, map **/ (root)** → Save.
5. Na ±1 minuut staat de app op **`https://acecore-technologies.github.io/qc-app/`**.
   Dit adres heb je nodig in stap 2 (exact zo, mét `/` aan het eind).

> **Let op – openbaar of privé?** Bij een gratis GitHub-account moet de repository *public* zijn voor Pages.
> Dan is de **code** (en de checklist-teksten) zichtbaar voor iedereen. De **gegevens** (builds, foto's) niet: die staan in jullie SharePoint en vragen een Acecore-login.
> Wil je ook de code privé houden: neem GitHub Team (privé-repo met Pages), of zet dezelfde map op Azure Static Web Apps (gratis tier) – de app werkt daar precies hetzelfde.

## 2. App registreren in Microsoft Entra ID (± 5 min)

Dit regelt dat de app namens de ingelogde gebruiker in SharePoint mag lezen/schrijven.
Je hebt geen admin-rechten nodig **als** gebruikers bij jullie apps mogen registreren (standaardinstelling). Lukt het niet, stuur dan stap 2 + 3 door naar jullie IT-beheerder (tekst onderaan).

1. Ga naar https://entra.microsoft.com → *Applications → App registrations → **New registration***.
2. Name: `Acecore QC`
   Supported account types: **Accounts in this organizational directory only**
   Redirect URI: platform **Single-page application (SPA)**, URL: `https://acecore-technologies.github.io/qc-app/`
3. *Register*. Noteer op de overzichtspagina:
   - **Application (client) ID**
   - **Directory (tenant) ID**
4. *API permissions → Add a permission → Microsoft Graph → Delegated permissions*, voeg toe:
   `Files.ReadWrite.All` (User.Read staat er al; openid/profile/offline_access worden automatisch gevraagd).
5. Bij de eerste login vraagt Microsoft iedere gebruiker één keer om toestemming. Staat jullie tenant dat niet toe, dan ziet de gebruiker "Need admin approval" → IT klikt dan één keer op **Grant admin consent for Acecore** op dezelfde pagina.

> Gebruik je ook nog een test-URL (bijv. `http://localhost:8000/`), voeg die dan als extra SPA-redirect-URI toe.

## 3. SharePoint-map kiezen

1. Maak in het Teams-kanaal of de SharePoint-site waar de productie-bestanden horen een map, bijv. **QC**.
2. Klik op de map → **⋯ → Copy link** (instelling: *People in Acecore with the link* of *People with existing access*).
3. Iedereen die de app gebruikt moet bewerkrechten op die map hebben (dat is automatisch zo als ze lid zijn van het Team).

## 4. config.js invullen

Open op GitHub `js/config.js` → potloodje (*Edit*) en vul in:

```js
clientId: '…Application (client) ID…',
tenantId: '…Directory (tenant) ID…',
sharepointFolderLink: 'https://acecore.sharepoint.com/:f:/s/…',   // de gekopieerde link
```

Commit. Na een minuut vraagt de app om in te loggen met Microsoft.
(Werkt de link om een of andere reden niet, gebruik dan optie B in config.js: host + site + mappad.)

## 5. Installeren op de apparaten

- **Samsung-tablet (Chrome of Samsung Internet):** open de URL → menu **⋮ → Add to Home screen / Install app**. Daarna opent hij als gewone app, met eigen icoon.
- **Laptop (Chrome of Edge):** open de URL → klik op het installatie-icoon rechts in de adresbalk (of menu → *Apps → Install*).
- **Telefoon:** niets installeren. Scan de QR-code met de gewone camera-app; de upload-pagina opent in de browser. De eerste keer log je in, daarna onthoudt de telefoon dat.

## 6. Zo werkt het

1. **New build** → kies Noa Electric / Noa Hybrid, typ het serienummer (bijv. `D-086-H`), klant en engineer.
2. **Build info**: standaardwaarden uit de Excel-template staan voorgevuld; vul serienummers van componenten in.
3. **Quality checklist**: de engineer tikt **Self** aan tijdens het bouwen. De supervisor kiest **Pass / Fail / Par / N/A**, op elk apparaat. Bij elk vinkje wordt vastgelegd wie het deed en wanneer. Met het potloodje voeg je een notitie toe.
4. **Foto's**: bij *Pictures taken* of op het tabblad **Photos** → **Scan with phone** → QR scannen → foto maken. De foto komt direct in `QC/<serienummer>/photos` en verschijnt binnen een paar seconden op de tablet.
5. **Report**: overzicht van alles wat nog open staat (klikbaar). **Finalize build** vergrendelt de build en zet het PDF-rapport in de map van het serienummer. Met *Reopen build* maak je hem weer bewerkbaar.

Offline: zonder wifi kun je gewoon doorwerken. De sync-indicator rechtsboven toont "Offline – saved on device" en zodra er weer verbinding is, wordt alles samengevoegd. Werken twee mensen tegelijk aan dezelfde build, dan wint per vinkje de laatste wijziging. Er gaat niets van de ander verloren.

## 7. Aanpassen

| Wat | Waar |
|---|---|
| Checklistpunten toevoegen/wijzigen | `js/checklists.js` (laat bestaande `id`'s ongewijzigd, daar hangen de antwoorden aan) |
| Build-info velden, standaardwaarden, nieuw model (bijv. Zoe, Zetona) | `js/models.js` → kopieer een blok in `MODELS` |
| Logo | `assets/logo.svg` (het witte Acecore-logo) |
| Kleuren/lettertype | `css/app.css` (bovenaan, `:root`) |

**Na elke wijziging:** verhoog `VERSION` in `sw.js` (bijv. `acqc-1.0.1`), zodat geïnstalleerde apps de nieuwe versie ophalen.

---

### Tekst voor IT (als je zelf geen app mag registreren)

> Hoi, wij willen een interne webapp gebruiken voor onze QC-checklists. Kun je in Entra ID een app registration aanmaken?
> – Naam: Acecore QC
> – Type: Single-page application, redirect URI `https://acecore-technologies.github.io/qc-app/`
> – Accounts: alleen onze organisatie
> – Delegated Microsoft Graph permissions: `User.Read`, `Files.ReadWrite.All` (+ graag *Grant admin consent*)
> Graag de Application (client) ID en Directory (tenant) ID terugsturen. De app werkt alleen namens de ingelogde gebruiker en schrijft in de SharePoint-map QC. Er is geen client secret nodig.
