import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const directory = await mkdtemp(join(tmpdir(), "reader-state-tests-"));
await build({ entryPoints: ["src/reading-state.ts"], bundle: true, define: { window: "globalThis" }, platform: "node", format: "esm", outfile: join(directory, "state.mjs") });
const { SavedReadingState } = await import(pathToFileURL(join(directory, "state.mjs")));
after(() => rm(directory, { recursive: true, force: true }));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const position = page => ({ page, offset: 0.25, zoom: "width" });
const parseSettings = data => ({ theme: data?.theme ?? "default" });
function fixture(t, initial = {}) {
  let disk = structuredClone(initial);
  const writes = [], errors = [];
  const storage = { read: async () => structuredClone(disk), write: async data => { writes.push(structuredClone(data)); disk = structuredClone(data); } };
  const state = new SavedReadingState(initial, storage, parseSettings, error => errors.push(error));
  t.after(() => state.close().catch(() => {}));
  return { state, storage, writes, errors, external: data => { disk = structuredClone(data); }, disk: () => disk };
}

test("settings and valid positions load without exposing mutable positions", async t => {
  const f = fixture(t, { theme: "dark", positions: { "A.pdf": position(3), zero: position(0), fraction: position(1.5), badOffset: { ...position(1), offset: Infinity }, badZoom: { ...position(1), zoom: -1 } } });
  assert.equal(f.state.settings.theme, "dark");
  assert.deepEqual(f.state.position("A.pdf"), position(3));
  for (const path of ["zero", "fraction", "badOffset", "badZoom"]) assert.equal(f.state.position(path), undefined);
  f.state.position("A.pdf").page = 99;
  assert.equal(f.state.position("A.pdf").page, 3);
});

test("scrolling debounces writes and settings share the same snapshot", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(t);
  f.state.remember("A.pdf", position(1));
  t.mock.timers.tick(500);
  f.state.remember("A.pdf", position(2));
  f.state.settings.theme = "dark";
  t.mock.timers.tick(999); assert.equal(f.writes.length, 0);
  t.mock.timers.tick(1); await f.state.flush();
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.disk(), { theme: "dark", positions: { "A.pdf": position(2) } });
});

test("external settings and saved positions are adopted while pending local positions win", async t => {
  const f = fixture(t, { positions: { "A.pdf": position(1), "B.pdf": position(1) } });
  f.state.remember("A.pdf", position(4));
  f.external({ theme: "external", positions: { "A.pdf": position(2), "B.pdf": position(7) } });
  await f.state.reload(); await f.state.flush();
  assert.deepEqual(f.disk(), { theme: "external", positions: { "B.pdf": position(7), "A.pdf": position(4) } });
});

test("external changes during a pending write survive its stale snapshot", async t => {
  const f = fixture(t); const started = deferred(), finish = deferred(); const write = f.storage.write;
  let first = true;
  f.storage.write = async data => { if (first) { first = false; started.resolve(); await finish.promise; } await write(data); };
  f.state.remember("A.pdf", position(4));
  const saving = f.state.flush(); await started.promise;
  f.external({ theme: "external", positions: { "A.pdf": position(1), "B.pdf": position(7) } });
  await f.state.reload();
  assert.equal(f.state.position("A.pdf").page, 4);
  finish.resolve(); await saving;
  assert.equal(f.writes.length, 2);
  assert.deepEqual(f.disk(), { theme: "external", positions: { "B.pdf": position(7), "A.pdf": position(4) } });
});

test("edits and explicit saves during a write serialize complete snapshots", async t => {
  const f = fixture(t); const started = deferred(), finish = deferred(); const write = f.storage.write;
  let active = 0, maximum = 0, first = true;
  f.storage.write = async data => {
    active++; maximum = Math.max(maximum, active);
    try { if (first) { first = false; started.resolve(); await finish.promise; } await write(data); }
    finally { active--; }
  };
  f.state.remember("A.pdf", position(1));
  const firstSave = f.state.flush(); await started.promise;
  f.state.remember("A.pdf", position(2)); f.state.settings.theme = "dark";
  const secondSave = f.state.flush();
  finish.resolve(); await Promise.all([firstSave, secondSave]);
  assert.equal(maximum, 1);
  assert.deepEqual(f.writes.map(w => [w.positions["A.pdf"].page, w.theme]), [[1, "default"], [2, "dark"]]);
});

