/* ============================================================================
   НОЛЬ-СЕКТОР — ЯДРО: утилиты, ввод, камера, частицы, звук, сохранение
   ========================================================================== */
'use strict';

/* сборщик ошибок — все исключения видны в window.__errs */
window.__errs=[];
addEventListener('error',e=>{window.__errs.push(String(e.message||e.error));console.error(e.error||e.message)});
addEventListener('unhandledrejection',e=>{window.__errs.push('promise: '+String(e.reason))});

/* ------------------------------------------------------------------ УТИЛИТЫ */
const U = {
  clamp:(v,a,b)=>v<a?a:v>b?b:v,
  lerp:(a,b,t)=>a+(b-a)*t,
  rand:(a=1,b=0)=>b+Math.random()*(a-b),
  randi:(a,b)=>Math.floor(b===undefined?Math.random()*a:a+Math.random()*(b-a)),
  choice:(arr)=>arr[Math.floor(Math.random()*arr.length)],
  dist:(x1,y1,x2,y2)=>Math.hypot(x2-x1,y2-y1),
  dist2:(x1,y1,x2,y2)=>{const dx=x2-x1,dy=y2-y1;return dx*dx+dy*dy},
  ang:(x1,y1,x2,y2)=>Math.atan2(y2-y1,x2-x1),
  angDiff:(a,b)=>{let d=(b-a+Math.PI)%(Math.PI*2);if(d<0)d+=Math.PI*2;return d-Math.PI},
  fmt:(n)=>String(Math.floor(n)).padStart(1,'0'),
  comma:(n)=>Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,' '),
  pad:(n,l=4)=>String(Math.floor(n)).padStart(l,'0'),
  hex2rgb:(h)=>{h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');
    return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)]},
  rgba:(h,a)=>{const[r,g,b]=U.hex2rgb(h);return `rgba(${r},${g},${b},${a})`},
  mix:(h1,h2,t)=>{const a=U.hex2rgb(h1),b=U.hex2rgb(h2);
    return '#'+a.map((v,i)=>Math.round(U.lerp(v,b[i],t)).toString(16).padStart(2,'0')).join('')},
  shade:(h,amt)=>{const[r,g,b]=U.hex2rgb(h);
    const f=(v)=>U.clamp(Math.round(amt>0?v+(255-v)*amt:v*(1+amt)),0,255);
    return '#'+[f(r),f(g),f(b)].map(v=>v.toString(16).padStart(2,'0')).join('')},
};

/* ---------------------------------------------------------------- ВВОД ----- */
const INPUT = {
  keys:{}, pressed:{}, mouse:{x:0,y:0,down:false,rdown:false}, wheel:0,
  init(){
    addEventListener('keydown',e=>{
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(e.code)) e.preventDefault();
      if(!this.keys[e.code]) this.pressed[e.code]=true;
      this.keys[e.code]=true;
    });
    addEventListener('keyup',e=>{this.keys[e.code]=false});
    addEventListener('blur',()=>{this.keys={};this.mouse.down=false});
    const cv=document.getElementById('cv');
    cv.addEventListener('mousemove',e=>{this.mouse.x=e.clientX;this.mouse.y=e.clientY});
    cv.addEventListener('mousedown',e=>{
      if(e.button===0){this.mouse.down=true;this.mouse.rdown=false}
      if(e.button===2){this.mouse.rdown=true;this.mouse.down=false}
    });
    cv.addEventListener('mouseup',e=>{if(e.button===0)this.mouse.down=false;if(e.button===2)this.mouse.rdown=false});
    cv.addEventListener('contextmenu',e=>e.preventDefault());
    cv.addEventListener('wheel',e=>{this.wheel+=Math.sign(e.deltaY);e.preventDefault()},{passive:false});
  },
  down(...c){return c.some(k=>this.keys[k])},
  hit(code){return !!this.pressed[code]},
  axis(){
    let x=0,y=0;
    if(this.down('KeyA','ArrowLeft')) x-=1;
    if(this.down('KeyD','ArrowRight')) x+=1;
    if(this.down('KeyW','ArrowUp')) y-=1;
    if(this.down('KeyS','ArrowDown')) y+=1;
    if(x&&y){x*=0.7071;y*=0.7071}
    return {x,y};
  },
  endFrame(){this.pressed={};this.wheel=0},
};

