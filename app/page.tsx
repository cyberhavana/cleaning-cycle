"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import {
  loadCloudRings,
  loadOrCreateProfile,
  normalizeRing,
  saveCloudRings,
  saveProfileName,
  type Cadence,
  type RingState,
} from "../lib/supabase/ring-sync";

const LEGACY_STORAGE_KEY = "cleaning-cycle-rings";
const userStorageKey = (userId: string) => `${LEGACY_STORAGE_KEY}:${userId}`;

const starter: RingState[] = [
  { cadence: "daily", label: "Daily", tasks: [{ name: "Dishes", icon: "▧" }, { name: "Wipe counters", icon: "✦" }, { name: "Sweep kitchen", icon: "⌁" }, { name: "Make beds", icon: "▤" }, { name: "Tidy lounge", icon: "⌂" }, { name: "Empty bins", icon: "▱" }], index: 0, done: Array(6).fill(false), cycle: 12, tint: "green", currentSince: 0, rotation: 0, previousRotation: 0 },
  { cadence: "weekly", label: "Weekly", tasks: [{ name: "Vacuum", icon: "≋" }, { name: "Mop floors", icon: "♒" }, { name: "Clean bathroom", icon: "▦" }, { name: "Change sheets", icon: "▤" }, { name: "Dust surfaces", icon: "✧" }, { name: "Clean mirrors", icon: "▯" }, { name: "Laundry towels", icon: "≋" }], index: 2, done: [true, true, false, false, false, false, false], cycle: 5, tint: "amber", currentSince: 0, rotation: -(2 * 360) / 7, previousRotation: -(2 * 360) / 7 },
  { cadence: "monthly", label: "Monthly", tasks: [{ name: "Clean oven", icon: "▣" }, { name: "Wash windows", icon: "▯" }, { name: "Descale kettle", icon: "♨" }, { name: "Clean fridge", icon: "▤" }, { name: "Wipe skirting", icon: "⌁" }, { name: "Flip mattress", icon: "▰" }, { name: "Clean vents", icon: "▦" }, { name: "Wash curtains", icon: "≋" }], index: 4, done: [true, true, true, true, false, false, false, false], cycle: 2, tint: "red", currentSince: 0, rotation: -180, previousRotation: -180 },
];
const iconOptions = ["🍽️", "🧽", "🧹", "🛏️", "🛋️", "🗑️", "🪣", "🧼", "🪞", "🧺", "🔥", "🪟", "🫖", "🧊", "🌀", "✨"];
const taskArt: Record<string, string> = {
  Dishes: "/task-icons/dishes.png",
  "Wipe counters": "/task-icons/wipe-counters.png",
  "Sweep kitchen": "/task-icons/sweep-kitchen.png",
  "Make beds": "/task-icons/make-beds.png",
};

const TaskIcon = ({ name, fallback, className = "" }: { name: string; fallback: string; className?: string }) => {
  const src = taskArt[name];
  return src ? <img className={`task-art ${className}`} src={src} alt="" /> : <>{fallback}</>;
};

const points = (r: number, angle: number) => {
  const rad = (angle * Math.PI) / 180;
  return [
    Number((170 + r * Math.sin(rad)).toFixed(3)),
    Number((170 - r * Math.cos(rad)).toFixed(3)),
  ];
};

const annularSector = (innerRadius: number, outerRadius: number, halfAngle: number) => {
  const [outerStartX, outerStartY] = points(outerRadius, -halfAngle);
  const [outerEndX, outerEndY] = points(outerRadius, halfAngle);
  const [innerEndX, innerEndY] = points(innerRadius, halfAngle);
  const [innerStartX, innerStartY] = points(innerRadius, -halfAngle);
  return `M${outerStartX} ${outerStartY} A${outerRadius} ${outerRadius} 0 0 1 ${outerEndX} ${outerEndY} L${innerEndX} ${innerEndY} A${innerRadius} ${innerRadius} 0 0 0 ${innerStartX} ${innerStartY} Z`;
};

const dialPalettes = [
  { case: "#a9c9b6", tick: "#759886", tab: "#d8e8de" },
  { case: "#c6b6d6", tick: "#927fa7", tab: "#e6dcf0" },
  { case: "#dfbd99", tick: "#ad8159", tab: "#f2dfca" },
];

const splitTaskName = (name: string) => {
  if (name.length <= 13 || !name.includes(" ")) return [name];
  const words = name.split(" ");
  const splitAt = Math.ceil(words.length / 2);
  return [words.slice(0, splitAt).join(" "), words.slice(splitAt).join(" ")];
};

