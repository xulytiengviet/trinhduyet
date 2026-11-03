/**
 * BilaBot interface with integrated Cloudflare Pages Hono gateway.
 * Google login remains exclusively at the official XiaoZhi website.
 * The device activation code is only obtained from XiaoZhi OTA.
 * Official XiaoZhi requires a small gateway for OTA/CORS and WebSocket
 * custom headers. A direct mode is exposed ONLY for compatible self-hosts.
 */
(function () {
  'use strict';
  const SAVE='bilabot-connection-v2', SESSION='bilabot-transport-session-v2';
  const ui=id=>document.getElementById(id), official='https://xiaozhi.me/console/agents';
  const fixed=window.BILABOT_CONFIG||{};
  let saved={};try{saved=JSON.parse(localStorage.getItem(SAVE)||'{}')}catch{}
  const settings={
    workerUrl: fixed.sameOrigin ? location.origin : String(saved.workerUrl || fixed.workerUrl || '').trim().replace(/\/+$/,''),
    mode: saved.mode==='direct'?'direct':(fixed.mode==='direct'?'direct':'gateway')
  };
  let transportSession='', expiresAt=0, healthCache=null, pending=null;
  const setStatus=message=>{if(ui('bb-auth-status'))ui('bb-auth-status').textContent=message;};
  const setGatewayStatus=(state,message)=>{
    const pill=ui('bb-server-state'),parent=pill?.parentElement;
    if(pill)pill.textContent=message;
    if(parent)parent.dataset.health=state;
  };
  const showError=message=>{
    const el=ui('bb-auth-error');if(el){el.hidden=false;el.textContent=message;}
    setStatus('Có thể mở giao diện BilaBot để xem nhật ký kết nối và thử lại.');
  };
  const hideError=()=>{const el=ui('bb-auth-error');if(el){el.hidden=true;el.textContent='';}};
  const validBase=()=>{
    try{const u=new URL(settings.workerUrl);return u.protocol==='https:'||
      (u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname));}
    catch{return false;}
  };
  async function health(force=false){
    if(force)healthCache=null;
    if(healthCache)return healthCache;
    if(!validBase()){
      setGatewayStatus('error','Chưa có Cloudflare gateway');
      throw new Error('Máy chủ BilaBot chưa được kích hoạt. Chủ dự án cần triển khai Cloudflare Pages một lần; người dùng không phải tự tạo gateway.');
    }
    setGatewayStatus('checking','Đang kiểm tra Cloudflare gateway…');
    let res;
    try{
      res=await fetch(settings.workerUrl+'/api/health',{mode:'cors',cache:'no-store',
        signal:typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(12000):undefined});
    }catch{
      setGatewayStatus('error','Không truy cập được gateway');
      throw new Error('Không kết nối được Cloudflare gateway. Kiểm tra URL, CORS và trạng thái triển khai.');
    }
    if(!res.ok){
      setGatewayStatus('error','Gateway trả HTTP '+res.status);
      throw new Error('Cloudflare gateway không sẵn sàng (HTTP '+res.status+').');
    }
    const data=await res.json().catch(()=>({}));
    if(!data.ready||!data.turnstileSiteKey){
      setGatewayStatus('error','Gateway chưa cấu hình');
      throw new Error('Cloudflare gateway chưa có Turnstile hoặc SESSION_SECRET/TICKET_KEY. Xem Hướng dẫn triển khai.');
    }
    setGatewayStatus('ready','Cloudflare gateway đã sẵn sàng');
    return(healthCache=data);
  }
  async function challenge(siteKey){
    // The Turnstile script is async: a quick first click should not fail while it loads.
    for(let attempt=0;!window.turnstile?.render && attempt<50;attempt++)
      await new Promise(resolve=>setTimeout(resolve,200));
    if(!window.turnstile?.render)throw new Error('Không tải được Cloudflare Turnstile. Kiểm tra kết nối hoặc tiện ích chặn nội dung rồi thử lại.');
    const holder=ui('bb-turnstile');if(!holder)throw new Error('Thiếu vùng Turnstile.');
    holder.hidden=false;holder.replaceChildren();
    setStatus('Xác nhận kết nối an toàn với proxy (không cần đăng nhập Google lần nữa)…');
    return await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Hết thời gian xác thực Turnstile.')),90000);
      try{
        window.turnstile.render(holder,{sitekey:siteKey,theme:'light',
          callback:token=>{clearTimeout(timeout);holder.hidden=true;resolve(token);},
          'error-callback':()=>{clearTimeout(timeout);reject(new Error('Không xác thực được Turnstile.'));},
          'expired-callback':()=>{clearTimeout(timeout);reject(new Error('Turnstile đã hết hạn, vui lòng thử lại.'))}
        });
      }catch(e){clearTimeout(timeout);reject(e);}
    });
  }
  async function ensureSession(){
    if(settings.mode==='direct')return '';
    if(transportSession&&expiresAt>Date.now()+15_000)return transportSession;
    if(pending)return pending;
    pending=(async()=>{
      // Only issue a transport session; do not use or impersonate XiaoZhi login.
      const cache=await health();
      let stored=null;try{stored=JSON.parse(sessionStorage.getItem(SESSION)||'null')}catch{}
      if(stored?.workerUrl===settings.workerUrl&&stored.expiresAt>Date.now()+20_000){
        const resp=await fetch(settings.workerUrl+'/api/me',
          {headers:{Authorization:'Bearer '+stored.token}});
        if(resp.ok){transportSession=stored.token;expiresAt=stored.expiresAt;return transportSession;}
      }
      const token=await challenge(cache.turnstileSiteKey);
      const res=await fetch(settings.workerUrl+'/api/auth/session',{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({turnstileToken:token})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data.session)throw new Error(data.error||'Không cấp được phiên chuyển tiếp.');
      transportSession=data.session;expiresAt=data.expiresAt;
      sessionStorage.setItem(SESSION,JSON.stringify({workerUrl:settings.workerUrl,token:transportSession,expiresAt}));
      setStatus('Phiên chuyển tiếp đã sẵn sàng. Đang yêu cầu mã từ XiaoZhi…');
      return transportSession;
    })().finally(()=>{pending=null;});
    return pending;
  }
  let pairingInFlight=null,lastActivationCode='',currentPhase='idle';
  let countdownTimer=null,suppressCancelledError=false;
  const preview=()=>ui('bb-code-preview');
  function stopCountdown(){
    if(countdownTimer!==null){clearInterval(countdownTimer);countdownTimer=null;}
    if(ui('bb-code-expiry'))ui('bb-code-expiry').hidden=true;
  }
  function startCountdown(ms){
    stopCountdown();
    if(!Number.isFinite(ms)||ms<1000)return;
    const deadline=Date.now()+Math.min(ms,600000);
    const update=()=>{
      const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));
      const el=ui('bb-code-expiry');
      if(el){el.hidden=false;el.textContent=Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');}
      if(remaining===0)stopCountdown();
    };
    update();countdownTimer=setInterval(update,1000);
  }
  const phaseLabels={idle:'CHƯA CÓ MÃ',checking:'ĐANG LẤY MÃ',code:'MÃ OTA THẬT',
    paired:'ĐÃ GHÉP NỐI',connecting:'KẾT NỐI...',connected:'ĐÃ KẾT NỐI',error:'CẦN KIỂM TRA',
    cancelled:'ĐÃ HỦY',disconnected:'MẤT KẾT NỐI'};
  function pairProgress(phase,message){
    currentPhase=phase;
    if(preview())preview().dataset.phase=phase;
    if(ui('bb-setup'))ui('bb-setup').dataset.phase=phase;
    if(ui('bb-code-state'))ui('bb-code-state').textContent=phaseLabels[phase]||'BILABOT';
    if(ui('bb-pair-progress'))ui('bb-pair-progress').textContent=message;
    if(ui('bb-preview-status'))ui('bb-preview-status').textContent=
      phase==='connected'?'Đã kết nối':phase==='paired'?'Đã ghép nối':
      phase==='code'?'Chờ nhập mã':phase==='checking'?'Đang cấp mã':'Chưa kết nối';
    if(ui('bb-cancel-pair'))ui('bb-cancel-pair').hidden=phase!=='code';
    setStatus(message);
  }
  function handlePairingEvent(event){
    const d=event?.detail||{}, phase=d.phase;
    if(phase==='checking'){
      stopCountdown();lastActivationCode='';suppressCancelledError=false;
      if(ui('bb-code-value'))ui('bb-code-value').textContent='— — — — — —';
      if(ui('bb-code-hint'))ui('bb-code-hint').textContent='Đang yêu cầu mã thật từ máy chủ OTA…';
      if(ui('bb-code-actions'))ui('bb-code-actions').hidden=true;
      pairProgress('checking','Đang kiểm tra thiết bị ảo với XiaoZhi OTA…');
    }else if(phase==='code'){
      // Only accept the code obtained from the active device's OTA result.
      const code=String(d.code||'').trim();
      if(!code)return handlePairingEvent({detail:{phase:'error',message:'OTA chưa trả về mã kích hoạt hợp lệ.'}});
      lastActivationCode=code;
      if(ui('bb-code-value')){ui('bb-code-value').textContent=code;ui('bb-code-value').setAttribute('aria-label','Mã kích hoạt '+code);}
      if(ui('bb-code-hint'))ui('bb-code-hint').textContent='Sao chép mã, mở XiaoZhi → AI Agents → thêm thiết bị và nhập mã này.';
      if(ui('bb-code-actions'))ui('bb-code-actions').hidden=false;
      pairProgress('code','Mã thật đã sẵn sàng. Dán mã vào AI Agent trên XiaoZhi; BilaBot tự kiểm tra ghép nối.');
      startCountdown(Number(d.timeoutMs)||300000);
    }else if(phase==='paired'){
      stopCountdown();
      pairProgress('paired','XiaoZhi đã xác nhận ghép nối! Đang thiết lập kết nối giọng nói…');
      if(ui('bb-code-hint'))ui('bb-code-hint').textContent='Mã đã được xác nhận. Đang kết nối WebSocket…';
    }else if(phase==='connecting'){
      pairProgress('connecting','Đang chờ XiaoZhi xác nhận kết nối WebSocket…');
    }else if(phase==='connected'){
      stopCountdown();
      pairProgress('connected','Đã kết nối XiaoZhi. Đang mở giao diện BilaBot…');
      if(ui('bb-code-hint'))ui('bb-code-hint').textContent='Thiết bị đã hoạt động. Nhấn micro để cấp quyền và bắt đầu trò chuyện.';
      if(ui('bb-pair-start'))ui('bb-pair-start').disabled=false;
      setTimeout(()=>{
        if(currentPhase==='connected'){
          document.body.classList.add('bilabot-open');
          window.BilaBotDirect?.closeSetup?.({ restoreFocus: false });
        }
      },700);
    }else if(phase==='disconnected'){
      if(currentPhase==='connected'){
        pairProgress('disconnected','WebSocket đã ngắt; mở trò chuyện và nhấn Kết nối để thử lại.');
      }else if(currentPhase!=='error'&&currentPhase!=='cancelled'){
        handlePairingEvent({detail:{phase:'error',message:d.message||'XiaoZhi đóng WebSocket trước khi xác nhận kết nối.'}});
      }
    }else if(phase==='cancelled'){
      stopCountdown();lastActivationCode='';
      if(ui('bb-code-actions'))ui('bb-code-actions').hidden=true;
      if(ui('bb-code-value'))ui('bb-code-value').textContent='— — — — — —';
      if(ui('bb-code-hint'))ui('bb-code-hint').textContent='Bạn có thể nhấn Lấy mã để bắt đầu lại.';
      pairProgress('cancelled','Đã hủy ghép nối. Bạn có thể lấy mã mới khi sẵn sàng.');
      if(ui('bb-pair-start'))ui('bb-pair-start').disabled=false;
    }else if(phase==='error'){
      if(suppressCancelledError&&/hủy ghép nối|cancelled/i.test(String(d.message||''))){
        suppressCancelledError=false;return;
      }
      stopCountdown();
      const message=String(d.message||'Không thể lấy mã hoặc kết nối tới XiaoZhi.');
      pairProgress('error',message);
      showError(message);
      if(ui('bb-pair-start'))ui('bb-pair-start').disabled=false;
      if(ui('bb-code-hint')&&!lastActivationCode)ui('bb-code-hint').textContent='Không có mã giả. Kiểm tra kết nối và nhấn Lấy mã để thử lại.';
    }
  }
  let appInitError='';
  window.addEventListener('bilabot:app-error',e=>{appInitError=e.detail?.message||'BilaBot chưa khởi tạo được.';});
  window.addEventListener('bilabot:pairing',handlePairingEvent);
  async function startPair(){
    if(pairingInFlight)return pairingInFlight;
    hideError();
    if(ui('bb-pair-start'))ui('bb-pair-start').disabled=true;
    handlePairingEvent({detail:{phase:'checking'}});
    pairingInFlight=(async()=>{
      try{
        if(settings.mode==='gateway')await ensureSession();
        // Leave the setup card visible while OTA responds and the user enters
        // the code at xiaozhi.me. The app opens only after server hello.
        for(let i=0;i<150;i++){
          if(appInitError)throw new Error('Không khởi tạo được BilaBot: '+appInitError);
          if(window.BilaBotAppReady && window.XiaozhiDebug?.quickTest){
            await window.XiaozhiDebug.quickTest();
            return;
          }
          await new Promise(resolve=>setTimeout(resolve,120));
        }
        throw new Error('Giao diện BilaBot chưa khởi tạo trên thiết bị này. Tải lại trang hoặc kiểm tra nhật ký trình duyệt.');
      }catch(e){
        handlePairingEvent({detail:{phase:'error',message:e?.message||'Không thể ghép nối.'}});
      }
    })().finally(()=>{
      pairingInFlight=null;
      // Keep the activation button locked while the new WS awaits server hello.
      if(ui('bb-pair-start')&&['idle','connected','error','cancelled','disconnected'].includes(currentPhase))
        ui('bb-pair-start').disabled=false;
    });
    return pairingInFlight;
  }
  ui('bb-copy-code')?.addEventListener('click',async()=>{
    if(!lastActivationCode)return;
    try{
      await navigator.clipboard.writeText(lastActivationCode);
      if(ui('bb-code-hint'))ui('bb-code-hint').textContent='Đã sao chép! Dán mã vào mục Thêm thiết bị trên XiaoZhi.';
    }catch{
      if(ui('bb-code-hint'))ui('bb-code-hint').textContent='Không thể truy cập clipboard. Hãy chọn mã phía trên và sao chép thủ công.';
    }
  });
  ui('bb-pair-start')?.addEventListener('click',startPair);
  ui('bb-cancel-pair')?.addEventListener('click',()=>{
    suppressCancelledError=true;
    try{window.XiaozhiDebug?.provisioning?.cancel();}catch{}
    handlePairingEvent({detail:{phase:'cancelled'}});
  });
  ui('bb-health-check')?.addEventListener('click',async()=>{
    hideError();
    try{await health(true);setStatus('Cloudflare gateway đã sẵn sàng; có thể lấy mã OTA thực.');}
    catch(e){showError(e.message);}
  });
  ui('bb-open-app')?.addEventListener('click',()=>document.body.classList.add('bilabot-open'));
  // Direct setup owns #bb-return-home; never hide the actual Olivia app.
  // The assistant UI remains accessible while the OTA drawer is open.
  ui('bb-save-config')?.addEventListener('click',()=>{
    const url=ui('bb-api-input').value.trim().replace(/\/+$/,'');
    const mode=ui('bb-relay-mode').value;
    if(url&&!fixed.sameOrigin&&url!==settings.workerUrl&&!confirm(
      'Worker do bạn chọn sẽ nhận token thiết bị và âm thanh của bạn. Chỉ kết nối Worker mà bạn tin cậy. Tiếp tục?'))return;
    localStorage.setItem(SAVE,JSON.stringify({workerUrl:fixed.sameOrigin?location.origin:url,mode}));
    sessionStorage.removeItem(SESSION);location.reload();
  });
  if(ui('bb-api-input'))ui('bb-api-input').value=settings.workerUrl;
  if(ui('bb-relay-mode'))ui('bb-relay-mode').value=settings.mode;
  if(settings.mode==='direct'){
    setGatewayStatus('checking','Chế độ trực tiếp — chưa kiểm tra');
    setStatus('Chỉ dùng trực tiếp với máy chủ hỗ trợ CORS và không yêu cầu header WebSocket tùy chỉnh.');
  }else if(!validBase()){
    setGatewayStatus('error','Chưa cấu hình Cloudflare gateway');
    setStatus('Máy chủ chưa được chủ dự án thiết lập. Khi cấu hình hoàn tất, bạn chỉ cần nhấn Lấy mã kích hoạt.');
  }else{
    setGatewayStatus('checking','Đang kiểm tra gateway…');
    setStatus('Mở XiaoZhi.me, đăng nhập và chuẩn bị nhận mã OTA.');
    if(typeof window.fetch==='function')
      health().then(()=>setStatus('Gateway đã sẵn sàng. Nhấn Lấy mã kích hoạt để bắt đầu.'))
        .catch(e=>{setStatus(e.message);});
  }
  window.BilaBotBridge={
    get mode(){return settings.mode;},
    get apiBase(){return settings.workerUrl;},
    get sessionToken(){return transportSession&&expiresAt>Date.now()+10_000?transportSession:'';},
    ensureSession, startPair, official,
    get isSetupOpen(){return Boolean(window.BilaBotDirect?.isOpen?.());},
    openSetup(){window.BilaBotDirect?.openSetup?.();},
    closeSetup(){window.BilaBotDirect?.closeSetup?.();}
  };
})();
