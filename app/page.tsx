"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

type Cadence = "daily" | "weekly" | "monthly";
type Ring = {
  cadence: Cadence;
  label: string;
  tasks: { name: string; icon: string }[];
  index: number;
  done: boolean[];
  cycle: number;
  tint: "green" | "amber" | "red";
  currentSince: number;
  rotation: number;
  previousRotation: number;
};
const starter: Ring[] = [
  { cadence: "daily", label: "Daily", tasks: [{ name: "Dishes", icon: "▧" }, { name: "Wipe counters", icon: "✦" }, { name: "Sweep kitchen", icon: "⌁" }, { name: "Make beds", icon: "▤" }, { name: "Tidy lounge", icon: "⌂" }, { name: "Empty bins", icon: "▱" }], index: 0, done: Array(6).fill(false), cycle: 12, tint: "green", currentSince: 0, rotation: 0, previousRotation: 0 },
  { cadence: "weekly", label: "Weekly", tasks: [{ name: "Vacuum", icon: "≋" }, { name: "Mop floors", icon: "♒" }, { name: "Clean bathroom", icon: "▦" }, { name: "Change sheets", icon: "▤" }, { name: "Dust surfaces", icon: "✧" }, { name: "Clean mirrors", icon: "▯" }, { name: "Laundry towels", icon: "≋" }], index: 2, done: [true, true, false, false, false, false, false], cycle: 5, tint: "amber", currentSince: 0, rotation: -(2 * 360) / 7, previousRotation: -(2 * 360) / 7 },
  { cadence: "monthly", label: "Monthly", tasks: [{ name: "Clean oven", icon: "▣" }, { name: "Wash windows", icon: "▯" }, { name: "Descale kettle", icon: "♨" }, { name: "Clean fridge", icon: "▤" }, { name: "Wipe skirting", icon: "⌁" }, { name: "Flip mattress", icon: "▰" }, { name: "Clean vents", icon: "▦" }, { name: "Wash curtains", icon: "≋" }], index: 4, done: [true, true, true, true, false, false, false, false], cycle: 2, tint: "red", currentSince: 0, rotation: -180, previousRotation: -180 },
];
const iconOptions = ["🍽️", "🧽", "🧹", "🛏️", "🛋️", "🗑️", "🪣", "🧼", "🪞", "🧺", "🔥", "🪟", "🫖", "🧊", "🌀", "✨"];

const points = (r: number, angle: number) => {
  const rad = (angle * Math.PI) / 180;
  return [
    Number((170 + r * Math.sin(rad)).toFixed(3)),
    Number((170 - r * Math.cos(rad)).toFixed(3)),
  ];
};

const cadenceDuration = (cadence: Cadence) => ({ daily: 86_400_000, weekly: 604_800_000, monthly: 2_592_000_000 })[cadence];
const blend = (from: number[], to: number[], amount: number) => from.map((value, index) => Math.round(value + (to[index] - value) * amount));
const urgencyColor = (amount: number) => {
  const [r, g, b] = amount <= 0.5
    ? blend([177, 181, 163], [205, 151, 56], amount * 2)
    : blend([205, 151, 56], [171, 75, 61], (amount - 0.5) * 2);
  return `rgb(${r} ${g} ${b})`;
};
const alignedRotation = (rotation: number, index: number, taskCount: number) => {
  const target = -(index * 360) / taskCount;
  const turns = Math.round((rotation - target) / 360);
  return target + turns * 360;
};
const displayNameForUser = (user: User | null) => user?.user_metadata.display_name || user?.user_metadata.full_name || user?.email?.split("@")[0] || "Your account";