/* --------------------------------------------------------------- КАНВАС --- */
const ENG = {
  cv:null, ctx:null, W:0, H:0, dpr:1,
  t:0, dt:0, last:0, timeScale:1,
  init(){
    this.cv=document.getElementById('cv');
    this.ctx=this.cv.getContext('2d');
    this.resize();
    addEventListener('resize',()=>this.resize());
  },
  resize(){
    this.dpr=Math.min(devicePixelRatio||1,2);
    this.W=innerWidth; this.H=innerHeight;
    this.cv.width=Math.floor(this.W*this.dpr);
    this.cv.height=Math.floor(this.H*this.dpr);
    this.cv.style.width=this.W+'px';
    this.cv.style.height=this.H+'px';
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
  },
};

/* --------------------------------------------------------------- КАМЕРА --- */
const CAM = {
  x:0,y:0, tx:0,ty:0, zoom:1, shakeT:0, shakeMag:0, ox:0, oy:0,
  follow(x,y,dt,snap){
    this.tx=x; this.ty=y;
    const k=snap?1:Math.min(1,dt*7.5);
    this.x=U.lerp(this.x,this.tx,k);
    this.y=U.lerp(this.y,this.ty,k);
  },
  shake(mag,dur){this.shakeMag=Math.max(this.shakeMag,mag);this.shakeT=Math.max(this.shakeT,dur)},
  update(dt){
    if(this.shakeT>0){
      this.shakeT-=dt;
      const f=Math.max(0,this.shakeT);
      const m=this.shakeMag*Math.min(1,f*5);
      this.ox=U.rand(m,-m); this.oy=U.rand(m,-m);
      if(this.shakeT<=0){this.shakeMag=0;this.ox=this.oy=0}
    }
  },
  apply(ctx){
    ctx.translate(eng_w()/2,eng_h()/2);
    ctx.scale(this.zoom,this.zoom);
    ctx.translate(-this.x+this.ox,-this.y+this.oy);
  },
  screenToWorld(sx,sy){
    return { x:(sx-eng_w()/2)/this.zoom+this.x, y:(sy-eng_h()/2)/this.zoom+this.y };
  },
  visible(x,y,r){
    const hw=eng_w()/2/this.zoom+r, hh=eng_h()/2/this.zoom+r;
    return Math.abs(x-this.x)<hw && Math.abs(y-this.y)<hh;
  },
};
const eng_w=()=>ENG.W, eng_h=()=>ENG.H;

