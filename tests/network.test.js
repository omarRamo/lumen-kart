import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createRelay } from '../server/index.js';

async function peer(url) {
  const ws=new WebSocket(url);const inbox=[];const pending=[];
  ws.on('message',raw=>{const m=JSON.parse(raw);const index=pending.findIndex(p=>p.type===m.type);if(index>=0){const p=pending.splice(index,1)[0];clearTimeout(p.timer);p.resolve(m);}else inbox.push(m);});
  const next=type=>{const index=inbox.findIndex(m=>m.type===type);if(index>=0)return Promise.resolve(inbox.splice(index,1)[0]);return new Promise((resolve,reject)=>{const p={type,resolve};p.timer=setTimeout(()=>reject(new Error('Timed out: '+type)),2500);pending.push(p);});};
  const welcome=await next('welcome');
  return {ws,id:welcome.playerId,next,send:m=>ws.send(JSON.stringify(m)),clear:()=>inbox.splice(0)};
}
const settings={trackId:'sunset-canyon',difficulty:'hard',laps:3};
const controls={throttle:1,brake:0,steer:-.4,drift:true,item:true,itemHeld:true};
test('private room, ready gate, synchronized roster, inputs, host snapshot and departure',async t=>{
  const relay=createRelay({port:0,host:'127.0.0.1'});const address=await relay.listen();t.after(()=>relay.close());
  const url=`ws://127.0.0.1:${address.port}/ws`;const a=await peer(url);const b=await peer(url);
  a.send({type:'create',name:'Host',character:'blaze',config:settings});const first=(await a.next('room')).room;
  assert.match(first.code,/^[A-Z0-9]{6}$/);assert.equal(first.public,false);
  b.send({type:'join',code:first.code,name:'Guest',character:'bella'});const joined=(await b.next('room')).room;await a.next('room');
  assert.equal(joined.players.length,2);assert.deepEqual(joined.config,settings);
  b.send({type:'start'});assert.match((await b.next('error')).message,/Only the host/);
  a.send({type:'start'});assert.match((await a.next('error')).message,/ready/);
  a.send({type:'ready',ready:true});await a.next('room');await b.next('room');
  b.send({type:'ready',ready:true});await a.next('room');await b.next('room');
  a.send({type:'start'});const [startA,startB]=await Promise.all([a.next('start'),b.next('start')]);
  assert.deepEqual(startA,startB);assert.ok(startA.startAt>Date.now()+4000);assert.deepEqual(startA.room.players.map(p=>p.id),[a.id,b.id]);
  b.send({type:'input',controls:{...controls,steer:20}});assert.match((await b.next('error')).message,/Invalid controls/);
  a.send({type:'snapshot',snapshot:{karts:[{position:[1e15,0,0]}]}});assert.match((await a.next('error')).message,/Invalid snapshot/);
  b.send({type:'input',controls});const received=await a.next('input');assert.equal(received.playerId,b.id);assert.equal(received.controls.steer,-.4);assert.equal(received.controls.itemHeld,true);
  const snapshot={phase:'racing',raceTime:2,karts:[{id:a.id,position:[1,2,3]},{id:b.id,position:[4,5,6]}]};
  b.send({type:'snapshot',snapshot});assert.match((await b.next('error')).message,/Only the racing host/);
  a.send({type:'snapshot',snapshot});assert.deepEqual((await b.next('snapshot')).snapshot,snapshot);
  const c=await peer(url);c.send({type:'join',code:first.code});assert.match((await c.next('error')).message,/already started/);
  a.ws.close();assert.match((await b.next('closed')).reason,/host left/);assert.equal(relay.rooms.size,0);
});
test('public matchmaking, invalid payloads, guest departure and room cleanup',async t=>{
  const relay=createRelay({port:0,host:'127.0.0.1'});const address=await relay.listen();t.after(()=>relay.close());
  const url=`ws://127.0.0.1:${address.port}/ws`;const a=await peer(url);const b=await peer(url);
  a.send({type:'create',config:{trackId:'bad'}});assert.match((await a.next('error')).message,/Invalid race/);
  a.ws.send('{');assert.equal((await a.next('error')).message,'Invalid JSON');
  a.send({type:'match',name:'<host>',config:settings});const room=(await a.next('room')).room;assert.equal(room.players[0].name,'host');
  b.send({type:'match',config:settings});assert.equal((await b.next('room')).room.code,room.code);await a.next('room');
  b.send({type:'leave'});await b.next('left');const remaining=(await a.next('room')).room;assert.equal(remaining.players.length,1);
  a.send({type:'leave'});await a.next('left');assert.equal(relay.rooms.size,0);
});
test('configured origin allowlist rejects untrusted clients',async t=>{
  const relay=createRelay({port:0,host:'127.0.0.1',allowedOrigins:['https://kart.example']});const address=await relay.listen();t.after(()=>relay.close());
  const ws=new WebSocket(`ws://127.0.0.1:${address.port}/ws`,{origin:'https://evil.example'});
  const error=await new Promise(resolve=>ws.on('error',resolve));assert.match(error.message,/403/);
});

