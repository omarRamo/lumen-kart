import { NetworkClient, defaultServerURL } from './network.js';
import './online.css';
import { t } from './i18n.js';
function validServer(value) {
  try { const url=new URL(value); return ['ws:','wss:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class OnlineUI {
  constructor({root=document.body,onStart,onClose}={}) {this.root=root;this.onStart=onStart;this.onClose=onClose;}
  show(options={}) {
    this.panel?.remove(); this.client?.disconnect(); this.client=null; this.connecting=false; this.generation=(this.generation||0)+1;
    const inviteServer=new URL(location.href).searchParams.get('server');
    if(inviteServer) this.serverURL=validServer(inviteServer)||undefined;
    else try { this.serverURL=validServer(localStorage.getItem('lumenkart.server'))||undefined; } catch {}
    this.options={name:'Lumen',character:'lumen',config:{trackId:'palm-cove',difficulty:'medium',laps:3},...options};
    this.panel=document.createElement('section');this.panel.className='online-overlay';this.root.append(this.panel);this.render();
  }
  render(message='') {
    const room=this.client?.room;
    this.panel.innerHTML=`<div class="online-card"><h2>${escapeHTML(t('online.title'))}</h2><p class="online-note">${escapeHTML(t('online.note'))}</p>${room ? this.lobby(room) : `<label>${escapeHTML(t('online.name'))}<input data-name maxlength="20" value="${escapeHTML(this.options.name)}" autocomplete="nickname"></label><details><summary>${escapeHTML(t('online.server'))}</summary><label>${escapeHTML(t('online.serverLabel'))}<input data-server type="url" value="${escapeHTML(this.serverURL||defaultServerURL())}" placeholder="wss://your-server/ws"></label><p>${escapeHTML(t('online.serverHint'))}</p></details><div class="online-actions"><button data-create>${escapeHTML(t('online.create'))}</button><button data-match>${escapeHTML(t('online.match'))}</button></div><label>${escapeHTML(t('online.code'))}<input data-code maxlength="6" autocapitalize="characters" placeholder="ABC123" value="${escapeHTML(new URL(location.href).searchParams.get('room')||'')}"></label><button data-join>${escapeHTML(t('online.join'))}</button>`}<p class="online-status" role="status">${escapeHTML(message)}</p><button class="online-back" data-back>${escapeHTML(room?t('online.leave'):t('online.back'))}</button></div>`;
    const bind=(selector,callback)=>this.panel.querySelector(selector)?.addEventListener('click',callback);
    bind('[data-back]',()=> {if(this.client?.room){this.client.leave();this.render();}else this.close();});
    bind('[data-create]',()=>this.enter('create'));bind('[data-match]',()=>this.enter('match'));bind('[data-join]',()=>this.enter('join'));
    bind('[data-ready]',()=>this.client.ready(!room.players.find(p=>p.id===this.client.playerId)?.ready));
    bind('[data-start]',()=>this.client.start());
    bind('[data-copy]',async()=> {const url=new URL(location.href);url.searchParams.set('room',room.code);
      const server=validServer(this.client.url); if(server)url.searchParams.set('server',server);
      if(location.protocol==='capacitor:' || ['localhost','127.0.0.1'].includes(location.hostname)) {this.render(t('online.shareLocal',{code:room.code,server}));return;}
      try {await navigator.clipboard.writeText(url.href);this.render(t('online.copied'));}catch{this.render(t('online.shareCode',{code:room.code}));}});
  }
  lobby(room) {
    const me=room.players.find(p=>p.id===this.client.playerId);const ready=room.players.length>=2&&room.players.every(p=>p.ready);
    return `<p class="online-code">${escapeHTML(t(room.public?'online.public':'online.private'))} <strong>${escapeHTML(room.code)}</strong></p><button data-copy>${escapeHTML(t('online.copy'))}</button><p>${escapeHTML(room.config.trackId)} · ${escapeHTML(room.config.difficulty)} · ${escapeHTML(t('online.laps',{n:room.config.laps}))}</p><ul class="online-roster">${room.players.map(p=>`<li><span>${escapeHTML(p.name)} ${p.id===room.hostId?'♛':''}${p.id===this.client.playerId?' '+escapeHTML(t('online.you')):''}</span><span>${escapeHTML(t(p.ready?'online.ready':'online.choosing'))}</span></li>`).join('')}</ul><button data-ready>${escapeHTML(t(me?.ready?'online.notReady':'online.readyUp'))}</button>${this.client.isHost?`<button data-start ${ready?'':'disabled'}>${escapeHTML(t('online.start'))}</button>`:`<p>${escapeHTML(t('online.hostStarts'))}</p>`}<p class="online-note">${escapeHTML(t(room.players.length<2?'online.waiting':'online.allReady'))}</p>`;
  }
  async enter(action) {
    if(this.connecting)return;
    const generation=this.generation;
    const name=this.panel.querySelector('[data-name]')?.value||'Racer';const code=this.panel.querySelector('[data-code]')?.value||'';
    this.serverURL=validServer(this.panel.querySelector('[data-server]')?.value||defaultServerURL());this.options.name=name;
    if(!this.serverURL){this.render(t('online.badServer'));return;}
    if(action==='join'&&!/^[A-Za-z0-9]{6}$/.test(code)) {this.render(t('online.badCode'));return;}
    this.connecting=true;
    this.panel.querySelectorAll('button:not([data-back])').forEach(b=>b.disabled=true);
    this.panel.querySelector('[role=status]').textContent=t('online.connecting');
    try {
      if(!this.client||this.client.url!==this.serverURL||this.client.ws?.readyState!==WebSocket.OPEN) {
        this.client?.disconnect();const client=this.client=new NetworkClient({url:this.serverURL});
        client.addEventListener('room',()=> {if(this.client===client && this.panel?.isConnected)this.render();});
        client.addEventListener('error',e=> {if(this.client===client && this.panel?.isConnected)this.render(e.detail.message);});
        client.addEventListener('closed',e=> {if(this.client===client && this.panel?.isConnected)this.render(e.detail.reason);});
        client.addEventListener('start',e=> {if(this.client!==client || !this.panel?.isConnected)return;this.panel.remove();this.onStart?.(client,e.detail);});
        await client.connect();
        try { localStorage.setItem('lumenkart.server', this.serverURL); } catch {}
        if(generation!==this.generation || !this.panel?.isConnected){client.disconnect();return;}
      }
      const payload={...this.options,name};if(action==='join')this.client.join(code,payload);else this.client[action](payload);
    } catch(error) {if(generation===this.generation && this.panel?.isConnected)this.render(error.message);}
    finally {if(generation===this.generation)this.connecting=false;}
  }
  close() {this.generation=(this.generation||0)+1;this.panel?.remove();this.client?.disconnect();this.connecting=false;this.onClose?.();}
}