/* ------------------------------------------------------------- ЧАСТИЦЫ ---- */
const FX = {
  list:[], texts:[], rings:[], slashes:[],
  clear(){this.list.length=0;this.texts.length=0;this.rings.length=0;this.slashes.length=0},

  spark(x,y,col,n=6,spd=170,life=0.42,size=2.6){
    for(let i=0;i<n;i++){
      const a=U.rand(6.283), s=U.rand(spd,spd*0.25);
      this.list.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-30,life,max:life*U.rand(1.5,0.6),
        size:size*U.rand(1.4,0.6),col,g:340,drag:0.93,type:'spark'});
    }
  },
  burst(x,y,col,n=16,spd=260){
    for(let i=0;i<n;i++){
      const a=U.rand(6.283), s=U.rand(spd,spd*0.3);
      this.list.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:U.rand(0.6,0.3),max:0.6,
        size:U.rand(5,2),col,g:120,drag:0.9,type:'glow'});
    }
  },
  ring(x,y,col,r0,r1,dur=0.4,w=3){
    this.rings.push({x,y,col,r0,r1,t:0,dur,w});
  },
  slash(x,y,ang,arc,r,col,dur=0.22,w=9){
    this.slashes.push({x,y,ang,arc,r,col,t:0,dur,w});
  },
  text(x,y,txt,col,size=18,vy=-52,crit=false){
    this.texts.push({x,y,txt,col,size,vy:vy,t:0,dur:0.85,crit});
  },
  update(dt){
    for(let i=this.list.length-1;i>=0;i--){
      const p=this.list[i];
      p.life-=dt;
      if(p.life<=0){this.list.splice(i,1);continue}
      p.vy+=(p.g||0)*dt;
      p.vx*=Math.pow(p.drag||0.94,dt*60);
      p.vy*=Math.pow(p.drag||0.94,dt*60);
      p.x+=p.vx*dt; p.y+=p.vy*dt;
    }
    for(let i=this.texts.length-1;i>=0;i--){
      const t=this.texts[i]; t.t+=dt;
      if(t.t>t.dur){this.texts.splice(i,1);continue}
      t.y+=t.vy*dt; t.vy*=0.94;
    }
    for(let i=this.rings.length-1;i>=0;i--){const r=this.rings[i];r.t+=dt;if(r.t>r.dur)this.rings.splice(i,1)}
    for(let i=this.slashes.length-1;i>=0;i--){const s=this.slashes[i];s.t+=dt;if(s.t>s.dur)this.slashes.splice(i,1)}
    if(this.list.length>900) this.list.splice(0,this.list.length-900);
  },
  draw(ctx){
    ctx.save();
    for(const s of this.slashes){
      const k=s.t/s.dur, a=1-k;
      ctx.globalAlpha=a*0.9;
      ctx.strokeStyle=s.col; ctx.lineWidth=s.w*(1-k*0.55); ctx.lineCap='round';
      ctx.shadowColor=s.col; ctx.shadowBlur=18;
      ctx.beginPath();
      ctx.arc(s.x,s.y,s.r*(0.8+k*0.3),s.ang-s.arc/2,s.ang+s.arc/2);
      ctx.stroke();
    }
    ctx.shadowBlur=0;
    for(const r of this.rings){
      const k=r.t/r.dur, a=1-k;
      ctx.globalAlpha=a*0.85;
      ctx.strokeStyle=r.col; ctx.lineWidth=r.w*(1-k*0.7);
      ctx.beginPath(); ctx.arc(r.x,r.y,U.lerp(r.r0,r.r1,k),0,6.2832); ctx.stroke();
    }
    for(const p of this.list){
      const a=U.clamp(p.life/p.max,0,1);
      ctx.globalAlpha=a;
      ctx.fillStyle=p.col;
      if(p.type==='glow'){ctx.shadowColor=p.col;ctx.shadowBlur=12}
      else ctx.shadowBlur=0;
      if(p.type==='spark'){
        ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size*1.6,p.size*0.9);
      } else {
        ctx.beginPath(); ctx.arc(p.x,p.y,p.size*a,0,6.2832); ctx.fill();
      }
    }
    ctx.shadowBlur=0;
    for(const t of this.texts){
      const k=t.t/t.dur;
      const a=k<0.12?k/0.12:(k>0.7?(1-k)/0.3:1);
      const sc=t.crit?1.35:1;
      ctx.globalAlpha=U.clamp(a,0,1);
      ctx.font=`700 ${Math.round(t.size*sc)}px "Impact","Arial Narrow",sans-serif`;
      ctx.textAlign='center';
      ctx.lineWidth=4; ctx.strokeStyle='rgba(0,0,0,.9)';
      ctx.strokeText(t.txt,t.x,t.y);
      ctx.fillStyle=t.col;
      ctx.fillText(t.txt,t.x,t.y);
    }
    ctx.restore();
    ctx.globalAlpha=1;
  },
};

