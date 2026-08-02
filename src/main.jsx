import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const SAVE_KEY = 'forest-camp-v1';
const RES = {
  wood: ['マキ', '🪵'],
  meat: ['肉', '🥩'],
  stone: ['石', '🪨'],
};

const baseFacilities = {
  furnace: { name: '炉', icon: '🔥', x: 50, y: 48, desc: 'キャンプの命。温度範囲と解放条件に影響。', cost: l => ({ wood: 8 + l * 10, stone: Math.max(0, l - 2) * 4 }), unlock: () => true },
  storage: { name: '倉庫', icon: '📦', x: 28, y: 56, desc: '資源の保管上限を増やす。', cost: l => ({ wood: 12 + l * 8, stone: l * 2 }), unlock: s => s.facilities.furnace.level >= 2 },
  lodging: { name: '宿舎', icon: '⛺', x: 70, y: 58, desc: '生存者と作業員上限を増やす。', cost: l => ({ wood: 24 + l * 12, meat: 8 + l * 5 }), unlock: s => s.facilities.furnace.level >= 2 },
  woodcamp: { name: '伐採所', icon: '🪓', x: 16, y: 34, desc: '作業員がマキを自動で集める。', cost: l => ({ wood: 26 + l * 12, meat: l * 3 }), unlock: s => s.facilities.lodging.level >= 1 },
  hunting: { name: '狩場', icon: '🏹', x: 84, y: 34, desc: '作業員が肉を自動で集める。', cost: l => ({ wood: 34 + l * 12, meat: 10 + l * 6 }), unlock: s => s.facilities.lodging.level >= 2 },
  quarry: { name: '石切場', icon: '⛏️', x: 50, y: 20, desc: '作業員が石を自動で集める。', cost: l => ({ wood: 50 + l * 14, meat: 18 + l * 6 }), unlock: s => s.facilities.furnace.level >= 4 },
  wall: { name: '防壁', icon: '🛡️', x: 50, y: 78, desc: '吹雪や獣の被害を抑える。', cost: l => ({ wood: 70 + l * 24, stone: 20 + l * 10 }), unlock: s => s.facilities.quarry.level >= 1 },
};

const initial = () => ({
  res: { wood: 0, meat: 0, stone: 0 },
  heat: 48,
  survivors: 1,
  message: 'マキと肉を集めて、中央の炉へ運ぼう。',
  last: Date.now(),
  player: { x: 50, y: 72, bag: { wood: 0, meat: 0, stone: 0 } },
  facilities: Object.fromEntries(Object.keys(baseFacilities).map(k => [k, { level: k === 'furnace' ? 1 : 0, workers: 0 }])),
  nodes: spawnNodes(),
});

function spawnNodes() {
  const arr = [];
  for (let i = 0; i < 18; i++) arr.push(makeNode(i));
  return arr;
}
function makeNode(id) {
  const r = Math.random();
  const type = r < .55 ? 'wood' : r < .88 ? 'meat' : 'stone';
  return { id, type, x: 8 + Math.random() * 84, y: 12 + Math.random() * 76, amount: type === 'stone' ? 1 : 2 };
}
function cap(state, type) {
  const storage = state.facilities.storage.level;
  const furnace = state.facilities.furnace.level;
  const base = type === 'stone' ? 40 : 70;
  return base + storage * 65 + furnace * 10;
}
function canPay(state, cost) { return Object.entries(cost).every(([k, v]) => state.res[k] >= v); }
function pay(state, cost) { Object.entries(cost).forEach(([k, v]) => state.res[k] -= v); }
function totalWorkers(state) { return Math.max(0, state.survivors - 1); }
function usedWorkers(state) { return Object.values(state.facilities).reduce((a, f) => a + f.workers, 0); }
function workerCapFor(key, state) {
  if (!['woodcamp', 'hunting', 'quarry'].includes(key)) return 0;
  return Math.max(0, state.facilities[key].level);
}
function unlocked(key, state) { return baseFacilities[key].unlock(state); }

