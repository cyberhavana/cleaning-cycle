import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Cycles dial", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Cycles<\/title>/i);
  assert.match(html, /LIFE GOES AROUND/);
  assert.match(html, /Choose a cycle/);
  assert.match(html, /Daily cleaning task wheel/);
  assert.match(html, /Press a task to complete/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("wires passwordless Supabase authentication safely", async () => {
  const [page, client, packageJson, envExample, gitignore] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase/client.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  ]);

  assert.match(page, /signInWithOtp/);
  assert.match(page, /EMAIL ME A SIGN-IN LINK/);
  assert.match(page, /auth\.updateUser/);
  assert.match(page, /account-name/);
  assert.match(page, /auth\.signOut\(\)/);
  assert.match(client, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(client, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(client, /flowType:\s*"implicit"/);
  assert.doesNotMatch(client, /service_role|SUPABASE_SECRET_KEY/i);
  assert.match(packageJson, /"@supabase\/supabase-js": "2\.117\.0"/);
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key/);
  assert.doesNotMatch(envExample, /service_role|SUPABASE_SECRET_KEY/i);
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
});

test("defines the Supabase Cycles data model without persisted rotation", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260922211733_create_cycles_data_model.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /create table public\.profiles/i);
  assert.match(migration, /user_id uuid primary key references auth\.users \(id\)/i);
  assert.match(migration, /display_name text not null/i);
  assert.match(migration, /create table public\.rings/i);
  assert.match(migration, /cadence in \('daily', 'weekly', 'monthly'\)/i);
  assert.match(migration, /active_task_position smallint not null/i);
  assert.match(migration, /cycle_count bigint not null/i);
  assert.match(migration, /current_since timestamptz not null/i);
  assert.match(migration, /create table public\.tasks/i);
  assert.match(migration, /foreign key \(ring_id, user_id\)/i);
  assert.match(migration, /position smallint not null/i);
  assert.match(migration, /completed boolean not null default false/i);
  assert.match(migration, /alter table public\.profiles enable row level security/i);
  assert.match(migration, /alter table public\.rings enable row level security/i);
  assert.match(migration, /alter table public\.tasks enable row level security/i);
  assert.doesNotMatch(migration, /^\s*rotation\s/m);
});

test("syncs profiles, rings, and tasks without persisting visual rotation", async () => {
  const [page, sync] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase/ring-sync.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /loadOrCreateProfile\(/);
  assert.match(page, /loadCloudRings\(/);
  assert.match(page, /saveCloudRings\(/);
  assert.match(page, /saveProfileName\(/);
  assert.match(page, /`\$\{LEGACY_STORAGE_KEY\}:\$\{userId\}`/);
  assert.match(page, /Your tasks and cycles are synced to your account\./);
  assert.match(page, /localStorage\.removeItem\(LEGACY_STORAGE_KEY\)/);

  assert.match(sync, /\.from\("profiles"\)/);
  assert.match(sync, /\.from\("rings"\)/);
  assert.match(sync, /\.from\("tasks"\)/);
  assert.match(sync, /onConflict:\s*"user_id,cadence"/);
  assert.match(sync, /onConflict:\s*"ring_id,position"/);
  assert.match(sync, /tasks:tasks!tasks_ring_owner_fkey/);
  assert.match(sync, /const rotation = normalizedRotation\(index, taskCount\)/);
  assert.doesNotMatch(sync, /\brotation:\s*ring\.rotation\b/);
  assert.doesNotMatch(sync, /\bprevious_rotation\b/);
});

test("keeps task-name inputs mounted while their values change", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /key=\{`\$\{rings\[editingRing\]\.cadence\}-\$\{index\}`\}/);
  assert.doesNotMatch(page, /key=\{`\$\{task\.name\}-\$\{index\}`\}/);
});

test("prevents iOS from auto-zooming editable fields", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(styles, /\.editor-row input\{[^}]*font:16px/);
  assert.match(styles, /\.custom-icon input\{[^}]*font:16px/);
  assert.match(styles, /\.account-auth input\{[^}]*font:16px/);
  assert.match(styles, /\.account-name-form input\{[^}]*font:16px/);
});

test("splits the dial into selectable cycle wheels while retaining sans-serif type", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /aria-label="Choose a cycle"/);
  assert.match(page, /const \[selectedRing, setSelectedRing\]/);
  assert.match(page, /ROUND \{activeRing\.cycle\}/);
  assert.match(page, /activeRing\.tasks\.map/);
  assert.doesNotMatch(page, /Three rotating cleaning task rings/);
  assert.match(styles, /--sans:"Avenir Next"/);
  assert.match(styles, /\.single-track\{[^}]*stroke-width:52/);
});
