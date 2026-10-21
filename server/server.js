const http=require('http'),{WebSocketServer}=require('ws');
const PORT=process.env.PORT||8080,A=7.4,TAU=Math.PI*2,SP=[[-5,5],[5,-5],[5,5],[-5,-5]],rooms=new Map();
const srv=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/plain'});r.end('Square Clash server is running')});
const wss=new WebSocketServer({server:srv,maxPayload:1024});
const send=(ws,o)=>{if(ws.readyState===1)ws.send(JSON.stringify(o))};
const bc=(r,o)=>r.players.forEach(p=>send(p.ws,o));
const ang=(a,b)=>{let d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d};
const mkCode=()=>{let c;do{c='';for(let i=0;i<4;i++)c+='ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random()*24|0]}while(rooms.has(c));return c};
const lobby=r=>r.players.forEach(p=>send(p.ws,{t:'room',code:r.code,you:p.slot,players:r.players.map(q=>({slot:q.slot,name:q.name,ready:q.ready}))}));
function addPlayer(r,ws,name){let slot=0;while(r.players.some(p=>p.slot===slot))slot++;
const p={ws,slot,ready:false,name:String(name||'').replace(/[<>&"'`]/g,'').trim().slice(0,12)||'Player '+(slot+1)};r.players.push(p);ws.p=p;ws.r=r}
function startMatch(r){r.st='count';r.ct=3;r.mt=0;r.ranks=[];r.ev=[];
r.F=r.players.map(p=>{const[x,z]=SP[p.slot];return{slot:p.slot,x,z,h:Math.atan2(-x,-z),hp:100,alive:true,act:null,t:0,dur:1,cd:0,dodgeCd:0,hurt:0,flash:0,kx:0,kz:0,arm:0,block:false,hit:false,dx:0,dz:0,inp:{mx:0,mz:0}}});
bc(r,{t:'go',slots:r.F.map(f=>f.slot)});r.timer=setInterval(()=>tick(r),1000/30)}
function near(r,f,rg=99){let b=null,bd=rg;for(const e of r.F){if(e===f||!e.alive)continue;const d=Math.hypot(e.x-f.x,e.z-f.z);if(d<bd){bd=d;b=e}}return b}
function begin(r,f,t){const e=near(r,f,3.2);if(e)f.h=Math.atan2(e.x-f.x,e.z-f.z);f.act=t;f.t=0;f.hit=false;
if(t==='punch'){f.dur=.34;f.cd=.5;f.arm^=1}else if(t==='kick'){f.dur=.55;f.cd=.95}else{f.dur=.26;f.dodgeCd=1.1}}
function strike(r,f){const k=f.act==='kick',Rg=k?2.1:1.7,D=k?15:8,K=k?7:3.5,fx=Math.sin(f.h),fz=Math.cos(f.h);
for(const e of r.F){if(e===f||!e.alive||e.act==='dodge')continue;const dx=e.x-f.x,dz=e.z-f.z,d=Math.hypot(dx,dz);
if(d>Rg||d<.01||(dx*fx+dz*fz)/d<.3)continue;
const blk=e.block&&(-Math.sin(e.h)*dx-Math.cos(e.h)*dz)/d>.2,q=blk?.3:1;e.kx=dx/d*K*q;e.kz=dz/d*K*q;
if(blk)e.hp-=D*.12;else{e.hp-=D;e.hurt=.3;e.act=null;e.flash=.12}
r.ev.push([e.slot,blk?1:0]);if(e.hp<=0){e.hp=0;e.alive=false;r.ranks.push(e.slot)}}}
function upd(r,f,dt){if(!f.alive)return;const o=f.inp,m=Math.hypot(o.mx,o.mz);
f.cd-=dt;f.dodgeCd-=dt;f.hurt-=dt;f.flash-=dt;
if(!f.act&&f.hurt<=0){if(o.dodge&&f.dodgeCd<=0){begin(r,f,'dodge');if(m>.2){f.dx=o.mx/m;f.dz=o.mz/m}else{f.dx=-Math.sin(f.h);f.dz=-Math.cos(f.h)}}
else if(o.punch&&f.cd<=0)begin(r,f,'punch');else if(o.kick&&f.cd<=0)begin(r,f,'kick')}
f.block=!!o.block&&!f.act&&f.hurt<=0;let vx=0,vz=0;
if(f.act==='dodge'){vx=f.dx*11;vz=f.dz*11}else if(f.hurt<=0){const s=f.act?1.2:f.block?2.2:5.4;vx=o.mx*s;vz=o.mz*s}
vx+=f.kx;vz+=f.kz;const dc=Math.max(0,1-9*dt);f.kx*=dc;f.kz*=dc;f.x+=vx*dt;f.z+=vz*dt;
if(m>.2&&!f.act&&!f.block)f.h+=ang(f.h,Math.atan2(o.mx,o.mz))*Math.min(1,dt*14);
else if(f.block){const e=near(r,f,4);if(e)f.h+=ang(f.h,Math.atan2(e.x-f.x,e.z-f.z))*Math.min(1,dt*12)}
if(f.act){f.t+=dt;if(!f.hit&&f.act!=='dodge'&&f.t/f.dur>(f.act==='kick'?.45:.35)){f.hit=true;strike(r,f)}if(f.t>=f.dur)f.act=null}}
function collide(r){const F=r.F;for(let i=0;i<F.length;i++){const a=F[i];if(!a.alive)continue;
for(let j=i+1;j<F.length;j++){const b=F[j];if(!b.alive)continue;const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz)||.01;if(d<1.1){const o=(1.1-d)/2;a.x-=dx/d*o;a.z-=dz/d*o;b.x+=dx/d*o;b.z+=dz/d*o}}
const d=Math.hypot(a.x,a.z);if(d<2.15&&d>.01){a.x*=2.15/d;a.z*=2.15/d}a.x=Math.max(-A,Math.min(A,a.x));a.z=Math.max(-A,Math.min(A,a.z))}}
function tick(r){const dt=1/30;
if(r.st==='count'){r.ct-=dt;if(r.ct<=0)r.st='fight'}else r.mt+=dt;
if(r.st==='fight'){for(const f of r.F)upd(r,f,dt);collide(r)}
const n=v=>+v.toFixed(2);
bc(r,{t:'s',st:r.st,ct:Math.max(1,Math.ceil(r.ct)),ev:r.ev,f:r.F.map(f=>[f.slot,n(f.x),n(f.z),n(f.h),Math.ceil(f.hp),f.alive?1:0,f.act==='punch'?1:f.act==='kick'?2:f.act==='dodge'?3:0,n(f.t),f.arm,f.block?1:0,f.hurt>0?1:0,f.flash>0?1:0])});
r.ev=[];const alive=r.F.filter(f=>f.alive);
if(alive.length<=1){clearInterval(r.timer);r.st='over';const w=alive[0]?alive[0].slot:r.ranks[r.ranks.length-1];
bc(r,{t:'end',w,order:[w,...r.ranks.filter(s=>s!==w).reverse()],time:Math.round(r.mt)})}}
function leave(ws){const r=ws.r,p=ws.p;if(!r)return;ws.r=null;r.players=r.players.filter(q=>q!==p);
if(r.st==='count'||r.st==='fight'){const f=r.F.find(f=>f.slot===p.slot);if(f&&f.alive){f.alive=false;f.hp=0;r.ranks.push(f.slot)}}
if(!r.players.length){clearInterval(r.timer);rooms.delete(r.code)}else if(r.st==='lobby'||r.st==='over'){if(r.st==='over')r.st='lobby';lobby(r)}}
wss.on('connection',ws=>{ws.live=true;ws.on('pong',()=>ws.live=true);
ws.on('message',d=>{let m;try{m=JSON.parse(d)}catch{return}const r=ws.r;
switch(m.t){
case'create':{if(r)break;const nr={code:mkCode(),players:[],st:'lobby',F:[],ranks:[],ev:[],ct:0,mt:0};rooms.set(nr.code,nr);addPlayer(nr,ws,m.name);lobby(nr);break}
case'join':{if(r)break;const j=rooms.get(String(m.code||'').toUpperCase());
if(!j)return send(ws,{t:'err',m:'Room not found. Check the code.'});
if(j.st!=='lobby')return send(ws,{t:'err',m:'That match has already started.'});
if(j.players.length>=4)return send(ws,{t:'err',m:'That room is full.'});addPlayer(j,ws,m.name);lobby(j);break}
case'ready':if(r&&r.st==='lobby'){ws.p.ready=!ws.p.ready;lobby(r);if(r.players.length>=2&&r.players.every(p=>p.ready))startMatch(r)}break;
case'in':{if(!r||r.st!=='fight')break;const f=r.F.find(f=>f.slot===ws.p.slot);if(!f)break;let mx=+m.mx||0,mz=+m.mz||0;const q=Math.hypot(mx,mz);if(q>1){mx/=q;mz/=q}
f.inp={mx,mz,punch:!!m.punch,kick:!!m.kick,block:!!m.block,dodge:!!m.dodge};break}
case'again':if(r&&r.st==='over'){r.st='lobby';r.players.forEach(p=>p.ready=false);lobby(r)}break;
case'leave':leave(ws)}});
ws.on('close',()=>leave(ws))});
setInterval(()=>wss.clients.forEach(ws=>{if(!ws.live)return ws.terminate();ws.live=false;ws.ping()}),30000);
srv.listen(PORT,'0.0.0.0',()=>console.log('Square Clash server on '+PORT));
