/* BILABOT / TRINHDUYET — Olivia-inspired UI controller.
 * No simulated chat replies: actual XiaoZhi interaction stays in the BilaBot iframe. */
(() => {
  'use strict';
  const root = document.documentElement;
  const themeBtn = document.getElementById('theme-switch');
  const storageKey = 'trinhduyet_olivia_theme_v1';
  let stored = null;
  try { stored = localStorage.getItem(storageKey); } catch {}
  function setTheme(value) {
    const mode = value === 'dark' ? 'dark' : 'light';
    root.dataset.theme = mode;
    if (themeBtn) {
      themeBtn.textContent = mode === 'dark' ? '☀' : '☾';
      themeBtn.title = mode === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối';
      themeBtn.setAttribute('aria-label', themeBtn.title);
    }
    try { localStorage.setItem(storageKey, mode); } catch {}
  }
  setTheme(stored === 'dark' || stored === 'light'
    ? stored
    : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  themeBtn?.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

  const btn = document.getElementById('hide-ai-intro');
  btn?.addEventListener('click', () => {
    document.getElementById('olivia-intro')?.classList.add('is-collapsed');
  });
  const reload = document.getElementById('reload-ai-frame');
  reload?.addEventListener('click', () => {
    const frame = document.getElementById('olivia-ai-frame');
    if (frame) frame.src = frame.src;
  });
  // A compact, optional guide: open on desktop, collapsed by default on phones.
  // Store only the view preference; never persist Google or XiaoZhi tokens.
  const layout = document.querySelector('#view-chat .chat-layout');
  const guide = document.getElementById('quick-guide');
  const guideToggle = document.getElementById('guide-toggle');
  const guideClose = document.getElementById('guide-close');
  const guideStorageKey = 'trinhduyet_guide_v2';
  let savedGuide = null;
  try { savedGuide = localStorage.getItem(guideStorageKey); } catch {}
  const smallScreen = window.matchMedia('(max-width:760px)').matches;
  let guideVisible = savedGuide === 'show' ? true :
    savedGuide === 'hide' ? false : !smallScreen;
  function setGuideVisible(visible, jump = false) {
    guideVisible = !!visible;
    layout?.classList.toggle('guide-collapsed', !guideVisible);
    if (guideToggle) {
      guideToggle.textContent = guideVisible ? 'Ẩn hướng dẫn' : 'Hướng dẫn 3 bước';
      guideToggle.setAttribute('aria-expanded', String(guideVisible));
    }
    if (guide) guide.setAttribute('aria-hidden', String(!guideVisible));
    try { localStorage.setItem(guideStorageKey, guideVisible ? 'show' : 'hide'); } catch {}
    if (guideVisible && jump && smallScreen) {
      guide?.scrollIntoView({behavior:'smooth',block:'start'});
    }
  }
  setGuideVisible(guideVisible);
  guideToggle?.addEventListener('click', () => setGuideVisible(!guideVisible, true));
  guideClose?.addEventListener('click', () => setGuideVisible(false));

  document.getElementById('focus-assistant')?.addEventListener('click', () => {
    setGuideVisible(false);
    const frame = document.getElementById('olivia-ai-frame');
    frame?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    frame?.focus();
  });
  document.querySelectorAll('a[target="_blank"]').forEach((a) => {
    a.rel = 'noopener noreferrer';
  });
})();
