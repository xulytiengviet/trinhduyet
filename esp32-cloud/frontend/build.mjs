import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const dir = new URL('./dist/', import.meta.url);
await mkdir(dir, {recursive:true});
for (const file of ['index.html','app.js','style.css','olivia-shell.js']) {
  await copyFile(new URL('./'+file, import.meta.url), new URL('./'+file, dir));
}
const c = {
  apiBase: (process.env.PUBLIC_API_URL || 'https://trinhduyet-esp32-cloud-api.onrender.com').replace(/\/+$/, ''),
  googleClientId: process.env.PUBLIC_GOOGLE_CLIENT_ID || '953301988621-v9osii8gqjhconp13guff25e20o3f3o1.apps.googleusercontent.com'
};
await writeFile(new URL('./config.js', dir),
  'window.ESP32_CLOUD_CONFIG = '+JSON.stringify(c).replace(/</g,'\\u003c')+';\n');
const origin = c.apiBase && new URL(c.apiBase).origin;
const headers = [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: geolocation=(), payment=()',
  '  Content-Security-Policy: default-src \'self\'; script-src \'self\' https://accounts.google.com; style-src \'self\' \'unsafe-inline\' https://accounts.google.com; frame-src https://accounts.google.com https://xulytiengviet.github.io; connect-src \'self\' https://accounts.google.com'+(origin?' '+origin:'')+'; img-src \'self\' data: https://lh3.googleusercontent.com https://*.googleusercontent.com; font-src \'self\'; object-src \'none\'; base-uri \'self\'; frame-ancestors \'none\''
].join('\n')+'\n';
await writeFile(new URL('./_headers', dir),headers);
console.log('Built Pages static frontend. Google configured: '+Boolean(c.googleClientId)+', API: '+Boolean(c.apiBase));
