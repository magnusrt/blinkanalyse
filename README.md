# Blinkanalyse

Web-app for .308: ta bilde av blinken og få treffpunkt, spredning, korreksjon i klikk (0,1 mrad) og vurdering.
Virker på iPhone, Android og PC, også uten nett.

**Åpne:** https://magnusrt.github.io/blinkanalyse/

**Installer på telefonen**
- iPhone: åpne lenken i Safari, trykk Del og velg «Legg til på Hjem-skjerm».
- Android: åpne lenken i Chrome og trykk «Installer» (eller meny ⋮ → «Installer app»).

Blinkene (A3 og A4) skrives ut fra «Skriv ut blinker» i appen. Skriv ut i 100 % størrelse.
Appen kjenner også igjen DFS 100 m-pappskiva (uten egne merker) og gir poeng per skudd, og har et
transparent måleark som kan legges over andre skiver.

**Testbilder for feilsøking**
Bilder som analyseres, sendes til mottakeren i `mottaker/Code.gs` (Google Apps Script) og lagres i
Google Drive-mappen «Blinkanalyse testbilder», med én mappe per enhet og én undermappe per måned:
originalbildet, appens tolkning før retting (`-tolkning.jpg`), resultatet etter manuell justering
(`-justert.jpg`) og analysen som JSON. Hver enhet får en egen ID i appen og kan gis et navn der.
Brukeren kan slå lagringen av i appen. Mottakeren settes opp
én gang; se kommentaren øverst i `mottaker/Code.gs`. Adressen legges inn som `DRIVE_URL` i appen.
