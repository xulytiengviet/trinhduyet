/**
 * BilaBot Direct Setup: Olivia-style app is the home screen.
 * The OTA wizard is available as an in-app drawer on all viewport sizes.
 * This module owns only presentation; OTA/check, activate and WS stay in app.js.
 */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  let lastOpener = null;
  const isOpen = () => document.body.classList.contains('bb-setup-open');

  function openSetup(opener = null) {
    if (!byId('bb-setup')) return;
    if (opener?.focus) lastOpener = opener;
    document.body.classList.add('bilabot-open', 'bb-setup-open');
    const dialog = byId('bilabot-gate');
    dialog?.setAttribute('aria-hidden', 'false');
    const pane = byId('bb-setup');
    if (pane) pane.scrollTop = 0;
    // Keep infrastructure configuration hidden from regular users.
    // The project owner may expand the advanced settings manually if needed.
    const config = byId('bb-selfconfig');
    if(config)config.open=false;
    // Ensure that the mobile sidebar cannot cover the settings drawer.
    byId('sidebar')?.classList.remove('mobile-open');
    byId('bb-close-setup')?.focus({ preventScroll: true });
  }

  function closeSetup({ restoreFocus = true } = {}) {
    document.body.classList.remove('bb-setup-open');
    byId('bilabot-gate')?.setAttribute('aria-hidden', 'true');
    if (restoreFocus) (lastOpener || byId('bb-open-setup-sidebar'))?.focus?.({ preventScroll: true });
  }

  function assistantSettings() {
    const api = window.XiaozhiDebug;
    const id = api?.assistants?.getActiveId?.();
    if (!id || !api?.ui?.openSettingsFor) {
      byId('bb-auth-status').textContent = 'Giao diện trợ lý chưa sẵn sàng; thử lại sau khi ứng dụng khởi tạo.';
      return;
    }
    closeSetup({ restoreFocus: false });
    api.ui.openSettingsFor(id);
    byId('assistantNameInput')?.focus({ preventScroll: true });
  }

  function refreshSidebar(phase = '') {
    const label = byId('bb-sidebar-pair-state');
    if (!label) return;
    const messages = {
      checking: 'Đang yêu cầu mã từ XiaoZhi OTA…',
      code: 'Mã OTA đã sẵn sàng — mở cấu hình để sao chép.',
      paired: 'Thiết bị đã ghép nối, đang mở WebSocket…',
      connecting: 'Đang kết nối với máy chủ XiaoZhi…',
      connected: 'Đã kết nối · BilaBot sẵn sàng trò chuyện',
      error: 'Có lỗi kết nối — mở cấu hình để xem chi tiết.',
      cancelled: 'Đã hủy ghép nối · có thể lấy mã mới.',
      disconnected: 'Đã ngắt kết nối với XiaoZhi.'
    };
    if (phase in messages) {
      label.textContent = messages[phase];
      label.dataset.phase = phase;
      return;
    }
    const api = window.XiaozhiDebug;
    const active = api?.assistants?.getActiveId?.();
    const connected = api?.protocol?.isConnected?.();
    const paired = Boolean(active && api?.assistants?.isPairedById?.(active));
    label.textContent = connected ? messages.connected :
      paired ? 'Thiết bị đã ghép nối · nhấn Kết nối để trò chuyện.' :
      'Chưa ghép nối · nhận mã từ XiaoZhi để bắt đầu.';
    label.dataset.phase = connected ? 'connected' : paired ? 'paired' : 'idle';
  }

  function onAppReady() {
    refreshSidebar();
    if (window.location.hash === '#bb-dashboard') {
      // Let the settings module open the direct dashboard instead of the OTA drawer.
      return;
    }
    if (window.location.hash === '#bb-setup') {
      openSetup();
      return;
    }
    const api = window.XiaozhiDebug;
    const active = api?.assistants?.getActiveId?.();
    if (active && !api?.assistants?.isPairedById?.(active)) {
      // A first visit should show the real application and its setup drawer.
      openSetup();
    }
  }

  // App content is always visible behind the setup drawer.
  document.body.classList.add('bilabot-open');
  byId('bilabot-gate')?.setAttribute('aria-hidden', 'true');

  for (const id of ['bb-open-setup-sidebar', 'bb-open-setup-chat']) {
    byId(id)?.addEventListener('click', event => {
      openSetup(event.currentTarget);
      // Same behavior as Olivia's Connect: one click starts real OTA.
      // A pending or already connected session is handled by startPair().
      window.BilaBotBridge?.startPair?.();
    });
  }
  byId('bb-return-home')?.addEventListener('click',event=>openSetup(event.currentTarget));
  byId('bb-close-setup')?.addEventListener('click', () => closeSetup());
  byId('bb-open-assistant-settings')?.addEventListener('click', assistantSettings);
  byId('bilabot-gate')?.addEventListener('click', event => {
    if (event.target === byId('bilabot-gate')) closeSetup();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen()) {
      event.preventDefault();
      closeSetup();
    }
  });
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#bb-setup') openSetup();
  });
  window.addEventListener('bilabot:pairing', event => {
    const phase = event.detail?.phase || '';
    refreshSidebar(phase);
    // A user clicking Connect inside Olivia should receive the same inline
    // OTA experience as clicking the dedicated onboarding button.
    if (phase === 'checking' || phase === 'code') openSetup();
  });
  window.addEventListener('bilabot:app-ready', onAppReady);
  if (window.BilaBotAppReady) onAppReady();
  window.BilaBotDirect = Object.freeze({ openSetup, closeSetup, isOpen, refreshSidebar });
})();
