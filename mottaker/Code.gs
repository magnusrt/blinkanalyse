/**
 * Blinkanalyse – mottaker for testbilder
 *
 * Tar imot bilder og analyser fra Blinkanalyse-appen og lagrer dem i Google Drive-mappen
 * «Blinkanalyse testbilder», med én undermappe per måned:
 *   Blinkanalyse testbilder/2026-11/20261103-213712-ab12.jpg   (originalbildet)
 *   Blinkanalyse testbilder/2026-11/20261103-213712-ab12.json  (hjørner, hull, rettelser, innstillinger)
 *
 * Oppsett (én gang):
 *   1. Lim inn hele denne filen i et nytt prosjekt på script.google.com.
 *   2. Distribuer → Ny distribusjon → Type: Nettapp.
 *      Kjør som: Meg.   Hvem har tilgang: Alle.
 *   3. Godkjenn tilgang til Google Drive, og kopier nettapp-adressen (slutter på /exec).
 *
 * KEY under må være lik DRIVE_KEY i appen. Den holder bare tilfeldig trafikk ute; den er ikke hemmelig.
 */
const KEY = "ba308-k7q2m9x4";
const ROOT_NAME = "Blinkanalyse testbilder";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_RECORD_CHARS = 512 * 1024;
const ID_RE = /^\d{8}-\d{6}-[a-z0-9]{2,8}$/;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function doGet() {
  return reply({ ok: true, service: "blinkanalyse-testbilder" });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: "json" }); }
  if (!req || req.key !== KEY) return reply({ ok: false, error: "key" });
  if (!ID_RE.test(String(req.id || ""))) return reply({ ok: false, error: "id" });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return reply({ ok: false, error: "busy" });
  try {
    const folder = monthFolder_(req.id);

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

function monthFolder_(id) {
  const props = PropertiesService.getScriptProperties();
  let root = null;
  const rootId = props.getProperty("rootId");
  if (rootId) { try { root = DriveApp.getFolderById(rootId); if (root.isTrashed()) root = null; } catch (err) { root = null; } }
  if (!root) {
    const found = DriveApp.getRootFolder().getFoldersByName(ROOT_NAME);
    root = found.hasNext() ? found.next() : DriveApp.createFolder(ROOT_NAME);
    props.setProperty("rootId", root.getId());
  }
  const month = id.slice(0, 4) + "-" + id.slice(4, 6);
  const sub = root.getFoldersByName(month);
  return sub.hasNext() ? sub.next() : root.createFolder(month);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
