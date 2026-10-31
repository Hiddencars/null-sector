/* ============================================================================
   НОЛЬ-СЕКТОР — ИНТЕРФЕЙС: HUD, древо навыков, гача, коллекция, магазин
   ========================================================================== */
'use strict';

/* ================================================================ ЗАКАЗЫ == */
const QM = {
  list:[
    { id:'q1', n:'Разгрести свалку', d:'Уничтожить 8 врагов в Ржавом Поясе',
      type:'killRegion', region:'rust', need:8, cr:600, eth:0, sp:1 },
    { id:'q2', n:'Не подходить к печи', d:'Уничтожить 12 врагов в Голодной Печи',
      type:'killRegion', region:'furnace', need:12, cr:1200, eth:40, sp:1 },
    { id:'q3', n:'Три ящика', d:'Открыть 3 любых сундука',
      type:'chest', need:3, cr:800, eth:0, sp:1 },
    { id:'q4', n:'Оглушить и добить', d:'Провести 10 стихийных реакций',
      type:'reaction', need:10, cr:900, eth:60, sp:1 },
    { id:'q5', n:'Печь должна остыть', d:'Победить босса ГОЛЕМ-ПЕЧЬ',
      type:'boss', boss:'golem', need:1, cr:3000, eth:200, sp:3 },
    { id:'q6', n:'Разлом не спит', d:'Победить НОЛЬ в Разломе',
      type:'boss', boss:'nullb', need:1, cr:8000, eth:500, sp:5 },
  ],
  q(id){ return G.save.quests[id] || (G.save.quests[id]={p:0,done:false,claimed:false}); },
  onKill(e){
    const reg=MAP.regionAt(e.x,e.y);
    for(const q of this.list){
      if(q.type!=='killRegion'||q.region!==reg.id) continue;
      const s=this.q(q.id);
      if(s.claimed) continue;
      s.p++;
      if(s.p>=q.need) s.done=true;
    }
    for(const q of this.list){
      if(q.type!=='boss'||q.boss!==e.bossId) continue;
      const s=this.q(q.id);
      s.p=1; s.done=true;
    }
  },
  onChest(){
    for(const q of this.list){
      if(q.type!=='chest') continue;
      const s=this.q(q.id);
      if(s.claimed) continue;
      s.p++; if(s.p>=q.need) s.done=true;
    }
  },
  onReaction(){
    for(const q of this.list){
      if(q.type!=='reaction') continue;
      const s=this.q(q.id);
      if(s.claimed) continue;
      s.p++; if(s.p>=q.need) s.done=true;
    }
  },
  claim(id){
    const q=this.list.find(x=>x.id===id), s=this.q(id);
    if(!s.done||s.claimed) return false;
    s.claimed=true;
    G.save.credits+=q.cr||0; G.save.eth+=q.eth||0; G.save.sp+=q.sp||0;
    return true;
  },
};

/* ================================================================== ГАЧА == */
const GACHA = {
  rollRarity(bannerId, pity, forceMin4){
    const b=DATA.GACHA.banners.find(x=>x.id===bannerId)||DATA.GACHA.banners[0];
    if(pity+1>=DATA.GACHA.hardPity) return 5;
    if(pity+1>=DATA.GACHA.softPity){
      const softRate=DATA.GACHA.rates[5]+(pity+1-DATA.GACHA.softPity)*0.06;
      if(Math.random()<softRate) return 5;
    }
    const r=Math.random();
    if(r<DATA.GACHA.rates[5]) return 5;
    if(r<DATA.GACHA.rates[5]+DATA.GACHA.rates[4]) return 4;
    return 3;
  },

  pickChar(rarity, bannerId){
    const b=DATA.GACHA.banners.find(x=>x.id===bannerId)||DATA.GACHA.banners[0];
    const owned=Object.keys(G.save.roster);
    if(rarity===5){
      const ups=(b.up||[]).map(id=>DATA.CHARS.find(c=>c.id===id)).filter(c=>c&&c.rarity===5);
      if(ups.length && Math.random()<0.6){
        return U.choice(ups);
      }
      const pool=DATA.CHARS.filter(c=>c.rarity===5);
      const fresh=pool.filter(c=>!owned.includes(c.id));
      if(fresh.length && Math.random()<0.5) return U.choice(fresh);
      return U.choice(pool);
    }
    const pool4=DATA.CHARS.filter(c=>c.rarity===4);
    const fresh4=pool4.filter(c=>!owned.includes(c.id));
    if(fresh4.length && Math.random()<0.62) return U.choice(fresh4);
    if(pool4.length) return U.choice(pool4);
    return null;
  },

  pull(bannerId, count){
    const b=DATA.GACHA.banners.find(x=>x.id===bannerId);
    const cost=count===10?DATA.GACHA.tenCost:DATA.GACHA.pullCost*count;
    if(G.save.eth<cost) return {err:'Недостаточно эфиритов'};
    G.save.eth-=cost;
    const out=[];
    let has4=false;
    for(let i=0;i<count;i++){
      const pid = bannerId==='lum'?'lum':'std';
      if(!G.save.pity[pid]) G.save.pity[pid]=0;
      let rar=this.rollRarity(pid,G.save.pity[pid]);
      if(count===10 && i===9 && !has4 && rar===3) rar=4;
      if(rar>=4) has4=true;
      G.save.pity[pid]= rar===5?0:G.save.pity[pid]+1;
      G.save.pulls.total=(G.save.pulls.total||0)+1;

      if(rar===3){
        const kind=Math.random()<0.5?'chip':'credits';
        const val=kind==='chip'?1:120;
        out.push({rar, kind, val});
      } else {
        const c=this.pickChar(rar,bannerId);
        if(!c){ out.push({rar:3,kind:'chip',val:2}); continue; }
        const isNew=!G.save.roster[c.id];
        if(isNew){
          G.save.roster[c.id]={level:1,xp:0,nodes:{},tiles:{basic:1,skill:1,dodge:1,chain:1},cinema:0};
          G.rt[c.id]={hp:CBT.stats(c.id).hp,dec:0};
          if(G.save.party.length<3) G.save.party.push(c.id);
        } else {
          const r=G.save.roster[c.id];
          r.cinema=Math.min(5,(r.cinema||0)+1);
          G.save.eth+=40;
        }
        out.push({rar, char:c, isNew, dupe:!isNew});
      }
    }
    G.save.stats.pulls=(G.save.stats.pulls||0)+count;
    Store.save();
    return {out};
  },
};

