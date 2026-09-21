"use client";

import { useEffect, useMemo, useState } from "react";

type Cadence = "daily" | "weekly" | "monthly";
type Ring = {
  cadence: Cadence;
  label: string;
  tasks: { name: string; icon: string }[];
  index: number;
  done: boolean[];
  cycle: number;
  tint: "green" | "amber" | "red";
};

const starter: Ring[] = [
  { cadence: "daily", label: "Daily", tasks: [{ name: "Dishes", icon: "▧" }, { name: "Wipe counters", icon: "✦" }, { name: "Sweep kitchen", icon: "⌁" }, { name: "Make beds", icon: "▤" }, { name: "Tidy lounge", icon: "⌂" }, { name: "Empty bins", icon: "▱" }], index: 0, done: Array(6).fill(false), cycle: 12, tint: "green" },
  { cadence: "weekly", label: "Weekly", tasks: [{ name: "Vacuum", icon: "≋" }, { name: "Mop floors", icon: "♒" }, { name: "Clean bathroom", icon: "▦" }, { name: "Change sheets", icon: "▤" }, { name: "Dust surfaces", icon: "✧" }, { name: "Clean mirrors", icon: "▯" }, { name: "Laundry towels", icon: "≋" }], index: 2, done: [true, true, false, false, false, false, false], cycle: 5, tint: "amber" },
  { cadence: "monthly", label: "Monthly", tasks: [{ name: "Clean oven", icon: "▣" }, { name: "Wash windows", icon: "▯" }, { name: "Descale kettle", icon: "♨" }, { name: "Clean fridge", icon: "▤" }, { name: "Wipe skirting", icon: "⌁" }, { name: "Flip mattress", icon: "▰" }, { name: "Clean vents", icon: "▦" }, { name: "Wash curtains", icon: "≋" }], index: 4, done: [true, true, true, true, false, false, false, false], cycle: 2, tint: "red" },
];

const points = (r: number, angle: number) => {
  const rad = (angle * Math.PI) / 180;
  return [170 + r * Math.sin(rad), 170 - r * Math.cos(rad)];
};

