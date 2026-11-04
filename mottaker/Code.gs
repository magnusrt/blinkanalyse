/**
 * Blinkanalyse – mottaker for testbilder
 *
 * Tar imot bilder og analyser fra Blinkanalyse-appen og lagrer dem i Google Drive-mappen
 * «Blinkanalyse testbilder», med én mappe per enhet og én undermappe per måned:
 *   Blinkanalyse testbilder/Magnus iPhone (7k2m9x)/2026-11/20261103-213712-ab12.jpg           (originalbildet)
 *   Blinkanalyse testbilder/Magnus iPhone (7k2m9x)/2026-11/20261103-213712-ab12-tolkning.jpg  (appens tolkning, før retting)
 *   Blinkanalyse testbilder/Magnus iPhone (7k2m9x)/2026-11/20261103-213712-ab12-justert.jpg   (etter manuell justering, med resultat)
 *   Blinkanalyse testbilder/Magnus iPhone (7k2m9x)/2026-11/20261103-213712-ab12.json          (hjørner, hull, rettelser, innstillinger)
 *
 * Hver enhet (telefon, nettbrett, PC) lager sin egen ID i appen. Navnet kan brukeren sette i appen;
 * mappen får nytt navn når det endres. Enheter uten navn får mappen «Enhet (ID)».
 * Bilder fra eldre versjoner av appen, uten ID, havner i «Uten enhet». Første gang denne versjonen
 * kjører, flyttes de gamle månedsmappene dit (eller til riktig enhet, hvis analysen sier hvilken).
 *
 * Oppsett (én gang):
 *   1. Lim inn hele denne filen i et nytt prosjekt på script.google.com.
 *   2. Distribuer → Ny distribusjon → Type: Nettapp.
 *      Kjør som: Meg.   Hvem har tilgang: Alle.
 *   3. Godkjenn tilgang til Google Drive, og kopier nettapp-adressen (slutter på /exec).
 *
 * Etter en endring her: Distribuer → Administrer distribusjoner → blyanten → Versjon: Ny versjon → Distribuer.
 * Da beholdes samme adresse.
 *
 * KEY under må være lik DRIVE_KEY i appen. Den holder bare tilfeldig trafikk ute; den er ikke hemmelig.
 */
const VERSION = 3;                 // vises når du åpner adressen i nettleseren
const KEY = "ba308-k7q2m9x4";
const ROOT_NAME = "Blinkanalyse testbilder";
const NO_DEVICE = "Uten enhet";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_RECORD_CHARS = 512 * 1024;
const ID_RE = /^\d{8}-\d{6}-[a-z0-9]{2,8}$/;
const DEV_RE = /^[a-z0-9]{6,12}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const ROLES = ["tolkning", "justert"];

