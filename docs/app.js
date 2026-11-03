(() => {
  'use strict';
  const cfg = window.ESP32_CLOUD_CONFIG || {};
  const base = (cfg.apiBase || '').replace(/\/+$/, '');
  const id = (s) => document.getElementById(s);
  let token = null;
  let devices = [];
  const views = {chat:'TRÒ CHUYỆN AI',overview:'TỔNG QUAN',devices:'THIẾT BỊ ESP32',virtual:'ESP32 ẢO',ota:'FIRMWARE OTA',guide:'TÀI LIỆU'};
  function notify(message, bad=false) {
    const node=id('toast');
    node.textContent=message;
    node.className=bad?'toast error':'toast';
    window.clearTimeout(notify.timer);
    notify.timer=window.setTimeout(()=>{node.className='';node.textContent=''},5000);
  }
  function show(view) {
    for (const [key] of Object.entries(views)) id('view-'+key).hidden=(view!==key);
    document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
    id('view-name').textContent=views[view]||views.overview;
    history.replaceState(null,'','#'+view);
  }
  async function request(route, options={}) {
    if (!base) throw Error('Chưa cấu hình PUBLIC_API_URL trên Cloudflare Pages.');
    const headers={'Content-Type':'application/json',...options.headers};
    if (token) headers.Authorization='Bearer '+token;
    let res;
    try {
      res=await fetch(base+route,{...options,headers,cache:'no-store'});
    } catch { throw Error('Không kết nối được Render API. Kiểm tra URL, CORS và trạng thái Render.'); }
    let json;
    try {json=await res.json()} catch {throw Error('Máy chủ không trả JSON hợp lệ')}
    if (!res.ok) {
      if(res.status===401 && route!=='/api/health') notify('Phiên Google không hợp lệ. Đăng nhập lại.',true);
      throw Error(json.error||('HTTP '+res.status));
    }
    return json;
  }
  async function health() {
    id('api-status').textContent='Đang kiểm tra';
    try {
      const result=await request('/api/health');
      const ok=result.status==='ok';
      const setup=result.status==='setup_required';
      id('api-status').textContent=ok?'Trực tuyến':setup?'Chờ cấu hình':'Có lỗi';
      id('service-health').textContent=ok?'SẴN SÀNG':setup?'CHỜ '+((result.missing||[]).join(', ')||'CẤU HÌNH'):'LỖI';
      id('service-health').title=setup?'Còn thiếu: '+(result.missing||[]).join(', '):'';
      id('api-dot').classList.toggle('online',ok);
    } catch(e) {
      id('api-dot').classList.remove('online');
      id('api-status').textContent='Chưa kết nối';
      id('service-health').textContent='CHƯA KẾT NỐI';
      id('service-health').title=e.message;
    }
  }
  async function loadDevices() {
    if (!token) return;
    try {
      devices=(await request('/api/devices')).devices||[];
      const total=devices.length, active=devices.filter(x=>x.status==='active').length;
      const now=Date.now();
      const online=devices.filter(x=>x.lastSeen && now-new Date(x.lastSeen).getTime()<120000).length;
      id('stat-total').textContent=String(total);
      id('stat-active').textContent=String(active);
      id('stat-online').textContent=String(online);
      renderDevices();
    } catch(e) {notify(e.message,true);}
  }
  function renderDevices() {
    const holder=id('device-list');
    holder.replaceChildren();
    if(!devices.length) {const d=document.createElement('div');d.className='empty-state';d.textContent='Chưa có thiết bị. Đăng ký thiết bị đầu tiên ở trên.';holder.append(d);return;}
    for(const dev of devices) {
      const card=document.createElement('article');card.className='device-card';
      const icon=document.createElement('div');icon.className='board-icon';icon.textContent='▣';
      const details=document.createElement('div');details.className='device-info';
      const name=document.createElement('strong');name.textContent=dev.name;
      const meta=document.createElement('small');meta.textContent=dev.board+' · '+dev.id;
      const ver=document.createElement('small');ver.textContent='Firmware: '+(dev.firmwareVersion||'chưa có')+' · lần cuối: '+(dev.lastSeen?new Date(dev.lastSeen).toLocaleString('vi-VN'):'chưa kết nối');
      details.append(name,meta,ver);
      const pill=document.createElement('span');pill.className='state '+(dev.status==='active'?'active':'');pill.textContent=dev.status==='active'?'ĐÃ KÍCH HOẠT':'CHỜ GHÉP NỐI';
      card.append(icon,details,pill);holder.append(card);
    }
  }
  function authenticated(user) {
    id('profile').textContent=user.email||user.name;
    id('login-help').textContent='Đã xác minh danh tính · '+(user.email||'');
    id('logout').hidden=false;
    loadDevices();
  }
  function setupGoogle() {
    if(!cfg.googleClientId) {
      id('login-help').textContent='Chưa cấu hình PUBLIC_GOOGLE_CLIENT_ID.';
      return;
    }
    if(!window.google?.accounts?.id) {
      id('login-help').textContent='Không tải được Google Identity Services. Kiểm tra trình duyệt hoặc trình chặn nội dung.';
      return;
    }
    id('google-status').textContent='SẴN SÀNG';
    google.accounts.id.initialize({
      client_id:cfg.googleClientId,
      callback:async (response)=>{
        token=response.credential;
        try {const a=await request('/api/me');authenticated(a.user);notify('Đã đăng nhập Google');}
        catch(e){token=null;notify(e.message,true);}
      }
    });
    google.accounts.id.renderButton(id('google-button'),{theme:'outline',size:'large',text:'signin_with',width:260});
    id('login-help').textContent='Đăng nhập để bắt đầu quản lý ESP32.';
  }
  document.querySelectorAll('[data-view]').forEach(n=>n.addEventListener('click',()=>show(n.dataset.view)));
  id('go-virtual').addEventListener('click',()=>show('virtual'));
  id('refresh-health').addEventListener('click',health);
  id('reload-devices').addEventListener('click',loadDevices);
  id('logout').addEventListener('click',()=>{
    token=null;devices=[];renderDevices();
    ['stat-total','stat-active','stat-online'].forEach(s=>id(s).textContent='—');
    id('profile').textContent='Chưa đăng nhập';
    id('login-help').textContent='Đã đăng xuất khỏi bảng điều khiển.';
    id('logout').hidden=true;
    if(window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
    notify('Đã đăng xuất');
  });
  id('create-device').addEventListener('submit',async(e)=>{
    e.preventDefault();
    if(!token){notify('Vui lòng đăng nhập Google trước',true);return;}
    try {
      const a=await request('/api/devices',{method:'POST',body:JSON.stringify({
        name:id('device-name').value,board:id('device-board').value
      })});
      const config='DEVICE_ID='+a.device.id+'\nDEVICE_KEY='+a.deviceKey+'\nAPI_URL='+base;
      id('credentials-text').textContent=config;
      id('new-credentials').hidden=false;
      id('copy-credentials').onclick=()=>navigator.clipboard.writeText(config).then(()=>notify('Đã sao chép cấu hình')).catch(()=>notify('Không thể sao chép',true));
      id('create-device').reset();
      await loadDevices();
      notify('Đã đăng ký. Hãy lưu khóa an toàn ngay.');
    } catch(err){notify(err.message,true);}
  });
  id('claim-device').addEventListener('submit',async(e)=>{
    e.preventDefault();
    if(!token){notify('Vui lòng đăng nhập Google trước',true);return;}
    const code=id('pair-code').value.trim();
    if(!/^[0-9]{6}$/.test(code)){notify('Nhập đúng 6 chữ số',true);return;}
    try{
      await request('/api/devices/claim',{method:'POST',body:JSON.stringify({code})});
      id('claim-device').reset();await loadDevices();notify('Ghép nối thiết bị thành công');
    }catch(err){notify(err.message,true);}
  });
  show(views[location.hash.slice(1)]?location.hash.slice(1):'chat');
  health();
  // Google Identity script is deferred; retry briefly while it initializes.
  let checks=0;
  const run=()=>{
    if(window.google?.accounts?.id || ++checks>=30) setupGoogle();
    else setTimeout(run,200);
  };
  run();
})();