export default function Home() {
  const [rings, setRings] = useState<Ring[]>(starter);
  const [open, setOpen] = useState<number | null>(null);
  const [last, setLast] = useState<{ ring: number; index: number; wrapped: boolean } | null>(null);
  const [rotating, setRotating] = useState<number | null>(null);
  const [install, setInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("cleaning-cycle-rings");
    if (saved) setRings(JSON.parse(saved));
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstall(event as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
    return () => window.removeEventListener("beforeinstallprompt", beforeInstall);
  }, []);
  useEffect(() => localStorage.setItem("cleaning-cycle-rings", JSON.stringify(rings)), [rings]);

  const complete = (ringIndex: number) => {
    if (rotating !== null) return;
    const ring = rings[ringIndex];
    const oldIndex = ring.index;
    const next = (oldIndex + 1) % ring.tasks.length;
    const wrapped = next === 0;
    setRotating(ringIndex);
    if (navigator.vibrate) navigator.vibrate(wrapped ? [20, 30, 55] : 25);
    setRings((current) => current.map((entry, i) => {
      if (i !== ringIndex) return entry;
      return { ...entry, index: next, cycle: wrapped ? entry.cycle + 1 : entry.cycle, done: wrapped ? Array(entry.tasks.length).fill(false) : entry.done.map((d, j) => j === oldIndex || d) };
    }));
    setLast({ ring: ringIndex, index: oldIndex, wrapped });
    window.setTimeout(() => setRotating(null), 520);
    window.setTimeout(() => setLast(null), 5000);
  };
  const undo = () => {
    if (!last) return;
    setRings((current) => current.map((entry, i) => i !== last.ring ? entry : { ...entry, index: last.index, cycle: last.wrapped ? entry.cycle - 1 : entry.cycle, done: entry.done.map((d, j) => j === last.index ? false : d) }));
    setLast(null);
    if (navigator.vibrate) navigator.vibrate(15);
  };
  const installApp = async () => {
    if (install) { await install.prompt(); setInstall(null); }
    else setShowInstall(true);
  };

  const ringTransforms = useMemo(() => rings.map((ring) => `rotate(${-ring.index * (360 / ring.tasks.length)} 170 170)`), [rings]);
  return <main className="app-shell">
    <header><div><p className="eyebrow">HOUSEWORK, TURN BY TURN</p><h1>Cleaning <em>cycle</em></h1></div><button className="icon-button" aria-label="Open settings">☼</button></header>
    <section className="dial-card" aria-label="Cleaning task dial">
      <div className="case-label">VANDA’S HOUSE · SEPTEMBER</div>
      <svg viewBox="0 0 340 340" className="dial" role="img" aria-label="Three rotating cleaning task rings">
        <circle cx="170" cy="170" r="168" className="case"/><circle cx="170" cy="170" r="161" className="case-line"/>
        {Array.from({ length: 60 }, (_, i) => { const a = points(157, i * 6), b = points(i % 5 ? 153 : 150, i * 6); return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="tick"/>; })}
        <circle cx="170" cy="170" r="152" className="face"/><circle cx="170" cy="170" r="132" className="outer-track"/><circle cx="170" cy="170" r="99" className="mid-track"/><circle cx="170" cy="170" r="66" className="inner-track"/>
        {rings.map((ring, ringIndex) => { const radius = [66, 99, 132][ringIndex]; const well = [11, 12, 13][ringIndex]; return <g key={ring.cadence} className={`ring ring-${ring.cadence} ${rotating === ringIndex ? "spinning" : ""}`} transform={ringTransforms[ringIndex]} onClick={() => complete(ringIndex)}>
          {ring.tasks.map((task, taskIndex) => { const [x, y] = points(radius, taskIndex * (360 / ring.tasks.length)); return <g key={task.name} transform={`translate(${x} ${y}) rotate(${taskIndex * (360 / ring.tasks.length)})`} className="task-well">
            <circle r={well} className="well"/><text y="5" textAnchor="middle" className="pixel-icon">{task.icon}</text>{ring.done[taskIndex] && <g className="completion"><circle r={well - 2} /><path d="M-5 0 l4 4 l7 -9" /></g>}
          </g>})}
        </g>})}
        <path d="M156 19 L154 114 A16 16 0 0 0 186 114 L184 19 A82 82 0 0 1 156 19Z" className={`window ${rings[2].tint}`}/>
        <circle cx="170" cy="170" r="47" className="brass"/><circle cx="170" cy="170" r="38" className="knob"/>
        <text x="170" y="160" textAnchor="middle" className="knob-mini">TURN THE DIAL</text><text x="170" y="180" textAnchor="middle" className="knob-big">TODAY</text><text x="170" y="194" textAnchor="middle" className="knob-mini">ONE TASK AT A TIME</text>
      </svg>
      <p className="tap-hint">Tap any ring to press out its next task</p>
    </section>
    <section className="tasks" aria-label="Current tasks">
      <div className="section-title"><span>YOUR NEXT THREE</span><button onClick={() => setShowInstall(true)}>EDIT TASKS</button></div>
      {rings.map((ring, i) => <div key={ring.cadence} className={`task-row ${ring.tint} ${open === i ? "expanded" : ""}`}>
        <button className="row-main" onClick={() => setOpen(open === i ? null : i)}><span className="status-dot"/><span className="task-icon">{ring.tasks[ring.index].icon}</span><span className="task-copy"><small>{ring.label.toUpperCase()} · {ring.index + 1} OF {ring.tasks.length}</small><strong>{ring.tasks[ring.index].name}</strong></span><span className="chevron">⌄</span></button>
        <button className="done" onClick={() => complete(i)}>DONE</button>
        {open === i && <ol>{ring.tasks.map((task, j) => <li key={task.name} className={j === ring.index ? "current" : ring.done[j] ? "finished" : ""}><span>{ring.done[j] ? "✓" : task.icon}</span>{task.name}{j === ring.index && <b>NOW</b>}</li>)}</ol>}
      </div>)}
    </section>
    <footer><button onClick={installApp}>⌄ &nbsp; Add to home screen</button><span>Cycle {rings.reduce((total, r) => total + r.cycle, 0)}</span></footer>
    {last && <div className="toast"><span>Task pressed out</span><button onClick={undo}>UNDO</button></div>}
    {showInstall && <div className="sheet" onClick={() => setShowInstall(false)}><div onClick={(e) => e.stopPropagation()}><span>INSTALL CLEANING CYCLE</span><h2>Keep it close at hand.</h2><p>On iPhone, tap Share, then “Add to Home Screen”. On Android, use the install prompt in your browser menu.</p><button onClick={() => setShowInstall(false)}>GOT IT</button></div></div>}
  </main>;
}

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; }
