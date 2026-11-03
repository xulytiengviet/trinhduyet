/** BilaBot · Bảng điều khiển đơn sắc, tiếng Việt.
 * Reuses the existing Olivia AssistantManager / settings form / BackupSystem.
 * Never fabricates a XiaoZhi activation code or connection state.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const panel = $('settingsPanel');
  if (!panel) return;
  document.body.classList.add('bb-mono-settings');
  const panes = new Set(['overview','assistant','connection','device','protocol','audio','data']);
  let gatewayRequest = 0;
  const STATUS = {checking:'Đang kiểm tra',ready:'Sẵn sàng',error:'Chưa sẵn sàng',idle:'Chưa kiểm tra'};
  const text = (id,value) => {const el=$(id);if(el)el.textContent=String(value);};
  const settings = () => window.XiaozhiDebug;
  const currentId = () => settings()?.ui?.getSettingsTargetIdPublic?.() ||
    settings()?.assistants?.getActiveId?.();
  function activate(pane){
    if(!panes.has(pane))pane='overview';
    panel.dataset.pane=pane;
    panel.querySelectorAll('.bb-db-tab').forEach(btn=>{
      const active=btn.dataset.pane===pane;
      btn.classList.toggle('active',active);
      if(active)btn.setAttribute('aria-current','page');
      else btn.removeAttribute('aria-current');
    });
    const body=$('bb-db-body');if(body)body.scrollTop=0;
    $('bb-db-validation')?.setAttribute('hidden','');
    if(pane==='connection')syncGateway();
    if(pane==='overview'||pane==='connection')refreshSummary();
    if(pane==='data')settings()?.backup?.updateLastBackupDisplay?.();
  }
  function safeHost(url){
    try{
      const u=new URL(url);
      return u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname);
    }catch{return false;}
  }
  function gatewayOrigin(url){
    if(!safeHost(url))return '';
    try{
      const u=new URL(url);
      // Gateway is an origin, not a URL with credentials, query or a path.
      if(u.username||u.password||u.search||u.hash||u.pathname!=='/')return '';
      return u.origin;
    }catch{return '';}
  }
  function gatewayUrl(){
    const u=String(settings()?.bridge?.apiBase||window.BilaBotBridge?.apiBase||'').trim();
    return u;
  }
  function setGatewayState(state,message){
    text('bb-db-gateway',STATUS[state]||'Chưa kiểm tra');
    text('bb-db-gateway-indicator',message||STATUS[state]||'Chưa kiểm tra');
    const el=$('bb-db-gateway-message');
    if(el){el.dataset.state=state;el.textContent=message||STATUS[state]||'Chưa kiểm tra';}
    const publicStatus=$('bb-db-public-state');
    if(publicStatus){
      publicStatus.dataset.state=state;
      publicStatus.textContent={
        checking:'Đang kiểm tra kết nối máy chủ BilaBot…',
        ready:'Máy chủ chuyển tiếp đã sẵn sàng. Nhấn Lấy mã OTA để bắt đầu.',
        error:'Máy chủ chưa sẵn sàng. Chủ dự án cần kiểm tra cấu hình.',
        idle:'Máy chủ BilaBot đang chờ chủ dự án kích hoạt.'
      }[state]||'Đang kiểm tra trạng thái máy chủ.';
    }
  }
  function refreshSummary(){
    const api=settings(),assistantApi=api?.assistants,id=currentId();
    const a=id?assistantApi?.getById?.(id):null;
    const all=assistantApi?.getAllAssistants?.()||[];
    const session=id?api?.sessionManager?.getSession?.(id):null;
    const connected=Boolean(session?.protocol?.isConnected?.());
    const paired=Boolean(id&&assistantApi?.isPairedById?.(id));
    text('bb-db-assistant-name',a?.name||'BilaBot');
    text('bb-db-assistant-count',all.length+' trợ lý đang quản lý');
    text('bb-db-pairing',paired?'Đã ghép nối':'Chưa ghép nối');
    text('bb-db-connection',connected?'WebSocket đã kết nối':'Chưa kết nối WebSocket');
    text('bb-db-top-state',connected?'Đã kết nối XiaoZhi':paired?'Đã ghép nối':'Chưa kết nối');
    text('bb-db-gateway-url',gatewayUrl()?'Máy chủ BilaBot đã được khai báo':'Chờ chủ dự án kích hoạt máy chủ');
  }
  function syncGateway(){
    const fixed=window.BILABOT_CONFIG||{};
    const input=$('bb-db-proxy-url'),mode=$('bb-db-mode'),save=$('bb-db-save-gateway');
    const source=$('bb-api-input');
    if(input){
      input.value=fixed.sameOrigin?window.location.origin:
        (source?.value?.trim()||gatewayUrl());
      input.disabled=Boolean(fixed.sameOrigin);
      input.title=fixed.sameOrigin?'Gateway được tích hợp sẵn cùng tên miền Cloudflare Pages':'Nhập URL gateway của bạn';
    }
    if(mode)mode.value=$('bb-relay-mode')?.value||window.BilaBotBridge?.mode||'gateway';
    if(save)save.disabled=Boolean(fixed.sameOrigin);
    text('bb-db-gateway-url',gatewayUrl()?'Máy chủ BilaBot đã được khai báo':'Chờ chủ dự án kích hoạt máy chủ');
    if(fixed.sameOrigin){
      text('bb-db-gateway-message','Gateway tích hợp cùng tên miền. Bạn có thể kiểm tra trạng thái.');
    }else if(!gatewayUrl()){
      setGatewayState('idle','Máy chủ chưa được kích hoạt. Chủ dự án cấu hình Cloudflare Pages một lần; người dùng không cần nhập URL.');
    }
  }
  async function checkGateway(){
    const btn=$('bb-db-check-gateway'),mode=$('bb-db-mode')?.value||'gateway';
    const url=$('bb-db-proxy-url')?.value?.trim()?.replace(/\/+$/,'')||'';
    if(mode==='direct'){
      setGatewayState('idle','Chế độ trực tiếp: chỉ kiểm tra được bằng kết nối tới máy chủ tự quản tương thích.');
      return;
    }
    if(!gatewayOrigin(url)){
      setGatewayState('error','Nhập địa chỉ HTTPS dạng https://ten-du-an.pages.dev, không kèm đường dẫn hoặc thông tin đăng nhập.');
      return;
    }
    const request=++gatewayRequest;
    if(btn)btn.disabled=true;
    setGatewayState('checking','Đang gửi yêu cầu đến '+new URL(url).hostname+'…');
    try{
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),11000);
      let response;
      try{response=await fetch(url+'/api/health',{method:'GET',mode:'cors',cache:'no-store',signal:controller.signal});}
      finally{clearTimeout(timeout);}
      if(request!==gatewayRequest)return;
      if(!response.ok)throw Error('Máy chủ trả HTTP '+response.status);
      const data=await response.json();
      if(data.ready===true&&data.turnstileSiteKey){
        setGatewayState('ready','Gateway đã sẵn sàng · Turnstile hoạt động.');
      }else{
        setGatewayState('error','Đã kết nối gateway nhưng chưa thiết lập đủ Turnstile hoặc khóa máy chủ.');
      }
    }catch(err){
      if(request!==gatewayRequest)return;
      setGatewayState('error','Không xác minh được gateway: '+(err?.name==='AbortError'?'hết thời gian chờ.':'kiểm tra URL, CORS và cấu hình Cloudflare.'));
    }finally{if(request===gatewayRequest&&btn)btn.disabled=false;}
  }
  function saveGateway(){
    const fixed=window.BILABOT_CONFIG||{},url=$('bb-db-proxy-url')?.value?.trim()?.replace(/\/+$/,'')||'';
    const mode=$('bb-db-mode')?.value||'gateway';
    if(fixed.sameOrigin){
      setGatewayState('idle','Gateway tích hợp cùng tên miền Cloudflare Pages; không cần thay đổi URL.');
      return;
    }
    if(mode==='gateway'&&!gatewayOrigin(url)){
      setGatewayState('error','Nhập tên miền gateway HTTPS hợp lệ, không kèm đường dẫn hoặc thông tin đăng nhập.');
      return;
    }
    if(mode==='direct'&&url&&!gatewayOrigin(url)){
      setGatewayState('error','Máy chủ tự quản phải sử dụng HTTPS hoặc HTTP trên localhost.');
      return;
    }
    // Reuse the existing trusted-origin confirmation and persistence flow.
    const originalInput=$('bb-api-input'),originalMode=$('bb-relay-mode'),button=$('bb-save-config');
    if(!originalInput||!originalMode||!button){
      setGatewayState('error','Không tìm thấy biểu mẫu cấu hình gateway gốc.');
      return;
    }
    originalInput.value=url;originalMode.value=mode;
    button.click();
  }
  function showValidation(message){
    const el=$('bb-db-validation');
    if(!el)return;
    el.hidden=false;el.textContent=message;
  }
  function validateAssistant(event){
    const ws=$('wsUrlInput')?.value?.trim()||'',ota=$('otaUrlInput')?.value?.trim()||'';
    const mac=$('deviceIdInput')?.value?.trim()||'',uuid=$('clientIdInput')?.value?.trim()||'';
    let error='';
    try{
      const u=new URL(ws);
      if(!(u.protocol==='wss:'||u.protocol==='ws:'&&['localhost','127.0.0.1'].includes(u.hostname)))error='WebSocket phải dùng wss://, trừ máy chủ localhost.';
    }catch{error='Nhập địa chỉ WebSocket hợp lệ.';}
    if(!error&&ota&&!safeHost(ota))error='URL OTA phải dùng HTTPS, trừ localhost.';
    if(!error&&mac&&!/^(?:[a-f\d]{2}:){5}[a-f\d]{2}$/i.test(mac))error='Mã thiết bị phải có dạng aa:bb:cc:dd:ee:ff.';
    if(!error&&uuid&&!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(uuid))error='Client ID phải có dạng UUID hợp lệ.';
    if(error){
      event.preventDefault();event.stopImmediatePropagation();
      showValidation(error);
      activate(error.includes('WebSocket')||error.includes('OTA')?'connection':'device');
      showValidation(error);
    }else{$('bb-db-validation').hidden=true;}
  }
  function openDashboard(){
    const api=settings(),id=api?.assistants?.getActiveId?.();
    if(id&&api?.ui?.openSettingsFor){api.ui.openSettingsFor(id);activate('overview');}
    else{
      // AppController emits app-ready once AssistantManager has loaded.
      window.addEventListener('bilabot:app-ready',openDashboard,{once:true});
    }
  }
  function openPairing(){
    $('closeSettingsBtn')?.click();
    window.BilaBotDirect?.openSetup?.();
    // Same one-click provisioning as Olivia's Connect button.
    window.BilaBotBridge?.startPair?.();
  }
  // Move native BackupSystem controls rather than copying IDs / duplicating handlers.
  const backup=$('globalSettingsPanel')?.querySelector('.settings-section');
  const slot=$('bb-db-backup-slot');
  if(backup&&slot)slot.appendChild(backup);
  panel.querySelectorAll('.bb-db-tab').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.pane)));
  panel.querySelectorAll('[data-go-pane]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.goPane)));
  $('bb-db-quick-ota')?.addEventListener('click',openPairing);
  $('bb-db-open-pairing')?.addEventListener('click',openPairing);
  $('bb-db-check-gateway')?.addEventListener('click',checkGateway);
  $('bb-db-save-gateway')?.addEventListener('click',saveGateway);
  $('saveSettingsBtn')?.addEventListener('click',validateAssistant,true);
  window.addEventListener('bilabot:settings-open',()=>{activate('overview');refreshSummary();syncGateway();});
  $('bb-open-dashboard-chat')?.addEventListener('click',openDashboard);
  $('bb-open-dashboard-sidebar')?.addEventListener('click',openDashboard);
  window.addEventListener('bilabot:pairing',refreshSummary);
  window.addEventListener('bilabot:app-ready',()=>{
    refreshSummary();syncGateway();
    // The hosted gateway is probed automatically, without asking each user for its URL.
    if(gatewayUrl() && ($('bb-db-mode')?.value||'gateway')==='gateway')
      checkGateway();
    if(window.location.hash==='#bb-dashboard')openDashboard();
  });
  window.addEventListener('hashchange',()=>{
    if(window.location.hash==='#bb-dashboard')openDashboard();
  });
  $('closeSettingsBtn')?.addEventListener('click',()=>{
    // Native UIController handles closing. Any validation message is cleared here.
    if($('bb-db-validation'))$('bb-db-validation').hidden=true;
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&panel.classList.contains('open')&&$('importConfirmOverlay')?.style.display!=='flex'){
      $('closeSettingsBtn')?.click();
    }
  });
  window.BilaBotDashboard=Object.freeze({activate,refreshSummary,syncGateway,checkGateway,setGatewayState});
  syncGateway();
})();