function doGet() {
  return reply({ ok: true, service: "blinkanalyse-testbilder", versjon: VERSION });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: "json" }); }
  if (!req || req.key !== KEY) return reply({ ok: false, error: "key" });
  const dev = req.device && DEV_RE.test(String(req.device.id || "")) ? { id: String(req.device.id), name: cleanName_(req.device.name) } : null;
  if (req.kind !== "device" && !ID_RE.test(String(req.id || ""))) return reply({ ok: false, error: "id" });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return reply({ ok: false, error: "busy" });
  try {
    const root = root_();
    migrate_(root);

    if (req.kind === "device") {                 // the name was changed in the app: rename the folder now
      if (!dev) return reply({ ok: false, error: "device" });
      deviceFolder_(root, dev);
      return reply({ ok: true });
    }

    const folder = child_(dev ? deviceFolder_(root, dev) : child_(root, NO_DEVICE), monthOf_(req.id));

    if (req.kind === "image") {
      const ext = TYPES[req.contentType];
      if (!ext) return reply({ ok: false, error: "type" });
      const name = req.id + "." + ext;
      if (folder.getFilesByName(name).hasNext()) return reply({ ok: true, existed: true });
      const bytes = Utilities.base64Decode(String(req.data || ""));
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return reply({ ok: false, error: "size" });
      folder.createFile(Utilities.newBlob(bytes, req.contentType, name));
      return reply({ ok: true });
    }

    if (req.kind === "render") {                 // the app's drawings; a newer one replaces the old
      if (ROLES.indexOf(req.role) < 0) return reply({ ok: false, error: "role" });
      if (req.contentType !== "image/jpeg") return reply({ ok: false, error: "type" });
      const bytes = Utilities.base64Decode(String(req.data || ""));
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return reply({ ok: false, error: "size" });
      const name = req.id + "-" + req.role + ".jpg";
      const old = folder.getFilesByName(name);
      while (old.hasNext()) old.next().setTrashed(true);
      folder.createFile(Utilities.newBlob(bytes, "image/jpeg", name));
      return reply({ ok: true });
    }

    if (req.kind === "record") {
      if (!req.record || typeof req.record !== "object") return reply({ ok: false, error: "record" });
      const name = req.id + ".json";
      const text = JSON.stringify(req.record, null, 1);
      if (text.length > MAX_RECORD_CHARS) return reply({ ok: false, error: "size" });
      const files = folder.getFilesByName(name);
      if (files.hasNext()) files.next().setContent(text);
      else folder.createFile(name, text, "application/json");
      return reply({ ok: true });
    }

    return reply({ ok: false, error: "kind" });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// Can also be run by hand from the editor (choose flyttGamleBilder and press Kjør).
function flyttGamleBilder() {
  migrate_(root_());
}

function root_() {
  const props = PropertiesService.getScriptProperties();
  let root = null;
  const rootId = props.getProperty("rootId");
  if (rootId) { try { root = DriveApp.getFolderById(rootId); if (root.isTrashed()) root = null; } catch (err) { root = null; } }
  if (!root) {
    const found = DriveApp.getRootFolder().getFoldersByName(ROOT_NAME);
    root = found.hasNext() ? found.next() : DriveApp.createFolder(ROOT_NAME);
    props.setProperty("rootId", root.getId());
  }
  return root;
}

function child_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function monthOf_(id) {
  return id.slice(0, 4) + "-" + id.slice(4, 6);
}

function cleanName_(s) {
  return String(s || "").replace(/[\u0000-\u001f\/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
}

// The device's folder is found by the ID at the end of its name, so it can be renamed freely.
function deviceFolder_(root, dev) {
  const want = (dev.name || "Enhet") + " (" + dev.id + ")", tail = "(" + dev.id + ")";
  const props = PropertiesService.getScriptProperties(), key = "dev_" + dev.id;
  let f = null;
  const fid = props.getProperty(key);
  if (fid) { try { f = DriveApp.getFolderById(fid); if (f.isTrashed()) f = null; } catch (err) { f = null; } }
  if (!f) {
    const it = root.getFolders();
    while (it.hasNext()) { const c = it.next(); const n = c.getName(); if (n.slice(-tail.length) === tail) { f = c; break; } }
  }
  if (!f) f = root.createFolder(want);
  else if (f.getName() !== want) f.setName(want);
  if (f.getId() !== fid) props.setProperty(key, f.getId());
  return f;
}

// Once: month folders from before device IDs move into «Uten enhet», or to their device if the record names one.
function migrate_(root) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("migrated") === "1") return;
  const months = [], it = root.getFolders();
  while (it.hasNext()) { const f = it.next(); if (MONTH_RE.test(f.getName())) months.push(f); }
  months.forEach(function (m) {
    const files = [], fi = m.getFiles();
    while (fi.hasNext()) files.push(fi.next());
    const devs = {};
    files.forEach(function (f) {
      const n = f.getName();
      if (!/\.json$/.test(n)) return;
      try {
        const r = JSON.parse(f.getBlob().getDataAsString());
        if (r && r.device && DEV_RE.test(String(r.device.id || ""))) devs[n.replace(/\.json$/, "")] = { id: String(r.device.id), name: cleanName_(r.device.name) };
      } catch (err) {}
    });
    files.forEach(function (f) {
      const id = f.getName().replace(/(-tolkning|-justert)?\.[a-z]+$/, "");
      const dev = devs[id];
      f.moveTo(child_(dev ? deviceFolder_(root, dev) : child_(root, NO_DEVICE), m.getName()));
    });
    if (!m.getFiles().hasNext() && !m.getFolders().hasNext()) m.setTrashed(true);
  });
  props.setProperty("migrated", "1");
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
