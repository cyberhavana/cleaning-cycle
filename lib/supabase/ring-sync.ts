import type { SupabaseClient } from "@supabase/supabase-js";

export type Cadence = "daily" | "weekly" | "monthly";

export type RingState = {
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

type CloudTask = {
  position: number;
  name: string;
  icon: string;
  completed: boolean;
};

type CloudRing = {
  id: number | string;
  cadence: Cadence;
  active_task_position: number;
  cycle_count: number | string;
  current_since: string;
  tasks: CloudTask[];
};

const CADENCES: Cadence[] = ["daily", "weekly", "monthly"];

const errorMessage = (error: { message?: string } | null, fallback: string) =>
  error?.message || fallback;

const normalizedRotation = (index: number, taskCount: number) =>
  -(index * 360) / taskCount;

const timestamp = (value: number) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
};

export function normalizeRing(ring: RingState): RingState {
  const taskCount = Math.max(1, ring.tasks.length);
  const index = Math.min(Math.max(0, ring.index), taskCount - 1);
  const rotation = normalizedRotation(index, taskCount);
  return {
    ...ring,
    index,
    done: ring.tasks.map((_, position) => Boolean(ring.done[position])),
    rotation,
    previousRotation: rotation,
  };
}

function cloudRingToState(row: CloudRing | undefined, fallback: RingState): RingState {
  if (!row) return normalizeRing(fallback);

  const cloudTasks = [...(row.tasks || [])].sort((a, b) => a.position - b.position);
  const tasks = cloudTasks.length
    ? cloudTasks.map(({ name, icon }) => ({ name, icon }))
    : fallback.tasks;
  const done = cloudTasks.length
    ? cloudTasks.map(({ completed }) => completed)
    : fallback.done;
  const parsedSince = Date.parse(row.current_since);

  return normalizeRing({
    ...fallback,
    tasks,
    done,
    index: row.active_task_position,
    cycle: Number(row.cycle_count),
    currentSince: Number.isFinite(parsedSince) ? parsedSince : Date.now(),
  });
}

export async function loadCloudRings(
  client: SupabaseClient,
  userId: string,
  fallbackRings: RingState[],
): Promise<RingState[] | null> {
  const { data, error } = await client
    .from("rings")
    .select("id, cadence, active_task_position, cycle_count, current_since, tasks:tasks!tasks_ring_owner_fkey(position, name, icon, completed)")
    .eq("user_id", userId);

  if (error) throw new Error(errorMessage(error, "Could not load your cycles."));
  if (!data?.length) return null;

  const rows = data as CloudRing[];
  return CADENCES.map((cadence) => {
    const fallback = fallbackRings.find((ring) => ring.cadence === cadence);
    if (!fallback) throw new Error(`Missing ${cadence} ring defaults.`);
    return cloudRingToState(rows.find((ring) => ring.cadence === cadence), fallback);
  });
}

export async function saveCloudRings(
  client: SupabaseClient,
  userId: string,
  rings: RingState[],
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const { data: savedRings, error: ringError } = await client
    .from("rings")
    .upsert(
      rings.map((ring) => ({
        user_id: userId,
        cadence: ring.cadence,
        active_task_position: ring.index,
        cycle_count: ring.cycle,
        current_since: timestamp(ring.currentSince),
        updated_at: updatedAt,
      })),
      { onConflict: "user_id,cadence" },
    )
    .select("id, cadence");

  if (ringError) throw new Error(errorMessage(ringError, "Could not save your cycles."));
  if (!savedRings || savedRings.length !== rings.length) {
    throw new Error("Not all cycle rings were saved.");
  }

  const ringIds = new Map(
    (savedRings as { id: number | string; cadence: Cadence }[]).map((ring) => [ring.cadence, ring.id]),
  );
  const taskRows = rings.flatMap((ring) => {
    const ringId = ringIds.get(ring.cadence);
    if (!ringId) throw new Error(`Missing saved ${ring.cadence} ring.`);
    return ring.tasks.map((task, position) => ({
      ring_id: ringId,
      user_id: userId,
      position,
      name: task.name.trim() || "Untitled task",
      icon: task.icon,
      completed: Boolean(ring.done[position]),
      updated_at: updatedAt,
    }));
  });

  const { error: taskError } = await client
    .from("tasks")
    .upsert(taskRows, { onConflict: "ring_id,position" });

  if (taskError) throw new Error(errorMessage(taskError, "Could not save your tasks."));

  await Promise.all(rings.map(async (ring) => {
    const ringId = ringIds.get(ring.cadence);
    if (!ringId) return;
    const { error } = await client
      .from("tasks")
      .delete()
      .eq("ring_id", ringId)
      .gte("position", ring.tasks.length);
    if (error) throw new Error(errorMessage(error, `Could not remove old ${ring.cadence} tasks.`));
  }));
}

export async function loadOrCreateProfile(
  client: SupabaseClient,
  userId: string,
  fallbackDisplayName: string,
): Promise<string> {
  const { data, error } = await client
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(errorMessage(error, "Could not load your profile."));
  if (data?.display_name) return data.display_name;

  const displayName = fallbackDisplayName.trim() || "Your account";
  const { error: insertError } = await client.from("profiles").insert({
    user_id: userId,
    display_name: displayName,
  });
  if (insertError) throw new Error(errorMessage(insertError, "Could not create your profile."));
  return displayName;
}

export async function saveProfileName(
  client: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<void> {
  const { error } = await client.from("profiles").upsert({
    user_id: userId,
    display_name: displayName,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(errorMessage(error, "Could not save your profile."));
}
