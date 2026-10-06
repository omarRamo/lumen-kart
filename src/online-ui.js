import { NetworkClient, defaultServerURL } from './network.js';
import './online.css';
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
    else try { this.serverURL=validServer(localStorage.getItem('tkr-server'))||undefined; } catch {}
    this.options={name:'Racer',character:'lumen',config:{trackId:'palm-cove',difficulty:'medium',laps:3},...options};
    this.panel=document.createElement('section');this.panel.className='online-overlay';this.root.append(this.panel);this.render();
  }
  render(message='') {
    const room=this.client?.room;
    this.panel.innerHTML=`<div class="online-card"><h2>Race online</h2><p class="online-note">Friends or new rivals · up to 8 racers</p>${room ? this.lobby(room) : `<label>Racer name<input data-name maxlength="20" value="${escapeHTML(this.options.name)}" autocomplete="nickname"></label><details><summary>Server connection</summary><label>WebSocket server<input data-server type="url" value="${escapeHTML(this.serverURL||defaultServerURL())}" placeholder="wss://your-server/ws"></label><p>Phones must use a reachable hosted server or your computer’s LAN IP.</p></details><div class="online-actions"><button data-create>Create private room</button><button data-match>Find public race</button></div><label>Friend’s room code<input data-code maxlength="6" autocapitalize="characters" placeholder="ABC123" value="${escapeHTML(new URL(location.href).searchParams.get('room')||'')}"></label><button data-join>Join friend</button>`}<p class="online-status" role="status">${escapeHTML(message)}</p><button class="online-back" data-back>${room?'Leave room':'Back'}</button></div>`;
    const bind=(selector,callback)=>this.panel.querySelector(selector)?.addEventListener('click',callback);
    bind('[data-back]',()=> {if(this.client?.room){this.client.leave();this.render();}else this.close();});
    bind('[data-create]',()=>this.enter('create'));bind('[data-match]',()=>this.enter('match'));bind('[data-join]',()=>this.enter('join'));
    bind('[data-ready]',()=>this.client.ready(!room.players.find(p=>p.id===this.client.playerId)?.ready));
    bind('[data-start]',()=>this.client.start());
    bind('[data-copy]',async()=> {const url=new URL(location.href);url.searchParams.set('room',room.code);
      const server=validServer(this.client.url); if(server)url.searchParams.set('server',server);
      if(location.protocol==='capacitor:' || ['localhost','127.0.0.1'].includes(location.hostname)) {this.render(`Share code ${room.code} and server ${server}. Local app links cannot open on another device.`);return;}
      try {await navigator.clipboard.writeText(url.href);this.render('Invite link copied.');}catch{this.render(`Share room code ${room.code}`);}});
  }
  lobby(room) {
    const me=room.players.find(p=>p.id===this.client.playerId);const ready=room.players.length>=2&&room.players.every(p=>p.ready);
    return `<p class="online-code">${room.public?'Public room':'Private room'} <strong>${escapeHTML(room.code)}</strong></p><button data-copy>Copy invite link</button><p>${escapeHTML(room.config.trackId)} · ${escapeHTML(room.config.difficulty)} · ${room.config.laps} laps</p><ul class="online-roster">${room.players.map(p=>`<li><span>${escapeHTML(p.name)} ${p.id===room.hostId?'♛':''}${p.id===this.client.playerId?' (you)':''}</span><span>${p.ready?'✓ Ready':'Choosing tires…'}</span></li>`).join('')}</ul><button data-ready>${me?.ready?'Not ready':'Ready to race'}</button>${this.client.isHost?`<button data-start ${ready?'':'disabled'}>Start race</button>`:'<p>Host starts when everyone is ready.</p>'}<p class="online-note">${room.players.length<2?'Waiting for another racer…':'All racers must ready up.'}</p>`;
  }
  async enter(action) {
    if(this.connecting)return;
    const generation=this.generation;
    const name=this.panel.querySelector('[data-name]')?.value||'Racer';const code=this.panel.querySelector('[data-code]')?.value||'';
    this.serverURL=validServer(this.panel.querySelector('[data-server]')?.value||defaultServerURL());this.options.name=name;
    if(!this.serverURL){this.render('Enter a valid ws:// or wss:// server address.');return;}
    if(action==='join'&&!/^[A-Za-z0-9]{6}$/.test(code)) {this.render('Enter the six-character room code.');return;}
    this.connecting=true;
    this.panel.querySelectorAll('button:not([data-back])').forEach(b=>b.disabled=true);
    this.panel.querySelector('[role=status]').textContent='Connecting…';
    try {
      if(!this.client||this.client.url!==this.serverURL||this.client.ws?.readyState!==WebSocket.OPEN) {
        this.client?.disconnect();const client=this.client=new NetworkClient({url:this.serverURL});
        client.addEventListener('room',()=> {if(this.client===client && this.panel?.isConnected)this.render();});
        client.addEventListener('error',e=> {if(this.client===client && this.panel?.isConnected)this.render(e.detail.message);});
        client.addEventListener('closed',e=> {if(this.client===client && this.panel?.isConnected)this.render(e.detail.reason);});
        client.addEventListener('start',e=> {if(this.client!==client || !this.panel?.isConnected)return;this.panel.remove();this.onStart?.(client,e.detail);});
        await client.connect();
        try { localStorage.setItem('tkr-server', this.serverURL); } catch {}
        if(generation!==this.generation || !this.panel?.isConnected){client.disconnect();return;}
      }
      const payload={...this.options,name};if(action==='join')this.client.join(code,payload);else this.client[action](payload);
    } catch(error) {if(generation===this.generation && this.panel?.isConnected)this.render(error.message);}
    finally {if(generation===this.generation)this.connecting=false;}
  }
  close() {this.generation=(this.generation||0)+1;this.panel?.remove();this.client?.disconnect();this.connecting=false;this.onClose?.();}
}