test("failed writes retain pending local positions through reload and retry automatically", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(t); const write = f.storage.write;
  f.storage.write = async () => { throw new Error("disk full"); };
  f.state.remember("A.pdf", position(9));
  await assert.rejects(f.state.flush(), /disk full/);
  f.external({ theme: "external", positions: { "A.pdf": position(1) } });
  await f.state.reload(); assert.equal(f.state.position("A.pdf").page, 9);
  f.storage.write = write;
  t.mock.timers.tick(1000); await f.state.flush();
  assert.equal(f.disk().positions["A.pdf"].page, 9);
  assert.equal(f.disk().theme, "external");
});

test("background write failures are reported and close cancels retries", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(t); const attempted = deferred();
  f.storage.write = async () => { attempted.resolve(); throw new Error("disk full"); };
  f.state.remember("A.pdf", position(1)); t.mock.timers.tick(1000);
  await attempted.promise;
  await assert.rejects(f.state.flush(), /disk full/);
  // The background caller observes the same rejection as the explicit caller.
  await Promise.resolve();
  assert.equal(f.errors[0]?.message, "disk full");
  await assert.rejects(f.state.close(), /disk full/);
  f.storage.write = async () => { throw new Error("unexpected retry"); };
  t.mock.timers.tick(10000); await Promise.resolve();
  assert.equal(f.errors.length, 1);
});

test("file and folder renames cannot be resurrected by an external reload", async t => {
  const f = fixture(t, { positions: { "Books/A.pdf": position(3), "Books/Sub/B.pdf": position(4), "Else.pdf": position(5) } });
  f.state.rename("Books", "Reading"); f.state.rename("Else.pdf", "Other.pdf");
  await f.state.reload(); await f.state.flush();
  assert.deepEqual(f.disk().positions, { "Reading/A.pdf": position(3), "Reading/Sub/B.pdf": position(4), "Other.pdf": position(5) });
});

test("only the 200 most recently read books survive eviction and reload", async t => {
  const f = fixture(t);
  for (let i = 0; i < 200; i++) f.state.remember(`${i}.pdf`, position(i + 1));
  f.state.remember("0.pdf", position(1));
  f.state.remember("new.pdf", position(1));
  f.external({ positions: { "1.pdf": position(2), "external.pdf": position(2) } });
  await f.state.reload(); await f.state.flush();
  assert.equal(Object.keys(f.disk().positions).length, 200);
  assert.equal(f.disk().positions["1.pdf"], undefined);
  assert.equal(f.disk().positions["external.pdf"], undefined);
  assert.deepEqual(f.disk().positions["0.pdf"], position(1));
});

test("a later external reload takes precedence over an older slow read", async t => {
  const f = fixture(t); const slow = deferred(); let first = true;
  f.storage.read = () => first ? (first = false, slow.promise) : Promise.resolve({ theme: "newer" });
  const old = f.state.reload(); await f.state.reload();
  slow.resolve({ theme: "older" }); await old;
  assert.equal(f.state.settings.theme, "newer");
});

test("close flushes final positions and ignores subsequent events", async t => {
  const f = fixture(t);
  f.state.remember("A.pdf", position(5));
  await f.state.close();
  f.state.remember("A.pdf", position(9)); f.state.rename("A.pdf", "B.pdf");
  f.external({ theme: "unrelated" }); await f.state.reload();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].positions["A.pdf"].page, 5);
  assert.equal(f.state.position("A.pdf").page, 5);
  assert.equal(f.state.position("B.pdf"), undefined);
});

test("close retries a failed settings-only save even without position edits", async t => {
  const f = fixture(t); const write = f.storage.write;
  f.state.settings.theme = "dark";
  f.storage.write = async () => { throw new Error("disk full"); };
  await assert.rejects(f.state.flush(), /disk full/);
  f.storage.write = write; await f.state.close();
  assert.equal(f.disk().theme, "dark");
});
