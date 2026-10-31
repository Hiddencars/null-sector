/* ============================================================================
   НОЛЬ-СЕКТОР — БОЙ: цепочки комбо, стихийные реакции, смена агента, ульты
   ========================================================================== */
'use strict';

const CBT = {
  player:null,
  party:[],
  active:0,
  enemies:[], projs:[], zones:[], pickups:[],
  combo:0, comboT:0, sinceHit:9,
  slowmo:0, hitstop:0, flash:0, flashCol:'#fff',
  spawnT:0, ultFx:null, chainFx:null,
  boss:null,
  kills:0,
  screenShake:0,

  /* ------------------------------------------------------------- старт --- */
  init(){
    this.player={
      x:48*MAP.ts, y:20*MAP.ts, vx:0, vy:0, r:14, face:1,
      aim:0, animPhase:Math.random()*6, moving:false, attacking:false,
      hurtFlash:0, atkIdx:0, atkTimer:0, atkQueued:null, atkWindow:0, atkCd:0,
      invuln:0, dodgeCd:0, dodgeT:0, dodgeDir:{x:0,y:0}, skillCd:0, chainCd:0,
      ultT:0, auraGlow:0, dashVx:0, dashVy:0, shield:0, buffT:0, buffAtk:0,
      dead:false, downed:false,
    };
    this.party=G.save.party.slice();
    this.active=0;
    this.enemies=[]; this.projs=[]; this.zones=[]; this.pickups=[];
    this.combo=0; this.comboT=0; this.sinceHit=9; this.boss=null;
    this.syncActive(true);
  },

  char(){ return DATA.CHARS.find(c=>c.id===this.party[this.active]); },
  rt(){ const id=this.party[this.active]; return G.rt[id]; },

  stats(id){
    const c=DATA.CHARS.find(x=>x.id===id||x===id);
    const r=G.save.roster[c.id];
    const lvl=r.level;
    const t=this.treeStats(c.id);
    let hp=c.hp*(1+0.095*(lvl-1));
    let atk=c.atk*(1+0.075*(lvl-1));
    let def=c.def*(1+0.07*(lvl-1));
    hp*=(1+(t.hpPct||0)); atk*=(1+(t.atkPct||0)); def*=(1+(t.defPct||0));
    const tile=r.tiles||{};
    return {
      hp, atk, def, spd:c.spd*(1+(t.spdPct||0)),
      crit:0.05+(t.critUp||0)+(r.cinema||0)*0.01,
      basicMul:1+(t.basicDmg||0)+(Math.max(0,(tile.basic||1)-1)*0.08),
      skillMul:1+(t.skillDmg||0)+(Math.max(0,(tile.skill||1)-1)*0.08),
      chainMul:1+(Math.max(0,(tile.chain||1)-1)*0.06),
      dodgeMul:1+(Math.max(0,(tile.dodge||1)-1)*0.05),
      reactionAmp:t.reactionAmp||0,
      dazeUp:t.dazeUp||0,
      ultGain:1+(t.ultGain||0),
      tree:t,
      lvl,
    };
  },

  treeStats(id){
    const c=DATA.CHARS.find(x=>x.id===id);
    const r=G.save.roster[id];
    const out={};
    for(const key of Object.keys(c.tree)){
      const node=c.tree[key];
      const lv=(r.nodes&&r.nodes[key])||0;
      if(!lv) continue;
      const per={ basicDmg:0.12, reactionAmp:0.15, dazeUp:0.18, skillDmg:0.16,
                  critUp:0.06, ultGain:0.15 }[node.k];
      if(per!==undefined) out[node.k]=(out[node.k]||0)+per*lv;
      else out[node.k]=1;
    }
    return out;
  },

  syncActive(full){
    const c=this.char(), s=this.stats(c.id), rt=G.rt[c.id];
    this.player.char=c;
    this.player.maxHp=s.hp;
    if(full){ rt.hp=Math.min(rt.hp||s.hp, s.hp); }
    this.player.hp=rt.hp;
    this.player.auraGlow=0;
    if(!full){
      this.player.invuln=Math.max(this.player.invuln,0.45);
      FX.ring(this.player.x,this.player.y,DATA.EL[c.el].c,10,110,0.4,4);
      FX.burst(this.player.x,this.player.y-24,DATA.EL[c.el].c,18,300);
    }
  },

  /* --------------------------------------------------------- ввод/тик --- */
  update(dt){
    if(!this.player) return;
    const p=this.player, c=this.char(), s=this.stats(c.id), rt=G.rt[c.id];
    p.char=c; p.maxHp=s.hp;

    this.sinceHit+=dt;
    this.comboT-=dt;
    if(this.comboT<=0 && this.combo>0){ this.combo=0; }

    // таймеры
    p.hurtFlash=Math.max(0,p.hurtFlash-dt*4);
    p.invuln=Math.max(0,p.invuln-dt);
    p.dodgeCd=Math.max(0,p.dodgeCd-dt);
    p.skillCd=Math.max(0,p.skillCd-dt);
    p.chainCd=Math.max(0,(p.chainCd||0)-dt);
    p.atkWindow=Math.max(0,p.atkWindow-dt);
    p.atkCd=Math.max(0,p.atkCd-dt);
    if(p.attacking && p.atkWindow<=0) p.attacking=false;
    p.buffT=Math.max(0,p.buffT-dt);
    p.auraGlow=Math.max(0,p.auraGlow-dt*2);

    if(this.slowmo>0){ this.slowmo-=dt; }
    if(this.flash>0) this.flash-=dt*2.6;

    // движение
    const ax=INPUT.axis();
    const speed=290*s.spd;
    p.moving=(ax.x!==0||ax.y!==0) && p.dodgeT<=0;

    if(p.dodgeT>0){
      // рывок
      p.dodgeT-=dt;
      p.x+=p.dodgeDir.x*760*dt;
      p.y+=p.dodgeDir.y*760*dt;
      FX.list.push({x:p.x,y:p.y-20,vx:0,vy:0,life:0.3,max:0.3,size:7,
        col:DATA.EL[c.el].c,g:0,drag:1,type:'glow'});
    } else {
      let vx=ax.x*speed, vy=ax.y*speed;
      if(p.dashVx||p.dashVy){ vx=p.dashVx; vy=p.dashVy; p.dashVx*=0.86; p.dashVy*=0.86;
        if(Math.abs(p.dashVx)<12) p.dashVx=0; if(Math.abs(p.dashVy)<12) p.dashVy=0; }
      // плавность
      p.vx=U.lerp(p.vx,vx,Math.min(1,dt*18));
      p.vy=U.lerp(p.vy,vy,Math.min(1,dt*18));
      this.moveEntity(p, p.vx*dt, p.vy*dt);
    }

    // прицел по мыши
    const mw=CAM.screenToWorld(INPUT.mouse.x,INPUT.mouse.y);
    p.aim=U.ang(p.x,p.y,mw.x,mw.y);
    p.face=Math.cos(p.aim)>=0?1:-1;

    // ---- действия
    if(INPUT.hit('KeyJ')||INPUT.mouse.down) this.tryAttack();
    if(INPUT.hit('KeyE')) this.useSkill();
    if(INPUT.hit('KeyQ')) this.useUlt();
    if(INPUT.hit('KeyK')||INPUT.mouse.rdown) this.dodge();
    if(INPUT.hit('KeyF')) this.tryChainAttack();
    for(let i=0;i<3;i++) if(INPUT.hit('Digit'+(i+1))) this.swapTo(i);

    // удар в очереди
    if(p.atkTimer>0){
      p.atkTimer-=dt;
      if(p.atkTimer<=0 && p.atkQueued){ this.resolveHit(p.atkQueued); p.atkQueued=null; }
    }

    // ульта-анимация
    if(this.ultFx){
      this.ultFx.t+=dt;
      if(this.ultFx.t>0.55 && !this.ultFx.hit){
        this.ultFx.hit=true;
        this.applyUltDamage(this.ultFx);
      }
      if(this.ultFx.t>1.3) this.ultFx=null;
    }
    if(this.chainFx){
      this.chainFx.t+=dt;
      if(this.chainFx.t>this.chainFx.dur) this.chainFx=null;
    }

    // пули
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateEnemies(dt);
    this.updatePickups(dt);
    this.spawnTick(dt);

    // аура-дебаффы
    if(rt.hp<=0 && !p.downed) this.downActive();
    p.hp=rt.hp;
  },

  /* ----------------------------------------------------------- движение - */
  moveEntity(e,dx,dy){
    const r=e.r||12;
    if(!MAP.solidAt(e.x+dx,e.y,r)) e.x+=dx; else if(e.dashVx) e.dashVx=0;
    if(!MAP.solidAt(e.x,e.y+dy,r)) e.y+=dy; else if(e.dashVy) e.dashVy=0;
    // границы
    e.x=U.clamp(e.x, MAP.ts, (MAP.w-1)*MAP.ts);
    e.y=U.clamp(e.y, MAP.ts, (MAP.h-1)*MAP.ts);
  },

  /* -------------------------------------------------------------- атаки - */
  tryAttack(){
    const p=this.player, c=this.char();
    if(p.atkCd>0) return;
    if(p.atkTimer>0.02) return;
    const hits=c.basic.hits;
    const extra=(this.treeStats(c.id).core1 && c.id==='volt')?1:0;
    const total=hits.length+extra;
    if(p.atkIdx>=total) p.atkIdx=0;
    p.atkIdx++;
    let h=hits[Math.min(p.atkIdx-1,hits.length-1)];
    if(p.atkIdx>hits.length && extra){ // добавочный удар ядра
      h={d:1.35,r:hits[hits.length-1].r*1.1,arc:2.2,kb:26,dur:0.2,aura:1,daze:24,finisher:true};
    }
    p.atkQueued=JSON.parse(JSON.stringify(h));
    p.atkTimer=h.dur;
    p.atkCd=0.06;
    p.attacking=true;
    p.atkWindow=0.85;
    if(h.proj){ /* снаряд уйдёт при resolveHit */ }
    SFX.hit();
  },

  resolveHit(h){
    const p=this.player, c=this.char(), s=this.stats(c.id), el=DATA.EL[c.el];
    const aim=p.aim;
    // визуал взмаха
    const arcH=h.arc||1.2, rad=h.r||80;
    FX.slash(p.x+Math.cos(aim)*rad*0.35, p.y-22+Math.sin(aim)*rad*0.2,
      aim, arcH, rad*0.9, el.c, 0.2, h.finisher?13:8);

    if(c.basic.ranged){
      this.spawnProjectile({
        x:p.x+Math.cos(aim)*22, y:p.y-22+Math.sin(aim)*12,
        vx:Math.cos(aim)*760, vy:Math.sin(aim)*760,
        r:9, dmg:s.atk*h.d*s.basicMul, el:c.el, from:'player',
        life:0.9, col:el.c, kind:h.proj||'orb', daze:h.daze||6, aura:h.aura||0.6,
        finisher:h.finisher,
      });
      return;
    }

    let hitCount=0;
    for(const e of this.enemies){
      if(e.dead) continue;
      const d=U.dist(p.x,p.y,e.x,e.y);
      if(d>rad+e.r) continue;
      const a=U.ang(p.x,p.y,e.x,e.y);
      if(Math.abs(U.angDiff(aim,a))>arcH/2) continue;
      hitCount++;
      this.hitEnemy(e, s.atk*h.d*s.basicMul, {
        el:c.el, aura:h.aura||0.6, daze:h.daze||6, kb:h.kb||8, crit:s.crit,
        src:'basic', from:{x:p.x,y:p.y},
      });
    }
    if(hitCount) this.registerHit(hitCount);
    if(h.finisher){ CAM.shake(5,0.16); }
  },

  registerHit(n){
    this.sinceHit=0;
    this.combo+=n;
    this.comboT=2.6;
    const c=this.char(), s=this.stats(c.id);
    this.addDec(2.4*s.ultGain*n);
    if(this.combo%5===0) FX.text(this.player.x, this.player.y-70,
      this.combo+' КОМБО', '#ffe600', 15, -30);
  },

  addDec(v){
    const rt=this.rt();
    rt.dec=U.clamp(rt.dec+v,0,100);
    if(rt.dec>=100 && !rt.ultReady){
      rt.ultReady=true;
      SFX.uiBig();
      UI.toast('УЛЬТА ГОТОВА · Q','gold');
    }
    if(rt.dec<100) rt.ultReady=false;
  },

  /* ------------------------------------------------------------- навык -- */
  useSkill(){
    const p=this.player, c=this.char(), s=this.stats(c.id), rt=this.rt();
    if(p.skillCd>0 || p.downed) return;
    const sk=c.skill, el=DATA.EL[sk.el||c.el];
    p.skillCd=sk.cd*(1/(s.dodgeMul||1));
    p.attacking=true; p.atkWindow=0.6;
    CAM.shake(6,0.2);
    SFX.reaction();
    this.addDec(8*s.ultGain);
    const dmgBase=s.atk*(sk.d||1.5)*s.skillMul;

    if(sk.type==='dash'||sk.type==='blink'){
      // рывок сквозь врагов
      const ang=p.aim, dist=sk.type==='blink'?260:300;
      const tx=p.x+Math.cos(ang)*dist, ty=p.y+Math.sin(ang)*dist;
      p.invuln=0.4;
      const steps=6;
      for(let i=1;i<=steps;i++){
        const x=U.lerp(p.x,tx,i/steps), y=U.lerp(p.y,ty,i/steps);
        FX.ring(x,y,el.c,4,40,0.3,3);
        FX.spark(x,y,el.c,3,90,0.3,2);
      }
      p.dashVx=Math.cos(ang)*dist*4; p.dashVy=Math.sin(ang)*dist*4;
      // урон по пути
      for(const e of this.enemies){
        if(e.dead) continue;
        const d=U.dist(p.x,p.y,e.x,e.y);
        if(d>dist*0.85) continue;
        const a=U.ang(p.x,p.y,e.x,e.y);
        if(Math.abs(U.angDiff(ang,a))>0.85) continue;
        for(let i=0;i<(sk.hits||1);i++){
          setTimeout(()=>{ if(!e.dead) this.hitEnemy(e, dmgBase*0.42, {
            el:c.el, aura:0.9, daze:sk.daze||10, kb:10, crit:s.crit, src:'skill',
            from:{x:p.x,y:p.y} }); }, i*70);
        }
      }
      FX.ring(p.x,p.y,el.c,20,240,0.5,6);
    }
    else if(sk.type==='aoe'){
      const R=sk.radius||150;
      FX.ring(p.x,p.y,el.c,20,R,0.45,8);
      FX.burst(p.x,p.y,el.c,22,340);
      for(const e of this.enemies){
        if(e.dead) continue;
        if(U.dist(p.x,p.y,e.x,e.y)>R+e.r) continue;
        this.hitEnemy(e, dmgBase, { el:c.el, aura:1, daze:sk.daze||20, kb:34,
          crit:s.crit, src:'skill', from:{x:p.x,y:p.y} });
        if(sk.stun) e.stunT=Math.max(e.stunT,sk.stun);
      }
      CAM.shake(9,0.28);
      SFX.heavy();
    }
    else if(sk.type==='ring'){
      const R=sk.radius||180;
      for(let i=0;i<3;i++) setTimeout(()=>FX.ring(p.x,p.y,el.c,20+i*30,R,0.45,5), i*80);
      for(const e of this.enemies){
        if(e.dead) continue;
        if(U.dist(p.x,p.y,e.x,e.y)>R+e.r) continue;
        this.hitEnemy(e, dmgBase, { el:c.el, aura:1, daze:sk.daze||18, kb:40,
          crit:s.crit, src:'skill', from:{x:p.x,y:p.y} });
      }
      CAM.shake(7,0.25);
    }
    else if(sk.type==='wall'){
      const len=sk.len||200, ang=p.aim;
      for(let i=0;i<5;i++){
        const t=(i/4-0.5)*len;
        this.zones.push({x:p.x+Math.cos(ang)*t+Math.cos(ang)*40,
          y:p.y+Math.sin(ang)*t+Math.sin(ang)*40,
          r:40, t:0, dur:5, dps:s.atk*0.34, el:c.el, col:el.c, kind:'fire'});
      }
      FX.ring(p.x,p.y,el.c,20,len*0.6,0.4,5);
      CAM.shake(5,0.2);
    }
    else if(sk.type==='pull'){
      const R=sk.radius||170;
      for(const e of this.enemies){
        if(e.dead) continue;
        const d=U.dist(p.x,p.y,e.x,e.y);
        if(d>R+e.r) continue;
        const a=U.ang(e.x,e.y,p.x,p.y);
        e.x+=Math.cos(a)*70; e.y+=Math.sin(a)*70;
        this.hitEnemy(e, dmgBase*0.7, { el:c.el, aura:1, daze:sk.daze||16, kb:0,
          crit:s.crit, src:'skill', from:{x:p.x,y:p.y} });
      }
      FX.ring(p.x,p.y,el.c,R,20,0.4,6);
      setTimeout(()=>{
        for(const e of this.enemies){
          if(e.dead) continue;
          if(U.dist(p.x,p.y,e.x,e.y)>R*0.8) continue;
          this.hitEnemy(e, dmgBase*0.8, { el:c.el, aura:0.8, daze:12, kb:26,
            crit:s.crit, src:'skill', from:{x:p.x,y:p.y} });
        }
        FX.slash(p.x,p.y-22,p.aim,3.6,R*0.8,el.c,0.25,16);
      },180);
    }
    else if(sk.type==='buff'){
      const R=sk.radius||200;
      p.buffT=8; p.buffAtk=0.25;
      G.rt[c.id].hp=Math.min(G.rt[c.id].hp+s.hp*0.12, s.hp);
      for(const id of this.party){
        const st=this.stats(id);
        G.rt[id].hp=Math.min(G.rt[id].hp+st.hp*0.08, st.hp);
      }
      this.addDec(15*s.ultGain);
      FX.ring(p.x,p.y,el.c,10,R,0.7,5);
      FX.burst(p.x,p.y-24,el.c,26,220);
      UI.toast('РЕЗОНАНС · +25% АТК на 8 с','gold');
      for(const e of this.enemies){
        if(e.dead) continue;
        if(U.dist(p.x,p.y,e.x,e.y)>R+e.r) continue;
        this.hitEnemy(e, s.atk*0.8, { el:c.el, aura:1, daze:10, kb:16, crit:s.crit,
          src:'skill', from:{x:p.x,y:p.y} });
      }
    }
    else if(sk.type==='shield'){
      const R=sk.radius||130;
      p.shield=Math.max(p.shield, s.hp*0.22);
      FX.ring(p.x,p.y,el.c,10,R,0.5,6);
      for(const e of this.enemies){
        if(e.dead) continue;
        if(U.dist(p.x,p.y,e.x,e.y)>R+e.r) continue;
        this.hitEnemy(e, dmgBase, { el:c.el, aura:1, daze:sk.daze||20, kb:30,
          crit:s.crit, src:'skill', from:{x:p.x,y:p.y} });
      }
      UI.toast('БАСТИОН · щит '+Math.round(s.hp*0.22),'gold');
      CAM.shake(7,0.2);
    }
    p.auraGlow=1;
  },

  /* -------------------------------------------------------------- ульта - */
  useUlt(){
    const p=this.player, c=this.char(), s=this.stats(c.id), rt=this.rt();
    if(rt.dec<100 || p.ultT>0) return;
    rt.dec=0; rt.ultReady=false;
    p.ultT=1.4; p.invuln=1.5;
    this.ultFx={t:0, hit:false, char:c, atk:s.atk, crit:s.crit, mul:s.chainMul};
    this.slowmo=0.45;
    this.flash=1; this.flashCol=DATA.EL[c.el].c;
    CAM.shake(14,0.6);
    SFX.ult();
    UI.toast('『'+c.ult.name+'』','gold');
    for(let i=0;i<3;i++) setTimeout(()=>FX.ring(p.x,p.y,DATA.EL[c.el].c,20,300+i*60,0.6,6),i*120);
  },

  applyUltDamage(u){
    const p=this.player, c=u.char, el=DATA.EL[c.el];
    const R=340;
    FX.burst(p.x,p.y,el.c,60,520);
    CAM.shake(16,0.5);
    SFX.heavy();
    const n=6;
    for(let i=0;i<n;i++){
      setTimeout(()=>{
        for(const e of this.enemies){
          if(e.dead) continue;
          if(U.dist(p.x,p.y,e.x,e.y)>R+e.r) continue;
          this.hitEnemy(e, u.atk*c.ult.d*0.28*u.mul, { el:c.el, aura:1, daze:20,
            kb:18, crit:u.crit+0.15, src:'chain', from:{x:p.x,y:p.y} });
          FX.spark(e.x,e.y-20,el.c,8,240,0.5,3);
        }
        FX.ring(p.x,p.y,el.c,40+i*40,R,0.4,5);
      }, i*90);
    }
    // хил команды от эфирных
    if(c.id==='eho'){
      for(const id of this.party){
        const st=this.stats(id);
        G.rt[id].hp=Math.min(G.rt[id].hp+st.hp*0.35, st.hp);
      }
    }
    if(c.id==='iney'){ // заморозка
      for(const e of this.enemies){
        if(!e.dead && U.dist(p.x,p.y,e.x,e.y)<R) e.frozen=Math.max(e.frozen,3);
      }
    }
    if(c.id==='pepel'){ // горение земли
      for(let i=0;i<6;i++){
        const a=i/6*6.283;
        this.zones.push({x:p.x+Math.cos(a)*150,y:p.y+Math.sin(a)*150,r:70,t:0,dur:5,
          dps:u.atk*0.3,el:'fire',col:'#ff4d1a',kind:'fire'});
      }
    }
  },

  /* ------------------------------------------------------- цепная атака - */
  tryChainAttack(){
    const p=this.player, c=this.char(), s=this.stats(c.id);
    // ищем оглушённого врага
    let target=null, best=1e9;
    for(const e of this.enemies){
      if(e.dead||e.stunT<=0) continue;
      const d=U.dist(p.x,p.y,e.x,e.y);
      if(d<420 && d<best){ best=d; target=e; }
    }
    if(!target){ UI.toast('Нет оглушённой цели','warn'); return; }
    if(p.chainCd>0) return;
    p.chainCd=1.2;
    this.slowmo=0.3;
    this.chainFx={t:0,dur:0.9,target,char:c};
    CAM.shake(10,0.4);
    SFX.reaction();
    const el=DATA.EL[c.el];
    // телепорт к цели
    const a=U.ang(target.x,target.y,p.x,p.y);
    p.x=target.x+Math.cos(a)*70; p.y=target.y+Math.sin(a)*70;
    for(let i=0;i<6;i++){
      setTimeout(()=>{
        if(target.dead) return;
        this.hitEnemy(target, s.atk*0.55*s.chainMul, { el:c.el, aura:1, daze:0,
          kb:6, crit:s.crit+0.2, src:'chain', from:{x:p.x,y:p.y} });
        FX.slash(target.x,target.y-20,Math.random()*6.28,2.4,90,el.c,0.22,10);
      }, i*95);
    }
    this.addDec(22*s.ultGain);
    this.combo+=6; this.comboT=3;
    UI.toast('ЦЕПНАЯ АТАКА','gold');
  },

  /* ------------------------------------------------------------- уклон - */
  dodge(){
    const p=this.player;
    if(p.dodgeCd>0) return;
    const ax=INPUT.axis();
    let dx=ax.x, dy=ax.y;
    if(!dx&&!dy){ dx=Math.cos(p.aim); dy=Math.sin(p.aim); }
    const len=Math.hypot(dx,dy)||1;
    p.dodgeDir={x:dx/len,y:dy/len};
    p.dodgeT=0.22;
    p.dodgeCd=0.85;
    p.invuln=0.34;
    p.attacking=false;
    FX.ring(p.x,p.y,'#ffffff',6,44,0.3,3);
    SFX.dodge();
    // идеальный уклон: если рядом летит снаряд
    let perfect=false;
    for(const pr of this.projs){
      if(pr.from!=='enemy') continue;
      if(U.dist(pr.x,pr.y,p.x,p.y)<70) perfect=true;
    }
    for(const e of this.enemies){
      if(!e.dead && e.wind>0 && e.wind<0.2 && U.dist(e.x,e.y,p.x,p.y)<e.r+70) perfect=true;
    }
    if(perfect){
      this.slowmo=0.32;
      this.addDec(14);
      this.combo+=2; this.comboT=2.6;
      FX.text(p.x,p.y-64,'ИДЕАЛЬНО','#22e0ff',15,-40);
      SFX.crit();
    }
  },

  /* ------------------------------------------------------------ смена --- */
  swapTo(i){
    if(i===this.active || i<0 || i>=this.party.length) return;
    const id=this.party[i], rt=G.rt[id];
    if(rt.hp<=0) { UI.toast('Агент выведен из строя','warn'); return; }
    const chain = this.sinceHit<0.55 || this.player.attacking;
    this.active=i;
    this.syncActive(false);
    SFX.swap();
    if(chain) this.chainSwap();
    UI.refreshTeam();
  },

  chainSwap(){
    const p=this.player, c=this.char(), s=this.stats(c.id), el=DATA.EL[c.el];
    p.invuln=Math.max(p.invuln,0.3);
    this.slowmo=0.18;
    this.addDec(10*s.ultGain);
    FX.ring(p.x,p.y,el.c,10,150,0.4,5);
    FX.burst(p.x,p.y-22,el.c,20,300);
    CAM.shake(6,0.2);
    let hits=0;
    for(const e of this.enemies){
      if(e.dead) continue;
      if(U.dist(p.x,p.y,e.x,e.y)>160+e.r) continue;
      hits++;
      // гарантированная реакция при смене элемента
      this.hitEnemy(e, s.atk*1.05*s.chainMul, { el:c.el, aura:1, daze:16, kb:18,
        crit:s.crit, src:'chain', from:{x:p.x,y:p.y} });
      if(c.id==='volt' && this.treeStats(c.id).core2){
        this.zones.push({x:e.x,y:e.y,r:60,t:0,dur:0.4,dps:s.atk*0.6,el:'elec',
          col:'#a86bff',kind:'zap'});
      }
    }
    if(hits){ this.combo+=hits; this.comboT=2.8; FX.text(p.x,p.y-72,'СЦЕПКА','#c8ff1e',16,-40); }
  },

  /* ------------------------------------------------------------ урон ---- */
  hitEnemy(e, rawDmg, o={}){
    if(e.dead) return 0;
    const defF=1-e.dfn/(e.dfn+340);
    let dmg=rawDmg*defF;
    if(e.defDown>0) dmg*=1/(1-e.defDown);
    let crit=false;
    if(o.crit && Math.random()<o.crit){ crit=true; dmg*=1.85; }
    if(e.frozen>0) dmg*=1.8;
    if(e.stunT>0) dmg*=1.45;
    dmg*=1+Math.min(this.combo,25)*0.025;

    e.hp-=dmg;
    e.hurtFlash=0.16;
    e.flashT=0.1;
    // отброс
    if(o.kb && e.kbResist!==1){
      const a=U.ang(o.from?o.from.x:e.x, o.from?o.from.y:e.y, e.x, e.y);
      e.kx=Math.cos(a)*o.kb*7; e.ky=Math.sin(a)*o.kb*7;
    }
    // шкала оглушения
    if(o.daze){
      const c=this.char();
      const dazeUp=this.stats(c.id).dazeUp;
      e.daze+=o.daze*(1+dazeUp);
      if(e.daze>=e.dazeMax && e.stunT<=0){
        e.daze=0;
        e.stunT=e.boss?1.6:3.2;
        FX.text(e.x,e.y-e.r*2.2,'ОГЛУШЁН','#ffe600',17,-46);
        FX.ring(e.x,e.y,'#ffe600',10,70,0.5,5);
        CAM.shake(6,0.2);
        SFX.heavy();
      }
    }
    // стихия
    if(o.el && o.aura>0) this.applyAura(e, o.el, o.aura);
    // цифры
    FX.text(e.x+U.rand(12,-12), e.y-e.r*1.9, Math.round(dmg).toString(),
      crit?'#ffdf3d':'#ffffff', crit?22:16, -56, crit);
    FX.spark(e.x,e.y-e.r, o.el?DATA.EL[o.el].c:'#fff', crit?10:5, crit?260:170, 0.35, 2.4);
    if(crit) SFX.crit(); else SFX.hit();
    if(crit||dmg>400) CAM.shake(crit?7:4,0.14);

    if(e.hp<=0) this.killEnemy(e);
    return dmg;
  },

  applyAura(e, elId, strength){
    const cur=e.aura;
    if(cur && cur.el!==elId){
      const r=DATA.getReaction(cur.el, elId);
      if(r){ this.doReaction(e, r, cur.el, elId); }
      e.aura={el:elId,t:Math.max(4,8*strength)*0.7};
    } else {
      e.aura={el:elId,t:Math.max(cur?cur.t:0, 8*strength)};
    }
  },

  doReaction(e, r, elA, elB){
    const c=this.char(), s=this.stats(c.id);
    const amp=1+s.reactionAmp;
    let dmg=s.atk*r.dmg*amp*(1+Math.min(this.combo,25)*0.02);
    if(c.id==='lyumen' && this.treeStats(c.id).core2) dmg*=2;

    e.hp-=dmg;
    e.hurtFlash=0.2;
    FX.text(e.x,e.y-e.r*2.4, r.n, r.c, 20, -70);
    FX.text(e.x+U.rand(14,-14),e.y-e.r*1.6, Math.round(dmg).toString(), r.c, 18, -50);
    FX.ring(e.x,e.y,r.c,10,120,0.5,6);
    FX.burst(e.x,e.y-e.r,r.c,26,380);
    CAM.shake(9,0.26);
    SFX.reaction();
    this.combo+=3; this.comboT=3.2;
    this.addDec(7*s.ultGain);
    G.save.stats.reactions=(G.save.stats.reactions||0)+1;

    const R=r.aoe||0;
    if(R>0){
      for(const o of this.enemies){
        if(o===e||o.dead) continue;
        if(U.dist(e.x,e.y,o.x,o.y)>R) continue;
        o.hp-=dmg*0.45;
        o.hurtFlash=0.15;
        FX.text(o.x,o.y-o.r*1.8,Math.round(dmg*0.45),r.c,13,-40);
        if(o.hp<=0) this.killEnemy(o);
      }
      FX.ring(e.x,e.y,r.c,20,R,0.45,5);
    }
    if(r.fx==='groundfire'){
      for(let i=0;i<3;i++){
        const a=Math.random()*6.283, d=U.rand(R,R*0.3);
        this.zones.push({x:e.x+Math.cos(a)*d,y:e.y+Math.sin(a)*d,r:50,t:0,dur:5,
          dps:s.atk*0.34,el:'fire',col:'#ff8a3d',kind:'fire'});
      }
    }
    if(r.dot){ e.dot={dps:s.atk*r.dot, t:r.dur||6, el:elB}; }
    if(r.def!==undefined){ e.defDown=r.def; e.defDownT=r.dur||8; }
    if(r.atkDown!==undefined){ e.atkDown=r.atkDown; e.atkDownT=r.dur||8; }
    if(r.freeze||r.stun){ e.frozen=Math.max(e.frozen,r.freeze||0); e.stunT=Math.max(e.stunT,r.stun||0); }
    if(r.fx==='chain'){
      let n=0;
      const others=this.enemies.filter(o=>o!==e&&!o.dead)
        .sort((a,b)=>U.dist(e.x,e.y,a.x,a.y)-U.dist(e.x,e.y,b.x,b.y)).slice(0,r.targets||3);
      for(const o of others){
        o.hp-=dmg*0.65; o.hurtFlash=0.16;
        FX.text(o.x,o.y-o.r*1.8,Math.round(dmg*0.65),r.c,13,-40);
        FX.slash((e.x+o.x)/2,(e.y+o.y)/2,U.ang(e.x,e.y,o.x,o.y),0.4,120,r.c,0.25,5);
        if(o.hp<=0) this.killEnemy(o);
        n++;
      }
    }
    if(r.fx==='shatter' && e.frozen>0){ e.frozen=0; e.hp-=dmg*r.bonus; }
    if(e.hp<=0) this.killEnemy(e);
  },

  killEnemy(e){
    if(e.dead) return;
    e.dead=true;
    this.kills++;
    FX.burst(e.x,e.y-e.r,DATA.EL[e.def.el].c,e.boss?60:18,e.boss?500:260);
    FX.ring(e.x,e.y,DATA.EL[e.def.el].c,10,e.r*3,0.5,4);
    CAM.shake(e.boss?18:4, e.boss?0.7:0.15);
    SFX.die();
    this.addDec(e.boss?40:5);
    this.combo+=e.boss?10:1; this.comboT=3;

    // награды
    const lvlMul=1+0.18*(e.lvl-1);
    const xp=Math.round(e.def.xp*lvlMul*(e.boss?1:1));
    const cr=Math.round(e.def.cr*lvlMul);
    G.save.credits+=cr;
    G.save.stats.kills=(G.save.stats.kills||0)+1;
    // опыт всей команде
    for(const id of this.party){
      this.gainXp(id, Math.round(xp*(id===this.party[this.active]?1:0.6)));
    }
    // дроп
    this.pickups.push({x:e.x,y:e.y,vx:U.rand(60,-60),vy:U.rand(-40,-120),t:0,
      kind:'credits',v:cr,col:'#bfc9d8'});
    if(Math.random()<0.28||e.boss){
      this.pickups.push({x:e.x,y:e.y,vx:U.rand(60,-60),vy:U.rand(-40,-120),t:0,
        kind:'eth',v:e.boss?120:20,col:'#ffe14d'});
    }
    if(Math.random()<0.18||e.boss){
      this.pickups.push({x:e.x,y:e.y,vx:U.rand(60,-60),vy:U.rand(-40,-120),t:0,
        kind:'chip',v:e.boss?3:1,col:'#c8ff1e'});
    }
    FX.text(e.x,e.y-e.r*2,'+'+cr+' КР','#bfc9d8',13,-44);

    if(e.boss){
      G.save.bossKilled[e.bossId]=true;
      this.boss=null;
      G.save.eth+=120; G.save.sp+=2;
      UI.toast('БОСС ПОВЕРЖЕН · +120 эфиритов, +2 SP','gold');
      G.save.stats.bosses=(G.save.stats.bosses||0)+1;
      Store.save();
    }
    // задания
    QM.onKill(e);
  },

  gainXp(id, amount){
    const r=G.save.roster[id];
    if(!r) return;
    r.xp+=amount;
    let need=DATA.XP_TABLE(r.level);
    let ups=0;
    while(r.xp>=need && r.level<60){
      r.xp-=need; r.level++; ups++;
      need=DATA.XP_TABLE(r.level);
    }
    if(ups){
      G.save.sp+=ups;
      const c=DATA.CHARS.find(x=>x.id===id);
      UI.toast(c.name+' · ур. '+r.level+' (+'+ups+' SP)','gold');
      SFX.levelup();
      if(id===this.party[this.active]){
        const s=this.stats(id);
        G.rt[id].hp=Math.min(G.rt[id].hp+s.hp*0.3, s.hp);
        this.syncActive(false);
      }
    }
  },

  /* ------------------------------------------------------------ игрок --- */
  hurtPlayer(dmg, srcEl){
    const p=this.player, c=this.char(), s=this.stats(c.id), rt=this.rt();
    if(p.invuln>0||p.downed) return;
    if(p.shield>0){
      const absorb=Math.min(p.shield,dmg);
      p.shield-=absorb; dmg-=absorb;
      FX.ring(p.x,p.y,'#cfd8e6',10,40,0.3,4);
      FX.text(p.x,p.y-58,'ЩИТ','#cfd8e6',12,-30);
      if(dmg<=0){ SFX.hurt(); CAM.shake(4,0.12); return; }
    }
    const defF=1-s.def/(s.def+420);
    dmg*=defF;
    rt.hp-=dmg;
    p.hurtFlash=1;
    p.invuln=0.55;
    CAM.shake(8,0.3);
    this.flash=0.5; this.flashCol='#ff2222';
    SFX.hurt();
    FX.text(p.x,p.y-58,'-'+Math.round(dmg),'#ff5a5a',17,-50);
    this.combo=0;
    if(rt.hp<=0) this.downActive();
    p.hp=rt.hp;
  },

  downActive(){
    const p=this.player, id=this.party[this.active];
    G.rt[id].hp=0;
    p.downed=true;
    FX.burst(p.x,p.y-20,'#ff3b30',30,300);
    UI.toast(DATA.CHARS.find(c=>c.id===id).name+' выведен из строя','warn');
    // ищем живого
    for(let i=0;i<this.party.length;i++){
      if(G.rt[this.party[i]].hp>0){
        this.active=i; p.downed=false; this.syncActive(true);
        UI.refreshTeam();
        return;
      }
    }
    this.wipe();
  },

  wipe(){
    UI.toast('КОМАНДА УНИЧТОЖЕНА · возврат в Кайрос','warn');
    this.player.x=48*MAP.ts; this.player.y=20*MAP.ts;
    for(const id of this.party){
      const s=this.stats(id);
      G.rt[id].hp=s.hp*0.5; G.rt[id].dec=0;
    }
    this.enemies=[]; this.projs=[]; this.zones=[];
    this.player.downed=false;
    this.syncActive(true);
    G.save.stats.deaths=(G.save.stats.deaths||0)+1;
    UI.refreshTeam();
    Store.save();
  },

  /* ----------------------------------------------------------- снаряды -- */
  spawnProjectile(o){
    this.projs.push(Object.assign({life:1.2,homing:0,trail:[]},o));
  },

  updateProjectiles(dt){
    const p=this.player;
    for(let i=this.projs.length-1;i>=0;i--){
      const pr=this.projs[i];
      pr.life-=dt;
      if(pr.homing>0){
        const tx=p.x,ty=p.y-20;
        const a=U.ang(pr.x,pr.y,tx,ty);
        const ca=U.ang(0,0,pr.vx,pr.vy);
        const na=ca+U.angDiff(ca,a)*Math.min(1,pr.homing*dt);
        const sp=Math.hypot(pr.vx,pr.vy);
        pr.vx=Math.cos(na)*sp; pr.vy=Math.sin(na)*sp;
      }
      pr.x+=pr.vx*dt; pr.y+=pr.vy*dt;
      if(pr.life<=0||MAP.solidAt(pr.x,pr.y,4)){ this.projs.splice(i,1); continue; }

      if(pr.from==='player'){
        for(const e of this.enemies){
          if(e.dead) continue;
          if(U.dist(pr.x,pr.y,e.x,e.y)<e.r+pr.r){
            this.hitEnemy(e, pr.dmg, { el:pr.el, aura:pr.aura, daze:pr.daze||6,
              kb:8, crit:0.08, src:'basic', from:{x:pr.x,y:pr.y} });
            FX.burst(pr.x,pr.y,pr.col,10,200);
            this.registerHit(1);
            this.projs.splice(i,1);
            break;
          }
        }
      } else {
        if(U.dist(pr.x,pr.y,p.x,p.y-16)<p.r+pr.r){
          this.hurtPlayer(pr.dmg, pr.el);
          FX.burst(pr.x,pr.y,pr.col,10,200);
          this.projs.splice(i,1);
        }
      }
    }
  },

  updateZones(dt){
    const p=this.player;
    for(let i=this.zones.length-1;i>=0;i--){
      const z=this.zones[i];
      z.t+=dt;
      if(z.t>z.dur){ this.zones.splice(i,1); continue; }
      if(z.tick===undefined) z.tick=0;
      z.tick-=dt;
      if(z.tick>0) continue;
      z.tick=0.5;
      // зоны бьют врагов (игрока, если это зона врага)
      if(z.hostile){
        if(U.dist(p.x,p.y,z.x,z.y)<z.r) this.hurtPlayer(z.dps*0.5);
      } else {
        for(const e of this.enemies){
          if(e.dead) continue;
          if(U.dist(e.x,e.y,z.x,z.y)>z.r+e.r*0.5) continue;
          this.hitEnemy(e, z.dps*0.5, { el:z.el, aura:0.35, daze:2, kb:0,
            crit:0.05, src:'skill', from:{x:z.x,y:z.y} });
        }
      }
    }
  },

  updatePickups(dt){
    const p=this.player;
    for(let i=this.pickups.length-1;i>=0;i--){
      const k=this.pickups[i];
      k.t+=dt;
      k.x+=k.vx*dt; k.y+=k.vy*dt;
      k.vx*=0.94; k.vy*=0.94;
      const d=U.dist(k.x,k.y,p.x,p.y-20);
      if(d<110){
        const a=U.ang(k.x,k.y,p.x,p.y-20);
        k.x+=Math.cos(a)*380*dt; k.y+=Math.sin(a)*380*dt;
      }
      if(d<26){
        if(k.kind==='credits'){ G.save.credits+=k.v; }
        if(k.kind==='eth'){ G.save.eth+=k.v; }
        if(k.kind==='chip'){ G.save.chips+=k.v; }
        if(k.kind==='sp'){ G.save.sp+=k.v; }
        FX.text(p.x,p.y-70,'+'+k.v+' '+({credits:'КР',eth:'ЭФ',chip:'ЧП',sp:'SP'})[k.kind],k.col,13,-40);
        SFX.pickup();
        this.pickups.splice(i,1);
      }
    }
  },

  /* ------------------------------------------------------------- враги -- */
  spawnEnemy(type,x,y,lvl,isBoss,id){
    const def=DATA.ENEMIES[type];
    if(!def) return null;
    const L=lvl||def.lvl||1;
    const hpMul=1+0.34*(L-1);
    const atkMul=1+0.2*(L-1);
    const e={
      type, def, boss:!!def.boss, bossId:id, elite:!!def.elite,
      x, y, r:def.r, face:1, seed:Math.random()*6.28,
      hp:def.hp*hpMul, maxHp:def.hp*hpMul,
      atk:def.atk*atkMul,
      spd:def.spd*(1+0.02*(L-1)), lvl:L,
      daze:0, dazeMax: def.boss?520: def.elite?220:100,
      stunT:0, frozen:0, aura:null, dot:null,
      defDown:0, defDownT:0, atkDown:0, atkDownT:0,
      kx:0, ky:0, hurtFlash:0, dead:false, wind:0, atkCd:U.rand(1.6,0.3),
      state:'idle', t:Math.random()*6, charge:0, special:U.rand(5,3),
      kbResist: def.boss?1:0, target:null,
      dfn: def.def*(1+0.18*(L-1)),
    };
    this.enemies.push(e);
    if(e.boss) this.boss=e;
    return e;
  },

  updateEnemies(dt){
    const p=this.player, c=this.char();
    for(const e of this.enemies){
      if(e.dead) continue;
      e.t+=dt;
      e.hurtFlash=Math.max(0,e.hurtFlash-dt*5);
      e.stunT=Math.max(0,e.stunT-dt);
      e.frozen=Math.max(0,e.frozen-dt);
      e.defDownT=Math.max(0,e.defDownT-dt); if(e.defDownT<=0) e.defDown=0;
      e.atkDownT=Math.max(0,e.atkDownT-dt); if(e.atkDownT<=0) e.atkDown=0;
      if(e.aura){ e.aura.t-=dt; if(e.aura.t<=0) e.aura=null; }
      if(e.dot){ e.dot.t-=dt; if(e.dot.t<=0) e.dot=null;
        else if(e.dot.tick===undefined||(e.dot.tick-=dt)<=0){
          e.dot.tick=1; e.hp-=e.dot.dps; e.hurtFlash=0.08;
          FX.text(e.x+U.rand(8,-8),e.y-e.r*1.6,Math.round(e.dot.dps),
            DATA.EL[e.dot.el||'fire'].c,11,-30);
          if(e.hp<=0){ this.killEnemy(e); continue; }
        }
      }
      // отброс
      if(e.kx||e.ky){
        this.moveEntity(e,e.kx*dt,e.ky*dt);
        e.kx*=0.86; e.ky*=0.86;
        if(Math.abs(e.kx)<6) e.kx=0;
        if(Math.abs(e.ky)<6) e.ky=0;
      }
      if(e.stunT>0||e.frozen>0) continue;

      const d=U.dist(e.x,e.y,p.x,p.y);
      const a=U.ang(e.x,e.y,p.x,p.y);
      e.face=Math.cos(a)>=0?1:-1;
      const spd=e.spd*(1-(e.atkDown||0)*0.4);

      // агрессия
      if(d>620 && !e.boss){ continue; }

      switch(e.def.ai){
        case 'chase': {
          if(d>e.r+34){ this.moveEntity(e, Math.cos(a)*spd*dt, Math.sin(a)*spd*dt); }
          e.atkCd-=dt;
          if(d<e.r+44 && e.atkCd<=0 && e.wind<=0){ e.wind=0.42; e.atkCd=U.rand(2.2,1.1); }
          break; }
        case 'ranged': {
          const ideal=230;
          if(d>ideal+40){ this.moveEntity(e, Math.cos(a)*spd*dt, Math.sin(a)*spd*dt); }
          else if(d<ideal-60){ this.moveEntity(e, -Math.cos(a)*spd*dt, -Math.sin(a)*spd*dt); }
          e.atkCd-=dt;
          if(e.atkCd<=0 && d<430){ e.wind=0.5; e.atkCd=U.rand(2.8,1.7); }
          break; }
        case 'charge': {
          if(e.charge>0){
            e.charge-=dt;
            this.moveEntity(e, Math.cos(e.chargeA)*520*dt, Math.sin(e.chargeA)*520*dt);
            if(d<e.r+40) this.hurtPlayer(e.atk*0.8, e.def.el);
            continue;
          }
          if(d>70) this.moveEntity(e, Math.cos(a)*spd*dt, Math.sin(a)*spd*dt);
          e.atkCd-=dt;
          if(e.atkCd<=0 && d<340){ e.wind=0.55; e.atkCd=U.rand(3.4,2.2);
            e.chargeA=a; e.chargePending=true; }
          break; }
        case 'brute': {
          if(d>e.r+50) this.moveEntity(e, Math.cos(a)*spd*dt, Math.sin(a)*spd*dt);
          e.atkCd-=dt;
          if(d<e.r+80 && e.atkCd<=0 && e.wind<=0){ e.wind=0.75; e.atkCd=U.rand(3.2,2.2); }
          break; }
        case 'boss': {
          e.special-=dt;
          if(d>e.r+60) this.moveEntity(e, Math.cos(a)*spd*dt, Math.sin(a)*spd*dt);
          e.atkCd-=dt;
          if(e.atkCd<=0 && d<e.r+130){ e.wind=0.7; e.atkCd=U.rand(2.6,1.7); }
          if(e.special<=0){
            e.special=U.rand(7,4.5);
            const hpK=e.hp/e.maxHp;
            if(hpK<0.5 && Math.random()<0.5){
              // кольцо снарядов
              for(let i=0;i<10;i++){
                const ang=i/10*6.283+e.t;
                this.spawnProjectile({x:e.x,y:e.y-30,vx:Math.cos(ang)*230,vy:Math.sin(ang)*230,
                  r:10,dmg:e.atk*0.55,el:e.def.el,from:'enemy',life:2.4,
                  col:DATA.EL[e.def.el].c,kind:'orb'});
              }
              FX.ring(e.x,e.y-20,DATA.EL[e.def.el].c,20,180,0.5,5);
            } else {
              // рывок
              e.charge=0.5; e.chargeA=a;
              FX.ring(e.x,e.y,DATA.EL[e.def.el].c,20,120,0.4,4);
            }
          }
          break; }
      }

      // телеграф → удар
      if(e.wind>0){
        e.wind-=dt;
        if(e.wind<=0){
          const reach = e.def.ai==='brute'||e.def.ai==='boss' ? e.r+95 : e.r+55;
          if(e.chargePending){ e.chargePending=false; e.charge=0.42; }
          if(e.def.atkType==='proj'||e.def.atkType==='homing'){
            this.spawnProjectile({x:e.x,y:e.y-e.r*0.8,
              vx:Math.cos(a)*300,vy:Math.sin(a)*300,r:9,
              dmg:e.atk,el:e.def.el,from:'enemy',life:2.6,
              col:DATA.EL[e.def.el].c,kind:'orb',homing:e.def.atkType==='homing'?1.6:0});
          } else if(e.def.atkType==='aoe'){
            this.zones.push({x:p.x,y:p.y,r:70,t:0,dur:0.8,dps:e.atk*1.2,
              el:e.def.el,col:DATA.EL[e.def.el].c,hostile:true});
            FX.ring(p.x,p.y,DATA.EL[e.def.el].c,10,70,0.7,4);
          } else if(e.def.atkType==='slam'){
            FX.ring(e.x,e.y,DATA.EL[e.def.el].c,10,reach+40,0.35,6);
            CAM.shake(6,0.2);
            if(U.dist(e.x,e.y,p.x,p.y)<reach+30) this.hurtPlayer(e.atk, e.def.el);
          } else {
            FX.slash(e.x,e.y-e.r*0.7,a,1.6,reach,DATA.EL[e.def.el].c,0.2,7);
            if(U.dist(e.x,e.y,p.x,p.y)<reach) this.hurtPlayer(e.atk, e.def.el);
          }
        }
      }
    }
    // чистка
    this.enemies=this.enemies.filter(e=>!e.dead);
  },

  spawnTick(dt){
    this.spawnT-=dt;
    if(this.spawnT>0) return;
    this.spawnT=1.6;
    const reg=MAP.regionAt(this.player.x,this.player.y);
    if(reg.safe) return;
    const alive=this.enemies.filter(e=>!e.dead).length;
    const cap=8;
    if(alive>=cap) return;
    // точка спавна в радиусе
    const near=MAP.spawns.filter(s=>s.region===reg.id &&
      U.dist(s.x,s.y,this.player.x,this.player.y)<1100 &&
      U.dist(s.x,s.y,this.player.x,this.player.y)>320);
    if(!near.length) return;
    const sp=U.choice(near);
    const type=U.choice(sp.types);
    const lvl=U.randi(sp.lvl[1],sp.lvl[0]);
    this.spawnEnemy(type, sp.x+U.rand(60,-60), sp.y+U.rand(60,-60), lvl);
    // боссы
    for(const b of MAP.bossSpots){
      if(G.save.bossKilled[b.id]) continue;
      if(U.dist(b.x,b.y,this.player.x,this.player.y)<420 && !this.boss){
        this.spawnEnemy(b.id,b.x,b.y,b.lvl,true,b.id);
        UI.toast('ОБНАРУЖЕН БОСС: '+DATA.ENEMIES[b.id].n,'warn');
        SFX.ult();
        CAM.shake(12,0.8);
      }
    }
  },

  /* ------------------------------------------------------------- отрисовка */
  draw(ctx,t){
    // зоны
    for(const z of this.zones){
      const k=z.t/z.dur, a=1-k;
      ctx.save();
      ctx.globalAlpha=0.25*a;
      const g=ctx.createRadialGradient(z.x,z.y,0,z.x,z.y,z.r);
      g.addColorStop(0,z.col); g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.ellipse(z.x,z.y,z.r,z.r*0.55,0,0,6.2832); ctx.fill();
      ctx.globalAlpha=0.5*a; ctx.strokeStyle=z.col; ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(z.x,z.y,z.r*0.95,z.r*0.52,0,0,6.2832); ctx.stroke();
      ctx.restore();
    }

    // враги
    for(const e of this.enemies){
      if(!CAM.visible(e.x,e.y,80)) continue;
      ART.drawEnemy(ctx,e,t);
      // телеграф атаки — сектор в сторону цели / круг для площадных
      if(e.wind>0){
        const elc=DATA.EL[e.def.el].c;
        const total=e.def.atkType==='slam'?0.75:e.def.ai==='ranged'?0.5:0.42;
        const k=1-U.clamp(e.wind/total,0,1);
        const reach=(e.def.ai==='brute'||e.def.ai==='boss')?e.r+95:e.r+55;
        ctx.save();
        if(e.def.atkType==='slam'||e.def.atkType==='aoe'){
          ctx.globalAlpha=0.08+k*0.14;
          ctx.fillStyle=elc;
          ctx.beginPath(); ctx.ellipse(e.x,e.y,e.r+95,e.r+58,0,0,6.2832); ctx.fill();
          ctx.globalAlpha=0.5+k*0.3;
          ctx.strokeStyle=elc; ctx.lineWidth=2; ctx.setLineDash([7,7]);
          ctx.beginPath(); ctx.ellipse(e.x,e.y,e.r+95,e.r+58,0,0,6.2832); ctx.stroke();
          ctx.setLineDash([]);
        } else {
          const a=U.ang(e.x,e.y,this.player.x,this.player.y);
          ctx.globalAlpha=0.10+k*0.16;
          ctx.fillStyle=elc;
          ctx.beginPath(); ctx.moveTo(e.x,e.y-8);
          ctx.arc(e.x,e.y-8,reach,a-0.5,a+0.5); ctx.closePath(); ctx.fill();
          ctx.globalAlpha=0.55+k*0.35; ctx.strokeStyle=elc; ctx.lineWidth=1.8;
          ctx.beginPath(); ctx.arc(e.x,e.y-8,reach,a-0.5,a+0.5); ctx.stroke();
        }
        ctx.restore();
      }
      // полоса HP
      if(e.hp<e.maxHp||e.boss||e.elite){
        const w=e.boss?170:Math.max(40,e.r*2.4), h=e.boss?7:5;
        const bx=e.x-w/2, by=e.y-(e.boss?e.r*2.8:e.r+30);
        ctx.fillStyle='rgba(0,0,0,.82)'; ctx.fillRect(bx-1.5,by-1.5,w+3,h+3);
        ctx.fillStyle='#3a0d10'; ctx.fillRect(bx,by,w,h);
        const elc=DATA.EL[e.def.el].c;
        ctx.fillStyle=elc;
        ctx.fillRect(bx,by,w*U.clamp(e.hp/e.maxHp,0,1),h);
        if(e.dazeMax&&e.daze>0){
          ctx.fillStyle='#ffb300';
          ctx.fillRect(bx,by+h+1.5,w*U.clamp(e.daze/e.dazeMax,0,1),2.5);
        }
        if(e.elite||e.boss){
          ctx.font='700 9px Consolas,monospace';
          ctx.textAlign='center'; ctx.fillStyle='#dfe6f2';
          ctx.fillText((e.elite?'ЭЛИТА ':'БОСС ')+'ур.'+e.lvl, e.x, by-5);
        }
      }
    }

    // снаряды
    for(const pr of this.projs){
      ctx.save();
      ctx.shadowColor=pr.col; ctx.shadowBlur=14;
      ctx.fillStyle=pr.col;
      ctx.beginPath(); ctx.arc(pr.x,pr.y,pr.r,0,6.2832); ctx.fill();
      ctx.fillStyle='#fff'; ctx.globalAlpha=.8;
      ctx.beginPath(); ctx.arc(pr.x,pr.y,pr.r*0.45,0,6.2832); ctx.fill();
      ctx.restore();
    }

    // подбираемое
    for(const k of this.pickups){
      const b=Math.sin(t*6+k.x)*3;
      ctx.save();
      ctx.shadowColor=k.col; ctx.shadowBlur=10;
      ctx.fillStyle=k.col;
      ctx.beginPath(); ctx.arc(k.x,k.y-10+b,4.5,0,6.2832); ctx.fill();
      ctx.restore();
    }

    // игрок
    const p=this.player;
    if(p&&!p.downed){
      const ch=this.char(), elc=DATA.EL[ch.el];
      // свет под ногами
      const lg=ctx.createRadialGradient(p.x,p.y,4,p.x,p.y,96);
      lg.addColorStop(0,U.rgba(elc.c,.20)); lg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=lg;
      ctx.beginPath(); ctx.ellipse(p.x,p.y,96,58,0,0,6.2832); ctx.fill();
      // кольцо-якорь
      ctx.strokeStyle=U.rgba(elc.c,.55); ctx.lineWidth=1.8;
      ctx.beginPath(); ctx.ellipse(p.x,p.y,22,10,0,0,6.2832); ctx.stroke();
      ctx.strokeStyle=U.rgba(elc.c,.22); ctx.lineWidth=1;
      ctx.beginPath(); ctx.ellipse(p.x,p.y,30,14,0,0,6.2832); ctx.stroke();
      // шеврон над головой
      const bob=Math.sin(t*3)*3;
      ctx.fillStyle=elc.c;
      ctx.beginPath();
      ctx.moveTo(p.x,p.y-62+bob); ctx.lineTo(p.x-6,p.y-72+bob); ctx.lineTo(p.x+6,p.y-72+bob);
      ctx.closePath(); ctx.fill();
      // HP над головой
      const hpR=U.clamp(p.hp/(p.maxHp||1),0,1), bw=46;
      ctx.fillStyle='rgba(0,0,0,.78)';
      ctx.fillRect(p.x-bw/2-1.5,p.y-90,bw+3,7);
      ctx.fillStyle=hpR>0.5?'#3ef08a':hpR>0.25?'#ffb300':'#ff3b30';
      ctx.fillRect(p.x-bw/2,p.y-88.5,bw*hpR,4);
      if(p.shield>0){
        ctx.fillStyle='#9fd8ff';
        ctx.fillRect(p.x-bw/2,p.y-93,bw*U.clamp(p.shield/(p.maxHp*0.3),0,1),2);
      }
      p.attacking=this.player.attacking;
      ART.drawAgent(ctx,p,t);
      if(p.shield>0){
        ctx.strokeStyle='rgba(207,216,230,.65)'; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.arc(p.x,p.y-22,26,0,6.2832); ctx.stroke();
      }
    }
    FX.draw(ctx);
  },
};