/* =================================================================== UI ==== */
const UI = {
  el:null, cur:null, agentTab:'skills', agentId:null, nodeSel:null, banner:'lum',

  init(){
    this.el=document.getElementById('screens');
    this.buildHUD();
    this.bindKeys();
  },

  /* ------------------------------------------------------------- HUD ---- */
  buildHUD(){
    const hud=document.getElementById('hud');
    hud.innerHTML=`
      <div class="hud-top">
        <div class="team" id="team"></div>
        <div class="res" id="res"></div>
      </div>
      <div class="combo hidden" id="combo">
        <div class="n">0</div><div class="l">комбо</div>
      </div>
      <div class="hud-bottom" id="acts"></div>
      <canvas id="minimap" width="184" height="184"></canvas>
      <div id="questpad"></div>
      <div id="toasts"></div>
      <div class="pop-hint" id="hint">WASD — движение · ЛКМ/J — удар · E — навык · Пробел — рывок · Q — ульта · 1/2/3 — смена</div>
    `;
    this.refreshTeam(); this.refreshRes();
  },

  refreshTeam(){
    const el=document.getElementById('team');
    if(!el) return;
    const parts=CBT.party||G.save.party;
    el.innerHTML=parts.map((id,i)=>{
      const c=DATA.CHARS.find(x=>x.id===id);
      const rt=G.rt[id]||{hp:1,dec:0};
      const s=CBT.stats(id);
      const hpP=U.clamp(rt.hp/s.hp,0,1)*100;
      const el2=DATA.EL[c.el];
      return `<div class="tm-c ${i===CBT.active?'active':''} ${rt.hp<=0?'dead':''}">
        <div class="tm-av" style="border-color:${U.rgba(el2.c,.6)}">${ART.portrait(c)}</div>
        <div class="tm-meta">
          <div class="tm-name" style="color:${i===CBT.active?'#fff':'#c8d0dd'}">${c.name}
            <span style="color:${el2.c};font-size:9px">${el2.g}</span>
            <b style="float:right;font-size:9px">${s.lvl}</b></div>
          <div class="bar hp"><i style="width:${hpP}%"></i></div>
          <div class="bar"><i style="width:${rt.dec||0}%"></i></div>
        </div>
        <div class="tm-key">${i+1}</div>
      </div>`;
    }).join('');
  },

  refreshRes(){
    const el=document.getElementById('res');
    if(!el) return;
    el.innerHTML=`
      <div class="pill eth"><span class="ico">✦</span><span class="v">${U.pad(G.save.eth,4)}</span></div>
      <div class="pill cre"><span class="ico">◈</span><span class="v">${U.comma(G.save.credits)}</span></div>
      <div class="pill sp"><span class="ico">★</span><span class="v">${G.save.sp}</span></div>
    `;
  },

  refreshActs(){
    const el=document.getElementById('acts');
    if(!el||!CBT.player) return;
    const p=CBT.player, c=CBT.char(), rt=CBT.rt();
    const sk=c.skill;
    const s=CBT.stats(c.id);
    const cdP = p.skillCd>0 ? (1-p.skillCd/(sk.cd*(1/(s.dodgeMul||1)))) : 1;
    el.innerHTML=`
      <div class="act ready"><span>${c.basic.name.split(' ')[0]}</span><span class="k">J</span></div>
      <div class="act ${p.skillCd>0?'':'ready'}">
        <span>E</span><span class="k">НАВЫК</span>
        <div class="cd" style="--p:${(1-cdP)*360}deg"></div>
        ${p.skillCd>0?`<span class="cdt">${p.skillCd.toFixed(1)}</span>`:''}
      </div>
      <div class="act big ${p.dodgeCd>0?'':'ready'}"><span>РЫВОК</span><span class="k">ПРОБЕЛ</span></div>
      <div class="act big ${(rt.dec>=100)?'ult on':''}">
        <span>${(rt.dec>=100)?'УЛЬТА':'Q'}</span><span class="k">${Math.floor(rt.dec)}%</span>
      </div>
      <div class="act ${CBT.enemies.some(e=>e.stunT>0)?'ready':''}"><span>СЦЕП</span><span class="k">F</span></div>
    `;
  },

  refreshCombo(){
    const el=document.getElementById('combo');
    if(!el) return;
    if(CBT.combo>1){
      el.classList.remove('hidden');
      el.querySelector('.n').textContent=CBT.combo;
      el.querySelector('.l').textContent=CBT.combo>7?'РАЗГАР':CBT.combo>4?'КОМБО':'цепочка';
    } else el.classList.add('hidden');
  },

  toast(msg,kind){
    const el=document.getElementById('toasts');
    if(!el) return;
    const d=document.createElement('div');
    d.className='toast '+(kind||'');
    d.textContent=msg;
    el.appendChild(d);
    setTimeout(()=>{d.style.transition='opacity .3s,transform .3s';d.style.opacity=0;
      d.style.transform='translateY(-8px)';setTimeout(()=>d.remove(),320)},2200);
    while(el.children.length>4) el.firstChild.remove();
  },

  bindKeys(){
    addEventListener('keydown',e=>{
      if(e.code==='Escape'){
        if(this.cur) this.close(); else this.openMenu();
        return;
      }
      if(this.cur) return; // в меню игнорируем игровые клавиши
      if(e.code==='Tab'){ e.preventDefault(); this.openAgent(G.save.party[CBT.active||0]); }
      else if(e.code==='KeyG'){ this.openGacha(); }
      else if(e.code==='KeyC'){ this.openRoster(); }
      else if(e.code==='KeyB'){ this.openShop(); }
      else if(e.code==='KeyV'){ this.openQuests(); }
      else if(e.code==='KeyM'){ this.openMap(); }
    });
  },

  /* ---------------------------------------------------------- скриншоты - */
  close(){
    this.el.innerHTML=''; this.cur=null;
    ENG.cv.style.filter='';
    if(typeof GAME!=='undefined' && GAME.paused) GAME.paused=false;
  },

  mount(id,html,onDone){
    this.el.innerHTML=`<div class="scr" id="${id}">${html}</div>`;
    this.cur=id;
    if(onDone) onDone();
  },

  head(title,sub){
    return `<div class="scr-head">
      <button class="back" onclick="UI.close()">↩</button>
      <button class="home" onclick="UI.close()">⌂</button>
      <div class="crumb">${title||'Город'}</div>
      <div style="flex:1"></div>
      <div class="pill eth"><span class="ico">✦</span><span class="v">${U.pad(G.save.eth,4)}</span></div>
      <div class="pill cre"><span class="ico">◈</span><span class="v">${U.comma(G.save.credits)}</span></div>
      <div class="pill sp"><span class="ico">★</span><span class="v">${G.save.sp}</span></div>
    </div>`;
  },

  /* ==================================================== ДРЕВО НАВЫКОВ === */
  openAgent(charId){
    const id=charId||G.save.party[0];
    this.agentId=id; this.nodeSel=null;
    const c=DATA.CHARS.find(x=>x.id===id);
    if(!c) return;
    if(!G.save.roster[id]){ UI.toast('Агент не открыт · крутите канал','warn'); return; }
    const r=G.save.roster[id];
    const el2=DATA.EL[c.el];
    const s=CBT.stats(id);

    const html=`
      ${this.head('Город / Агенты','')}
      <div class="tree-wrap">
        <div class="showcase">
          <div class="film"></div>
          <div class="film-glyph">NULL SECTOR · ${U.pad(r.level,2)}</div>
          <div class="fig">${ART.figure(c)}</div>
          <div class="fig-shadow"></div>
          <div class="agent-tag">
            <div class="an">${c.name}</div>
            <div class="ar">${c.title}</div>
            <div class="al">${ART.elIcon(c.el,14)} ${el2.n} · ${DATA.ROLES[c.role].n}
              <span class="lvbadge">${r.level}</span></div>
          </div>
        </div>
        <div class="panel-r">
          <div class="panel-title">
            <h2>${this.agentTab==='stats'?'Базовые параметры':this.agentTab==='gear'?'Снаряжение':'Навыки'}</h2>
            <div class="ln"></div>
            <div class="sp">SP ${G.save.sp}</div>
          </div>
          <div id="tabbody">${this.tabBody(c)}</div>
          <div class="statrow">
            <div class="s"><span>HP</span><b>${Math.round(s.hp)}</b></div>
            <div class="s"><span>АТК</span><b>${Math.round(s.atk)}</b></div>
            <div class="s"><span>ЗАЩ</span><b>${Math.round(s.def)}</b></div>
            <div class="s"><span>КРИТ</span><b>${(s.crit*100).toFixed(0)}%</b></div>
          </div>
          <div class="tabs">
            <div class="tab ${this.agentTab==='stats'?'on':''}" onclick="UI.setTab('stats')">Параметры</div>
            <div class="tab ${this.agentTab==='skills'?'on':''}" onclick="UI.setTab('skills')">Навыки</div>
            <div class="tab ${this.agentTab==='gear'?'on':''}" onclick="UI.setTab('gear')">Снаряжение</div>
          </div>
        </div>
      </div>
    `;
    this.mount('scr-agent',html);
    GAME.paused=true;
  },

  setTab(t){
    if(this.agentTab===t) return;
    this.agentTab=t;
    SFX.ui();
    this.openAgent(this.agentId);
  },

  tabBody(c){
    if(this.agentTab==='stats') return this.statsBody(c);
    if(this.agentTab==='gear') return this.gearBody(c);
    return this.skillsBody(c);
  },

  skillsBody(c){
    const r=G.save.roster[c.id];
    const nodes=c.tree;
    const owned=k=>(r.nodes&&r.nodes[k])||0;
    const avail=(k)=>{
      const n=nodes[k];
      if(!n.req.length) return true;
      if(n.req[0]==='3nodes'){
        return ['A','B','C','D','E','F'].filter(x=>owned(x)>0).length>=3;
      }
      return n.req.every(x=>owned(x)>0);
    };
    const cls=(k)=>{
      const lv=owned(k), n=nodes[k];
      if(lv>=n.max) return 'owned';
      if(!avail(k)) return 'locked';
      return 'avail';
    };
    const node=(k,extra='')=>{
      const lv=owned(k), n=nodes[k];
      return `<div class="node ${cls(k)} ${extra}" data-k="${k}" onclick="UI.selNode('${k}')">
        <span>${k}</span>${lv?`<span class="lv">${lv}/${n.max}</span>`:''}</div>`;
    };
    const t=r.tiles||{basic:1,skill:1,dodge:1,chain:1};
    const tiles=DATA.TILES.map(td=>{
      const lv=t[td.id]||1;
      const cost=this.tileCost(lv);
      const can=lv<8 && G.save.chips>=cost.chip && G.save.credits>=cost.cr;
      return `<div class="tile ${can?'can':''} ${lv>=8?'maxed':''}"
        onclick="UI.upTile('${td.id}')">
        <div class="t-ic">${td.ic}</div>
        <div class="t-lv">${U.pad(lv,2)}</div>
        <div class="t-n">${td.n}</div>
        <div class="t-l">${lv>=8?'МАКС':`${cost.chip}чп · ${cost.cr}кр`}</div>
      </div>`;
    }).join('');

    return `
      <div class="cols">
        <div class="caps">
          <div class="cap">${node('A')}${node('B')}</div>
          <div class="cap">${node('C')}${node('D')}</div>
          <div class="cap">${node('E')}${node('F')}</div>
        </div>
        <div class="gears">
          <div class="cap" style="background:none;border:none;padding:0">
            ${node('G1','core')}${node('G2','core')}
          </div>
        </div>
      </div>
      <div class="tiles">${tiles}</div>
      <div id="nodeinfo"></div>
    `;
  },

  tileCost(lv){ return { chip: lv, cr: 150*lv }; },

  statsBody(c){
    const r=G.save.roster[c.id], s=CBT.stats(c.id);
    const need=DATA.XP_TABLE(r.level);
    const base=CBT.stats(c.id);
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:10px">
        <div style="background:#0e1015;border:1px solid #262b38;padding:12px 14px">
          <div style="font-size:10px;letter-spacing:2px;color:var(--dim)">УРОВЕНЬ</div>
          <div style="font-family:Impact,sans-serif;font-size:44px;line-height:1">${U.pad(r.level,2)}</div>
          <div class="bar" style="height:6px;margin-top:8px"><i style="width:${U.clamp(r.xp/need,0,1)*100}%"></i></div>
          <div style="font-size:10px;color:var(--dim2);margin-top:5px" class="mono">
            ${Math.floor(r.xp)} / ${need} XP</div>
        </div>
        <div style="background:#0e1015;border:1px solid #262b38;padding:12px 14px">
          <div style="font-size:10px;letter-spacing:2px;color:var(--dim)">КИНО-РАНГ</div>
          <div style="font-family:Impact,sans-serif;font-size:44px;line-height:1">
            ${'★'.repeat(r.cinema||0)||'—'}</div>
          <div style="font-size:10.5px;color:var(--dim2);margin-top:6px;line-height:1.5">
            Дубли агента повышают ранг: +1% крита за уровень</div>
        </div>
      </div>
      <div style="background:#0e1015;border:1px solid #262b38;padding:12px 14px;margin-bottom:10px">
        <div style="font-size:10px;letter-spacing:2px;color:var(--dim);margin-bottom:8px">РОЛЬ · ${DATA.ROLES[c.role].n}</div>
        <div style="font-size:12px;color:#c8d0dd;line-height:1.55">${DATA.ROLES[c.role].d}</div>
        <div style="font-size:11.5px;color:var(--dim);line-height:1.6;margin-top:8px">${c.bio}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:12px">
        <div class="s" style="display:flex;justify-content:space-between;border-bottom:1px dotted #262b38;padding:4px 0">
          <span>Здоровье</span><b class="mono">${Math.round(s.hp)}</b></div>
        <div class="s" style="display:flex;justify-content:space-between;border-bottom:1px dotted #262b38;padding:4px 0">
          <span>Атака</span><b class="mono">${Math.round(s.atk)}</b></div>
        <div class="s" style="display:flex;justify-content:space-between;border-bottom:1px dotted #262b38;padding:4px 0">
          <span>Защита</span><b class="mono">${Math.round(s.def)}</b></div>
        <div class="s" style="display:flex;justify-content:space-between;border-bottom:1px dotted #262b38;padding:4px 0">
          <span>Скорость</span><b class="mono">${(s.spd*100).toFixed(0)}%</b></div>
        <div class="s" style="display:flex;justify-content:space-between;border-bottom:1px dotted #262b38;padding:4px 0">
          <span>Урон базовых</span><b class="mono">${(s.basicMul*100).toFixed(0)}%</b></div>
        <div class="s" style="display:flex;justify-content:space-between;border-bottom:1px dotted #262b38;padding:4px 0">
          <span>Урон навыка</span><b class="mono">${(s.skillMul*100).toFixed(0)}%</b></div>
        <div class="s" style="display:flex;justify-content:space-between;border-bottom:1px dotted #262b38;padding:4px 0">
          <span>Реакции</span><b class="mono" style="color:var(--lime)">+${(s.reactionAmp*100).toFixed(0)}%</b></div>
        <div class="s" style="display:flex;justify-content:space-between;border-bottom:1px dotted #262b38;padding:4px 0">
          <span>Оглушение</span><b class="mono" style="color:var(--lime)">+${(s.dazeUp*100).toFixed(0)}%</b></div>
      </div>
      <div style="margin-top:auto;display:flex;gap:8px;padding-top:10px">
        <button class="btn" onclick="UI.addParty('${c.id}')">В ОТРЯД</button>
        <button class="btn ghost" onclick="UI.openRoster()">ВСЕ АГЕНТЫ</button>
      </div>
    `;
  },

  gearBody(c){
    const r=G.save.roster[c.id];
    const cin=r.cinema||0;
    const ranks=[
      ['I','«Первый дубль»', '+1% крит. шанса'],
      ['II','«Второй дубль»','+2% крит. шанса'],
      ['III','«Третий дубль»','+3% крит. шанса'],
      ['IV','«Четвёртый дубль»','+4% крит. шанса'],
      ['V','«Пятый дубль»','+5% крит. шанса'],
    ];
    return `
      <div style="display:flex;flex-direction:column;gap:8px">
        ${ranks.map((x,i)=>`
          <div class="si" style="opacity:${i<cin?1:0.4}">
            <div class="si-ic" style="color:${i<cin?'var(--yellow)':'#3a4152'}">★</div>
            <div class="si-m">
              <div class="si-n">КИНО ${x[0]} · ${x[1]}</div>
              <div class="si-d">${x[2]}</div>
            </div>
            <div style="font-size:10px;letter-spacing:1px;color:${i<cin?'var(--lime)':'var(--dim2)'}">
              ${i<cin?'ОТКРЫТО':'ЗАКРЫТО'}</div>
          </div>`).join('')}
      </div>
      <div style="margin-top:12px;padding:12px;background:#0e1015;border:1px solid #262b38;
        font-size:11.5px;color:var(--dim);line-height:1.6">
        Кино-ранги открываются при выпадении дублей агента в канале.<br>
        Дубли также дают <b style="color:var(--yellow)">+40 эфиритов</b> каждый.
      </div>
    `;
  },

  selNode(k){
    SFX.ui();
    this.nodeSel=k;
    const c=DATA.CHARS.find(x=>x.id===this.agentId);
    const n=c.tree[k], r=G.save.roster[c.id];
    const lv=(r.nodes&&r.nodes[k])||0;
    const maxed=lv>=n.max;
    const cost=maxed?0:n.cost[lv];
    const owned=['A','B','C','D','E','F'].filter(x=>(r.nodes[x]||0)>0).length;
    const avail = !n.req.length ? true
      : n.req[0]==='3nodes' ? owned>=3
      : n.req.every(x=>(r.nodes[x]||0)>0);
    const box=document.getElementById('nodeinfo');
    if(!box) return;
    box.innerHTML=`<div class="nodeinfo">
      <div class="ni-h">
        <div class="ni-t">${n.name}</div>
        <div class="ni-l">${lv}/${n.max}</div>
      </div>
      <div class="ni-d">${n.d}</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;font-size:11px">
        <span class="tag">${n.core?'ЯДРО':'УЗЕЛ'}</span>
        <span class="mono" style="color:var(--lime)">${maxed?'МАКС':cost+' SP'}</span>
      </div>
      <button class="btn" ${maxed||!avail?'disabled':''}
        onclick="UI.upNode('${k}')">
        ${maxed?'ИЗУЧЕНО':!avail?'НУЖНЫ ПРЕДЫДУЩИЕ УЗЛЫ':`ИЗУЧИТЬ · ${cost} SP`}</button>
    </div>`;
  },

  upNode(k){
    const c=DATA.CHARS.find(x=>x.id===this.agentId);
    const n=c.tree[k], r=G.save.roster[c.id];
    const lv=(r.nodes&&r.nodes[k])||0;
    if(lv>=n.max) return;
    const cost=n.cost[lv];
    if(G.save.sp<cost){ UI.toast('Не хватает SP','warn'); return; }
    G.save.sp-=cost;
    r.nodes[k]=lv+1;
    SFX.levelup();
    const b=document.querySelector(`.node[data-k="${k}"]`);
    if(b){ b.style.transform='scale(1.18)'; setTimeout(()=>b.style.transform='',180); }
    Store.save();
    this.openAgent(c.id);
    this.selNode(k);
  },

  upTile(id){
    const c=DATA.CHARS.find(x=>x.id===this.agentId);
    const r=G.save.roster[c.id];
    r.tiles=r.tiles||{basic:1,skill:1,dodge:1,chain:1};
    const lv=r.tiles[id]||1;
    if(lv>=8) return;
    const cost=this.tileCost(lv);
    if(G.save.chips<cost.chip || G.save.credits<cost.cr){
      UI.toast('Нужно '+cost.chip+' чипов и '+cost.cr+' кредитов','warn'); return;
    }
    G.save.chips-=cost.chip; G.save.credits-=cost.cr;
    r.tiles[id]=lv+1;
    SFX.levelup();
    Store.save();
    this.openAgent(c.id);
  },

  addParty(id){
    const p=G.save.party;
    if(p.includes(id)){ UI.toast('Уже в отряде','warn'); return; }
    if(p.length>=3){ UI.toast('Отряд полон: уберите агента','warn'); this.openRoster(); return; }
    p.push(id);
    if(CBT.party && !CBT.party.includes(id)) CBT.party.push(id);
    G.rt[id]=G.rt[id]||{hp:CBT.stats(id).hp,dec:0};
    SFX.uiBig(); Store.save(); this.openRoster();
  },

  removeParty(id){
    if(G.save.party.length<=1) return;
    const i=G.save.party.indexOf(id);
    if(i<0) return;
    G.save.party.splice(i,1);
    if(CBT.party){ const j=CBT.party.indexOf(id); if(j>=0) CBT.party.splice(j,1); }
    CBT.active=0; CBT.syncActive(true);
    SFX.ui(); Store.save(); this.openRoster();
  },

  /* ======================================================= КОЛЛЕКЦИЯ ===== */
  openRoster(){
    const ids=Object.keys(G.save.roster);
    const cards=ids.map(id=>{
      const c=DATA.CHARS.find(x=>x.id===id);
      const r=G.save.roster[id];
      const el2=DATA.EL[c.el];
      const inP=G.save.party.includes(id);
      return `<div class="rc ${inP?'inparty':''}" onclick="UI.pickAgent('${id}')">
        <div class="re">${el2.g}</div>
        <div class="rl" style="color:${c.rarity===5?'#ffe600':'#c9a6ff'}">${'★'.repeat(c.rarity)}</div>
        <div class="rf">${ART.figure(c)}</div>
        <div class="rn">${c.name}</div>
        <div class="rr">${DATA.ROLES[c.role].n} · ур.${r.level}</div>
        ${inP?'<div class="pk">В ОТРЯДЕ</div>':''}
      </div>`;
    }).join('');
    const locked=DATA.CHARS.filter(c=>!ids.includes(c.id)).map(c=>`
      <div class="rc lockedc"><div class="rf">${ART.figure(c)}</div>
        <div class="rn">???</div><div class="rr">НЕ ОТКРЫТ</div></div>`).join('');

    this.mount('scr-roster',`
      ${this.head('Агенты · коллекция')}
      <div style="padding:0 24px 8px;display:flex;justify-content:space-between;align-items:center">
        <div class="sub">ОТКРЯД ${G.save.party.length}/3</div>
        <div class="muted">Клик — выбрать · ПКМ — убрать из отряда</div>
      </div>
      <div class="roster">${cards}${locked}</div>
      <div class="tabs" style="padding-bottom:18px">
        <div class="tab" onclick="UI.openAgent(G.save.party[0])">ДРЕВО НАВЫКОВ</div>
        <div class="tab on">КОЛЛЕКЦИЯ</div>
        <div class="tab" onclick="UI.openGacha()">КАНАЛ</div>
      </div>
    `);
    GAME.paused=true;
    this.el.querySelectorAll('.rc').forEach(rc=>{
      rc.addEventListener('contextmenu',e=>{
        e.preventDefault();
        const id=e.currentTarget.getAttribute('onclick').match(/'(\w+)'/)[1];
        UI.removeParty(id);
      });
    });
  },

  pickAgent(id){
    const p=G.save.party;
    if(p.includes(id)) this.openAgent(id);
    else this.addParty(id);
  },

  /* ================================================================= ГАЧА */
  openGacha(){
    const b=DATA.GACHA.banners.find(x=>x.id===this.banner)||DATA.GACHA.banners[1];
    const upChars=(b.up||[]).map(id=>DATA.CHARS.find(c=>c.id===id)).filter(Boolean);
    const fullArt=b.id==='lum'?DATA.CHARS.find(c=>c.id==='lyumen'):DATA.CHARS.find(c=>c.id==='volt');
    const pity=G.save.pity[b.id==='lum'?'lum':'std']||0;
    this.mount('scr-gacha',`
      ${this.head('Канал связи')}
      <div class="banner">
        <div class="banner-art">
          <div class="rays"></div>
          <div class="banner-fig">${ART.figure(fullArt)}</div>
          <div class="banner-name">
            <div class="bn1">${b.tag}</div>
            <div class="bn2">${b.n}</div>
            <div class="bn3">${b.desc}<br>
              <span style="color:${U.rgba(b.c,1)}">Повышенный шанс: ${upChars.map(c=>c.name).join(' · ')||'—'}</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:14px">
              ${DATA.GACHA.banners.map(bb=>`
                <div class="tab ${bb.id===b.id?'on':''}" onclick="UI.banner='${bb.id}';UI.openGacha()">${bb.n}</div>`).join('')}
            </div>
          </div>
        </div>
        <div class="banner-side">
          <div class="sub" style="font-size:10px">ВЕРОЯТНОСТИ</div>
          <div class="rate s5"><span>S-ранг · агент</span><b>0.6%</b></div>
          <div class="rate"><span>A-ранг · агент</span><b>5.1%</b></div>
          <div class="rate"><span>Материалы</span><b>94.3%</b></div>
          <div class="pitybox"><span>До гаранта S</span><b>${Math.max(0,DATA.GACHA.hardPity-pity)}</b></div>
          <div style="display:flex;gap:10px;font-size:11px;color:var(--dim)">
            <div>Всего круток: <b class="mono" style="color:#dfe5f0">${G.save.pulls.total||0}</b></div>
            <div>Агентов: <b class="mono" style="color:#dfe5f0">${Object.keys(G.save.roster).length}/${DATA.CHARS.length}</b></div>
          </div>
          <div class="pullrow">
            <div class="costln"><span>1 крутка</span><span class="mono">✦ ${DATA.GACHA.pullCost}</span></div>
            <button class="btn ghost" onclick="UI.doPull(1)">КРУТИТЬ ×1</button>
            <div class="costln"><span>10 круток · гарант A</span><span class="mono">✦ ${DATA.GACHA.tenCost}</span></div>
            <button class="btn" onclick="UI.doPull(10)">КРУТИТЬ ×10</button>
            <div class="costln" style="margin-top:4px"><span>Баланс</span>
              <span class="mono" style="color:var(--yellow)">✦ ${G.save.eth}</span></div>
          </div>
        </div>
      </div>
    `);
    GAME.paused=true;
  },

  doPull(n){
    const res=GACHA.pull(this.banner,n);
    if(res.err){ UI.toast(res.err,'warn'); return; }
    SFX.gacha(5);
    // сначала проигрываем звук максимальной редкости
    const best=Math.max(...res.out.map(o=>o.rar));
    SFX.gacha(best);
    this.showResults(res.out);
  },

  showResults(out){
    const cards=out.map((o,i)=>{
      const delay=(i*0.07).toFixed(2);
      if(o.rar===3){
        return `<div class="card r3" style="animation-delay:${delay}s">
          <div style="position:absolute;inset:0;display:grid;place-items:center;font-size:40px;
            color:${o.kind==='chip'?'#c8ff1e':'#bfc9d8'}">${o.kind==='chip'?'▣':'◈'}</div>
          <div class="cn">${o.kind==='chip'?'Чип ×'+o.val:'Кредиты '+o.val}</div>
          <div class="sr">★★★</div></div>`;
      }
      const c=o.char;
      return `<div class="card r${o.rar} ${o.dupe?'dupe':''}" style="animation-delay:${delay}s">
        <div class="cf">${ART.figure(c)}</div>
        <div class="cb"></div>
        <div class="ce" style="background:${U.rgba(DATA.EL[c.el].c,.25)};color:${DATA.EL[c.el].c}">${DATA.EL[c.el].g}</div>
        <div class="sr">${'★'.repeat(o.rar)}</div>
        <div class="cn">${c.name}</div>
        ${o.dupe?'<div class="dup">ДУБЛЬ · +РАНГ</div>':''}
      </div>`;
    }).join('');
    this.mount('scr-pull',`
      <div class="scr-head">
        <button class="back" onclick="UI.openGacha()">↩</button>
        <div class="crumb">Результат канала</div>
        <div style="flex:1"></div>
        <div class="muted">${out.length} круток</div>
      </div>
      <div class="pullgrid">${cards}</div>
      <div class="tabs" style="justify-content:center;padding-bottom:22px">
        <div class="tab" onclick="UI.doPull(10)">ЕЩЁ ×10</div>
        <div class="tab on" onclick="UI.openGacha()">НАЗАД</div>
      </div>
    `);
    GAME.paused=true;
  },

  /* ================================================================ МАГАЗИН */
  openShop(){
    const items=DATA.SHOP.map(it=>{
      const bal=it.cur==='cr'?G.save.credits:G.save.eth;
      const can=bal>=it.price;
      return `<div class="si">
        <div class="si-ic" style="color:${it.cur==='cr'?'#bfc9d8':'#ffe14d'}">${it.ic}</div>
        <div class="si-m">
          <div class="si-n">${it.n}</div>
          <div class="si-d">${it.d}</div>
        </div>
        <button class="btn ${can?'':'ghost'}" ${can?'':'disabled'}
          onclick="UI.buy('${it.id}')">${it.price} ${it.cur==='cr'?'КР':'ЭФ'}</button>
      </div>`;
    }).join('');
    this.mount('scr-shop',`
      ${this.head('Магазин · Ржавый рынок')}
      <div style="padding:0 24px 10px"><div class="sub">ТОВАРЫ</div></div>
      <div class="shop">${items}
        <div class="si" style="grid-column:1/-1;border-color:#333">
          <div class="si-ic">▤</div>
          <div class="si-m"><div class="si-n">Чипы: ${G.save.chips}</div>
            <div class="si-d">Материал для прокачки категорий навыков</div></div>
          <button class="btn ghost" onclick="UI.dailyBonus()">ЗАБРАТЬ ДНЕВНОЙ БОНУС</button>
        </div>
      </div>
    `);
    GAME.paused=true;
  },

  buy(id){
    const it=DATA.SHOP.find(x=>x.id===id);
    const bal=it.cur==='cr'?G.save.credits:G.save.eth;
    if(bal<it.price){ UI.toast('Недостаточно средств','warn'); return; }
    if(it.cur==='cr') G.save.credits-=it.price; else G.save.eth-=it.price;
    if(it.give.chip) G.save.chips+=it.give.chip;
    if(it.give.eth) G.save.eth+=it.give.eth;
    if(it.give.sp) G.save.sp+=it.give.sp;
    if(it.give.heal){
      for(const cid of G.save.party){
        const s=CBT.stats(cid); G.rt[cid].hp=s.hp;
      }
      UI.toast('Команда восстановлена','gold');
    }
    SFX.pickup(); Store.save(); this.openShop(); this.refreshRes();
  },

  dailyBonus(){
    const k='bonus:'+new Date().toDateString();
    if(G.save.flags[k]){ UI.toast('Сегодня уже забрано','warn'); return; }
    G.save.flags[k]=true;
    G.save.eth+=160; G.save.chips+=2; G.save.credits+=500;
    UI.toast('Бонус: ✦160 · 2 чипа · 500 КР','gold');
    SFX.levelup(); Store.save(); this.openShop();
  },

  /* ================================================================ ЗАКАЗЫ */
  openQuests(){
    const rows=QM.list.map(q=>{
      const s=QM.q(q.id);
      const pct=U.clamp(s.p/q.need,0,1)*100;
      const can=s.done&&!s.claimed;
      return `<div class="si" style="align-items:flex-start">
        <div class="si-ic" style="color:${s.claimed?'#3a4152':can?'var(--lime)':'#8b91a3'}">
          ${s.claimed?'✓':'!'}</div>
        <div class="si-m">
          <div class="si-n">${q.n}</div>
          <div class="si-d">${q.d}</div>
          <div class="bar" style="height:4px;margin-top:7px;width:220px">
            <i style="width:${pct}%;background:${can?'linear-gradient(90deg,#ffe600,#c8ff1e)':'#4a5568'}"></i></div>
          <div style="font-size:10px;color:var(--dim2);margin-top:4px" class="mono">
            ${Math.min(s.p,q.need)} / ${q.need} · награда: ${q.cr}КР${q.eth?' · ✦'+q.eth:''}${q.sp?' · '+q.sp+'SP':''}</div>
        </div>
        <button class="btn ${can?'':'ghost'}" ${can?'':'disabled'}
          onclick="UI.claimQuest('${q.id}')">${s.claimed?'ЗАБРАНО':can?'ЗАБРАТЬ':'В ПРОЦЕССЕ'}</button>
      </div>`;
    }).join('');
    this.mount('scr-quests',`
      ${this.head('Доска заказов · Диспетчер')}
      <div style="padding:0 24px 10px"><div class="sub">КОНТРАКТЫ</div></div>
      <div class="shop">${rows}</div>
    `);
    GAME.paused=true;
  },

  claimQuest(id){
    if(QM.claim(id)){ SFX.levelup(); Store.save(); this.openQuests(); }
  },

  /* ================================================================= КАРТА */
  openMap(){
    const regs=DATA.REGIONS.map(r=>{
      const unlocked=G.save.unlockedTP.includes(r.id);
      const lv=r.lvl[1]>0?`ур. ${r.lvl[0]}–${r.lvl[1]}`:'безопасно';
      return `<div class="si">
        <div class="si-ic" style="color:${r.safe?'var(--lime)':'#ff8a3d'}">${r.safe?'⌂':'◈'}</div>
        <div class="si-m"><div class="si-n">${r.name}</div>
          <div class="si-d">${r.desc} · ${lv}</div></div>
        <button class="btn ${unlocked?'':'ghost'}" ${unlocked?'':'disabled'}
          onclick="UI.tp('${r.id}')">${unlocked?'ПЕРЕМЕСТИТЬСЯ':'НЕ ОТКРЫТО'}</button>
      </div>`;
    }).join('');
    this.mount('scr-map',`
      ${this.head('Карта Ноль-сектора')}
      <div style="padding:0 24px 10px"><div class="sub">ТОЧКИ ПЕРЕМЕЩЕНИЯ</div></div>
      <div class="shop">${regs}</div>
    `);
    GAME.paused=true;
  },

  tp(id){
    const pad=MAP.pads.find(p=>p.id===id);
    if(!pad) return;
    CBT.player.x=pad.x; CBT.player.y=pad.y;
    CAM.follow(pad.x,pad.y,1,true);
    CBT.enemies=[]; CBT.projs=[]; CBT.zones=[];
    UI.close(); SFX.swap();
    UI.toast('Перемещение: '+pad.n,'gold');
  },

  /* ================================================================ МЕНЮ */
  openMenu(){
    this.mount('scr-menu',`
      <div class="center-col">
        <div class="sub">НОЛЬ-СЕКТОР</div>
        <div class="big-title">ПАУЗА</div>
        <div class="muted">Ур. отряда ${Math.max(...G.save.party.map(id=>G.save.roster[id].level))} ·
          реакций: ${G.save.stats.reactions||0} · врагов: ${G.save.stats.kills||0}</div>
        <div class="menu-btns">
          <button class="btn" onclick="UI.close()">ПРОДОЛЖИТЬ</button>
          <button class="btn ghost" onclick="UI.openAgent(G.save.party[CBT.active||0])">ДРЕВО НАВЫКОВ</button>
          <button class="btn ghost" onclick="UI.openRoster()">АГЕНТЫ</button>
          <button class="btn ghost" onclick="UI.openGacha()">КАНАЛ</button>
          <button class="btn ghost" onclick="UI.openShop()">МАГАЗИН</button>
          <button class="btn ghost" onclick="UI.openQuests()">ЗАКАЗЫ</button>
          <button class="btn ghost" onclick="UI.openMap()">КАРТА</button>
          <button class="btn ghost" onclick="UI.saveGame()">СОХРАНИТЬ</button>
        </div>
        <div class="hintline">
          <span class="kbd">WASD</span> движение · <span class="kbd">ЛКМ</span>/<span class="kbd">J</span> цепочка атак ·
          <span class="kbd">E</span> навык · <span class="kbd">Пробел</span>/<span class="kbd">K</span> рывок ·
          <span class="kbd">Q</span> ульта · <span class="kbd">F</span> цепная атака · <span class="kbd">1</span><span class="kbd">2</span><span class="kbd">3</span> смена агента
        </div>
      </div>
    `);
    GAME.paused=true;
  },

  saveGame(){ Store.save(); UI.toast('Прогресс сохранён','gold'); },

  /* ================================================================ ДИАЛОГ */
  dialog(npc,onEnd){
    const lines=npc.npc?npc.npc.lines:npc.lines;
    const name=npc.npc?npc.npc.name:npc.name;
    let i=0;
    const show=()=>{
      const d=document.getElementById('dlg');
      if(!d) return;
      d.querySelector('.dt').textContent=lines[i];
      d.querySelector('.dc').textContent=(i+1)+' / '+lines.length+' · клик — далее';
    };
    this.el.innerHTML=`<div class="dlg" id="dlg" onclick="UI._nextLine()">
      <div class="dp"><div style="width:100%;height:100%;display:grid;place-items:center;
        font-family:Impact;font-size:26px;color:var(--lime)">${name[0]}</div></div>
      <div style="flex:1">
        <div class="dn">${name}</div>
        <div class="dt">${lines[0]}</div>
      </div>
      <div class="dc"></div>
    </div>`;
    this.cur='dialog';
    this._dlg={lines,i:0,npc,onEnd,show};
    show();
    SFX.uiBig();
  },
  _nextLine(){
    const d=this._dlg;
    if(!d) return;
    d.i++;
    if(d.i>=d.lines.length){
      this.el.innerHTML=''; this.cur=null; this._dlg=null;
      if(d.onEnd) d.onEnd();
      return;
    }
    d.show();
    SFX.ui();
  },
};

/* ================================================================ ТИТУЛ === */
const TITLE = {
  open(){
    const hasSave=Store.has();
    UI.mount('scr-title',`
      <div class="center-col">
        <div class="sub">НОВЫЙ ЭРИДУ… ШУТКА. КАЙРОС.</div>
        <div class="big-title">НОЛЬ<br>СЕКТОР</div>
        <div style="font-size:13px;letter-spacing:4px;color:var(--dim);margin-top:-6px">
          ЭКШЕН-ГАЧА · СТИХИЙНЫЕ РЕАКЦИИ · ДРЕВО НАВЫКОВ</div>
        <div class="menu-btns">
          <button class="btn" id="startBtn" onclick="TITLE.start(${hasSave})">
            ${hasSave?'ПРОДОЛЖИТЬ':'НАЧАТЬ'}</button>
          ${hasSave?`<button class="btn ghost" onclick="TITLE.newGame()">НОВАЯ ИГРА</button>`:''}
          <button class="btn ghost" onclick="UI.openMenu()">УПРАВЛЕНИЕ</button>
        </div>
        <div class="hintline">
          Пять районов, десять стихийных реакций, комбо через смену агента.<br>
          <span style="color:var(--lime)">Совет:</span> бей одним элементом, добивай другим — реакция даёт больше урона, чем удар.
        </div>
      </div>
    `);
    GAME.paused=true;
  },
  start(hasSave){
    SFX.init(); SFX.resume(); SFX.setMood(110);
    if(hasSave && Store.load()){
      Object.assign(G.save, Store.load().save||{});
    }
    UI.close();
    GAME.paused=false;
    GAME.started=true;
    if(!G.save.seen.intro){
      G.save.seen.intro=true;
      setTimeout(()=>{
        UI.dialog({name:'ДИСПЕТЧЕР', lines:[
          'Добро пожаловать в Ноль-сектор, courier.',
          'Дыра в небе растёт. Пока ты читаешь это, она съела ещё два квартала.',
          'Правило простое: наложи стихию, смени агента, добей реакцией. Один удар — ноль. Реакция — всё.',
          'Иди в Ржавый Пояс. Там уже шумит. W A S D — и вперёд.',
        ]}, ()=>{});
      }, 700);
    }
    UI.refreshTeam();
  },
  newGame(){
    Store.wipe();
    G.init();
    TITLE.start(false);
  },
};
