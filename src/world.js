/* ============================================================================
   НОЛЬ-СЕКТОР — МИР: карта, районы, реквизит, коллизии, погода, миникарта
   ========================================================================== */
'use strict';

/* ------------------------------------------------------------ генератор --- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const T = { VOID:0, GROUND:1, ROAD:2, WALL:3, WATER:4, LAVA:5, ICE:6, METAL:7, RIFT:8, RUBBLE:9, GRASS:10 };

const MAP = {
  w:DATA.WORLD.w, h:DATA.WORLD.h, ts:DATA.WORLD.tile,
  tiles:null, props:[], objs:[], spawns:[], bossSpots:[], pads:[],
  rnd:null, seed:1337,

  build(){
    this.rnd=mulberry32(this.seed);
    const {w,h}=this;
    this.tiles=new Uint8Array(w*h).fill(T.VOID);
    this.props=[]; this.objs=[]; this.spawns=[]; this.bossSpots=[]; this.pads=[];

    /* --- заливка районов --- */
    for(const r of DATA.REGIONS){
      const [rx,ry,rw,rh]=r.rect;
      const base = r.ground==='city'?T.METAL : r.ground==='rust'?T.RUBBLE
                 : r.ground==='furnace'?T.METAL : r.ground==='cryo'?T.ICE : T.RIFT;
      for(let y=ry;y<ry+rh;y++)for(let x=rx;x<rx+rw;x++){
        if(x<0||y<0||x>=w||y>=h) continue;
        this.set(x,y,base);
      }
      // пятна второго типа
      const patchA = r.ground==='city'?T.ROAD : r.ground==='rust'?T.GROUND : null;
      if(patchA) this.blobs(r, patchA, 6, 4);
      const patchB = r.ground==='furnace'?T.LAVA : r.ground==='cryo'?T.WATER
                   : r.ground==='rift'?T.RIFT : T.RUBBLE;
      this.blobs(r, patchB, 5, 4);
      if(r.ground==='furnace') this.blobs(r,T.RUBBLE,5,3);
      if(r.ground==='cryo') this.blobs(r,T.ICE,4,3);
      if(r.ground==='rust') this.blobs(r,T.RUBBLE,5,3);
    }

    /* --- дороги между районами --- */
    const c=i=>{const r=DATA.REGIONS[i].rect;return {x:Math.floor(r[0]+r[2]/2),y:Math.floor(r[1]+r[3]/2)}};
    const order=['hub','rust','furnace','cryo','rift'];
    for(let i=0;i<order.length;i++){
      for(let j=i+1;j<order.length;j++){
        if(i!==0 && j!==0 && !(j===i+1)) continue;
        this.road(c(order.indexOf(order[i])),c(order.indexOf(order[j])));
      }
    }
    // центральная площадь
    this.plaza(48,18,7);

    /* --- город: кварталы --- */
    for(let bx=30;bx<=62;bx+=8){
      for(let by=7;by<=26;by+=7){
        if(this.rnd()<0.18) continue;
        const bw=3+Math.floor(this.rnd()*3), bh=2+Math.floor(this.rnd()*2);
        this.building(bx,by,bw,bh, this.rnd()<0.5?'#1b2028':'#20242c');
      }
    }
    // стены по периметру города (с проёмами на дорогах)
    for(let x=28;x<70;x++){ if(this.tiles[5*w+x]!==T.ROAD&&this.rnd()<0.85) this.set(x,5,T.WALL);
                            if(this.tiles[29*w+x]!==T.ROAD&&this.rnd()<0.8) this.set(x,29,T.WALL); }

    /* --- реквизит по районам --- */
    for(const r of DATA.REGIONS) this.scatterProps(r);

    /* --- объекты --- */
    this.placeObjects();

    /* --- точки спавна врагов --- */
    for(const r of DATA.REGIONS){
      if(r.safe) continue;
      const [rx,ry,rw,rh]=r.rect;
      for(let i=0;i<12;i++){
        const x=rx+2+Math.floor(this.rnd()*(rw-4));
        const y=ry+2+Math.floor(this.rnd()*(rh-4));
        if(!this.walkable(x,y)) continue;
        this.spawns.push({x:x*this.ts+this.ts/2, y:y*this.ts+this.ts/2, region:r.id,
          types:r.enemies, lvl:r.lvl});
      }
    }
    // боссы
    this.bossSpots=[
      {id:'golem', x:74*this.ts, y:50*this.ts, region:'furnace', lvl:14},
      {id:'queen', x:26*this.ts, y:72*this.ts, region:'cryo',    lvl:20},
      {id:'nullb', x:78*this.ts, y:72*this.ts, region:'rift',    lvl:28},
    ];
    // точки быстрого перемещения
    this.pads=[
      {id:'hub',   x:48*this.ts, y:19*this.ts, region:'hub', n:'КАЙРОС'},
      {id:'rust',  x:20*this.ts, y:44*this.ts, region:'rust', n:'РЖАВЫЙ ПОЯС'},
      {id:'furnace',x:64*this.ts,y:42*this.ts, region:'furnace', n:'ГОЛОДНАЯ ПЕЧЬ'},
      {id:'cryo',  x:24*this.ts, y:70*this.ts, region:'cryo', n:'КРИОБУХТА'},
      {id:'rift',  x:70*this.ts, y:70*this.ts, region:'rift', n:'РАЗЛОМ НОЛЬ'},
    ];
  },

  set(x,y,t){ if(x>=0&&y>=0&&x<this.w&&y<this.h) this.tiles[y*this.w+x]=t; },
  get(x,y){ if(x<0||y<0||x>=this.w||y>=this.h) return T.VOID; return this.tiles[y*this.w+x]; },

  blobs(region, type, count, size){
    const rnd=this.rnd, [rx,ry,rw,rh]=region.rect;
    for(let i=0;i<count;i++){
      const cx=rx+rnd()*rw, cy=ry+rnd()*rh, rad=size*(0.6+rnd()*1.2);
      for(let y=Math.floor(cy-rad);y<=cy+rad;y++)for(let x=Math.floor(cx-rad);x<=cx+rad;x++){
        const d=Math.hypot(x-cx,y-cy);
        if(d<rad*(0.7+rnd()*0.5)) this.set(x,y,type);
      }
    }
  },

  road(a,b){
    const w=this.w;
    const hz=(y,x1,x2)=>{for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++)
      for(let d=-1;d<=1;d++){ const t=this.get(x,y+d); if(t===T.WALL) continue; this.set(x,y+d,T.ROAD); }};
    const vz=(x,y1,y2)=>{for(let y=Math.min(y1,y2);y<=Math.max(y1,y2);y++)
      for(let d=-1;d<=1;d++){ const t=this.get(x+d,y); if(t===T.WALL) continue; this.set(x+d,y,T.ROAD); }};
    hz(a.y,a.x,b.x); vz(b.x,a.y,b.y);
  },

  plaza(cx,cy,r){
    for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){
      if(Math.hypot(x-cx,y-cy)>r) continue;
      this.set(x,y,T.ROAD);
    }
  },

  building(x,y,w,h){
    for(let i=0;i<w;i++)for(let j=0;j<h;j++){
      if(this.get(x+i,y+j)===T.ROAD) continue;
      this.set(x+i,y+j,T.WALL);
    }
    // неоновые вывески на фасаде
    this.props.push({t:'sign', x:(x+w/2)*this.ts, y:(y+h)*this.ts-6,
      w:w*this.ts*0.8, h:10, col:this.rnd()<0.5?'#c8ff1e':'#ff2e88', txt:''});
  },

  scatterProps(r){
    const rnd=this.rnd, [rx,ry,rw,rh]=r.rect;
    const n=Math.floor(rw*rh*0.16);
    for(let i=0;i<n;i++){
      const tx=rx+1+Math.floor(rnd()*(rw-2));
      const ty=ry+1+Math.floor(rnd()*(rh-2));
      if(!this.walkable(tx,ty)) continue;
      const x=tx*this.ts+this.ts/2, y=ty*this.ts+this.ts/2;
      let t;
      if(r.ground==='city')       t = U.choice(['barrel','sign2','lamp','vending','crate']);
      else if(r.ground==='rust')  t = U.choice(['wreck','barrel','pipe','crate','fence']);
      else if(r.ground==='furnace')t= U.choice(['pipe','barrel','furnace','crate','wreck']);
      else if(r.ground==='cryo')  t = U.choice(['crystal','wreck','barrel','fence','crate']);
      else                        t = U.choice(['shard','crystal','wreck','shard']);
      if(t==='barrel'&&rnd()<0.4) continue;
      this.props.push({t,x,y, r:(t==='crate'?13:t==='barrel'?10:0),
        solid:['wreck','barrel','crate','fence','pipe','furnace','vending','crystal'].includes(t),
        s:0.8+rnd()*0.5, rot:rnd()*6.283, col:U.choice(['#c8ff1e','#ff2e88','#22e0ff','#ffe14d'])});
    }
  },

  placeObjects(){
    const ts=this.ts;
    // сундуки
    const chestSpots=[[16,40],[30,36],[38,52],[22,54],[60,36],[70,50],[84,44],
                      [12,68],[34,78],[42,66],[66,72],[84,76],[72,66]];
    chestSpots.forEach(([x,y],i)=>{
      if(!this.walkable(x,y)) return;
      this.objs.push({t:'chest', id:'ch'+i, x:x*ts+ts/2, y:y*ts+ts/2, opened:false,
        reward: i%3===0?{eth:60,cr:200}:i%3===1?{cr:420,chip:2}:{eth:120,cr:120,chip:1}});
    });
    // терминал крутки + магазин в городе
    this.objs.push({t:'terminal', id:'gacha', x:45*ts, y:14*ts, label:'КАНАЛ'});
    this.objs.push({t:'shop',     id:'shop',  x:52*ts, y:14*ts, label:'МАГАЗИН'});
    this.objs.push({t:'board',    id:'board', x:41*ts, y:22*ts, label:'ЗАКАЗЫ'});
    this.objs.push({t:'save',     id:'save',  x:48*ts, y:24*ts, label:'СОХРАНИТЬ'});
    // NPC
    DATA.NPCS.forEach((n,i)=>{
      this.objs.push({t:'npc', id:n.id, x:n.x*ts, y:n.y*ts, npc:n, label:n.name});
    });
  },

  /* ------------------------------------------------------------ запросы -- */
  walkable(tx,ty){
    const t=this.get(tx,ty);
    return t===T.GROUND||t===T.ROAD||t===T.RUBBLE||t===T.METAL||t===T.ICE||t===T.GRASS;
  },
  solidTile(tx,ty){ return !this.walkable(tx,ty); },

  solidAt(x,y,r=12){
    const ts=this.ts;
    // тайлы
    for(let ty=Math.floor((y-r)/ts);ty<=Math.floor((y+r)/ts);ty++)
      for(let tx=Math.floor((x-r)/ts);tx<=Math.floor((x+r)/ts);tx++)
        if(this.solidTile(tx,ty)) return true;
    // пропсы
    for(const p of this.props){
      if(!p.solid) continue;
      const dx=x-p.x, dy=y-(p.y-8);
      if(Math.abs(dx)<(p.r||16)+r*0.6 && Math.abs(dy)<(p.r||16)+r*0.4) return true;
    }
    return false;
  },

  regionAt(x,y){
    const tx=x/this.ts, ty=y/this.ts;
    for(const r of DATA.REGIONS){
      const[ax,ay,aw,ah]=r.rect;
      if(tx>=ax&&tx<ax+aw&&ty>=ay&&ty<ay+ah) return r;
    }
    return DATA.REGIONS[0];
  },

  /* ------------------------------------------------------------ рисование */
  terrainCol(t,region){
    const g=region.ground;
    switch(t){
      case T.ROAD:  return g==='city'?'#4a5468':g==='rust'?'#4e412a':g==='furnace'?'#453022':
                           g==='cryo'?'#3a5c70':'#332347';
      case T.WALL:  return g==='city'?'#12161e':'#171315';
      case T.WATER: return '#123246';
      case T.LAVA:  return '#c43c00';
      case T.ICE:   return '#284e60';
      case T.METAL: return g==='city'?'#2d3644':g==='furnace'?'#332520':'#272123';
      case T.RIFT:  return '#221636';
      case T.RUBBLE:return g==='rust'?'#3d3324':'#2b241e';
      case T.GRASS: return '#1f2a1c';
      default:      return '#0d0e13';
    }
  },

  drawTerrain(ctx,cam,t){
    const ts=this.ts;
    const x0=Math.max(0,Math.floor((cam.x-cam.w/2)/ts)-1);
    const x1=Math.min(this.w-1,Math.ceil((cam.x+cam.w/2)/ts)+1);
    const y0=Math.max(0,Math.floor((cam.y-cam.h/2)/ts)-1);
    const y1=Math.min(this.h-1,Math.ceil((cam.y+cam.h/2)/ts)+1);

    for(let y=y0;y<=y1;y++){
      for(let x=x0;x<=x1;x++){
        const t2=this.get(x,y);
        const px=x*ts, py=y*ts;
        const reg=this.regionAt(px+ts/2,py+ts/2);
        const g=reg.ground;
        let col=this.terrainCol(t2,reg);
        const hash=(((x*374761393)^(y*668265263))>>>0);

        /* ---- пол ---- */
        if(t2===T.ROAD){
          ctx.fillStyle=col; ctx.fillRect(px,py,ts+1,ts+1);
          // разметка
          if(hash%7===0){
            ctx.fillStyle='rgba(255,225,77,.16)';
            ctx.fillRect(px+ts*0.15,py+ts*0.45,ts*0.7,3);
          }
          if(hash%13===0){
            ctx.fillStyle='rgba(0,0,0,.25)';
            ctx.fillRect(px+ts*0.3,py+ts*0.2,ts*0.4,ts*0.12);
          }
          // бордюр на стыке с не-дорогой
          const up=this.get(x,y-1), dn=this.get(x,y+1);
          if(up!==T.ROAD&&up!==T.WALL){ ctx.fillStyle='rgba(255,255,255,.14)'; ctx.fillRect(px,py,ts+1,2); }
          if(dn!==T.ROAD&&dn!==T.WALL){ ctx.fillStyle='rgba(0,0,0,.22)'; ctx.fillRect(px,py+ts-2,ts+1,2); }
        }
        else if(t2===T.WALL){
          const below=this.get(x,y+1), above=this.get(x,y-1);
          const l=this.get(x-1,y), r=this.get(x+1,y);
          // корпус
          ctx.fillStyle='#0b0e14'; ctx.fillRect(px,py,ts+1,ts+1);
          // крыша
          ctx.fillStyle='#1c222c'; ctx.fillRect(px,py,ts+1,ts*0.52);
          ctx.fillStyle='rgba(255,255,255,.035)'; ctx.fillRect(px,py,ts+1,3);
          // фасад
          if(below!==T.WALL){
            ctx.fillStyle='#10131a'; ctx.fillRect(px,py+ts*0.5,ts+1,ts*0.5);
            if(hash%3===0){
              ctx.fillStyle=hash%2?'#ffe14d':'#7fe4ff';
              ctx.globalAlpha=.42;
              ctx.fillRect(px+ts*0.18,py+ts*0.58,ts*0.2,ts*0.2);
              ctx.fillRect(px+ts*0.58,py+ts*0.58,ts*0.2,ts*0.2);
              ctx.globalAlpha=1;
            }
          }
          // кромки
          if(above!==T.WALL){
            ctx.fillStyle='rgba(200,255,30,.30)'; ctx.fillRect(px,py,ts+1,3);
            ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(px,py-10,ts+1,10);
          }
          if(l!==T.WALL){ ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(px-8,py,9,ts+1); }
          if(r!==T.WALL){ ctx.fillStyle='rgba(0,0,0,.35)'; ctx.fillRect(px+ts,py,4,ts+1); }
          if(below!==T.WALL){ ctx.fillStyle='rgba(0,0,0,.65)'; ctx.fillRect(px,py+ts,ts+1,10); }
          continue;
        }
        else {
          ctx.fillStyle=col; ctx.fillRect(px,py,ts+1,ts+1);
          // затемнение у стен (псевдо-объём)
          const nW=(this.get(x,y-1)===T.WALL?1:0)+(this.get(x-1,y)===T.WALL?1:0)
                  +(this.get(x+1,y)===T.WALL?1:0)+(this.get(x,y+1)===T.WALL?1:0);
          if(nW){
            ctx.fillStyle=`rgba(0,0,0,${0.10+nW*0.06})`;
            ctx.fillRect(px,py,ts+1,ts+1);
            if(this.get(x,y-1)===T.WALL){ ctx.fillStyle='rgba(0,0,0,.22)'; ctx.fillRect(px,py,ts+1,10); }
            if(this.get(x,y+1)===T.WALL){ ctx.fillStyle='rgba(0,0,0,.30)'; ctx.fillRect(px,py+ts-8,ts+1,8); }
            if(this.get(x-1,y)===T.WALL){ ctx.fillStyle='rgba(0,0,0,.22)'; ctx.fillRect(px,py,8,ts+1); }
            if(this.get(x+1,y)===T.WALL){ ctx.fillStyle='rgba(0,0,0,.22)'; ctx.fillRect(px+ts-8,py,8,ts+1); }
          }
          // фактура пола
          if(t2===T.METAL){
            if(hash%4===0){
              ctx.strokeStyle='rgba(255,255,255,.05)'; ctx.lineWidth=1;
              ctx.strokeRect(px+0.5,py+0.5,ts,ts);
            }
            if(hash%17===0){
              ctx.fillStyle='rgba(200,255,30,.07)';
              ctx.fillRect(px+ts*0.2,py+ts*0.2,ts*0.6,ts*0.06);
            }
          }
          if(t2===T.RUBBLE){
            if(hash%5===0){
              ctx.fillStyle='rgba(0,0,0,.22)';
              ctx.fillRect(px+ts*0.25,py+ts*0.3,ts*0.3,ts*0.16);
            }
            if(hash%9===0){
              ctx.fillStyle='rgba(255,150,60,.12)';
              ctx.fillRect(px+ts*0.6,py+ts*0.65,ts*0.18,ts*0.1);
            }
          }
          if(t2===T.ICE){
            if(hash%6===0){
              ctx.strokeStyle='rgba(180,240,255,.14)'; ctx.lineWidth=1;
              ctx.beginPath();
              ctx.moveTo(px+ts*0.2,py+ts*0.3); ctx.lineTo(px+ts*0.5,py+ts*0.45);
              ctx.lineTo(px+ts*0.4,py+ts*0.8); ctx.stroke();
            }
          }
          if(t2===T.RIFT){
            const w=Math.sin(t*1.2+x*0.4+y*0.3)*0.5+0.5;
            ctx.fillStyle=`rgba(168,107,255,${0.05+w*0.09})`;
            ctx.fillRect(px,py,ts,ts);
            if(hash%8===0){
              ctx.fillStyle='rgba(255,225,77,.10)';
              ctx.fillRect(px+ts*0.4,py+ts*0.4,ts*0.2,ts*0.2);
            }
          }
        }

        /* ---- вода / лава ---- */
        if(t2===T.WATER){
          const w=Math.sin(t*1.4+x*0.4+y*0.25)*0.5+0.5;
          ctx.fillStyle=U.mix('#0e2b3c','#245a72',w*0.7);
          ctx.fillRect(px,py,ts+1,ts+1);
        }
        if(t2===T.LAVA){
          const w=Math.sin(t*2.2+x*0.6-y*0.4)*0.5+0.5;
          ctx.fillStyle=U.mix('#a32b00','#ff8a2a',w*0.8);
          ctx.fillRect(px,py,ts+1,ts+1);
        }
      }
    }

    /* ---- свечение лавы и неба ---- */
    for(let y=y0;y<=y1;y+=2)for(let x=x0;x<=x1;x+=2){
      if(this.get(x,y)===T.LAVA){
        const g2=ctx.createRadialGradient(x*ts+ts/2,y*ts+ts/2,0,x*ts+ts/2,y*ts+ts/2,ts*2.2);
        g2.addColorStop(0,'rgba(255,120,30,.26)'); g2.addColorStop(1,'rgba(255,120,30,0)');
        ctx.fillStyle=g2; ctx.fillRect(x*ts-ts*2,y*ts-ts*2,ts*5,ts*5);
      }
    }
  },

  drawProp(ctx,p,t){
    const x=p.x, y=p.y, s=p.s||1;
    switch(p.t){
      case 'wreck':{
        ctx.save(); ctx.translate(x,y); ctx.rotate(p.rot*0.2);
        ctx.fillStyle='#2a2420'; ctx.beginPath();
        ctx.moveTo(-26,-14); ctx.lineTo(20,-20); ctx.lineTo(28,-2); ctx.lineTo(-22,6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle='#3d322a'; ctx.lineWidth=2; ctx.stroke();
        ctx.fillStyle='#151210'; ctx.fillRect(-14,-10,18,10);
        ctx.fillStyle='#c85a1a'; ctx.globalAlpha=.35; ctx.fillRect(-6,-8,6,4); ctx.globalAlpha=1;
        ctx.restore(); break; }
      case 'barrel':{
        ctx.save(); ctx.translate(x,y);
        ctx.fillStyle='#2d3138'; ctx.beginPath(); ctx.ellipse(0,-14,11,16,0,0,6.2832); ctx.fill();
        ctx.fillStyle='#3a4048'; ctx.fillRect(-11,-16,22,12);
        ctx.strokeStyle=p.col; ctx.globalAlpha=.6; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(-11,-8); ctx.lineTo(11,-8); ctx.stroke();
        ctx.globalAlpha=1; ctx.restore(); break; }
      case 'crate':{
        ctx.save(); ctx.translate(x,y);
        ctx.fillStyle='#3b3126'; ctx.fillRect(-13,-26,26,26);
        ctx.strokeStyle='#241d15'; ctx.lineWidth=2; ctx.strokeRect(-13,-26,26,26);
        ctx.strokeStyle='#57483a'; ctx.beginPath(); ctx.moveTo(-13,-26); ctx.lineTo(13,0);
        ctx.moveTo(13,-26); ctx.lineTo(-13,0); ctx.stroke();
        if(p.id) { ctx.fillStyle=p.col; ctx.fillRect(-13,-26,26,3); }
        ctx.restore(); break; }
      case 'fence':{
        ctx.save(); ctx.translate(x,y);
        ctx.strokeStyle='#4a4238'; ctx.lineWidth=3; ctx.lineCap='round';
        for(let i=-2;i<=2;i++){ ctx.beginPath(); ctx.moveTo(i*10,-24); ctx.lineTo(i*10,-2); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(-22,-18); ctx.lineTo(22,-18); ctx.moveTo(-22,-8); ctx.lineTo(22,-8); ctx.stroke();
        ctx.restore(); break; }
      case 'pipe':{
        ctx.save(); ctx.translate(x,y);
        ctx.fillStyle='#2b2a26'; ctx.fillRect(-6,-40,12,40);
        ctx.fillStyle='#3a332c'; ctx.fillRect(-9,-42,18,6);
        ctx.strokeStyle='#6a4a2a'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-6,-30); ctx.lineTo(6,-30); ctx.stroke();
        ctx.restore(); break; }
      case 'furnace':{
        ctx.save(); ctx.translate(x,y);
        ctx.fillStyle='#241a15'; ctx.beginPath(); ctx.moveTo(-22,0); ctx.lineTo(-18,-46);
        ctx.lineTo(18,-46); ctx.lineTo(22,0); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#ff6a1a'; ctx.globalAlpha=.55+Math.sin(t*3+x)*0.15;
        ctx.fillRect(-9,-30,18,16); ctx.globalAlpha=1;
        ctx.strokeStyle='#3a2a20'; ctx.lineWidth=2; ctx.stroke();
        ctx.restore(); break; }
      case 'crystal':{
        ctx.save(); ctx.translate(x,y);
        const g=ctx.createLinearGradient(0,-40,0,0);
        g.addColorStop(0,'rgba(140,233,255,.9)'); g.addColorStop(1,'rgba(60,140,180,.5)');
        ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(0,-42); ctx.lineTo(11,-12);
        ctx.lineTo(4,0); ctx.lineTo(-8,-4); ctx.lineTo(-12,-16); ctx.closePath(); ctx.fill();
        ctx.strokeStyle='rgba(200,240,255,.55)'; ctx.lineWidth=1.4; ctx.stroke();
        ctx.restore(); break; }
      case 'shard':{
        ctx.save(); ctx.translate(x,y);
        ctx.fillStyle='rgba(168,107,255,.6)'; ctx.shadowColor='#a86bff'; ctx.shadowBlur=14;
        ctx.beginPath(); ctx.moveTo(0,-38+Math.sin(t*2+x)*4); ctx.lineTo(8,-10);
        ctx.lineTo(0,0); ctx.lineTo(-8,-10); ctx.closePath(); ctx.fill();
        ctx.shadowBlur=0; ctx.restore(); break; }
      case 'vending':{
        ctx.save(); ctx.translate(x,y);
        ctx.fillStyle='#1c2028'; ctx.fillRect(-16,-44,32,44);
        ctx.fillStyle='#0a0b0f'; ctx.fillRect(-12,-40,24,26);
        ctx.fillStyle=p.col; ctx.globalAlpha=.5; ctx.fillRect(-12,-40,24,26); ctx.globalAlpha=1;
        ctx.fillStyle='#2a303a'; ctx.fillRect(-12,-10,24,6);
        ctx.restore(); break; }
      case 'lamp':{
        ctx.save(); ctx.translate(x,y);
        ctx.strokeStyle='#2a2f38'; ctx.lineWidth=4;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-64); ctx.stroke();
        ctx.fillStyle='#c8ff1e'; ctx.globalAlpha=.8;
        ctx.beginPath(); ctx.ellipse(0,-68,10,5,0,0,6.2832); ctx.fill();
        ctx.globalAlpha=1;
        const g=ctx.createRadialGradient(0,-68,0,0,-68,90);
        g.addColorStop(0,'rgba(200,255,30,.16)'); g.addColorStop(1,'rgba(200,255,30,0)');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,-68,90,0,6.2832); ctx.fill();
        ctx.restore(); break; }
      case 'sign':
      case 'sign2':{
        ctx.save(); ctx.translate(x,y);
        const c=p.col, w=p.w||54, hh=p.h||10;
        ctx.shadowColor=c; ctx.shadowBlur=16;
        ctx.fillStyle=c; ctx.globalAlpha=.75+Math.sin(t*2.4+x*0.05)*0.2;
        ctx.fillRect(-w/2,-hh/2,w,hh);
        ctx.shadowBlur=0; ctx.globalAlpha=1;
        ctx.fillStyle='#0b0c10';
        for(let i=0;i<3;i++) ctx.fillRect(-w/2+6+i*(w/3),-2,6,4);
        ctx.restore(); break; }
    }
  },

  drawObjects(ctx,t){
    for(const o of this.objs){
      const x=o.x,y=o.y;
      if(o.t==='chest'){
        ctx.save(); ctx.translate(x,y);
        if(o.opened){
          ctx.fillStyle='#2a2620'; ctx.fillRect(-14,-16,28,16);
          ctx.fillStyle='#1a1712'; ctx.fillRect(-14,-22,28,8);
        } else {
          ctx.fillStyle='#3d3225'; ctx.fillRect(-14,-20,28,20);
          ctx.fillStyle='#4d4030'; ctx.beginPath(); ctx.moveTo(-14,-20);
          ctx.lineTo(-14,-26); ctx.quadraticCurveTo(0,-38,14,-26); ctx.lineTo(14,-20); ctx.closePath(); ctx.fill();
          ctx.strokeStyle='#c8ff1e'; ctx.lineWidth=2; ctx.strokeRect(-14,-20,28,20);
          ctx.fillStyle='#c8ff1e'; ctx.fillRect(-3,-16,6,8);
          const g=ctx.createRadialGradient(0,-18,0,0,-18,44);
          g.addColorStop(0,'rgba(200,255,30,.18)'); g.addColorStop(1,'rgba(200,255,30,0)');
          ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,-18,44,0,6.2832); ctx.fill();
        }
        ctx.restore();
      } else if(o.t==='terminal'||o.t==='shop'||o.t==='board'||o.t==='save'){
        const col = o.t==='terminal'?'#c8ff1e':o.t==='shop'?'#ffe14d':o.t==='board'?'#22e0ff':'#ff2e88';
        ctx.save(); ctx.translate(x,y);
        // корпус
        ctx.fillStyle='#141821'; ctx.fillRect(-26,-58,52,58);
        ctx.strokeStyle='#2b3240'; ctx.lineWidth=2; ctx.strokeRect(-26,-58,52,58);
        // экран
        ctx.fillStyle='#0a0c11'; ctx.fillRect(-21,-53,42,34);
        ctx.shadowColor=col; ctx.shadowBlur=12;
        ctx.fillStyle=col; ctx.globalAlpha=.22+Math.sin(t*3)*0.06;
        ctx.fillRect(-21,-53,42,34); ctx.globalAlpha=1; ctx.shadowBlur=0;
        ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.strokeRect(-21,-53,42,34);
        // пиктограмма
        ctx.fillStyle=col; ctx.font='16px Impact'; ctx.textAlign='center';
        ctx.fillText(o.t==='terminal'?'✦':o.t==='shop'?'$':o.t==='board'?'!':'▮', 0,-30);
        // подпись на плашке
        ctx.font='700 11px "Segoe UI",sans-serif';
        const tw=ctx.measureText(o.label||'').width;
        ctx.fillStyle='rgba(6,8,11,.92)';
        ctx.fillRect(-tw/2-7,-20,tw+14,15);
        ctx.strokeStyle=col; ctx.lineWidth=1; ctx.strokeRect(-tw/2-7,-20,tw+14,15);
        ctx.fillStyle=col;
        ctx.fillText(o.label||'', 0, -9);
        ctx.restore();
      } else if(o.t==='npc'){
        const c=o.npc.color;
        ctx.save(); ctx.translate(x,y);
        ART.shadow(ctx,0,0,12);
        ctx.fillStyle='#1a1e26'; ctx.fillRect(-7,-34,14,26);
        ctx.fillStyle='#d8b48c'; ctx.beginPath(); ctx.arc(0,-40,7,0,6.2832); ctx.fill();
        ctx.fillStyle=c; ctx.fillRect(-7,-34,14,3);
        ctx.restore();
        // маркер
        const b=Math.sin(t*3)*3;
        ctx.fillStyle=c; ctx.font='12px Impact'; ctx.textAlign='center';
        ctx.globalAlpha=.85; ctx.fillText('!', x, y-56+b); ctx.globalAlpha=1;
      }
    }
    // пады телепорта
    for(const p of this.pads){
      ctx.save(); ctx.translate(p.x,p.y);
      const on=G.save.unlockedTP.includes(p.id);
      ctx.strokeStyle=on?'#c8ff1e':'#3a4152'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(0,0,26,12,0,0,6.2832); ctx.stroke();
      ctx.globalAlpha=on?0.35:0.15;
      ctx.fillStyle=on?'#c8ff1e':'#3a4152';
      ctx.beginPath(); ctx.ellipse(0,0,26,12,0,0,6.2832); ctx.fill();
      ctx.globalAlpha=1; ctx.restore();
    }
  },

  minimap(ctx,x,y,w,h,player){
    ctx.save();
    ctx.translate(x,y);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='rgba(6,7,10,.92)';
    ctx.fillRect(0,0,w,h);
    const sx=w/this.w, sy=h/this.h;
    // районы
    for(const r of DATA.REGIONS){
      const[ax,ay,aw,ah]=r.rect;
      ctx.fillStyle = r.safe?'rgba(200,255,30,.22)':'rgba(130,150,185,.15)';
      ctx.fillRect(ax*sx,ay*sy,aw*sx,ah*sy);
      ctx.strokeStyle=r.safe?'rgba(200,255,30,.65)':'rgba(130,150,185,.35)';
      ctx.lineWidth=1;
      ctx.strokeRect(ax*sx+.5,ay*sy+.5,aw*sx-1,ah*sy-1);
    }
    // улицы
    ctx.fillStyle='rgba(255,255,255,.10)';
    for(let ty=0;ty<this.h;ty+=1){
      for(let tx=0;tx<this.w;tx+=1){
        if(this.get(tx,ty)===T.ROAD) ctx.fillRect(tx*sx,ty*sy,Math.max(1,sx),Math.max(1,sy));
      }
    }
    // сундуки
    for(const o of this.objs){
      if(o.t==='chest'&&!o.opened){
        ctx.fillStyle='#ffe14d';
        ctx.fillRect(o.x/this.ts*sx-2,o.y/this.ts*sy-2,4,4);
      }
    }
    // боссы
    for(const b of this.bossSpots){
      if(G.save.bossKilled[b.id]) continue;
      ctx.fillStyle='#ff2e88';
      ctx.beginPath(); ctx.arc(b.x/this.ts*sx,b.y/this.ts*sy,3.4,0,6.2832); ctx.fill();
    }
    // враги
    ctx.fillStyle='#ff5252';
    for(const e of CBT.enemies){
      if(e.dead) continue;
      ctx.beginPath(); ctx.arc(e.x/this.ts*sx, e.y/this.ts*sy, e.boss?3:2, 0,6.2832); ctx.fill();
    }
    // игрок — стрелка
    const px=player.x/this.ts*sx, py=player.y/this.ts*sy;
    ctx.save();
    ctx.translate(px,py);
    ctx.rotate((player.aim||0)+Math.PI/2);
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(4.6,4.5); ctx.lineTo(0,2.4); ctx.lineTo(-4.6,4.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#c8ff1e'; ctx.lineWidth=1.2; ctx.stroke();
    ctx.restore();
    ctx.strokeStyle='rgba(200,255,30,.55)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(px,py,8,0,6.2832); ctx.stroke();
    // рамка
    ctx.strokeStyle='rgba(255,255,255,.16)'; ctx.lineWidth=1;
    ctx.strokeRect(.5,.5,w-1,h-1);
    ctx.restore();
  },
};

