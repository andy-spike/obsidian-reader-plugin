import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const directory = await mkdtemp(join(tmpdir(), "reader-following-tests-"));
await build({ entryPoints: ["src/book-note-following.ts"], bundle: true, platform: "node", format: "esm", outfile: join(directory, "following.mjs") });
const { BookNoteFollowing } = await import(pathToFileURL(join(directory, "following.mjs")));
after(() => rm(directory, { recursive: true, force: true }));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const reader = (id, notePath) => { const record = { documentId: id, annotations: [], exportRetired: true, notePath }; return { getRecord: () => record }; };

function fixture() {
  const a = reader("a", "Book notes/A.md"), b = reader("b", "Book notes/B.md");
  const tabs = new Map();
  const calls = [];
  const settings = { notePlace: "sidebar", showAnnotationsOnOpen: true };
  const workspace = {
    isCurrent: r => workspace.active === r, active: a, readers: () => [a, b],
    find: place => tabs.get(place) ?? null,
    create: place => { const tab = { place, visible: false }; tabs.set(place, tab); calls.push(["create", place]); return tab; },
    display: async (tab, record) => { tab.document = record?.documentId; tab.note = record?.notePath ?? "placeholder"; calls.push(["display", tab.place, tab.document]); },
    visible: tab => tab.visible,
    dismiss: tab => { calls.push(["dismiss", tab.place]); tab.visible = false; if (tab.place === "beside") tabs.delete(tab.place); },
    reveal: async tab => { tab.visible = true; calls.push(["reveal", tab.place]); },
  };
  const notes = {
    load: async record => { calls.push(["load", record.documentId]); },
    schedule: record => calls.push(["schedule", record.documentId]),
    open: async (record, annotationId, show) => { record.notePath ??= `Book notes/${record.documentId}.md`; const tab = await show(); calls.push(["open", record.documentId, annotationId, tab?.document]); },
  };
  const following = new BookNoteFollowing(workspace, notes, () => settings);
  return { a, b, tabs, calls, settings, workspace, notes, following };
}

test("ready loads the note before opening it and replaces a first-highlight placeholder", async () => {
  const f = fixture();
  f.a.getRecord().notePath = undefined;
  await f.following.ready(f.a);
  assert.equal(f.tabs.get("sidebar").note, "placeholder");
  assert.equal(f.calls[0][0], "load");
  f.a.getRecord().notePath = "Book notes/A.md";
  await f.following.changed("a");
  assert.equal(f.tabs.get("sidebar").note, "Book notes/A.md");
  assert.equal(f.calls.filter(c => c[0] === "create").length, 1);
});

test("switching PDFs updates both existing placements without opening or revealing tabs", async () => {
  const f = fixture();
  await f.following.ready(f.a);
  await f.following.open(f.a, null, "beside");
  f.calls.length = 0;
  await f.following.activate(f.b);
  assert.equal(f.following.current, f.b);
  assert.deepEqual([...f.tabs.values()].map(t => t.document), ["b", "b"]);
  assert.ok(f.calls.every(c => c[0] === "display"));
});

test("editing a book note selects its PDF while unrelated notes leave it alone", async () => {
  const f = fixture();
  await f.following.ready(f.a);
  await f.following.activate(null, "Book notes/B.md");
  assert.equal(f.following.current, f.b);
  await f.following.activate(null, "Personal.md");
  assert.equal(f.following.current, f.b);
});

test("dismissal survives another PDF opening and explicit toggle restores automatic opening", async () => {
  const f = fixture();
  await f.following.ready(f.a);
  await f.following.toggle();
  f.workspace.active = f.b;
  await f.following.ready(f.b);
  assert.equal(f.tabs.get("sidebar").visible, false);
  assert.equal(f.tabs.get("sidebar").document, "b");
  await f.following.toggle();
  assert.equal(f.tabs.get("sidebar").visible, true);
  f.workspace.active = f.a;
  await f.following.ready(f.a);
  assert.equal(f.tabs.get("sidebar").document, "a");
});

test("automatic opening can be disabled while explicit note requests use either place", async () => {
  const f = fixture(); f.settings.showAnnotationsOnOpen = false;
  await f.following.ready(f.a);
  assert.equal(f.tabs.size, 0);
  await f.following.open(f.a, "passage-a", "beside");
  assert.equal(f.tabs.get("beside").document, "a");
  assert.equal(f.settings.notePlace, "sidebar");
  assert.deepEqual(f.calls.at(-1), ["open", "a", "passage-a", "a"]);
  await f.following.toggle("beside");
  assert.equal(f.tabs.has("beside"), false);
});

test("stale readiness cannot reopen the previous PDF after a tab switch", async () => {
  const f = fixture(); const loaded = deferred();
  f.notes.load = () => loaded.promise;
  const opening = f.following.ready(f.a);
  await f.following.activate(f.b);
  loaded.resolve(); await opening;
  assert.equal(f.following.current, f.b);
  assert.equal(f.tabs.size, 0);
});

test("two overlapping toggles open and then dismiss rather than opening twice", async () => {
  const f = fixture();
  await f.following.activate(f.a);
  await Promise.all([f.following.toggle(), f.following.toggle()]);
  assert.equal(f.tabs.size, 1);
  assert.equal(f.tabs.get("sidebar").visible, false);
  assert.equal(f.calls.filter(c => c[0] === "create").length, 1);
});

test("opening requests are serialized and a failed request does not poison the queue", async () => {
  const f = fixture(); const pause = deferred();
  const display = f.workspace.display;
  let running = 0, maximum = 0, first = true;
  f.workspace.display = async (...args) => {
    running++; maximum = Math.max(maximum, running);
    try { if (first) { first = false; await pause.promise; throw new Error("tab failed"); } await display(...args); }
    finally { running--; }
  };
  const failed = f.following.toggle();
  const recovered = f.following.toggle();
  const rejection = assert.rejects(failed, /tab failed/);
  pause.resolve(); await rejection; await recovered;
  assert.equal(maximum, 1);
  assert.equal(f.tabs.get("sidebar").visible, true);
});

test("an explicit passage request stays tied to its PDF while its note is being written", async () => {
  const f = fixture(); const writing = deferred();
  const open = f.notes.open;
  f.notes.open = async (...args) => { await writing.promise; return open(...args); };
  const opening = f.following.open(f.a, "passage-a");
  await f.following.activate(f.b);
  writing.resolve(); await opening;
  assert.deepEqual(f.calls.at(-1), ["open", "a", "passage-a", "a"]);
});

test("disposing stops queued work and suppresses a reveal after an in-flight display", async () => {
  const f = fixture(); const pause = deferred(); const started = deferred();
  f.workspace.display = async () => { started.resolve(); await pause.promise; };
  const opening = f.following.toggle();
  await started.promise;
  const queued = f.following.toggle("beside");
  f.following.dispose(); pause.resolve();
  await opening; await queued;
  assert.equal(f.calls.some(c => c[0] === "reveal"), false);
  assert.equal(f.tabs.has("beside"), false);
});