function App() {
  const [state, setState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (saved) {
        const elapsed = Math.min(7200, Math.floor((Date.now() - saved.last) / 1000));
        const next = { ...initial(), ...saved, last: Date.now() };
        applyProduction(next, elapsed, true);
        next.message = elapsed > 60 ? `留守中に${Math.floor(elapsed/60)}分ぶんの資源を回収した。` : 'キャンプに戻った。';
        return next;
      }
    } catch {}
    return initial();
  });
  const keys = useRef({});

  useEffect(() => {
    const down = e => { keys.current[e.key.toLowerCase()] = true; };
    const up = e => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setState(prev => tick(prev, keys.current)), 1000 / 15);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, last: Date.now() })), 1500);
    return () => clearInterval(t);
  }, [state]);

  const free = totalWorkers(state) - usedWorkers(state);
  const quest = useMemo(() => currentQuest(state), [state]);

  const upgrade = key => setState(prev => {
    const s = structuredClone(prev);
    if (!unlocked(key, s)) return s;
    const f = s.facilities[key];
    const cost = baseFacilities[key].cost(f.level);
    if (!canPay(s, cost)) { s.message = '資源が足りない。'; return s; }
    pay(s, cost); f.level += 1;
    if (key === 'lodging') s.survivors += 1;
    if (key === 'furnace') s.heat = Math.min(100, s.heat + 18);
    s.message = `${baseFacilities[key].name}をレベル${f.level}にした。`;
    return s;
  });
  const assign = (key, delta) => setState(prev => {
    const s = structuredClone(prev);
    const f = s.facilities[key];
    const max = workerCapFor(key, s);
    if (delta > 0 && totalWorkers(s) - usedWorkers(s) <= 0) { s.message = '空き作業員がいない。宿舎を強化しよう。'; return s; }
    f.workers = Math.max(0, Math.min(max, f.workers + delta));
    s.message = `${baseFacilities[key].name}の作業員を${f.workers}人にした。`;
    return s;
  });

  const reset = () => { if (confirm('最初からやり直しますか？')) { localStorage.removeItem(SAVE_KEY); setState(initial()); } };

  return <div className="app">
    <header>
      <div><p className="eyebrow">snow idle camp builder</p><h1>FOREST CAMP</h1></div>
      <button onClick={reset}>リセット</button>
    </header>
    <section className="stats">
      {Object.keys(RES).map(k => <div className="stat" key={k}><b>{RES[k][1]} {RES[k][0]}</b><span>{Math.floor(state.res[k])}/{cap(state,k)}</span></div>)}
      <div className="stat heat"><b>🔥 温度</b><span>{Math.floor(state.heat)}%</span></div>
      <div className="stat"><b>👥 生存者</b><span>{state.survivors}人 / 空き{free}人</span></div>
    </section>
    <main>
      <section className="world">
        <div className="snow"></div>
        <div className="quest"><b>次の目標</b><span>{quest}</span></div>
        {state.nodes.map(n => <div key={n.id} className={'node '+n.type} style={{left:n.x+'%', top:n.y+'%'}}>{RES[n.type][1]}</div>)}
        {Object.entries(baseFacilities).map(([key, def]) => unlocked(key, state) ? <button key={key} onClick={() => upgrade(key)} className={'facility '+(state.facilities[key].level?'':'ghost')} style={{left:def.x+'%', top:def.y+'%'}}>
          <span>{def.icon}</span><b>{def.name}</b><em>Lv.{state.facilities[key].level}</em>
        </button> : null)}
        <div className="player" style={{left:state.player.x+'%', top:state.player.y+'%'}}>🧍</div>
        <div className="bag">袋：🪵{state.player.bag.wood} 🥩{state.player.bag.meat} 🪨{state.player.bag.stone}</div>
      </section>
      <aside className="panel">
        <h2>設備</h2>
        {Object.entries(baseFacilities).map(([key, def]) => unlocked(key, state) ? <div className="card" key={key}>
          <div className="cardTop"><strong>{def.icon} {def.name} Lv.{state.facilities[key].level}</strong><button onClick={() => upgrade(key)}>強化</button></div>
          <p>{def.desc}</p>
          <small>次：{formatCost(def.cost(state.facilities[key].level))}</small>
          {workerCapFor(key, state) > 0 && <div className="workers"><button onClick={() => assign(key,-1)}>-</button><span>作業員 {state.facilities[key].workers}/{workerCapFor(key,state)}</span><button onClick={() => assign(key,1)}>+</button></div>}
        </div> : null)}
      </aside>
    </main>
    <footer>{state.message}</footer>
    <Pad keys={keys} />
  </div>;
}