/* ----------------------------------------------------------------- ЗВУК ---- */
const SFX = {
  ctx:null, master:null, musicGain:null, sfxGain:null, on:true, musicOn:true,
  _musicTimer:0, _step:0, _scale:[0,3,5,7,10], _root:110,
  init(){
    if(this.ctx) return;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    this.ctx=new AC();
    this.master=this.ctx.createGain(); this.master.gain.value=0.55;
    const comp=this.ctx.createDynamicsCompressor();
    comp.threshold.value=-18; comp.ratio.value=6;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    this.sfxGain=this.ctx.createGain(); this.sfxGain.gain.value=0.8; this.sfxGain.connect(this.master);
    this.musicGain=this.ctx.createGain(); this.musicGain.gain.value=0.3; this.musicGain.connect(this.master);
    this.noise=this._makeNoise();
  },
  resume(){ if(this.ctx && this.ctx.state==='suspended') this.ctx.resume(); },
  _makeNoise(){
    const len=this.ctx.sampleRate*1.2;
    const buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    return buf;
  },
  tone(freq,dur,type='sine',vol=0.25,slide=0,dest){
    if(!this.ctx||!this.on) return;
    const t=this.ctx.currentTime;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*slide),t+dur);
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(dest||this.sfxGain);
    o.start(t); o.stop(t+dur+0.02);
  },
  noiseHit(dur=0.12,vol=0.3,freq=900,q=1.2,type='lowpass'){
    if(!this.ctx||!this.on) return;
    const t=this.ctx.currentTime;
    const s=this.ctx.createBufferSource(); s.buffer=this.noise;
    const f=this.ctx.createBiquadFilter(); f.type=type;
    f.frequency.setValueAtTime(freq,t); f.frequency.exponentialRampToValueAtTime(Math.max(120,freq*0.3),t+dur);
    f.Q.value=q;
    const g=this.ctx.createGain();
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t); s.stop(t+dur+0.02);
  },
  hit(){ this.noiseHit(0.09,0.26,1800,1.4); this.tone(150,0.09,'square',0.1,0.6) },
  heavy(){ this.noiseHit(0.22,0.36,900,1); this.tone(80,0.2,'sawtooth',0.16,0.5) },
  crit(){ this.noiseHit(0.14,0.32,2600,2); this.tone(880,0.12,'square',0.1,0.5); this.tone(1320,0.1,'sine',0.07,0.6) },
  reaction(){ this.tone(320,0.28,'triangle',0.16,2.2); this.noiseHit(0.3,0.3,1400,0.8); },
  dodge(){ this.tone(520,0.16,'sine',0.12,1.9); this.noiseHit(0.14,0.14,3200,2,'highpass') },
  swap(){ this.tone(660,0.1,'triangle',0.1,1.4); this.tone(990,0.16,'sine',0.07,1.2) },
  ult(){ this.tone(70,0.9,'sawtooth',0.22,2.6); this.noiseHit(0.7,0.4,700,0.6); },
  ui(){ this.tone(760,0.05,'square',0.05,1.1) },
  uiBig(){ this.tone(420,0.12,'triangle',0.1,1.6) },
  pickup(){ this.tone(880,0.08,'sine',0.1,1.3); setTimeout(()=>this.tone(1320,0.1,'sine',0.08,1.2),62) },
  levelup(){ [523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.tone(f,0.22,'triangle',0.12),i*78)) },
  gacha(rarity){
    if(rarity>=5){[784,988,1175,1568].forEach((f,i)=>setTimeout(()=>this.tone(f,0.5,'sine',0.13),i*90))}
    else if(rarity>=4){[659,880].forEach((f,i)=>setTimeout(()=>this.tone(f,0.3,'triangle',0.1),i*100))}
    else this.tone(440,0.2,'sine',0.07);
  },
  hurt(){ this.tone(180,0.14,'sawtooth',0.14,0.6); this.noiseHit(0.14,0.2,600,1) },
  die(){ this.tone(200,0.4,'sawtooth',0.16,0.35); this.noiseHit(0.4,0.24,500,0.7) },
  /* --- простая музыкальная петля --- */
  setMood(root){
    this._root=root;
    this._step=0;
  },
  tickMusic(dt){
    if(!this.ctx||!this.musicOn||!this.on) return;
    this._musicTimer-=dt;
    const bpm=92, beat=60/bpm/2;
    if(this._musicTimer>0) return;
    this._musicTimer=beat;
    const s=this._step++;
    const root=this._root;
    // бас на каждые 4 шага
    if(s%4===0){
      this.tone(root/2,0.42,'sawtooth',0.055,1,this.musicGain);
    }
    if(s%8===3||s%8===7){
      this.tone(root*1.5,0.2,'triangle',0.035,1,this.musicGain);
    }
    // арпеджио
    if(s%2===0){
      const n=this._scale[(s*3)%this._scale.length];
      const f=root*Math.pow(2,n/12)*2;
      this.tone(f,0.26,'sine',0.028,1,this.musicGain);
    }
    if(s%16===0){
      this.tone(root*2,0.7,'sine',0.02,1,this.musicGain);
    }
  },
};

/* ------------------------------------------------------------ СОХРАНЕНИЕ -- */
const SAVE_KEY='nullsector.save.v1';
const Store = {
  save(){
    try{
      const j=JSON.stringify(G, (k,v)=> (k==='_tmp'?undefined:v));
      localStorage.setItem(SAVE_KEY,j);
      return true;
    }catch(e){console.warn('save failed',e);return false}
  },
  load(){
    try{
      const raw=localStorage.getItem(SAVE_KEY);
      if(!raw) return null;
      return JSON.parse(raw);
    }catch(e){return null}
  },
  wipe(){ try{localStorage.removeItem(SAVE_KEY)}catch(e){} },
  has(){ try{return !!localStorage.getItem(SAVE_KEY)}catch(e){return false} },
};
