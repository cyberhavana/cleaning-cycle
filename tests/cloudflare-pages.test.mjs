import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("exports a deployable Cloudflare Pages site", async () => {
  await Promise.all([
    access(new URL("../out/index.html", import.meta.url)),
    access(new URL("../out/manifest.webmanifest", import.meta.url)),
    access(new URL("../out/sw.js", import.meta.url)),
    access(new URL("../out/click-pen.mp3", import.meta.url)),
  ]);

  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Cycles<\/title>/i);
  assert.match(html, /LIFE GOES AROUND/);
  assert.match(html, /Press a task to complete/);
  assert.match(html, /_next\/static/);
});

test("does not pin users to a stale application shell", async () => {
  const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

  assert.match(serviceWorker, /cleaning-cycle-v2/);
  assert.match(serviceWorker, /event\.request\.mode === "navigate"/);
  assert.match(serviceWorker, /fetch\(event\.request\)/);
  assert.match(serviceWorker, /caches\.delete/);
  assert.match(serviceWorker, /self\.skipWaiting\(\)/);
  assert.match(serviceWorker, /self\.clients\.claim\(\)/);
});
