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
  assert.match(html, /Three rotating cleaning task rings/);
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
