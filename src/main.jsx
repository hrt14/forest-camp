import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const SAVE_KEY = 'forest-camp-arcade-idle-v1';
const RESOURCE = {
  wood: { name: '丸太', icon: '🪵', value: 4 },
  berry: { name: 'ベリー', icon: '🫐', value: 7 },
  fish: { name: '魚', icon: '🐟', value: 12 },
  stone: { name: '石', icon: '🪨', value: 16 },
};
const AREAS = [
  { id: 0, name: 'はじまりの森', cost: 0, icon: '🌲', resource: ['wood', 'berry'] },
  { id: 1, name: 'きらめく湖', cost: 450, icon: '🏞️', resource: ['wood', 'fish'] },
  { id: 2, name: '岩山のキャンプ', cost: 1500, icon: '⛰️', resource: ['wood', 'stone'] },
];
const FACILITIES = {
  fire: { name: '焚き火', icon: '🔥', x: 50, y: 48, base: 40, desc: '強化するとすべての資源の売値が上がる。' },
  tent: { name: 'テント', icon: '⛺', x: 67, y: 59, base: 90, desc: '強化するたび木こりが1人増える。' },
  lumber: { name: '伐採所', icon: '🪓', x: 22, y: 33, base: 180, desc: '木こりの自動収益を増やす。' },
  kitchen: { name: '山小屋キッチン', icon: '🍳', x: 80, y: 35, base: 320, desc: '資源を高く売れるようになる。' },
};
function spawnNodes(area = 0) {
  const types = AREAS[area].resource;
  return Array.from({ length: 24 }, (_, id) => ({ id, type: types[Math.floor(Math.random() * types.length)], x: 7 + Math.random() * 86, y: 13 + Math.random() * 75 }));
}
function initialState() {
  return { coins: 0, area: 0, unlockedAreas: 1, player: { x: 50, y: 78 }, bag: { wood: 0, berry: 0, fish: 0, stone: 0 }, nodes: spawnNodes(), facilities: { fire: 1, tent: 0, lumber: 0, kitchen: 0 }, upgrades: { speed: 0, capacity: 0, power: 0 }, workers: 0, lifetimeCoins: 0, message: '画面を押した方向へ移動。資源に近づくと自動で集めます。', lastSaved: Date.now() };
}
const bagCount = bag => Object.values(bag).reduce((a, b) => a + b, 0);
const capacity = s => 6 + s.upgrades.capacity * 4;
const sellMultiplier = s => 1 + s.facilities.fire * .15 + s.facilities.kitchen * .22;
const upgradeCost = (kind, level) => Math.floor(({ speed: 55, capacity: 70, power: 90 }[kind]) * Math.pow(1.7, level));
const facilityCost = (kind, level) => Math.floor(FACILITIES[kind].base * Math.pow(1.8, level));

