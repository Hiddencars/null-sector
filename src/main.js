/* ============================================================================
   НОЛЬ-СЕКТОР — ГЛАВНЫЙ ЦИКЛ: состояние, сцены, взаимодействия, отрисовка
   ========================================================================== */
'use strict';

/* ============================================================ СОСТОЯНИЕ === */
const G = {
  save:null,
  rt:{},
  init(){
    this.save={
      credits:3600, eth:3200, chips:8, sp:6,
      party:['volt','iney','pepel'],
      roster:{
        volt:{level:6,xp:0,nodes:{},tiles:{basic:1,skill:1,dodge:1,chain:1},cinema:0},
        iney:{level:5,xp:0,nodes:{},tiles:{basic:1,skill:1,dodge:1,chain:1},cinema:0},
        pepel:{level:5,xp:0,nodes:{},tiles:{basic:1,skill:1,dodge:1,chain:1},cinema:0},
      },
      world:{x:48,y:20},
      unlockedTP:['hub'],
      bossKilled:{},
      quests:{},
      pulls:{total:0},
      pity:{std:0,lum:0},
      flags:{},
      seen:{intro:false},
      stats:{kills:0,reactions:0,bosses:0,deaths:0,pulls:0},
    };
    this.rt={};
    for(const id of Object.keys(this.save.roster)){
      const s=CBT.statsOutside?CBT.statsOutside(id):null;
      this.rt[id]={hp:99999,dec:0,cd:0};
    }
    // hp выставим после первого расчёта статов
    this.fixRuntimes();
  },
  fixRuntimes(){
    for(const id of Object.keys(this.save.roster)){
      if(!this.rt[id]) this.rt[id]={hp:1,dec:0,cd:0};
      const st=CBT.stats(id);
      if(!isFinite(this.rt[id].hp)||this.rt[id].hp>st.hp||this.rt[id].hp<1)
        this.rt[id].hp=st.hp;
    }
  },
  loadFrom(data){
    if(!data||!data.save) return false;
    this.save=Object.assign(this.save,data.save);
    this.rt=data.rt||{};
    for(const id of Object.keys(this.save.roster)) if(!this.rt[id]) this.rt[id]={hp:1,dec:0};
    return true;
  },
};

