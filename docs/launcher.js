/* ESP32 web launcher — a real Xiaozhi virtual device state-machine UI.
 * The protocol runs in ./device/index.html (vendored BilaBot/Olivia).
 * Pairing codes and connection states come from that device, never simulated.
 */
(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  const frame=el('native-esp32');
  const stateText=el('status-message');
  const viewerState=el('viewer-state');
  const dot=el('device-indicator');
  const codeBlock=el('activation-block');
  const codeText=el('activation-code');
  const copyButton=el('copy-activation');
  const pairButton=el('pair-device');
  const connectButton=el('connect-device');
  const statusLabels={
    booting:'Đang khởi động ESP32 ảo…',
    ready:'ESP32 ảo đã mở. Nhấn “Lấy mã và ghép thiết bị” để kết nối XiaoZhi.',
    checking:'Đang yêu cầu thông tin OTA từ XiaoZhi…',
    code:'Đã nhận mã kích hoạt thật. Nhập mã tại XiaoZhi, sau đó đợi máy chủ xác nhận.',
    paired:'XiaoZhi đã xác nhận ghép nối. Đang thiết lập đường truyền…',
    connecting:'Đang kết nối WebSocket tới XiaoZhi…',
    connected:'Kết nối XiaoZhi thành công. Bạn có thể trò chuyện trong khung thiết bị.',
    disconnected:'Đường truyền đã ngắt. Nhấn Kết nối để thử lại.',
    cancelled:'Đã hủy ghép nối. Bạn có thể lấy mã mới.',
    error:'Không kết nối được XiaoZhi. Kiểm tra gateway và thử lại.'
  };
  const phases=new Set(Object.keys(statusLabels));
  let phase='booting', lastCode='', frameLoaded=false;
  let lastError='';
  const mark=(step,status)=>{
    for(const node of document.querySelectorAll('.progress-step')){
      const order=['open','pair','chat'];
      const index=order.indexOf(step);
      const nodeIndex=order.indexOf(node.dataset.step);
      node.classList.toggle('current',nodeIndex===index);
      node.classList.toggle('done',nodeIndex<index);
    }
    for(const key of ['open','pair','chat']){
      const node=el('action-'+key);
      node?.classList.toggle('active',key===step);
      node?.classList.toggle('done',['open','pair','chat'].indexOf(key)<['open','pair','chat'].indexOf(step));
    }
  };
  function render(next, extras={}) {
    if(!phases.has(next)) return;
    phase=next;
    if(next==='code'){
      if(/^\d{6}$/.test(String(extras.code||''))){
        lastCode=String(extras.code);
        codeText.textContent=lastCode;
        codeBlock.hidden=false;
      }
    }else if(next==='checking'||next==='connected'||next==='cancelled'){
      lastCode=''; codeText.textContent='······';codeBlock.hidden=true;
    }
    lastError=next==='error'?String(extras.message||'').slice(0,240):'';
    stateText.textContent=lastError||statusLabels[next];
    viewerState.textContent=next==='connected'?'Đã kết nối XiaoZhi':
      next==='code'?'Chờ ghép mã':
      next==='paired'?'Đã ghép nối':
      next==='error'?'Lỗi kết nối':next==='ready'?'ESP32 ảo sẵn sàng':'Đang kết nối';
    dot.className='state-indicator';
    if(next==='connected')dot.classList.add('connected');
    else if(next==='checking'||next==='code'||next==='connecting')dot.classList.add('connecting');
    else if(next==='error')dot.classList.add('error');
    else if(next==='ready'||next==='paired')dot.classList.add('ready');
    const step=(next==='connected')?'chat':
      (['checking','code','paired','connecting'].includes(next) || (next==='error' && frameLoaded))?'pair':'open';
    mark(step);
    pairButton.disabled=(next==='checking'||next==='connecting'||next==='code');
    connectButton.disabled=(next==='checking'||next==='code'||next==='connecting');
    connectButton.textContent=next==='connected'?'Đã kết nối · Mở khung chat ↗':'Kết nối & trò chuyện →';
    if(next==='code') el('action-pair')?.scrollIntoView?.({block:'nearest'});
  }
  function command(action){
    if(!frameLoaded || !frame.contentWindow){
      render('error',{message:'Thiết bị chưa khởi động. Nhấn Tải lại và đợi khung ESP32 sẵn sàng.'});
      return false;
    }
    frame.contentWindow.postMessage({type:'trinhduyet:command',action},window.location.origin);
    return true;
  }
  window.addEventListener('message',e=>{
    if(e.origin!==window.location.origin || e.source!==frame.contentWindow ||
       e.data?.type!=='trinhduyet:device')return;
    const next=String(e.data.phase||'');
    if(next==='ready'||next==='paired'||next==='connected'||next==='code')frameLoaded=true;
    render(next,{code:e.data.code,message:e.data.message});
  });
  frame.addEventListener('load',()=>{
    frameLoaded=true;
    render('booting');
    command('status');
  });
  frame.addEventListener('error',()=>render('error',{message:'Không tải được mã nguồn ESP32 ảo. Kiểm tra đường dẫn thiết bị.'}));
  el('open-device').addEventListener('click',()=>{
    if(!frameLoaded){frame.src=frame.src;render('booting');return;}
    command('status');frame.scrollIntoView({behavior:'smooth',block:'start'});
    try{frame.focus()}catch{}
  });
  pairButton.addEventListener('click',()=>{
    if(command('pair'))render('checking');
  });
  connectButton.addEventListener('click',()=>{
    if(phase==='connected'){frame.scrollIntoView({behavior:'smooth',block:'start'});frame.focus();return;}
    if(phase==='code'){stateText.textContent='Hãy nhập mã tại XiaoZhi và đợi xác nhận trước khi trò chuyện.';return;}
    if(command('connect'))render('connecting');
  });
  copyButton.addEventListener('click',async ()=>{
    if(!/^\d{6}$/.test(lastCode))return;
    try{await navigator.clipboard.writeText(lastCode);copyButton.textContent='Đã sao chép';}
    catch{copyButton.textContent='Hãy chọn mã để sao chép';}
  });
  el('reload-device').addEventListener('click',()=>{
    frameLoaded=false; lastCode='';codeBlock.hidden=true;render('booting');
    const url=new URL(frame.getAttribute('src'),location.href);
    frame.src=url.href;
  });
  render('booting');
})();