test('oversized frames and message floods close the abusive connection',async t=>{
  const relay=createRelay({port:0,host:'127.0.0.1'});const address=await relay.listen();t.after(()=>relay.close());
  const url=`ws://127.0.0.1:${address.port}/ws`;const a=await peer(url);
  const oversizedClosed=new Promise(resolve=>a.ws.once('close',resolve));
  a.ws.send('x'.repeat(65537));assert.equal(await oversizedClosed,1009);
  const b=await peer(url);const floodClosed=new Promise(resolve=>b.ws.once('close',resolve));
  for(let i=0;i<105;i++)b.send({type:'leave'});assert.equal(await floodClosed,1008);
});

test('browser NetworkClient receives room events and latches one-shot inputs',async t=>{
  const { NetworkClient }=await import('../src/network.js');
  const relay=createRelay({port:0,host:'127.0.0.1'});const address=await relay.listen();t.after(()=>relay.close());
  const url=`ws://127.0.0.1:${address.port}/ws`;
  const host=new NetworkClient({url});const guest=new NetworkClient({url});
  await Promise.all([host.connect(),guest.connect()]);
  const event=(client,type,predicate=()=>true)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Timed out '+type)),2500);const receive=e=>{if(!predicate(e.detail))return;clearTimeout(timer);client.removeEventListener(type,receive);resolve(e.detail);};client.addEventListener(type,receive);});
  const created=event(host,'room');host.create({config:settings});const room=await created;
  const joined=event(guest,'room');guest.join(room.code);await joined;
  const hostReady=event(host,'room',r=>r.players.find(p=>p.id===host.playerId)?.ready);host.ready(true);await hostReady;
  const guestReady=event(guest,'room',r=>r.players.every(p=>p.ready));guest.ready(true);await guestReady;
  // Wait for both clients to observe readiness before requesting a synchronized start.
  const started=event(guest,'start');host.start();await started;
  assert.equal(host.isHost,true);assert.equal(guest.isHost,false);
  guest.send({type:'input',controls});
  await new Promise(resolve=>setTimeout(resolve,20));
  const press=host.consumeInput(guest.playerId);
  assert.equal(press.item,true);assert.equal(press.itemHeld,true);
  const held=host.consumeInput(guest.playerId);
  assert.equal(held.item,false);assert.equal(held.itemHeld,true);
  host.inputTimes.set(guest.playerId,performance.now()-1500);
  assert.equal(host.consumeInput(guest.playerId).itemHeld,false);
  const snapshot=event(guest,'snapshot');host.send({type:'snapshot',snapshot:{phase:'racing',karts:[]}});
  assert.equal((await snapshot).phase,'racing');
  guest.leave();assert.equal(guest.latestSnapshot,null);
});

test('relay serves built static assets without exposing parent directories', async t => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'kart-static-'));
  await writeFile(join(dir, 'index.html'), '<h1>Kart</h1>');
  await writeFile(join(dir, 'game.js'), 'export const game = true;');
  const relay = createRelay({port:0,host:'127.0.0.1',staticDir:dir});
  const address=await relay.listen();
  t.after(async()=>{await relay.close();await rm(dir,{recursive:true});});
  const origin=`http://127.0.0.1:${address.port}`;
  const index=await fetch(origin);assert.equal(index.status,200);assert.match(await index.text(),/Kart/);
  const js=await fetch(origin+'/game.js');assert.equal(js.headers.get('content-type'),'text/javascript');
  assert.equal((await fetch(origin+'/%2e%2e%2fpackage.json')).status,404);
  assert.equal((await fetch(origin,{method:'POST'})).status,405);
});
