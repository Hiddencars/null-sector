/* ============================================================================
   НОЛЬ-СЕКТОР — ГРАФИКА: SVG-фигуры агентов + отрисовка сущностей на канвасе
   Всё процедурное: новый агент = строка данных, а не новый код.
   ========================================================================== */
const ART = (() => {

/* --------------------------------------------------------- помощники SVG -- */
const limb = (pts,w,col,cap='round') =>
  `<path d="M${pts.map(p=>p.join(' ')).join(' L')}" stroke="${col}" stroke-width="${w}"
    stroke-linecap="${cap}" stroke-linejoin="round" fill="none"/>`;

const poly = (d,fill,stroke='#0b0c10',sw=3) =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;

/* ------------------------------------------------------------- ПРИЧЁСКИ -- */
function hairBack(s,a){
  const L=a.hair, D=U.shade(a.hair,-0.22);
  switch(s){
    case 'long': return poly(`M96 96 C86 60 104 52 120 52 C136 52 154 60 144 96
      L152 230 C146 246 138 250 120 250 C102 250 94 246 88 230 Z`,L, D,3);
    case 'pony': return `<path d="M138 78 C168 92 172 130 158 168" stroke="${D}" stroke-width="16"
      stroke-linecap="round" fill="none"/>` + poly(`M96 92 C90 62 106 54 120 54
      C136 54 150 62 146 94 L146 108 L94 108 Z`,L,'#0b0c10',3);
    case 'bun': return `<circle cx="120" cy="46" r="16" fill="${L}" stroke="#0b0c10" stroke-width="3"/>`
      + poly(`M98 94 C92 66 106 56 120 56 C134 56 148 66 142 94 L142 104 L98 104 Z`,L,'#0b0c10',3);
    case 'messy': return poly(`M94 100 C84 66 102 50 120 50 C140 50 158 66 146 100
      L154 128 L138 118 L146 148 L126 132 L118 152 L108 134 L96 146 L100 120 L88 128 Z`,L,'#0b0c10',3);
    default: return poly(`M96 94 C92 62 106 54 120 54 C136 54 150 62 146 96 L146 112 L94 112 Z`,L,'#0b0c10',3);
  }
}
function hairFront(s,a){
  const L=a.hair, H=a.hair2;
  switch(s){
    case 'spiky': return `<path d="M96 84 L86 60 L104 72 L102 50 L116 68 L122 46 L130 68
      L146 52 L142 74 L156 66 L146 88 Z" fill="${L}" stroke="#0b0c10" stroke-width="3" stroke-linejoin="round"/>`;
    case 'long': return poly(`M94 88 C92 62 106 54 120 54 C134 54 148 62 146 88
      L138 80 L132 92 L124 78 L116 94 L108 78 L100 92 Z`,L,'#0b0c10',3)
      + `<path d="M92 88 C88 120 90 150 96 168" stroke="${H}" stroke-width="7" stroke-linecap="round" fill="none"/>
         <path d="M148 88 C152 120 150 150 144 168" stroke="${H}" stroke-width="7" stroke-linecap="round" fill="none"/>`;
    case 'bob': return poly(`M94 90 C90 60 106 52 120 52 C136 52 150 60 146 90
      L146 118 L136 108 L134 120 L106 120 L104 108 L94 118 Z`,L,'#0b0c10',3);
    case 'pony': return poly(`M96 88 C92 62 106 54 120 54 C134 54 148 62 144 88
      L136 78 L128 90 L120 76 L112 90 L104 78 Z`,L,'#0b0c10',3);
    case 'messy': return poly(`M94 88 C90 58 108 50 122 50 C140 50 152 62 146 88
      L138 76 L130 92 L118 74 L110 92 L102 78 Z`,L,'#0b0c10',3)
      + `<path d="M104 58 C118 50 138 54 146 66" stroke="${H}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case 'bun': return poly(`M96 88 C92 62 106 54 120 54 C134 54 148 62 144 88
      L134 80 L126 90 L118 78 L108 90 Z`,L,'#0b0c10',3);
    default: return '';
  }
}

/* -------------------------------------------------------------- ОРУЖИЕ --- */
function weapon(kind,a){
  const A=a.accent, S=a.suit2, M='#8c96a8';
  switch(kind){
    case 'katana': return `
      ${poly(`M0 0 L14 -10 L18 4 L4 12 Z`,S)}
      <path d="M10 -4 L108 -96" stroke="${M}" stroke-width="9" stroke-linecap="round"/>
      <path d="M10 -4 L108 -96" stroke="${A}" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>
      <path d="M104 -100 L112 -92" stroke="${A}" stroke-width="6" stroke-linecap="round"/>`;
    case 'gauntlets': return `
      ${poly(`M-6 -14 L22 -16 L26 12 L-6 14 Z`,S)}
      <circle cx="10" cy="0" r="10" fill="none" stroke="${A}" stroke-width="3"/>
      <circle cx="10" cy="0" r="4" fill="${A}" opacity=".8"/>`;
    case 'flamer': return `
      ${poly(`M-8 -8 L26 -12 L30 8 L-8 10 Z`,S)}
      <rect x="26" y="-7" width="46" height="12" rx="3" fill="${M}" stroke="#0b0c10" stroke-width="3"/>
      <circle cx="74" cy="-1" r="7" fill="${A}" opacity=".9"/>
      <rect x="4" y="8" width="14" height="18" rx="3" fill="${S}" stroke="#0b0c10" stroke-width="2"/>
      <path d="M30 -18 L46 -18" stroke="${A}" stroke-width="3"/>`;
    case 'drone': return `
      <ellipse cx="0" cy="0" rx="16" ry="12" fill="${S}" stroke="#0b0c10" stroke-width="3"/>
      <circle cx="0" cy="0" r="6" fill="${A}"/>
      <path d="M-16 0 L-30 -8 M16 0 L30 -8" stroke="${M}" stroke-width="3"/>
      <circle cx="-32" cy="-9" r="4" fill="${M}"/><circle cx="32" cy="-9" r="4" fill="${M}"/>`;
    case 'shield': return `
      ${poly(`M-10 -34 L18 -34 L22 6 L4 22 L-12 6 Z`,S,'#0b0c10',3)}
      <path d="M4 -30 L8 4 L2 14" stroke="${A}" stroke-width="3" fill="none"/>
      <circle cx="4" cy="-8" r="6" fill="none" stroke="${A}" stroke-width="2.5"/>`;
    case 'daggers': return `
      <path d="M0 0 L-8 -30 L6 -34 L10 -6 Z" fill="${M}" stroke="#0b0c10" stroke-width="2.5"/>
      <path d="M2 -8 L0 -26" stroke="${A}" stroke-width="2.4"/>
      <rect x="-4" y="-4" width="16" height="6" rx="2" fill="${S}" stroke="#0b0c10" stroke-width="2"/>`;
    case 'amp': return `
      ${poly(`M-14 -22 L16 -22 L22 22 L-20 22 Z`,S,'#0b0c10',3)}
      <circle cx="0" cy="-4" r="11" fill="#0a0b0f" stroke="${A}" stroke-width="3"/>
      <circle cx="0" cy="-4" r="4" fill="${A}"/>
      <rect x="-6" y="12" width="12" height="4" fill="${A}" opacity=".8"/>`;
    case 'scythe': return `
      <path d="M6 6 L10 -78" stroke="${M}" stroke-width="7" stroke-linecap="round"/>
      <path d="M10 -78 C46 -96 84 -84 92 -52 C74 -70 40 -76 10 -70 Z" fill="${M}" stroke="#0b0c10" stroke-width="3"/>
      <path d="M14 -74 C44 -88 74 -80 86 -56" stroke="${A}" stroke-width="3.4" fill="none"/>`;
    case 'hammer': return `
      <path d="M2 8 L8 -66" stroke="${M}" stroke-width="8" stroke-linecap="round"/>
      ${poly(`M-24 -84 L34 -92 L38 -64 L-20 -58 Z`,S,'#0b0c10',3)}
      <path d="M-18 -78 L32 -85" stroke="${A}" stroke-width="3"/>`;
    default: return '';
  }
}

/* ------------------------------------------------------------ ФИГУРА ----- */
function figure(c,o={}){
  const a=c.art, el=DATA.EL[c.el];
  const s=a.suit, s2=a.suit2, ac=a.accent, sk=a.skin;
  const dark=U.shade(a.suit,-0.4);
  const w=o.w||'100%', h=o.h||'100%';
  const skinS=U.shade(sk,-0.14);
  const stance = o.pose||'idle';

  return `<svg viewBox="0 0 240 430" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMax meet">
  <defs>
    <linearGradient id="glo-${c.id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${el.c}" stop-opacity=".55"/>
      <stop offset="1" stop-color="${el.c}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="rg-${c.id}" cx="50%" cy="45%" r="55%">
      <stop offset="0" stop-color="${el.c}" stop-opacity=".38"/>
      <stop offset="1" stop-color="${el.c}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <ellipse cx="120" cy="300" rx="112" ry="140" fill="url(#rg-${c.id})"/>
  <ellipse cx="120" cy="404" rx="66" ry="13" fill="#000" opacity=".5"/>

  ${hairBack(a.hairStyle,a)}

  <!-- ноги -->
  ${limb([[104,268],[100,336],[98,396]],17,dark)}
  ${limb([[136,268],[140,336],[142,396]],17,dark)}
  <ellipse cx="96" cy="400" rx="15" ry="8" fill="${s2}" stroke="#0b0c10" stroke-width="3"/>
  <ellipse cx="144" cy="400" rx="15" ry="8" fill="${s2}" stroke="#0b0c10" stroke-width="3"/>

  <!-- бёдра -->
  ${poly(`M92 250 L148 250 L154 288 L86 288 Z`,s)}

  <!-- торс -->
  ${poly(`M84 142 L156 142 L162 208 L150 262 L90 262 L78 208 Z`,s)}
  <!-- нагрудная вставка -->
  ${poly(`M104 146 L136 146 L140 200 L120 232 L100 200 Z`,s2,'none',0)}
  <!-- акцентные полосы -->
  <path d="M92 168 L118 176" stroke="${ac}" stroke-width="5" stroke-linecap="round" opacity=".95"/>
  <path d="M148 168 L122 176" stroke="${ac}" stroke-width="5" stroke-linecap="round" opacity=".95"/>
  <path d="M120 150 L120 226" stroke="${ac}" stroke-width="2" opacity=".45"/>
  <!-- ремень -->
  ${poly(`M86 252 L154 252 L152 266 L88 266 Z`,dark,'#0b0c10',2)}
  <rect x="112" y="252" width="18" height="14" rx="2" fill="${ac}" stroke="#0b0c10" stroke-width="2"/>

  <!-- руки -->
  ${limb([[88,152],[70,206],[74,258]],14,sk)}
  ${limb([[152,152],[172,206],[166,258]],14,sk)}
  <!-- перчатки -->
  <ellipse cx="73" cy="262" rx="10" ry="9" fill="${s2}" stroke="#0b0c10" stroke-width="3"/>
  <ellipse cx="167" cy="262" rx="10" ry="9" fill="${s2}" stroke="#0b0c10" stroke-width="3"/>
  <!-- рукава -->
  ${poly(`M84 142 L100 146 L96 196 L74 190 L72 162 Z`,s2)}
  ${poly(`M156 142 L140 146 L144 196 L170 190 L172 162 Z`,s2)}

  <!-- оружие в правой руке -->
  <g transform="translate(167,262) rotate(${stance==='battle'?-14:4})">${weapon(a.weapon,a)}</g>

  <!-- шея + голова -->
  <rect x="110" y="118" width="20" height="20" rx="6" fill="${skinS}" stroke="#0b0c10" stroke-width="2"/>
  <ellipse cx="120" cy="96" rx="26" ry="29" fill="${sk}" stroke="#0b0c10" stroke-width="3"/>
  <!-- тень под чёлкой -->
  <path d="M96 84 Q120 96 144 84 L144 76 Q120 86 96 76 Z" fill="${skinS}" opacity=".7"/>

  ${hairFront(a.hairStyle,a)}

  <!-- лицо -->
  <ellipse cx="110" cy="100" rx="3.4" ry="4.2" fill="#101318"/>
  <ellipse cx="131" cy="100" rx="3.4" ry="4.2" fill="#101318"/>
  <circle cx="111" cy="98.6" r="1.5" fill="${a.eye}"/>
  <circle cx="132" cy="98.6" r="1.5" fill="${a.eye}"/>
  <path d="M105 92 L114 91" stroke="#101318" stroke-width="2" stroke-linecap="round"/>
  <path d="M127 91 L136 92" stroke="#101318" stroke-width="2" stroke-linecap="round"/>
  <path d="M116 112 Q120 115 125 112" stroke="#101318" stroke-width="2" fill="none" stroke-linecap="round"/>
  <ellipse cx="103" cy="108" rx="5" ry="3" fill="${el.c}" opacity=".18"/>
  <ellipse cx="139" cy="108" rx="5" ry="3" fill="${el.c}" opacity=".18"/>

  <!-- элементный акцент у ног -->
  <path d="M84 396 L156 396" stroke="${ac}" stroke-width="3" opacity=".35"/>
  <circle cx="120" cy="392" r="3" fill="${ac}" opacity=".7"/>
</svg>`;
}

/* ----------------------------------------------------------- ПОРТРЕТ ----- */
function portrait(c){
  const a=c.art;
  return `<svg viewBox="30 30 180 180" xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid slice">
    <rect x="30" y="30" width="180" height="180" fill="${U.shade(a.suit2,-0.35)}"/>
    ${hairBack(a.hairStyle,a)}
    ${poly(`M84 150 L156 150 L166 210 L74 210 Z`,a.suit)}
    ${poly(`M104 152 L136 152 L138 178 L120 196 L102 178 Z`,a.suit2,'none',0)}
    <rect x="110" y="118" width="20" height="26" rx="6" fill="${U.shade(a.skin,-0.14)}" stroke="#0b0c10" stroke-width="2"/>
    <ellipse cx="120" cy="96" rx="26" ry="29" fill="${a.skin}" stroke="#0b0c10" stroke-width="3"/>
    <path d="M96 84 Q120 96 144 84 L144 76 Q120 86 96 76 Z" fill="${U.shade(a.skin,-0.14)}" opacity=".7"/>
    ${hairFront(a.hairStyle,a)}
    <ellipse cx="110" cy="100" rx="3.4" ry="4.2" fill="#101318"/>
    <ellipse cx="131" cy="100" rx="3.4" ry="4.2" fill="#101318"/>
    <circle cx="111" cy="98.6" r="1.5" fill="${a.eye}"/>
    <circle cx="132" cy="98.6" r="1.5" fill="${a.eye}"/>
    <path d="M116 112 Q120 115 125 112" stroke="#101318" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`;
}

/* ================================================== ОТРИСОВКА НА КАНВАСЕ == */
function shadow(ctx,x,y,rx){ 
  ctx.fillStyle='rgba(0,0,0,.42)';
  ctx.beginPath(); ctx.ellipse(x,y,rx,rx*0.36,0,0,6.2832); ctx.fill();
}

/* --- агент в бою/мире --- */
function drawAgent(ctx,e,t){
  const c=e.char, a=c.art, el=DATA.EL[c.el];
  const bob=Math.sin(t*10+e.animPhase)*(e.moving?1.8:0.8);
  const x=e.x, y=e.y;
  const flip=e.face<0?-1:1;

  shadow(ctx,x,y+2,20);

  // аура элемента
  if(e.auraGlow>0){
    ctx.globalAlpha=U.clamp(e.auraGlow,0,1)*0.5;
    const g=ctx.createRadialGradient(x,y-16,2,x,y-16,34);
    g.addColorStop(0,el.c); g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y-16,34,0,6.2832); ctx.fill();
    ctx.globalAlpha=1;
  }

  ctx.save();
  ctx.translate(x,y-3+bob);
  ctx.scale(flip*1.28,1.28);

  if(e.hurtFlash>0){
    ctx.globalAlpha=0.9;
  }

  // ноги
  const legSw=e.moving?Math.sin(t*12)*4:0;
  ctx.strokeStyle=U.shade(a.suit,-0.3); ctx.lineWidth=5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-4,-16); ctx.lineTo(-5+legSw,-1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4,-16); ctx.lineTo(5-legSw,-1); ctx.stroke();

  // корпус
  ctx.fillStyle=a.suit;
  ctx.beginPath();
  ctx.moveTo(-8,-36); ctx.lineTo(8,-36); ctx.lineTo(10,-18); ctx.lineTo(-10,-18); ctx.closePath(); ctx.fill();
  // акцентная полоса
  ctx.fillStyle=a.accent;
  ctx.fillRect(-8,-31,16,2.4);
  // голова
  ctx.fillStyle=a.skin;
  ctx.beginPath(); ctx.arc(0,-43,8,0,6.2832); ctx.fill();
  // волосы
  ctx.fillStyle=a.hair;
  ctx.beginPath(); ctx.arc(0,-44,8.2,Math.PI*0.98,Math.PI*2.12); ctx.fill();
  ctx.fillRect(-8.2,-46,5,7);
  // глаз
  ctx.fillStyle=a.eye;
  ctx.fillRect(2.5,-44.5,2.6,2.2);

  // оружие
  drawWeaponSmall(ctx,c,e,t);

  // вспышка урона
  if(e.hurtFlash>0){
    ctx.globalAlpha=e.hurtFlash*0.75;
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.ellipse(0,-26,12,20,0,0,6.2832); ctx.fill();
    ctx.globalAlpha=1;
  }
  ctx.restore();

  // полоса ауры над головой
  if(e.aura){
    ctx.fillStyle=DATA.EL[e.aura.el].c;
    ctx.globalAlpha=0.9;
    ctx.beginPath(); ctx.arc(x,y-56,3,0,6.2832); ctx.fill();
    ctx.globalAlpha=1;
  }
}

function drawWeaponSmall(ctx,c,e,t){
  const a=c.art, ac=a.accent, sw=Math.sin(t*9)*0.2;
  ctx.save();
  ctx.translate(9,-24);
  ctx.rotate(-0.35+sw*(e.attacking?3:1));
  ctx.lineCap='round';
  switch(a.weapon){
    case 'katana':
      ctx.strokeStyle='#c9d3e2'; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(20,-14); ctx.stroke();
      ctx.strokeStyle=ac; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(20,-14); ctx.stroke();
      break;
    case 'scythe':
      ctx.strokeStyle='#9aa5b6'; ctx.lineWidth=2.2;
      ctx.beginPath(); ctx.moveTo(0,4); ctx.lineTo(4,-20); ctx.stroke();
      ctx.strokeStyle=ac; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(4,-20,10,-0.4,1.5); ctx.stroke();
      break;
    case 'hammer':
      ctx.strokeStyle='#9aa5b6'; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.moveTo(0,2); ctx.lineTo(6,-18); ctx.stroke();
      ctx.fillStyle=a.suit2; ctx.fillRect(0,-22,13,8);
      ctx.strokeStyle=ac; ctx.lineWidth=1.6; ctx.strokeRect(0,-22,13,8);
      break;
    case 'shield':
      ctx.fillStyle=a.suit2; ctx.strokeStyle=ac; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.moveTo(2,-10); ctx.lineTo(14,-8); ctx.lineTo(15,4); ctx.lineTo(8,10);
      ctx.lineTo(1,3); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case 'daggers':
      ctx.strokeStyle='#d6dfee'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(10,-10); ctx.moveTo(0,2); ctx.lineTo(9,8); ctx.stroke();
      break;
    case 'flamer':
      ctx.fillStyle='#7d879a'; ctx.fillRect(-2,-3,18,6);
      ctx.fillStyle=ac; ctx.beginPath(); ctx.arc(17,0,2.6,0,6.2832); ctx.fill();
      break;
    case 'gauntlets':
      ctx.fillStyle=a.suit2; ctx.fillRect(-2,-4,9,9);
      ctx.strokeStyle=ac; ctx.lineWidth=1.4; ctx.strokeRect(-2,-4,9,9);
      break;
    case 'amp':
      ctx.rotate(0.4);
      ctx.fillStyle=a.suit2; ctx.fillRect(-3,-8,10,15);
      ctx.strokeStyle=ac; ctx.lineWidth=1.2; ctx.strokeRect(-3,-8,10,15);
      break;
    case 'drone':
      ctx.fillStyle=a.suit2; ctx.beginPath(); ctx.arc(6,-6,5,0,6.2832); ctx.fill();
      ctx.strokeStyle=ac; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(6,-6,6.5,0,6.2832); ctx.stroke();
      break;
  }
  ctx.restore();
}

/* --- враги --- */
function drawEnemy(ctx,e,t){
  const d=e.def, el=DATA.EL[d.el];
  const x=e.x, y=e.y;
  const s=e.r/16;
  const bob=Math.sin(t*4.5+e.seed)*1.8;
  shadow(ctx,x,y+1,e.r*1.05);

  ctx.save();
  ctx.translate(x,y-2+bob);
  ctx.scale(s*e.face, s);

  const bodyCol = e.hurtFlash>0 ? '#ffffff' : el.c;
  const darkCol = U.shade(el.c,-0.55);

  if(e.stunT>0){
    ctx.globalAlpha=0.85;
  }

  const ty=e.type;
  if(ty==='scrap'||ty==='junk'){
    // коробка на ножках
    ctx.fillStyle=darkCol;
    ctx.fillRect(-4,-14,3.5,13); ctx.fillRect(3,-14,3.5,13);
    ctx.fillStyle=bodyCol;
    ctx.beginPath(); ctx.moveTo(-13,-30); ctx.lineTo(13,-30); ctx.lineTo(15,-14); ctx.lineTo(-15,-14);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#0b0c10'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#0b0c10'; ctx.fillRect(-8,-26,16,5);
    ctx.fillStyle=e.hurtFlash>0?'#fff':'#fff';
    ctx.fillRect(-6,-25,4,3); ctx.fillRect(2,-25,4,3);
    if(ty==='junk'){ ctx.strokeStyle=el.c; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(0,-34,5,0,6.2832); ctx.stroke(); }
  } else if(ty==='spark'||ty==='wisp'||ty==='screech'){
    // парящая сфера
    const r=ty==='screech'?20:12;
    ctx.shadowColor=el.c; ctx.shadowBlur=16;
    ctx.fillStyle=bodyCol;
    ctx.beginPath(); ctx.arc(0,-22,r,0,6.2832); ctx.fill();
    ctx.shadowBlur=0;
    ctx.strokeStyle='#0b0c10'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#0b0c10';
    ctx.beginPath(); ctx.arc(-r*0.35,-24,r*0.18,0,6.2832); ctx.arc(r*0.35,-24,r*0.18,0,6.2832); ctx.fill();
    ctx.strokeStyle=el.c; ctx.lineWidth=1.6;
    for(let i=0;i<3;i++){
      const a=t*1.6+i*2.09;
      ctx.beginPath(); ctx.arc(0,-22,r+5+Math.sin(t*3+i)*2,a,a+0.7); ctx.stroke();
    }
  } else if(ty==='frost'){
    // кристалл
    ctx.fillStyle=bodyCol;
    ctx.beginPath(); ctx.moveTo(0,-38); ctx.lineTo(11,-22); ctx.lineTo(6,-8);
    ctx.lineTo(-6,-8); ctx.lineTo(-11,-22); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#0b0c10'; ctx.lineWidth=2; ctx.stroke();
    ctx.strokeStyle='#fff'; ctx.globalAlpha=.7; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,-34); ctx.lineTo(0,-12); ctx.stroke();
    ctx.globalAlpha=1;
  } else if(ty==='ember'||ty==='stoker'){
    // огненный комок с руками
    ctx.shadowColor=el.c; ctx.shadowBlur=18;
    ctx.fillStyle=bodyCol;
    ctx.beginPath(); ctx.ellipse(0,-20,13,15,0,0,6.2832); ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle='#ffd166'; ctx.globalAlpha=.6;
    ctx.beginPath(); ctx.ellipse(0,-18,6,8,0,0,6.2832); ctx.fill();
    ctx.globalAlpha=1;
    ctx.strokeStyle=darkCol; ctx.lineWidth=3; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-12,-22); ctx.lineTo(-20,-14); ctx.moveTo(12,-22); ctx.lineTo(20,-14); ctx.stroke();
  } else if(ty==='butcher'||ty==='turbine'){
    // крупный механоид
    ctx.fillStyle=darkCol;
    ctx.fillRect(-7,-20,5,19); ctx.fillRect(2,-20,5,19);
    ctx.fillStyle=bodyCol;
    ctx.beginPath(); ctx.moveTo(-17,-42); ctx.lineTo(17,-42); ctx.lineTo(20,-18); ctx.lineTo(-20,-18);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#0b0c10'; ctx.lineWidth=2.4; ctx.stroke();
    ctx.fillStyle='#0b0c10'; ctx.fillRect(-11,-38,22,6);
    ctx.fillStyle='#ff4d1a'; ctx.fillRect(-8,-36.5,5,3); ctx.fillRect(3,-36.5,5,3);
    ctx.strokeStyle=el.c; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.moveTo(18,-40); ctx.lineTo(26,-30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-18,-40); ctx.lineTo(-26,-30); ctx.stroke();
  } else {
    // босс / прочее
    ctx.fillStyle=darkCol;
    ctx.fillRect(-10,-24,7,23); ctx.fillRect(3,-24,7,23);
    ctx.fillStyle=bodyCol;
    ctx.beginPath(); ctx.ellipse(0,-34,22,20,0,0,6.2832); ctx.fill();
    ctx.strokeStyle='#0b0c10'; ctx.lineWidth=3; ctx.stroke();
  }

  if(e.hurtFlash>0){
    ctx.globalAlpha=e.hurtFlash*0.6;
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.ellipse(0,-24,15,20,0,0,6.2832); ctx.fill();
    ctx.globalAlpha=1;
  }
  ctx.restore();

  // заморозка
  if(e.frozen>0){
    ctx.globalAlpha=0.55;
    ctx.fillStyle='#8ce9ff';
    ctx.beginPath(); ctx.moveTo(x-14,y-46); ctx.lineTo(x+14,y-46); ctx.lineTo(x+12,y-2);
    ctx.lineTo(x-12,y-2); ctx.closePath(); ctx.fill();
    ctx.globalAlpha=1;
  }
  // оглушение
  if(e.stunT>0){
    ctx.fillStyle='#ffe600';
    for(let i=0;i<3;i++){
      const a=t*3+i*2.09;
      ctx.beginPath(); ctx.arc(x+Math.cos(a)*11, y-50+Math.sin(a)*4, 2.4,0,6.2832); ctx.fill();
    }
  }
  // аура
  if(e.aura){
    ctx.fillStyle=DATA.EL[e.aura.el].c;
    ctx.globalAlpha=0.85;
    ctx.beginPath(); ctx.arc(x+e.r*0.9, y-52, 4, 0, 6.2832); ctx.fill();
    ctx.globalAlpha=1;
  }
}

/* --- пиктограмма элемента --- */
function elIcon(elId,size=16){
  const el=DATA.EL[elId];
  return `<span style="display:inline-grid;place-items:center;width:${size}px;height:${size}px;
    border-radius:50%;background:${U.rgba(el.c,.18)};color:${el.c};font-size:${size*0.7}px;
    border:1px solid ${U.rgba(el.c,.5)}">${el.g}</span>`;
}

return { figure, portrait, drawAgent, drawEnemy, elIcon, shadow };
})();