const isoWeek = (timestamp: number) => {
  const local = new Date(timestamp);
  const date = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
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
const initialRings = (initialNow: number) => starter.map((ring) => normalizeRing({ ...ring, currentSince: initialNow }));
const storedRings = (serialized: string | null, initialNow: number) => {
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as RingState[];
    if (!Array.isArray(parsed) || parsed.length !== starter.length) return null;
    return parsed.map((ring) => normalizeRing({ ...ring, currentSince: ring.currentSince || initialNow }));
  } catch {
    return null;
  }
};

export default function Home() {
  const [rings, setRings] = useState<RingState[]>(starter);
  const [open, setOpen] = useState<number | null>(null);
  const [rotating, setRotating] = useState<number | null>(null);
  const [install, setInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingRing, setEditingRing] = useState(0);
  const [selectedRing, setSelectedRing] = useState(0);
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
  const [localReady, setLocalReady] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"device" | "loading" | "saving" | "synced" | "error">("device");
  const [syncMessage, setSyncMessage] = useState("");
  const animationFrame = useRef<number | null>(null);
  const clickAudio = useRef<HTMLAudioElement | null>(null);
  const ringsHydrated = useRef(false);
  const ringsRef = useRef<RingState[]>(starter);
  const syncUserRef = useRef<string | null>(null);
  const authNameRef = useRef("Your account");
  const saveTimer = useRef<number | null>(null);
  const authUserId = authUser?.id ?? null;

  useEffect(() => {
    const hydrate = window.setTimeout(() => {
      const initialNow = Date.now();
      const serialized = localStorage.getItem(LEGACY_STORAGE_KEY);
      const savedRings = storedRings(serialized, initialNow);
      const hydratedRings = savedRings || initialRings(initialNow);
      if (serialized && !savedRings) localStorage.removeItem(LEGACY_STORAGE_KEY);
      ringsHydrated.current = true;
      ringsRef.current = hydratedRings;
      setRings(hydratedRings);
      setNow(initialNow);
      setLocalReady(true);
    }, 0);
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstall(event as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
    return () => { window.removeEventListener("beforeinstallprompt", beforeInstall); window.clearTimeout(hydrate); window.clearInterval(clock); if (animationFrame.current) window.cancelAnimationFrame(animationFrame.current); };
  }, []);
  useEffect(() => {
    ringsRef.current = rings;
    if (!ringsHydrated.current) return;
    if (!authUserId) localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(rings));
    else if (syncReady && syncUserRef.current === authUserId) {
      localStorage.setItem(userStorageKey(authUserId), JSON.stringify(rings));
    }
  }, [authUserId, rings, syncReady]);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const applyUser = (user: User | null) => {
      authNameRef.current = user ? displayNameForUser(user) : "Your account";
      if (!user) {
        const resetRings = initialRings(Date.now());
        syncUserRef.current = null;
        setSyncReady(false);
        setSyncStatus("device");
        setSyncMessage("");
        setRings(resetRings);
      }
      setAuthUser(user);
      setAccountNameDraft(user ? displayNameForUser(user) : "");
      setAuthReady(true);
    };
    void supabase.auth.getUser().then(({ data }) => {
      applyUser(data.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!authUserId || !localReady) return;
    let cancelled = false;
    const start = window.setTimeout(() => {
      void (async () => {
        setSyncReady(false);
        setSyncStatus("loading");
        setSyncMessage("");
        try {
          const client = getSupabaseBrowserClient();
          const cached = storedRings(localStorage.getItem(userStorageKey(authUserId)), Date.now());
          const deviceRings = cached || ringsRef.current.map(normalizeRing);
          if (cached && !cancelled) setRings(cached);

          const [profileName, cloudRings] = await Promise.all([
            loadOrCreateProfile(client, authUserId, authNameRef.current),
            loadCloudRings(client, authUserId, deviceRings),
          ]);
          let syncedRings = cloudRings;
          if (!syncedRings) {
            await saveCloudRings(client, authUserId, deviceRings);
            syncedRings = deviceRings.map(normalizeRing);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
          }
          if (cancelled) return;
          syncUserRef.current = authUserId;
          ringsRef.current = syncedRings;
          setAccountNameDraft(profileName);
          setRings(syncedRings);
          setSyncReady(true);
          setSyncStatus("synced");
        } catch (error) {
          if (cancelled) return;
          setSyncReady(false);
          setSyncStatus("error");
          setSyncMessage(error instanceof Error ? error.message : "Cloud sync failed.");
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
    };
  }, [authUserId, localReady]);
  useEffect(() => {
    if (!authUserId || !syncReady || syncUserRef.current !== authUserId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setSyncStatus("saving");
      void saveCloudRings(getSupabaseBrowserClient(), authUserId, rings)
        .then(() => {
          if (syncUserRef.current !== authUserId) return;
          localStorage.setItem(userStorageKey(authUserId), JSON.stringify(rings));
          setSyncStatus("synced");
          setSyncMessage("");
        })
        .catch((error: unknown) => {
          if (syncUserRef.current !== authUserId) return;
          setSyncStatus("error");
          setSyncMessage(error instanceof Error ? error.message : "Cloud save failed.");
        });
    }, 1_200);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [authUserId, rings, syncReady]);

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
    const signedOutUserId = authUser?.id;
    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await getSupabaseBrowserClient().auth.signOut();
    if (error) setAuthMessage(error.message);
    else if (signedOutUserId) localStorage.removeItem(userStorageKey(signedOutUserId));
    setAuthBusy(false);
  };
  const saveAccountName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = accountNameDraft.trim();
    if (!displayName || authBusy) return;
    setAuthBusy(true);
    setAccountNameMessage("");
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.auth.updateUser({ data: { display_name: displayName } });
    if (data.user) setAuthUser(data.user);
    if (error || !authUser) {
      setAccountNameMessage(error?.message || "Sign in before saving your name.");
    } else {
      try {
        await saveProfileName(client, authUser.id, displayName);
        authNameRef.current = displayName;
        setAccountNameMessage("Name saved.");
      } catch (profileError) {
        setAccountNameMessage(profileError instanceof Error ? profileError.message : "Could not save your profile.");
      }
    }
    setAuthBusy(false);
  };

  const urgency = (ring: RingState) => ring.currentSince && now ? Math.min(1, Math.max(0, (now - ring.currentSince) / cadenceDuration(ring.cadence))) : 0;
  const totalCycles = rings.reduce((total, ring) => total + ring.cycle, 0);
  const weekday = now ? new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date(now)).toUpperCase() : "TODAY";
  const month = now ? new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(now)).toUpperCase() : "SEPTEMBER";
  const activeRing = rings[selectedRing];
  const activeTask = activeRing.tasks[activeRing.index];
  const activeTaskLines = splitTaskName(activeTask.name);
  const activeSlot = 360 / activeRing.tasks.length;
  const activeRadius = 114;
  const activeWell = 22;
  const activeRotation = motion?.ring === selectedRing ? motion.rotation : activeRing.rotation;
  const activePalette = dialPalettes[selectedRing];
  const activePeriod = activeRing.cadence === "daily" ? weekday : activeRing.cadence === "monthly" ? month : now ? `WEEK ${isoWeek(now)}` : "THIS WEEK";
  const accountName = accountNameDraft.trim() || displayNameForUser(authUser);
  const accountStorageMessage = !authUser
    ? "Your tasks and cycles are saved on this device."
    : syncStatus === "loading"
      ? "Loading your synced tasks and cycles."
      : syncStatus === "saving"
        ? "Saving your latest changes."
        : syncStatus === "error"
          ? `Cloud sync error: ${syncMessage}`
          : "Your tasks and cycles are synced to your account.";
  if (screen === "account") return <main className="app-shell account-screen">
    <audio ref={clickAudio} src="/click-pen.mp3" preload="auto" />
    <header><button className="back-button" aria-label="Back to dial" onClick={() => setScreen("dial")}>←</button><div><p className="eyebrow">CYCLES</p><h1>My account</h1></div></header>
    <section className="account-card"><p className="eyebrow">ABOUT YOU</p><h2>{authReady ? authUser ? accountName : "Sign in" : "Checking account"}</h2>{authUser?.email && <p className="account-email">{authUser.email}</p>}{authUser && <form className="account-name-form" onSubmit={saveAccountName}><label htmlFor="account-name">YOUR NAME</label><div><input id="account-name" autoComplete="name" maxLength={60} required value={accountNameDraft} onChange={(event) => setAccountNameDraft(event.target.value)} /><button disabled={authBusy || !accountNameDraft.trim()}>{authBusy ? "SAVING" : "SAVE"}</button></div>{accountNameMessage && <p role="status">{accountNameMessage}</p>}</form>}<p role="status">{accountStorageMessage}</p></section>
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
      <div className="dial-tabs" role="tablist" aria-label="Choose a cycle">
        {rings.map((ring, ringIndex) => <button key={ring.cadence} type="button" role="tab" aria-selected={selectedRing === ringIndex} className={selectedRing === ringIndex ? "selected" : ""} style={selectedRing === ringIndex ? { backgroundColor: dialPalettes[ringIndex].tab } : undefined} onClick={() => setSelectedRing(ringIndex)}><span style={{ backgroundColor: urgencyColor(urgency(ring)) }} />{ring.label}</button>)}
      </div>
      <svg viewBox="0 0 340 340" className="dial split-dial" role="img" aria-label={`${activeRing.label} cleaning task wheel`}>
        <circle cx="170" cy="170" r="168" className="case" style={{ fill: activePalette.case, stroke: activePalette.tick }}/><circle cx="170" cy="170" r="161" className="case-line"/>
        {Array.from({ length: 60 }, (_, i) => { if (i === 0) return null; const a = points(157, i * 6), b = points(i % 5 ? 153 : 150, i * 6); return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="tick" style={{ stroke: activePalette.tick }}/>; })}
        <path d="M166 11 H174 L170 18 Z" className="north-marker" style={{ fill: activePalette.tick }} />
        <circle cx="170" cy="170" r="146" className="face"/><circle cx="170" cy="170" r="110" className="single-track"/>
        <path d={annularSector(82, 144, Math.min(23, activeSlot * 0.38))} className="due-window" fill={urgencyColor(urgency(activeRing))}/>
        <g transform="translate(170 170)"><g className={`ring ring-${activeRing.cadence} ${rotating === selectedRing ? "spinning" : ""}`} transform={`rotate(${activeRotation})`}>
          <g transform="translate(-170 -170)">
            <circle cx="170" cy="170" r={activeRadius} fill="none" stroke="transparent" strokeWidth={activeWell * 2.2} className="ring-press-area" onClick={() => complete(selectedRing)} />
            {activeRing.tasks.map((task, taskIndex) => { const [x, y] = points(activeRadius, taskIndex * activeSlot); return <g key={`${taskIndex}-${task.name}`} transform={`translate(${x} ${y}) rotate(${taskIndex * activeSlot})`} className={`task-well ${taskIndex === activeRing.index ? "due" : ""}`} onClick={(event) => { event.stopPropagation(); if (taskIndex === activeRing.index) complete(selectedRing); else if (activeRing.done[taskIndex]) restoreTask(selectedRing, taskIndex); else markAhead(selectedRing, taskIndex); }}>
              <circle r={activeWell} className="well"/>{taskArt[task.name] ? <image href={taskArt[task.name]} x={-activeWell + 4} y={-activeWell + 4} width={(activeWell - 4) * 2} height={(activeWell - 4) * 2} /> : <text y="6" textAnchor="middle" className="pixel-icon split-icon">{task.icon}</text>}{activeRing.done[taskIndex] && <g className="completion"><circle r={activeWell - 3} /><path d="M-7 0 l5 5 l10 -11" /></g>}
            </g>})}
          </g>
        </g></g>
        <g className="dial-knob" role="button" tabIndex={0} aria-label={`Complete ${activeTask.name}`} onClick={() => complete(selectedRing)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") complete(selectedRing); }}>
          <circle cx="170" cy="170" r="76" className="brass"/>
          {Array.from({ length: 48 }, (_, i) => { const a = points(75, i * 7.5), b = points(69, i * 7.5); return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="knob-tick"/>; })}
          <circle cx="170" cy="170" r="66" className="knob"/>
          <text x="170" y="143" textAnchor="middle" className="knob-period" fill={urgencyColor(urgency(activeRing))}>{activePeriod}</text>
          {activeTaskLines.length === 1 ? <text x="170" y="177" textAnchor="middle" className="knob-task">{activeTaskLines[0]}</text> : <><text x="170" y="169" textAnchor="middle" className="knob-task">{activeTaskLines[0]}</text><text x="170" y="187" textAnchor="middle" className="knob-task">{activeTaskLines[1]}</text></>}
          <text x="170" y="210" textAnchor="middle" className="knob-round" fill={urgencyColor(urgency(activeRing))}>ROUND {activeRing.cycle} · {activeRing.index + 1} OF {activeRing.tasks.length}</text>
        </g>
      </svg>
      <p className="tap-hint">Press a task to complete</p>
    </section>
    <section className="tasks" aria-label="Current tasks">
      <div className="section-title"><button onClick={() => setShowEditor(true)}>EDIT TASKS</button></div>
      {rings.map((ring, i) => <div key={ring.cadence} className={`task-row ${open === i ? "expanded" : ""}`}>
        <button className="row-main" onClick={() => { setSelectedRing(i); setOpen(open === i ? null : i); }}><span className="task-icon" style={{ borderColor: urgencyColor(urgency(ring)) }}><TaskIcon name={ring.tasks[ring.index].name} fallback={ring.tasks[ring.index].icon} /></span><span className="task-copy"><small>{ring.label.toUpperCase()} · {ring.index + 1} OF {ring.tasks.length}</small><strong>{ring.tasks[ring.index].name}</strong></span></button>
        <button className="done" onClick={() => complete(i)}>DONE</button>
        {open === i && <ol>{ring.tasks.map((task, j) => <li key={task.name} className={j === ring.index ? "current" : ring.done[j] ? "finished" : ""}><span>{ring.done[j] ? "✓" : <TaskIcon name={task.name} fallback={task.icon} className="task-art-list" />}</span>{task.name}{j === ring.index && <b>NOW</b>}</li>)}</ol>}
      </div>)}
    </section>
    <footer><button onClick={installApp}>Add to home screen</button><button className="cycle-link" onClick={() => setScreen("cycles")}>Cycle {totalCycles}</button></footer>
    {showInstall && <div className="sheet" onClick={() => setShowInstall(false)}><div onClick={(e) => e.stopPropagation()}><span>INSTALL CYCLES</span><h2>Keep it close at hand.</h2><p>On iPhone, tap Share, then “Add to Home Screen”. On Android, use the install prompt in your browser menu.</p><button onClick={() => setShowInstall(false)}>GOT IT</button></div></div>}
    {showEditor && <div className="sheet editor-sheet" onClick={() => setShowEditor(false)}><div onClick={(e) => e.stopPropagation()}><div className="editor-head"><span>EDIT YOUR TASKS</span><button aria-label="Close task editor" onClick={() => setShowEditor(false)}>×</button></div><h2>Keep the cycle yours.</h2><div className="ring-tabs">{rings.map((ring, index) => <button key={ring.cadence} className={editingRing === index ? "selected" : ""} onClick={() => { setEditingRing(index); setPickingIcon(null); }}>{ring.label}</button>)}</div><p className="editor-rule">Tap an icon to choose another · {rings[editingRing].tasks.length} of 12 tasks</p><div className="editor-list">{rings[editingRing].tasks.map((task, index) => <div className="editor-task" key={`${rings[editingRing].cadence}-${index}`}><div className="editor-row"><button className="editor-icon" aria-label={`Change icon for ${task.name}`} onClick={() => { setPickingIcon(pickingIcon === index ? null : index); setCustomIcon(""); }}>{task.icon}</button><input aria-label={`${rings[editingRing].label} task ${index + 1}`} maxLength={24} value={task.name} onChange={(event) => updateTaskName(index, event.target.value)} /><button aria-label={`Remove ${task.name}`} disabled={rings[editingRing].tasks.length <= 3} onClick={() => removeTask(index)}>×</button></div>{pickingIcon === index && <div className="icon-picker" aria-label={`Choose icon for ${task.name}`}>{iconOptions.map((icon) => <button key={icon} className={task.icon === icon ? "selected" : ""} aria-label={`Use ${icon} for ${task.name}`} onClick={() => { chooseTaskIcon(index, icon); setPickingIcon(null); }}>{icon}</button>)}<div className="custom-icon"><input aria-label={`Custom emoji for ${task.name}`} placeholder="Choose another emoji" value={customIcon} onChange={(event) => setCustomIcon(event.target.value)} /><button disabled={!customIcon.trim()} onClick={() => { chooseTaskIcon(index, customIcon.trim()); setPickingIcon(null); setCustomIcon(""); }}>USE</button></div></div>}</div>)}</div><button className="add-task" disabled={rings[editingRing].tasks.length >= 12} onClick={addTask}>+ ADD TASK</button><button className="editor-save" onClick={() => setShowEditor(false)}>SAVE CHANGES</button></div></div>}
  </main>;
}

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; }