function tick(prev, keys) {
  const s = structuredClone(prev);
  const p = s.player;
  const speed = 1.05;
  if (keys.a || keys.arrowleft) p.x -= speed;
  if (keys.d || keys.arrowright) p.x += speed;
  if (keys.w || keys.arrowup) p.y -= speed;
  if (keys.s || keys.arrowdown) p.y += speed;
  p.x = Math.max(4, Math.min(96, p.x)); p.y = Math.max(8, Math.min(92, p.y));
  s.nodes.forEach((n, i) => {
    const d = Math.hypot(p.x - n.x, p.y - n.y);
    if (d < 5) { p.bag[n.type] += n.amount; s.nodes[i] = makeNode(n.id); s.message = `${RES[n.type][0]}を拾った。炉の近くで納品。`; }
  });
  if (Math.hypot(p.x - 50, p.y - 48) < 10) {
    Object.keys(p.bag).forEach(k => { const move = Math.min(p.bag[k], cap(s,k) - s.res[k]); s.res[k] += move; p.bag[k] -= move; });
    const burn = Math.min(s.res.wood, 1, Math.max(0, 100 - s.heat) / 8);
    if (burn > 0) { s.res.wood -= burn; s.heat += burn * 8; }
  }
  applyProduction(s, 1/15, false);
  s.heat -= (0.018 - Math.min(.012, s.facilities.wall.level * .003));
  if (s.heat < 5 && Math.random() < .01) { s.survivors = Math.max(1, s.survivors - 1); s.message = '寒さで生存者が離脱した。炉を温めよう。'; }
  s.heat = Math.max(0, Math.min(100, s.heat));
  return s;
}
function applyProduction(s, seconds, offline) {
  const rates = { woodcamp: ['wood', .09], hunting: ['meat', .055], quarry: ['stone', .03] };
  Object.entries(rates).forEach(([key, [res, base]]) => {
    const f = s.facilities[key];
    const gain = f.workers * f.level * base * seconds * (offline ? .55 : 1);
    s.res[res] = Math.min(cap(s,res), s.res[res] + gain);
  });
  const foodUse = Math.max(0, s.survivors - 2) * .002 * seconds;
  s.res.meat = Math.max(0, s.res.meat - foodUse);
}
function formatCost(cost) { return Object.entries(cost).filter(([,v])=>v>0).map(([k,v]) => `${RES[k][1]}${v}`).join(' ') || '無料'; }
function currentQuest(s) {
  if (s.facilities.furnace.level < 2) return 'マキを集めて炉をLv.2にする';
  if (s.facilities.storage.level < 1) return '倉庫を建てて資源上限を増やす';
  if (s.facilities.lodging.level < 1) return '宿舎を建てて生存者を増やす';
  if (s.facilities.woodcamp.level < 1) return '伐採所を作ってマキ集めを自動化';
  if (s.facilities.hunting.level < 1) return '狩場を作って肉集めを自動化';
  if (s.facilities.quarry.level < 1) return '炉Lv.4から石切場を解放する';
  return '設備を強化してキャンプを村に育てる';
}
function Pad({keys}) {
  const set = (k, v) => { keys.current[k] = v; };
  return <div className="pad">
    {['w','a','s','d'].map(k => <button key={k} onTouchStart={()=>set(k,true)} onTouchEnd={()=>set(k,false)} onMouseDown={()=>set(k,true)} onMouseUp={()=>set(k,false)}>{k==='w'?'↑':k==='a'?'←':k==='s'?'↓':'→'}</button>)}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
