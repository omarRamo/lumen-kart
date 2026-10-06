// Native wrappers can set VITE_WS_URL at build time. Browser development defaults to port 8787.
export function defaultServerURL() {
  const configured = import.meta.env?.VITE_WS_URL;
  if (configured) return configured;
  const local = ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.hostname}${local ? ':8787' : location.port ? ':' + location.port : ''}/ws`;
}
export class NetworkClient extends EventTarget {
  constructor({url = defaultServerURL()} = {}) {
    super(); this.url=url; this.playerId=null; this.room=null; this.latestInputs=new Map(); this.latestSnapshot=null; this.inputTimes=new Map();
  }
  get isHost() { return !!this.room && this.room.hostId===this.playerId; }
  emit(type,detail) { this.dispatchEvent(new CustomEvent(type,{detail})); }
  connect() {
    if(this.ws?.readyState===WebSocket.OPEN) return Promise.resolve(this);
    return new Promise((resolve,reject)=> {
      let settled=false;
      const ws=this.ws=new WebSocket(this.url);
      const timer=setTimeout(()=> {if(!settled) {settled=true;ws.close();reject(new Error('Connection timed out. Check the server address.'));}},8000);
      ws.addEventListener('message',event=> {
        let m; try {m=JSON.parse(event.data);} catch {return;}
        if(m.type==='welcome') {this.playerId=m.playerId;settled=true;clearTimeout(timer);resolve(this);}
        else if(m.type==='room') {this.room=m.room;this.emit('room',m.room);}
        else if(m.type==='start') {this.room=m.room;this.latestInputs.clear();this.inputTimes.clear();this.latestSnapshot=null;this._itemPending=false;this.emit('start',m);}
        else if(m.type==='input') {
          const previous=this.latestInputs.get(m.playerId);
          this.latestInputs.set(m.playerId,{...m.controls,item:m.controls.item||previous?.item||false}); this.inputTimes.set(m.playerId,performance.now());
        } else if(m.type==='snapshot') {this.latestSnapshot=m.snapshot;this.emit('snapshot',m.snapshot);}
        else if(m.type==='closed') {this.room=null;this.emit('closed',{reason:m.reason});}
        else if(m.type==='left') {this.room=null;this.emit('left',{});}
        else if(m.type==='error') this.emit('error',{message:m.message});
      });
      ws.addEventListener('error',()=> {if(!settled) {settled=true;clearTimeout(timer);reject(new Error('Could not connect to the race server.'));}});
      ws.addEventListener('close',()=> {clearTimeout(timer);if(!settled) {settled=true;reject(new Error('Race server connection closed.'));}this.room=null;this.emit('closed',{reason:'Disconnected from the race server.'});});
    });
  }
  send(message) { if(this.ws?.readyState===WebSocket.OPEN) this.ws.send(JSON.stringify(message)); }
  create(options={}) {this.send({type:'create',...options});}
  join(code,options={}) {this.send({type:'join',code:code.trim().toUpperCase(),...options});}
  match(options={}) {this.send({type:'match',...options});}
  ready(ready) {this.send({type:'ready',ready});}
  start() {this.send({type:'start'});}
  leave() {this.send({type:'leave'});this.room=null;this.latestInputs.clear();this.inputTimes.clear();this.latestSnapshot=null;this._itemPending=false;}
  disconnect() {this.leave();this.ws?.close();}
  sendInput(controls) {
    this._itemPending=this._itemPending||controls.item;
    const now=performance.now(); if(now-(this._lastInput||0)<33) return;
    this._lastInput=now;this.send({type:'input',controls:{...controls,item:!!this._itemPending}});this._itemPending=false;
  }
  consumeInput(playerId) {
    if(performance.now()-(this.inputTimes.get(playerId)||0)>1000) return {throttle:0,brake:1,steer:0,drift:false,item:false,itemHeld:false,lookBack:false};
    const controls=this.latestInputs.get(playerId);if(!controls) return null;
    const copy={...controls};controls.item=false;return copy;
  }
  sendSnapshot(snapshot) {const now=performance.now();if(now-(this._lastSnapshot||0)<50)return;this._lastSnapshot=now;this.send({type:'snapshot',snapshot});}
}
