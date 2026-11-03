/* TrinhDuyet virtual ESP32 bridge — communicates status, never auth tokens.
 * This file runs in the same-origin native BilaBot device iframe.
 */
(() => {
  'use strict';
  const origin = window.location.origin;
  function emit(phase, extras={}) {
    if(window.parent===window) return;
    const message = { type:'trinhduyet:device', phase,
      ...extras };
    try { window.parent.postMessage(message,origin); } catch {}
  }
  function report() {
    const api=window.XiaozhiDebug;
    const active=api?.assistants?.getActiveId?.();
    if(!active) {emit('booting');return}
    const connected=Boolean(api?.protocol?.isConnected?.());
    const paired=Boolean(api?.assistants?.isPairedById?.(active));
    emit(connected?'connected':paired?'paired':'ready');
  }
  window.addEventListener('bilabot:app-ready',()=>{ emit('ready'); report(); });
  window.addEventListener('bilabot:app-error',e=>emit('error',{message:String(e.detail?.message||'Khởi tạo thiết bị không thành công').slice(0,220)}));
  window.addEventListener('bilabot:pairing',e=>{
    const details=e.detail||{};
    const phase=String(details.phase||'').toLowerCase();
    if(!['checking','code','paired','connecting','connected','error','cancelled','disconnected'].includes(phase))return;
    const detail={};
    if(phase==='code' && /^\d{6}$/.test(String(details.code||'')))detail.code=String(details.code);
    if(phase==='error')detail.message=String(details.message||'Không thể kết nối tới XiaoZhi').slice(0,220);
    emit(phase,detail);
  });
  window.addEventListener('message',async e=>{
    if(e.origin!==origin||e.source!==window.parent||e.data?.type!=='trinhduyet:command')return;
    if(e.data.action==='status'){report();return}
    if(e.data.action==='pair'){
      if(typeof window.BilaBotBridge?.startPair!=='function'){
        emit('error',{message:'Lõi ESP32 chưa khởi tạo, hãy tải lại ứng dụng'});return;
      }
      try{
        emit('checking');
        await window.BilaBotBridge.startPair();
      }catch(err){emit('error',{message:String(err?.message||'Không lấy được mã kích hoạt').slice(0,220)})}
    }
    if(e.data.action==='connect'){
      if(!window.XiaozhiDebug?.app?.connect) {
        emit('error',{message:'Thiết bị chưa sẵn sàng kết nối'});return;
      }
      try{emit('connecting');await window.XiaozhiDebug.app.connect();}
      catch(err){emit('error',{message:String(err?.message||'Không thể kết nối').slice(0,220)})}
    }
    if(e.data.action==='reset'){
      try{window.BilaBotBridge?.closeSetup?.()}catch{}
      report();
    }
  });
  if(window.BilaBotAppReady)report();
  else window.setTimeout(report,1800);
})();
