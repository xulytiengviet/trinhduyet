/** Public BilaBot gateway configuration.
 * GitHub Pages remains the Olivia-style application URL; the optional
 * Cloudflare Pages app is its trusted Hono OTA/WebSocket gateway.
 * No OAuth credentials, XiaoZhi cookies or device secrets belong here.
 */
(() => {
  'use strict';
  const onGitHub = location.hostname.toLowerCase() === 'xulytiengviet.github.io';
  // Public project gateway: users of GitHub Pages do not need to configure it.
  // The optional deploy.js value (if set) still overrides this default.
  let deployed = 'https://bilabot-web.pages.dev';
  try {
    const value = String(window.BILABOT_DEPLOY_URL || '').trim();
    if (value) {
      const url = new URL(value);
      if (url.protocol === 'https:' && !url.username && !url.password &&
          url.hostname !== location.hostname && !url.search && !url.hash) {
        deployed = url.origin;
      }
    }
  } catch {}
  // Do NOT redirect: the user configures BilaBot at its familiar GitHub URL.
  // Hono is same-origin when deployed on Cloudflare Pages directly.
  window.BILABOT_CONFIG = Object.freeze({
    workerUrl: onGitHub ? deployed : location.origin,
    sameOrigin: !onGitHub,
    mode: 'gateway',
    autoPair: false
  });
})();