function App() {
  const worldRef = useRef(null);
  const target = useRef({ x: 50, y: 78, active: false });
  const [state, setState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (saved) {
        const merged = { ...initialState(), ...saved, nodes: spawnNodes(saved.area || 0) };
        const seconds = Math.min(7200, Math.max(0, (Date.now() - (saved.lastSaved || Date.now())) / 1000));
        const idle = Math.floor(seconds * saved.workers * (1.1 + saved.facilities.lumber * .5));
        merged.coins += idle; merged.lifetimeCoins += idle;
        merged.message = idle > 0 ? `留守中に木こりが ${idle} コイン稼ぎました。` : 'キャンプに戻りました。';
        return merged;
      }
    } catch {}
    return initialState();
  });
  useEffect(() => { const t = setInterval(() => setState(p => tick(p, target.current)), 1000 / 30); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastSaved: Date.now() })), 1200); return () => clearInterval(t); }, [state]);
  const setTarget = e => { const r = worldRef.current.getBoundingClientRect(); target.current = { x: Math.max(4, Math.min(96, (e.clientX-r.left)/r.width*100)), y: Math.max(9, Math.min(92, (e.clientY-r.top)/r.height*100)), active: true }; };
  const buyUpgrade = kind => setState(prev => { const s=structuredClone(prev), cost=upgradeCost(kind,s.upgrades[kind]); if(s.coins<cost){s.message=`あと ${Math.ceil(cost-s.coins)} コイン必要です。`;return s;} s.coins-=cost;s.upgrades[kind]++;s.message=`${{speed:'移動速度',capacity:'バッグ',power:'採集力'}[kind]}を強化！`;return s; });
  const build = kind => setState(prev => { const s=structuredClone(prev), cost=facilityCost(kind,s.facilities[kind]); if(s.coins<cost){s.message=`設備建設にはあと ${Math.ceil(cost-s.coins)} コイン必要です。`;return s;} s.coins-=cost;s.facilities[kind]++;if(kind==='tent')s.workers++;s.message=`${FACILITIES[kind].name}が成長しました。`;return s; });
  const moveArea = index => setState(prev => { const s=structuredClone(prev); if(index>=s.unlockedAreas)return s;s.area=index;s.nodes=spawnNodes(index);s.player={x:50,y:78};target.current={x:50,y:78,active:false};s.message=`${AREAS[index].name}へ移動しました。`;return s; });
  const unlockNext = () => setState(prev => { const s=structuredClone(prev); if(s.unlockedAreas>=AREAS.length)return s;const next=AREAS[s.unlockedAreas];if(s.coins<next.cost){s.message=`新エリアまであと ${Math.ceil(next.cost-s.coins)} コイン。`;return s;}s.coins-=next.cost;s.unlockedAreas++;s.area=next.id;s.nodes=spawnNodes(next.id);s.player={x:50,y:78};s.message=`${next.name}を解放！ 新しい資源が見つかりました。`;return s; });
  const quest = useMemo(() => state.facilities.fire<2?'丸太を売って焚き火を強化':state.facilities.tent<1?'テントを建てて木こりを雇う':state.unlockedAreas<2?'450コインで湖を解放':state.facilities.lumber<1?'伐採所を建てて自動化':state.unlockedAreas<3?'岩山のキャンプを解放':'キャンプを好きなだけ大きくしよう',[state]);
  const reset=()=>{if(confirm('最初からやり直しますか？')){localStorage.removeItem(SAVE_KEY);setState(initialState());}};
  return <div className={`app area-${state.area}`}>
    <header><div><p className="eyebrow">ARCADE IDLE CAMP BUILDER</p><h1>FOREST CAMP</h1></div><button className="subButton" onClick={reset}>リセット</button></header>
    <section className="topbar"><div className="coin"><span>🪙</span><div><small>COINS</small><b>{Math.floor(state.coins)}</b></div></div><div className="goal"><small>NEXT GOAL</small><b>{quest}</b></div><div className="bagStat"><small>BAG</small><b>{bagCount(state.bag)} / {capacity(state)}</b></div></section>
    <main><section className="world" ref={worldRef} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);setTarget(e);}} onPointerMove={e=>{if(e.buttons||e.pointerType==='touch')setTarget(e);}}>
      <div className="groundPattern"/><div className="areaTitle"><span>{AREAS[state.area].icon}</span><div><small>AREA {state.area+1}</small><b>{AREAS[state.area].name}</b></div></div>
      {state.nodes.map(n=><div key={n.id} className={`node ${n.type}`} style={{left:`${n.x}%`,top:`${n.y}%`}}>{RESOURCE[n.type].icon}</div>)}
      {Object.entries(FACILITIES).map(([key,f])=><button key={key} className={`facility ${state.facilities[key]?'built':'ghost'}`} style={{left:`${f.x}%`,top:`${f.y}%`}} onPointerDown={e=>e.stopPropagation()} onClick={()=>build(key)}><span>{f.icon}</span><b>{f.name}</b><em>Lv.{state.facilities[key]}</em></button>)}
      <div className="sellZone"><span>💰</span><b>SELL</b><small>ここで自動販売</small></div><div className="player" style={{left:`${state.player.x}%`,top:`${state.player.y}%`}}>🧑‍🌾</div><div className="carry">{Object.entries(state.bag).filter(([,v])=>v>0).map(([k,v])=><span key={k}>{RESOURCE[k].icon}{v}</span>)}</div><div className="touchHint">押した方向へ歩く</div>
    </section><aside>
      <section className="panel upgrades"><h2>プレイヤー強化</h2>{[['speed','🏃','移動速度'],['capacity','🎒','バッグ容量'],['power','💪','採集力']].map(([key,icon,label])=><button key={key} onClick={()=>buyUpgrade(key)}><span>{icon}</span><div><b>{label} Lv.{state.upgrades[key]}</b><small>{upgradeCost(key,state.upgrades[key])} 🪙</small></div><em>強化</em></button>)}</section>
      <section className="panel facilitiesPanel"><h2>キャンプ設備</h2>{Object.entries(FACILITIES).map(([key,f])=><button key={key} onClick={()=>build(key)}><span>{f.icon}</span><div><b>{f.name} Lv.{state.facilities[key]}</b><small>{f.desc}</small></div><em>{facilityCost(key,state.facilities[key])} 🪙</em></button>)}<div className="workerLine"><span>👷 木こり</span><b>{state.workers}人</b><small>毎秒 {Math.floor(state.workers*(1.1+state.facilities.lumber*.5))} コイン</small></div></section>
      <section className="panel mapPanel"><h2>エリア</h2>{AREAS.slice(0,state.unlockedAreas).map(a=><button key={a.id} className={state.area===a.id?'active':''} onClick={()=>moveArea(a.id)}>{a.icon} {a.name}</button>)}{state.unlockedAreas<AREAS.length&&<button className="unlock" onClick={unlockNext}>🔓 {AREAS[state.unlockedAreas].name}<small>{AREAS[state.unlockedAreas].cost} 🪙</small></button>}</section>
    </aside></main><footer>{state.message}</footer>
  </div>;
}
function tick(prev,target){const s=structuredClone(prev),p=s.player;if(target.active){const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);if(d<.65)target.active=false;else{const step=.34+s.upgrades.speed*.055;p.x+=dx/d*step;p.y+=dy/d*step;}}if(bagCount(s.bag)<capacity(s)){const n=s.nodes.find(n=>Math.hypot(p.x-n.x,p.y-n.y)<5.4+s.upgrades.power*.25);if(n){const type=n.type,amount=Math.min(1+Math.floor(s.upgrades.power/3),capacity(s)-bagCount(s.bag));s.bag[type]+=amount;const types=AREAS[s.area].resource;n.type=types[Math.floor(Math.random()*types.length)];n.x=7+Math.random()*86;n.y=13+Math.random()*75;s.message=`${RESOURCE[type].name}を集めた。バッグが満ちたらSELLへ。`;}}if(Math.hypot(p.x-50,p.y-48)<11&&bagCount(s.bag)>0){let earned=0;Object.entries(s.bag).forEach(([k,v])=>{earned+=v*RESOURCE[k].value;s.bag[k]=0;});earned=Math.floor(earned*sellMultiplier(s));s.coins+=earned;s.lifetimeCoins+=earned;s.message=`資源を売って ${earned} コイン獲得！`;}const idle=s.workers*(1.1+s.facilities.lumber*.5)/30;s.coins+=idle;s.lifetimeCoins+=idle;return s;}
createRoot(document.getElementById('root')).render(<App/>);