/* ------------------------------------------------------------- ПОГОДА ---- */
const WEATHER = {
  parts:[], mood:'rain', t:0,
  init(mood){
    this.mood=mood; this.parts=[];
    const n = mood==='snow'?120: mood==='ember'?80: mood==='void'?70:110;
    for(let i=0;i<n;i++) this.parts.push(this.mk(true));
  },
  mk(rand){
    const W=eng_w(),H=eng_h();
    return { x:Math.random()*W, y:rand?Math.random()*H:-20,
      vx:this.mood==='snow'?U.rand(14,-14):U.rand(-30,-8),
      vy:this.mood==='ember'?U.rand(-40,-14): this.mood==='void'?U.rand(12,-12): U.rand(320,180),
      s:U.rand(2.2,0.7), a:U.rand(0.5,0.15), life:U.rand(6,2) };
  },
  update(dt){
    const W=eng_w(),H=eng_h();
    for(let i=0;i<this.parts.length;i++){
      const p=this.parts[i];
      p.x+=p.vx*dt; p.y+=p.vy*dt;
      if(this.mood==='snow') p.x+=Math.sin(this.t+p.y*0.02)*8*dt;
      if(this.mood==='void') p.x+=Math.sin(this.t*0.7+p.y*0.01)*12*dt;
      if(p.y>H+20||p.x<-30||p.x>W+30){ this.parts[i]=this.mk(false); }
    }
    this.t+=dt;
  },
  draw(ctx){
    const m=this.mood;
    const col = m==='rain'?'170,200,230': m==='snow'?'220,240,255':
                m==='ember'?'255,140,50': m==='dust'?'200,170,120':'180,140,255';
    ctx.save();
    if(m==='rain'){
      ctx.strokeStyle=`rgba(${col},.18)`; ctx.lineWidth=1.1;
      ctx.beginPath();
      for(const p of this.parts){ ctx.moveTo(p.x,p.y); ctx.lineTo(p.x-3,p.y+11); }
      ctx.stroke();
    } else {
      for(const p of this.parts){
        ctx.fillStyle=`rgba(${col},${p.a})`;
        if(m==='ember'){ ctx.shadowColor='rgba(255,140,50,.8)'; ctx.shadowBlur=8; }
        ctx.beginPath(); ctx.arc(p.x,p.y,p.s,0,6.2832); ctx.fill();
        ctx.shadowBlur=0;
      }
    }
    ctx.restore();
  },
};

/* ------------------------------------------------------------ ФОНЫ/ЭФФЕКТ */
function drawVignette(ctx,W,H,col='#000',amt=0.72){
  const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.36,W/2,H/2,Math.max(W,H)*0.82);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,U.rgba(col,amt));
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
}
function drawScanlines(ctx,W,H){
  ctx.save();
  ctx.globalAlpha=0.05; ctx.fillStyle='#000';
  for(let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
  ctx.restore();
}