/* ================================================================ ИГРА ==== */
const GAME = {
  t:0, last:0, paused:true, started:false,
  hudT:0, region:null, promptObj:null, mm:null, mmx:null,
  nearObj:null,

  boot(){
    ENG.init();
    INPUT.init();
    G.init();
    MAP.build();
    MAP.props.sort((a,b)=>a.y-b.y);
    CBT.init();
    G.fixRuntimes();
    CBT.syncActive(true);
    UI.init();
    // миникарта
    this.mm=document.getElementById('minimap');
    if(this.mm){ this.mm.width=184; this.mm.height=184; this.mmx=this.mm.getContext('2d'); }
    // погода по региону
    const reg=MAP.regionAt(CBT.player.x,CBT.player.y);
    WEATHER.init(reg.weather);
    SFX.setMood(130);
    CAM.follow(CBT.player.x,CBT.player.y,1,true);
    TITLE.open();
    this.last=performance.now();
    // основной цикл: rAF + резервный таймер (для вкладок, где rAF заморожен)
    const step=(now)=>{ this.tick(now); requestAnimationFrame(step); };
    requestAnimationFrame(step);
    setInterval(()=>{
      if(performance.now()-this.last>180) this.tick(performance.now());
    }, 60);
  },

  tick(now){
    if(this._inTick) return;
    this._inTick=true;
    try{ this.loop(now); } finally { this._inTick=false; }
  },

  loop(now){
    const dtRaw=U.clamp((now-this.last)/1000,0,0.05);
    this.last=now;
    this.t+=dtRaw;
    if(!this.paused && this.started){
      const dt=dtRaw*(CBT.slowmo>0?0.33:1);
      CBT.update(dt);
      WEATHER.update(dtRaw);
      this.checkRegion();
      this.checkInteract();
      this.checkPads();
      CAM.follow(CBT.player.x,CBT.player.y+8,dtRaw);
      SFX.tickMusic(dtRaw);
    } else {
      // лёгкая анимация мира в меню
      CAM.follow(CBT.player.x,CBT.player.y,0.05);
      WEATHER.update(dtRaw*0.5);
    }
    CAM.update(dtRaw);
    this.render(dtRaw);
    this.renderHUD(dtRaw);
    INPUT.endFrame();
  },

  checkRegion(){
    const reg=MAP.regionAt(CBT.player.x,CBT.player.y);
    if(reg!==this.region){
      this.region=reg;
      WEATHER.init(reg.weather);
      SFX.setMood(reg.id==='hub'?130:reg.id==='rust'?110:reg.id==='furnace'?98:
                  reg.id==='cryo'?146:87);
      UI.toast('◈ '+reg.name+' · '+(reg.safe?'безопасная зона':'ур. '+reg.lvl[0]+'–'+reg.lvl[1]),'gold');
      this.showQuest();
    }
  },

  checkPads(){
    for(const p of MAP.pads){
      if(G.save.unlockedTP.includes(p.id)) continue;
      if(U.dist(p.x,p.y,CBT.player.x,CBT.player.y)<50){
        G.save.unlockedTP.push(p.id);
        UI.toast('Точка перемещения открыта: '+p.n,'gold');
        SFX.levelup(); Store.save();
      }
    }
  },

  checkInteract(){
    let best=null, bd=76;
    for(const o of MAP.objs){
      const d=U.dist(o.x,o.y,CBT.player.x,CBT.player.y);
      if(d<bd){ bd=d; best=o; }
    }
    this.nearObj=best;
    const hint=document.getElementById('hint');
    if(hint){
      if(best){
        const label = best.t==='chest'?'открыть сундук':
          best.t==='terminal'?'открыть канал':
          best.t==='shop'?'магазин':
          best.t==='board'?'доска заказов':
          best.t==='save'?'сохранить':
          'поговорить';
        hint.innerHTML=`<b style="color:var(--lime)">R</b> — ${label}`;
        hint.style.color='#dfe6f2';
      } else {
        hint.innerHTML='WASD — движение · ЛКМ/J — удар · E — навык · Пробел — рывок · Q — ульта · 1/2/3 — смена';
        hint.style.color='';
      }
    }
    if(best && INPUT.hit('KeyR')) this.interact(best);
  },

  interact(o){
    if(o.t==='chest'){
      if(o.opened){ UI.toast('Сундук пуст','warn'); return; }
      o.opened=true;
      const r=o.reward;
      G.save.credits+=r.cr||0;
      G.save.eth+=r.eth||0;
      G.save.chips+=r.chip||0;
      FX.burst(o.x,o.y-20,'#c8ff1e',26,320);
      FX.ring(o.x,o.y,'#c8ff1e',10,90,0.5,4);
      SFX.pickup();
      UI.toast(`Сундук: ${r.cr||0} КР · ${r.eth?r.eth+' ЭФ · ':''}${r.chip?r.chip+' чипов':''}`,'gold');
      QM.onChest(); Store.save(); UI.refreshRes();
    }
    else if(o.t==='terminal') UI.openGacha();
    else if(o.t==='shop') UI.openShop();
    else if(o.t==='board') UI.openQuests();
    else if(o.t==='save'){ Store.save(); UI.toast('Прогресс сохранён','gold'); SFX.uiBig(); }
    else if(o.t==='npc'){
      if(o.npc.hook){ o.npc.hook(); return; }
      UI.dialog(o, ()=>{});
    }
  },

  showQuest(){
    const el=document.getElementById('questpad');
    if(!el) return;
    const q=QM.list.find(q=>{const s=QM.q(q.id);return !s.claimed;});
    if(!q){ el.innerHTML=''; return; }
    const s=QM.q(q.id);
    el.innerHTML=`<div id="quest">
      <div class="qt">Активный заказ</div>
      <div class="qd">${q.n}</div>
      <div class="qo">${q.d} · ${Math.min(s.p,q.need)}/${q.need}</div>
    </div>`;
  },

  /* ------------------------------------------------------------- рендер -- */
  render(dt){
    const ctx=ENG.ctx, W=ENG.W, H=ENG.H;
    const reg=this.region||MAP.regionAt(CBT.player.x,CBT.player.y);
    ctx.setTransform(ENG.dpr,0,0,ENG.dpr,0,0);
    // фон
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,reg.sky||'#0b0c10');
    bg.addColorStop(1,'#05060a');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

    CAM.zoom=U.clamp(Math.min(W,H)/540,1.0,1.7);
    ctx.save();
    CAM.apply(ctx);

    const cam={x:CAM.x,y:CAM.y,w:W/CAM.zoom,h:H/CAM.zoom};
    MAP.drawTerrain(ctx,cam,this.t);

    // объекты станций (под всеми)
    MAP.drawObjects(ctx,this.t);

    const p=CBT.player;
    const py=p?p.y:0;

    // реквизит позади игрока
    for(const pr of MAP.props){
      if(pr.y<py) { if(CAM.visible(pr.x,pr.y,120)) MAP.drawProp(ctx,pr,this.t); }
    }

    // бой
    CBT.draw(ctx,this.t);

    // реквизит впереди
    for(const pr of MAP.props){
      if(pr.y>=py) { if(CAM.visible(pr.x,pr.y,120)) MAP.drawProp(ctx,pr,this.t); }
    }

    // босс-бар
    if(CBT.boss && !CBT.boss.dead){
      const b=CBT.boss;
      ctx.save();
      ctx.fillStyle='rgba(8,9,12,.82)';
      ctx.fillRect(W/2-260,26,520,34);
      ctx.fillStyle='#ff3b30';
      ctx.fillRect(W/2-256,26+22,512*U.clamp(b.hp/b.maxHp,0,1),8);
      ctx.fillStyle='#fff';
      ctx.font='16px Impact, sans-serif'; ctx.textAlign='center';
      ctx.fillText(b.def.n+' · ур.'+b.lvl, W/2, 26+16);
      ctx.restore();
    }

    // анимация ульты
    if(CBT.ultFx){
      const k=CBT.ultFx.t/1.3;
      ctx.save();
      ctx.globalAlpha=Math.max(0,1-k)*0.9;
      ctx.fillStyle=CBT.ultFx.char.art.accent;
      ctx.fillRect(-2000,-2000,6000,6000);
      ctx.restore();
    }
    ctx.restore();

    // погода поверх мира
    WEATHER.draw(ctx);

    // вспышка
    if(CBT.flash>0){
      ctx.save();
      ctx.globalAlpha=U.clamp(CBT.flash,0,1)*0.5;
      ctx.fillStyle=CBT.flashCol;
      ctx.fillRect(0,0,W,H);
      ctx.restore();
    }
    // рамка/виньетка
    drawVignette(ctx,W,H,reg.safe?'#0a1420':'#1a0a0a',0.52);
    drawScanlines(ctx,W,H);

    // затемнение под меню
    if(this.paused){
      ctx.save();
      ctx.globalAlpha=.35; ctx.fillStyle='#05060a'; ctx.fillRect(0,0,W,H);
      ctx.restore();
    }
    // кастомный курсор-прицел
    if(!this.paused){
      const mx=INPUT.mouse.x, my=INPUT.mouse.y;
      ctx.save();
      ctx.strokeStyle='rgba(200,255,30,.75)'; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.arc(mx,my,7,0,6.2832); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx-12,my); ctx.lineTo(mx-4,my);
      ctx.moveTo(mx+4,my); ctx.lineTo(mx+12,my);
      ctx.moveTo(mx,my-12); ctx.lineTo(mx,my-4);
      ctx.moveTo(mx,my+4); ctx.lineTo(mx,my+12); ctx.stroke();
      ctx.restore();
    }
  },

  renderHUD(dt){
    if(!this.started||this.paused) return;
    this.hudT-=dt;
    if(this.hudT>0) return;
    this.hudT=0.08;
    UI.refreshTeam();
    UI.refreshRes();
    UI.refreshActs();
    UI.refreshCombo();
    if(this.mmx){
      this.mmx.clearRect(0,0,184,184);
      MAP.minimap(this.mmx,0,0,184,184,CBT.player);
    }
  },
};