export default function Home() {
  const [rings, setRings] = useState<Ring[]>(starter);
  const [open, setOpen] = useState<number | null>(null);
  const [rotating, setRotating] = useState<number | null>(null);
  const [install, setInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingRing, setEditingRing] = useState(0);
  const [now, setNow] = useState(0);
  const [motion, setMotion] = useState<{ ring: number; rotation: number } | null>(null);
  const [pickingIcon, setPickingIcon] = useState<number | null>(null);
  const [customIcon, setCustomIcon] = useState("");
  const [screen, setScreen] = useState<"dial" | "cycles" | "account">("dial");
  const [confirmReset, setConfirmReset] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [accountNameDraft, setAccountNameDraft] = useState("");
  const [accountNameMessage, setAccountNameMessage] = useState("");
  const animationFrame = useRef<number | null>(null);
  const clickAudio = useRef<HTMLAudioElement | null>(null);
  const ringsHydrated = useRef(false);

  useEffect(() => {
    const hydrate = window.setTimeout(() => {
      const initialNow = Date.now();
      const saved = localStorage.getItem("cleaning-cycle-rings");
      let hydratedRings = starter.map((ring) => ({ ...ring, currentSince: initialNow }));
      if (saved) {
        try {
          hydratedRings = (JSON.parse(saved) as Ring[]).map((ring) => {
            const savedRotation = Number.isFinite(ring.rotation) ? ring.rotation : -(ring.index * 360) / ring.tasks.length;
            const rotation = alignedRotation(savedRotation, ring.index, ring.tasks.length);
            return { ...ring, currentSince: ring.currentSince || initialNow, rotation, previousRotation: rotation };
          });
        } catch {
          localStorage.removeItem("cleaning-cycle-rings");
        }
      }
      ringsHydrated.current = true;
      setRings(hydratedRings);
      setNow(initialNow);
    }, 0);
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstall(event as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
    return () => { window.removeEventListener("beforeinstallprompt", beforeInstall); window.clearTimeout(hydrate); window.clearInterval(clock); if (animationFrame.current) window.cancelAnimationFrame(animationFrame.current); };
  }, []);
  useEffect(() => {
    if (ringsHydrated.current) localStorage.setItem("cleaning-cycle-rings", JSON.stringify(rings));
  }, [rings]);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user ?? null;
      setAuthUser(user);
      setAccountNameDraft(user ? displayNameForUser(user) : "");
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthUser(user);
      setAccountNameDraft(user ? displayNameForUser(user) : "");
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const animateRotation = (ringIndex: number, from: number, to: number, finished: () => void) => {
    let startedAt: number | null = null;
    const duration = 850;
    const step = (timestamp: number) => {
      startedAt ??= timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setMotion({ ring: ringIndex, rotation: from + (to - from) * eased });
      if (progress < 1) animationFrame.current = window.requestAnimationFrame(step);
      else { animationFrame.current = null; setMotion(null); finished(); }
    };
    animationFrame.current = window.requestAnimationFrame(step);
  };
  const playDialClick = () => {
    const sound = clickAudio.current;
    if (!sound) return;
    sound.currentTime = 0;
    void sound.play().catch(() => undefined);
  };
  const complete = (ringIndex: number) => {
    if (rotating !== null) return;
    const ring = rings[ringIndex];
    const oldIndex = ring.index;
    const next = (oldIndex + 1) % ring.tasks.length;
    const completedCycle = ring.done.every((done, index) => done || index === oldIndex);
    setRotating(ringIndex);
    if (navigator.vibrate) navigator.vibrate(completedCycle ? [20, 30, 55] : 25);
    playDialClick();
    setRings((current) => current.map((entry, i) => {
      if (i !== ringIndex) return entry;
      return { ...entry, done: entry.done.map((isDone, taskIndex) => taskIndex === oldIndex || isDone) };
    }));
    animateRotation(ringIndex, ring.rotation, ring.rotation - 360 / ring.tasks.length, () => {
      setRings((current) => current.map((entry, i) => {
        if (i !== ringIndex) return entry;
        const cycleFinished = entry.done.every(Boolean);
        return { ...entry, index: next, previousRotation: ring.rotation - 360 / entry.tasks.length, rotation: ring.rotation - 360 / entry.tasks.length, currentSince: Date.now(), cycle: cycleFinished ? entry.cycle + 1 : entry.cycle, done: cycleFinished ? Array(entry.tasks.length).fill(false) : entry.done };
      }));
      setRotating(null);
    });
  };
  const markAhead = (ringIndex: number, taskIndex: number) => {
    if (rotating !== null || rings[ringIndex].done[taskIndex]) return;
    if (navigator.vibrate) navigator.vibrate(25);
    setRings((current) => current.map((ring, index) => index !== ringIndex ? ring : { ...ring, done: ring.done.map((done, task) => task === taskIndex || done) }));
  };
  const restoreTask = (ringIndex: number, taskIndex: number) => {
    if (rotating !== null) return;
    const ring = rings[ringIndex];
    const previousIndex = (ring.index - 1 + ring.tasks.length) % ring.tasks.length;
    const rollsBack = taskIndex === previousIndex;
    if (navigator.vibrate) navigator.vibrate(15);
    setRings((current) => current.map((entry, index) => {
      if (index !== ringIndex) return entry;
      return {
        ...entry,
        index: rollsBack ? taskIndex : entry.index,
        previousRotation: rollsBack ? entry.rotation : entry.previousRotation,
        rotation: rollsBack ? entry.rotation + 360 / entry.tasks.length : entry.rotation,
        currentSince: rollsBack ? Date.now() : entry.currentSince,
        cycle: rollsBack && entry.index === 0 ? Math.max(0, entry.cycle - 1) : entry.cycle,
        done: entry.done.map((done, task) => task === taskIndex ? false : done),
      };
    }));
  };
  const installApp = async () => {
    if (install) { await install.prompt(); setInstall(null); }
    else setShowInstall(true);
  };
  const updateTaskName = (taskIndex: number, name: string) => setRings((current) => current.map((ring, ringIndex) => ringIndex !== editingRing ? ring : {
    ...ring,
    tasks: ring.tasks.map((task, index) => index === taskIndex ? { ...task, name } : task),
  }));
  const chooseTaskIcon = (taskIndex: number, icon: string) => setRings((current) => current.map((ring, ringIndex) => ringIndex !== editingRing ? ring : {
    ...ring,
    tasks: ring.tasks.map((task, index) => index !== taskIndex ? task : { ...task, icon }),
  }));
  const resetAllCycles = () => {
    const resetAt = Date.now();
    setRings((current) => current.map((ring) => ({ ...ring, index: 0, done: Array(ring.tasks.length).fill(false), cycle: 0, currentSince: resetAt, rotation: 0, previousRotation: 0 })));
    setConfirmReset(false);
    setScreen("dial");
  };
  const addTask = () => setRings((current) => current.map((ring, ringIndex) => {
    if (ringIndex !== editingRing || ring.tasks.length >= 12) return ring;
    const tasks = [...ring.tasks, { name: "New task", icon: "✦" }];
    const rotation = alignedRotation(ring.rotation, ring.index, tasks.length);
    return { ...ring, tasks, done: [...ring.done, false], rotation, previousRotation: rotation };
  }));
  const removeTask = (taskIndex: number) => setRings((current) => current.map((ring, ringIndex) => {
    if (ringIndex !== editingRing || ring.tasks.length <= 3) return ring;
    const remaining = ring.tasks.filter((_, index) => index !== taskIndex);
    const index = taskIndex < ring.index ? ring.index - 1 : taskIndex === ring.index ? ring.index % remaining.length : ring.index;
    const rotation = alignedRotation(ring.rotation, index, remaining.length);
    return {
      ...ring,
      tasks: remaining,
      done: ring.done.filter((_, index) => index !== taskIndex),
      index,
      rotation,
      previousRotation: rotation,
    };
  }));
  const sendMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authEmail.trim() || authBusy) return;
    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: `${window.location.origin}/`, shouldCreateUser: true },
    });
    setAuthMessage(error ? error.message : "Check your email for the sign-in link.");
    setAuthBusy(false);
  };
  const signOut = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await getSupabaseBrowserClient().auth.signOut();
    if (error) setAuthMessage(error.message);
    setAuthBusy(false);
  };
  const saveAccountName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = accountNameDraft.trim();
    if (!displayName || authBusy) return;
    setAuthBusy(true);
    setAccountNameMessage("");
    const { data, error } = await getSupabaseBrowserClient().auth.updateUser({ data: { display_name: displayName } });
    if (data.user) setAuthUser(data.user);
    setAccountNameMessage(error ? error.message : "Name saved.");
    setAuthBusy(false);
  };

  const urgency = (ring: Ring) => ring.currentSince && now ? Math.min(1, Math.max(0, (now - ring.currentSince) / cadenceDuration(ring.cadence))) : 0;
  const totalCycles = rings.reduce((total, ring) => total + ring.cycle, 0);
  const weekday = now ? new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date(now)).toUpperCase() : "TODAY";
  const month = now ? new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(now)).toUpperCase() : "SEPTEMBER";
  const accountName = displayNameForUser(authUser);
  if (screen === "account") return <main className="app-shell account-screen">
    <audio ref={clickAudio} src="/click-pen.mp3" preload="auto" />
    <header><button className="back-button" aria-label="Back to dial" onClick={() => setScreen("dial")}>←</button><div><p className="eyebrow">CYCLES</p><h1>My account</h1></div></header>
    <section className="account-card"><p className="eyebrow">ABOUT YOU</p><h2>{authReady ? authUser ? accountName : "Sign in" : "Checking account"}</h2>{authUser?.email && <p className="account-email">{authUser.email}</p>}{authUser && <form className="account-name-form" onSubmit={saveAccountName}><label htmlFor="account-name">YOUR NAME</label><div><input id="account-name" autoComplete="name" maxLength={60} required value={accountNameDraft} onChange={(event) => setAccountNameDraft(event.target.value)} /><button disabled={authBusy || !accountNameDraft.trim()}>{authBusy ? "SAVING" : "SAVE"}</button></div>{accountNameMessage && <p role="status">{accountNameMessage}</p>}</form>}<p>Your tasks and cycles are saved on this device.</p></section>
    {authReady && !authUser && <form className="account-auth" onSubmit={sendMagicLink}><label htmlFor="account-email">EMAIL ADDRESS</label><input id="account-email" type="email" inputMode="email" autoComplete="email" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com"/><button disabled={authBusy}>{authBusy ? "SENDING" : "EMAIL ME A SIGN-IN LINK"}</button>{authMessage && <p role="status">{authMessage}</p>}</form>}
    <section className="account-links" aria-label="Account options"><button onClick={() => { setScreen("dial"); setShowEditor(true); }}><span>YOUR TASKS</span><strong>Edit tasks</strong></button><button onClick={() => setScreen("cycles")}><span>CYCLE HISTORY</span><strong>{totalCycles} completed</strong></button></section>
    {authUser && <div className="account-session"><span>SIGNED IN</span><button onClick={signOut} disabled={authBusy}>{authBusy ? "SIGNING OUT" : "SIGN OUT"}</button>{authMessage && <p role="status">{authMessage}</p>}</div>}
  </main>;
  if (screen === "cycles") return <main className="app-shell cycle-screen">
    <audio ref={clickAudio} src="/click-pen.mp3" preload="auto" />
    <header><button className="back-button" aria-label="Back to dial" onClick={() => setScreen("dial")}>←</button><div><p className="eyebrow">CYCLES</p><h1>Fresh <em>start</em></h1></div></header>
    <section className="cycle-card"><p className="eyebrow">TOTAL COMPLETED CYCLES</p><strong>{totalCycles}</strong><p>Resetting starts every ring from its first task and clears all current completion marks.</p></section>
    <section className="reset-section"><span>START OVER</span><h2>Reset the whole dial.</h2><p>Your task names and icons stay intact. Daily, weekly, and monthly progress returns to zero.</p><button onClick={() => setConfirmReset(true)}>RESET ALL CYCLES</button></section>
    {confirmReset && <div className="sheet" onClick={() => setConfirmReset(false)}><div onClick={(event) => event.stopPropagation()}><span>CONFIRM RESET</span><h2>Clear all progress?</h2><p>This clears every tick and resets all three cycle counters to zero.</p><div className="confirm-actions"><button className="cancel" onClick={() => setConfirmReset(false)}>CANCEL</button><button className="danger" onClick={resetAllCycles}>RESET</button></div></div></div>}
  </main>;
  return <main className="app-shell">
    <audio ref={clickAudio} src="/click-pen.mp3" preload="auto" />
    <header><div><p className="eyebrow">LIFE GOES AROUND</p><h1>Cycles</h1></div><button className="icon-button" aria-label="Open my account" onClick={() => setScreen("account")}>☼</button></header>
    <section className="dial-card" aria-label="Cleaning task dial">
      <div className="case-label">{month}</div>
      <svg viewBox="0 0 340 340" className="dial" role="img" aria-label="Three rotating cleaning task rings">
        <circle cx="170" cy="170" r="168" className="case"/><circle cx="170" cy="170" r="161" className="case-line"/>
        {Array.from({ length: 60 }, (_, i) => { if (i === 0) return null; const a = points(157, i * 6), b = points(i % 5 ? 153 : 150, i * 6); return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="tick"/>; })}
        <path d="M166 11 H174 L170 18 Z" className="north-marker" />
        <circle cx="170" cy="170" r="152" className="face"/><circle cx="170" cy="170" r="132" className="outer-track"/><circle cx="170" cy="170" r="98" className="mid-track"/><circle cx="170" cy="170" r="66" className="inner-track"/>
        {rings.map((ring, ringIndex) => { const radius = [66, 98, 132][ringIndex]; const well = [11, 12, 13][ringIndex]; const slot = 360 / ring.tasks.length; const [startX, startY] = points(radius, -slot * 0.37); const [endX, endY] = points(radius, slot * 0.37); return <path key={`highlight-${ring.cadence}`} d={`M${startX} ${startY} A${radius} ${radius} 0 0 1 ${endX} ${endY}`} className="due-segment" stroke={urgencyColor(urgency(ring))} strokeWidth={well * 2.2} />; })}
        {rings.map((ring, ringIndex) => { const radius = [66, 98, 132][ringIndex]; const well = [11, 12, 13][ringIndex]; const slot = 360 / ring.tasks.length; const displayRotation = motion?.ring === ringIndex ? motion.rotation : ring.rotation; return <g key={ring.cadence} transform="translate(170 170)"><g className={`ring ring-${ring.cadence} ${rotating === ringIndex ? "spinning" : ""}`} transform={`rotate(${displayRotation})`}>
          <g transform="translate(-170 -170)">
            <circle cx="170" cy="170" r={radius} fill="none" stroke="transparent" strokeWidth={well * 2.2} className="ring-press-area" onClick={() => complete(ringIndex)} />
            {ring.tasks.map((task, taskIndex) => { const [x, y] = points(radius, taskIndex * slot); return <g key={task.name} transform={`translate(${x} ${y}) rotate(${taskIndex * slot})`} className={`task-well ${taskIndex === ring.index ? "due" : ""}`} onClick={(event) => { event.stopPropagation(); if (taskIndex === ring.index) complete(ringIndex); else if (ring.done[taskIndex]) restoreTask(ringIndex, taskIndex); else markAhead(ringIndex, taskIndex); }}>
              <circle r={well} className="well"/><text y="5" textAnchor="middle" className="pixel-icon">{task.icon}</text>{ring.done[taskIndex] && <g className="completion"><circle r={well - 2} /><path d="M-5 0 l4 4 l7 -9" /></g>}
            </g>})}
          </g>
        </g></g>})}
        <circle cx="170" cy="170" r="48.5" className="brass"/><circle cx="170" cy="170" r="38" className="knob"/>
        <text x="170" y="175" textAnchor="middle" className="knob-big">{weekday}</text>
      </svg>
      <p className="tap-hint">Press a task to complete</p>
    </section>
    <section className="tasks" aria-label="Current tasks">
      <div className="section-title"><button onClick={() => setShowEditor(true)}>EDIT TASKS</button></div>
      {rings.map((ring, i) => <div key={ring.cadence} className={`task-row ${open === i ? "expanded" : ""}`}>
        <button className="row-main" onClick={() => setOpen(open === i ? null : i)}><span className="task-icon" style={{ borderColor: urgencyColor(urgency(ring)) }}>{ring.tasks[ring.index].icon}</span><span className="task-copy"><small>{ring.label.toUpperCase()} · {ring.index + 1} OF {ring.tasks.length}</small><strong>{ring.tasks[ring.index].name}</strong></span></button>
        <button className="done" onClick={() => complete(i)}>DONE</button>
        {open === i && <ol>{ring.tasks.map((task, j) => <li key={task.name} className={j === ring.index ? "current" : ring.done[j] ? "finished" : ""}><span>{ring.done[j] ? "✓" : task.icon}</span>{task.name}{j === ring.index && <b>NOW</b>}</li>)}</ol>}
      </div>)}
    </section>
    <footer><button onClick={installApp}>Add to home screen</button><button className="cycle-link" onClick={() => setScreen("cycles")}>Cycle {totalCycles}</button></footer>
    {showInstall && <div className="sheet" onClick={() => setShowInstall(false)}><div onClick={(e) => e.stopPropagation()}><span>INSTALL CYCLES</span><h2>Keep it close at hand.</h2><p>On iPhone, tap Share, then “Add to Home Screen”. On Android, use the install prompt in your browser menu.</p><button onClick={() => setShowInstall(false)}>GOT IT</button></div></div>}
    {showEditor && <div className="sheet editor-sheet" onClick={() => setShowEditor(false)}><div onClick={(e) => e.stopPropagation()}><div className="editor-head"><span>EDIT YOUR TASKS</span><button aria-label="Close task editor" onClick={() => setShowEditor(false)}>×</button></div><h2>Keep the cycle yours.</h2><div className="ring-tabs">{rings.map((ring, index) => <button key={ring.cadence} className={editingRing === index ? "selected" : ""} onClick={() => { setEditingRing(index); setPickingIcon(null); }}>{ring.label}</button>)}</div><p className="editor-rule">Tap an icon to choose another · {rings[editingRing].tasks.length} of 12 tasks</p><div className="editor-list">{rings[editingRing].tasks.map((task, index) => <div className="editor-task" key={`${task.name}-${index}`}><div className="editor-row"><button className="editor-icon" aria-label={`Change icon for ${task.name}`} onClick={() => { setPickingIcon(pickingIcon === index ? null : index); setCustomIcon(""); }}>{task.icon}</button><input aria-label={`${rings[editingRing].label} task ${index + 1}`} maxLength={24} value={task.name} onChange={(event) => updateTaskName(index, event.target.value)} /><button aria-label={`Remove ${task.name}`} disabled={rings[editingRing].tasks.length <= 3} onClick={() => removeTask(index)}>×</button></div>{pickingIcon === index && <div className="icon-picker" aria-label={`Choose icon for ${task.name}`}>{iconOptions.map((icon) => <button key={icon} className={task.icon === icon ? "selected" : ""} aria-label={`Use ${icon} for ${task.name}`} onClick={() => { chooseTaskIcon(index, icon); setPickingIcon(null); }}>{icon}</button>)}<div className="custom-icon"><input aria-label={`Custom emoji for ${task.name}`} placeholder="⌃⌘Space for any emoji" value={customIcon} onChange={(event) => setCustomIcon(event.target.value)} /><button disabled={!customIcon.trim()} onClick={() => { chooseTaskIcon(index, customIcon.trim()); setPickingIcon(null); setCustomIcon(""); }}>USE</button></div></div>}</div>)}</div><button className="add-task" disabled={rings[editingRing].tasks.length >= 12} onClick={addTask}>+ ADD TASK</button><button className="editor-save" onClick={() => setShowEditor(false)}>SAVE CHANGES</button></div></div>}
  </main>;
}

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; }
