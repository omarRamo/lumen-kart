import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const TRACKS = new Set(['palm-cove', 'frosty-peaks', 'sunset-canyon', 'lava-keep', 'alpine-rush', 'neon-harbor']);
const CHARS = new Set(['lumen','zina','pip','coralie','rivo','jagu','kibo','nox']);
const fail = message => { throw new Error(message); };
const finite = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
function config(value = {}) {
  const trackId = value.trackId || 'palm-cove';
  const difficulty = value.difficulty === 'normal' ? 'medium' : value.difficulty || 'medium';
  const laps = value.laps ?? 3;
  if (!TRACKS.has(trackId) || !['easy','medium','hard'].includes(difficulty) || !Number.isInteger(laps) || laps < 1 || laps > 9) fail('Invalid race settings');
  return { trackId, difficulty, laps };
}
function profile(value) {
  const name = typeof value.name === 'string' ? value.name.trim().replace(/[\x00-\x1f<>]/g, '').slice(0, 20) : 'Racer';
  const character = typeof value.character === 'number' ? [...CHARS][value.character] : value.character || 'lumen';
  if (!CHARS.has(character)) fail('Invalid character');
  return { name: name || 'Racer', character };
}
function input(value) {
  if (!value || !finite(value.throttle,0,1) || !finite(value.brake,0,1) || !finite(value.steer,-1,1)) fail('Invalid controls');
  return { throttle:value.throttle, brake:value.brake, steer:value.steer, drift:!!value.drift, item:!!value.item, itemHeld:!!value.itemHeld, lookBack:!!value.lookBack };
}
// Host-owned snapshots are deliberately schema-flexible, but bounded in size, depth and numeric range.
function bounded(value, depth = 0) {
  if (depth > 8) return false;
  if (typeof value === 'number') return finite(value,-1e9,1e9);
  if (typeof value === 'string') return value.length <= 200;
  if (value === null || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length <= 128 && value.every(v => bounded(v,depth+1));
  if (value && typeof value === 'object') return Object.keys(value).length <= 64 && Object.values(value).every(v=>bounded(v,depth+1));
  return false;
}
export function createRelay({ port = 8787, host = '0.0.0.0', allowedOrigins = [], maxRooms = 1000, staticDir = resolve('dist') } = {}) {
  const rooms = new Map();
  const server = http.createServer(async (req,res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type':'application/json' });
      res.end(JSON.stringify({ok:true,rooms:rooms.size})); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const base = resolve(staticDir);
      const file = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(base + sep)) throw new Error('Invalid path');
      const data = await readFile(file);
      const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2' };
      res.writeHead(200, { 'Content-Type':mime[extname(file)] || 'application/octet-stream',
        'X-Content-Type-Options':'nosniff', 'Cache-Control':pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  const wss = new WebSocketServer({ server, path:'/ws', maxPayload:65536, perMessageDeflate:false,
    verifyClient: ({ origin }, done) => done(!allowedOrigins.length || allowedOrigins.includes(origin), 403, 'Origin rejected') });
  const send = (ws,data) => { if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 262144) ws.send(JSON.stringify(data)); };
  const view = room => ({code:room.code,public:room.public,hostId:room.hostId,phase:room.phase,config:room.config,players:[...room.members.values()].map(p=>({id:p.id,...p.profile,ready:p.ready}))});
  const broadcast = (room,data,except) => { for (const p of room.members.values()) if (p !== except) send(p.ws,data); };
  const update = room => broadcast(room,{type:'room',room:view(room)});
  function leave(p) {
    const room = p.room; if (!room) return;
    p.room = null; room.members.delete(p.id);
    if (room.hostId === p.id) {
      broadcast(room,{type:'closed',reason:'The host left. Return to online play to join another room.'});
      for (const member of room.members.values()) member.room = null;
      rooms.delete(room.code);
    } else if (!room.members.size) rooms.delete(room.code);
    else { broadcast(room,{type:'input',playerId:p.id,controls:{throttle:0,brake:1,steer:0,drift:false,item:false,itemHeld:false,lookBack:false}}); update(room); }
  }
  wss.on('connection', ws => {
    const p = {id:randomUUID(),ws,room:null,profile:null,ready:false,alive:true,count:0,window:Date.now(),lastInput:0,lastSnapshot:0};
    send(ws,{type:'welcome',playerId:p.id});
    ws.on('pong',()=> {p.alive=true;});
    ws.on('close',()=>leave(p));
    ws.on('error',()=>leave(p));
    ws.on('message', raw => {
      try {
        const now=Date.now(); if (now-p.window>=1000) {p.count=0;p.window=now;}
        if (++p.count>100) {ws.close(1008,'Rate limit');return;}
        const m=JSON.parse(raw.toString()); if (!m || typeof m.type !== 'string') fail('Invalid message');
        if (['create','join','match'].includes(m.type)) {
          if (p.room) fail('Leave your current room first');
          p.profile=profile(m); p.ready=false;
          let room;
          if (m.type==='join') {
            if (typeof m.code!=='string' || !/^[A-Z0-9]{6}$/.test(m.code.toUpperCase())) fail('Enter a valid six-character room code');
            room=rooms.get(m.code.toUpperCase()); if (!room) fail('Room not found');
          } else {
            const settings=config(m.config);
            if (m.type==='match') room=[...rooms.values()].find(r=>r.public && r.phase==='lobby' && r.members.size<8 && JSON.stringify(r.config)===JSON.stringify(settings));
            if (!room) {
              if (rooms.size>=maxRooms) fail('Server is full. Try again later');
              let code; do {code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();} while(rooms.has(code));
              room={code,public:m.type==='match'||m.public===true,hostId:p.id,phase:'lobby',config:settings,members:new Map()}; rooms.set(code,room);
            }
          }
          if (room.phase!=='lobby') fail('This race has already started');
          if (room.members.size>=8) fail('Room is full');
          p.room=room; room.members.set(p.id,p); update(room); return;
        }
        if (m.type==='leave') {leave(p);send(ws,{type:'left'});return;}
        const room=p.room; if (!room) fail('Join a room first');
        if (m.type==='ready') { if(room.phase!=='lobby') fail('Race already started'); p.ready=m.ready===true;update(room); }
        else if (m.type==='start') {
          if(room.hostId!==p.id) fail('Only the host can start');
          if(room.phase!=='lobby' || room.members.size<2 || ![...room.members.values()].every(member=>member.ready)) fail('At least two racers must be ready');
          room.phase='racing'; update(room); broadcast(room,{type:'start',room:view(room),startAt:Date.now()+5000});
        } else if(m.type==='input') {
          if(room.phase!=='racing') return;
          const controls=input(m.controls); if(now-p.lastInput<12) return; p.lastInput=now;
          send(room.members.get(room.hostId).ws,{type:'input',playerId:p.id,controls});
        } else if(m.type==='snapshot') {
          if(room.hostId!==p.id || room.phase!=='racing') fail('Only the racing host can publish snapshots');
          if(!m.snapshot || !bounded(m.snapshot)) fail('Invalid snapshot');
          if(now-p.lastSnapshot<25) return; p.lastSnapshot=now;
          broadcast(room,{type:'snapshot',snapshot:m.snapshot},p);
        } else fail('Unknown message');
      } catch(error) {send(ws,{type:'error',message:error instanceof SyntaxError ? 'Invalid JSON' : error.message});}
    });
    ws._player=p;
  });
  const heartbeat=setInterval(()=> { for(const ws of wss.clients) {if(!ws._player.alive) ws.terminate(); else {ws._player.alive=false;ws.ping();}} },15000);
  heartbeat.unref();
  return { server,wss,rooms, listen:()=>new Promise(resolve=>server.listen(port,host,()=>resolve(server.address()))), close:()=>new Promise(resolve=>{clearInterval(heartbeat);for(const ws of wss.clients) ws.terminate();wss.close(()=>server.close(resolve));}) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const allowedOrigins=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(process.env.NODE_ENV==='production' && !allowedOrigins.length) throw new Error('Set ALLOWED_ORIGINS in production');
  const relay=createRelay({port:Number(process.env.PORT)||8787,host:process.env.HOST||'0.0.0.0',allowedOrigins});
  relay.listen().then(address=>console.log(`Kart relay listening on ${address.port} (/ws)`));
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>relay.close().then(()=>process.exit(0)));
}