/* ================================================================ СТАРТ === */
addEventListener('DOMContentLoaded',()=>{
  try{
    GAME.boot();
  }catch(e){
    console.error(e);
    document.body.innerHTML=`<div style="padding:40px;font-family:Consolas;color:#ff5a5a;white-space:pre-wrap">
ОШИБКА ЗАГРУЗКИ:\n${e && e.stack || e}</div>`;
  }
});

/* отладочный хук для проверки */
window.__game={
  state:()=>({paused:GAME.paused, started:GAME.started, region:GAME.region&&GAME.region.id,
    enemies:CBT.enemies.length, party:CBT.party, active:CBT.active,
    hp:CBT.player&&CBT.player.hp, credits:G.save.credits, eth:G.save.eth}),
  give:(n)=>{G.save.eth+=n;G.save.credits+=n;UI.refreshRes();return G.save.eth;},
  spawn:(type,x,y,lvl)=>{const e=CBT.spawnEnemy(type,x||CBT.player.x+120,y||CBT.player.y,lvl||5);
    return e?e.hp:null;},
  tp:(x,y)=>{CBT.player.x=x*MAP.ts;CBT.player.y=y*MAP.ts;CAM.follow(CBT.player.x,CBT.player.y,1,true);return true;},
  god:()=>{CBT.player.invuln=9999;return true;},
  setDec:(v)=>{CBT.rt().dec=v;return CBT.rt().dec;},
  openAgent:(id)=>UI.openAgent(id||G.save.party[0]),
  openGacha:()=>UI.openGacha(),
  closeMenu:()=>UI.close(),
  start:()=>{GAME.paused=false;GAME.started=true;UI.close();},
  friends:()=>CBT.enemies.map(e=>({t:e.type,hp:Math.round(e.hp)})),
};
