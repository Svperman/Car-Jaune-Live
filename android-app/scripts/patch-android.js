// Après « npx cap add android » : permissions de position en arrière-plan, nom des notifications, icône Car Jaune.
const fs = require('fs'), path = require('path');
const app = path.join(__dirname, '..', 'android', 'app', 'src', 'main');

// 1. permissions
const mf = path.join(app, 'AndroidManifest.xml');
let xml = fs.readFileSync(mf, 'utf8');
const perms = ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION',
               'POST_NOTIFICATIONS', 'WAKE_LOCK', 'INTERNET', 'RECEIVE_BOOT_COMPLETED', 'SCHEDULE_EXACT_ALARM'];
const add = perms.filter(p => !xml.includes(`android.permission.${p}"`))
  .map(p => `    <uses-permission android:name="android.permission.${p}" />`).join('\n');
if (add) xml = xml.replace(/<\/manifest>\s*$/, add + '\n</manifest>\n');
fs.writeFileSync(mf, xml);

// 2. textes
const strings = path.join(app, 'res', 'values', 'strings.xml');
let s = fs.readFileSync(strings, 'utf8');
if (!s.includes('capacitor_background_geolocation_notification_channel_name'))
  s = s.replace('</resources>', '    <string name="capacitor_background_geolocation_notification_channel_name">Partage de position</string>\n</resources>');
fs.writeFileSync(strings, s);

// 3. icône (celle de l'appli web) à toutes les densités ; pas d'icône adaptative par défaut
const icon = path.join(__dirname, '..', '..', 'icons', 'icon-512.png');
const res = path.join(app, 'res');
fs.readdirSync(res).filter(d => d.startsWith('mipmap-')).forEach(d => {
  const dir = path.join(res, d);
  if (d.includes('anydpi')) { fs.rmSync(dir, { recursive: true, force: true }); return; }
  ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'].forEach(f => fs.copyFileSync(icon, path.join(dir, f)));
});
console.log('Android préparé : permissions' + (add ? ' ajoutées' : ' déjà présentes') + ', icône et textes.');
