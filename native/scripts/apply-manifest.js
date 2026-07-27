/* Merges background-location + foreground-service permissions into the generated
   AndroidManifest.xml. Runs in CI after `cap add android`. */
const fs = require('fs');
const path = require('path');
const manifestPath = path.resolve(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const additionsPath = path.resolve(__dirname, '..', 'android-config', 'AndroidManifest-additions.xml');
if (!fs.existsSync(manifestPath)) { console.log('no manifest yet — skipping'); process.exit(0); }
if (!fs.existsSync(additionsPath)) { console.log('no additions file — skipping'); process.exit(0); }
let manifest = fs.readFileSync(manifestPath, 'utf8');
const additions = fs.readFileSync(additionsPath, 'utf8');
// extract <uses-permission> lines from additions
const perms = (additions.match(/<uses-permission[^>]*\/>/g) || []);
let added = 0;
for (const p of perms) {
  const nameMatch = p.match(/android:name="([^"]+)"/);
  if (nameMatch && manifest.indexOf(nameMatch[1]) === -1) {
    manifest = manifest.replace('<application', '    ' + p + '\n    <application');
    added++;
  }
}
/* SHOMER's own foreground services live in android-config too — the merger used to
   drop them, so AlarmForegroundService and ShakeService never reached the APK. */
/* Self-closing form first (bounded so it cannot run past its own '>'), otherwise the
   full block. A single non-greedy pattern stopped at the <property/> INSIDE
   ShakeService and emitted an unterminated <service>, which broke manifest merge. */
const services = (additions.match(/<service\b[^>]*\/>|<service\b[\s\S]*?<\/service>/g) || []);
let svc = 0;
for (const s of services) {
  const nm = s.match(/android:name="([^"]+)"/);
  if (nm && manifest.indexOf(nm[1]) === -1) {
    manifest = manifest.replace('</application>', '        ' + s + '\n    </application>');
    svc++;
  }
}
fs.writeFileSync(manifestPath, manifest);
console.log('applied', added, 'permission(s) and', svc, 'service(s) to AndroidManifest.xml');
