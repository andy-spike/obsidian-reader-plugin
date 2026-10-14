import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const directory = await mkdtemp(join(tmpdir(), "reader-tests-"));
await build({ entryPoints: ["src/annotations.ts"], bundle: true, platform: "node", format: "esm", outfile: join(directory, "annotations.mjs") });
const { AnnotationStore, parseRecord, fingerprint } = await import(pathToFileURL(join(directory, "annotations.mjs")));
const hash = fingerprint(new Uint8Array([1, 2, 3]).buffer);
function storage() {
  const files = new Map();
  let failing = "";
  return { files, fail: path => { failing = path; }, adapter: {
    exists: async path => path === ".reader-annotations" || files.has(path), mkdir: async () => {},
    list: async () => ({ files: [...files.keys()] }), read: async path => files.get(path),
    write: async (path, text) => { if (path.endsWith(failing) && failing) throw new Error("disk full"); files.set(path, text); },
  }};
}
const annotation = { id: "annotation-1", page: 2, color: "green", quote: { exact: "Evidence\nmatters", prefix: "", suffix: "" }, position: { start: 10, end: 26 }, rects: [{ x: .1, y: .2, width: .3, height: .04 }], comment: "My reading note", createdAt: new Date().toISOString() };
test("reopens annotations with stable identity and writes only the JSON record", async () => {
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const record = await store.open("Books/Book.pdf", hash);
  record.annotations.push(annotation); await store.save(record);
  const reopened = await new AnnotationStore(disk.adapter).open("Books/Book.pdf", hash);
  assert.deepEqual(reopened, record);
  assert.deepEqual([...disk.files.keys()], [`.reader-annotations/${record.documentId}.json`]);
});
test("serializes simultaneous opens and retains edits from multiple leaves", async () => {
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const [one, two] = await Promise.all([store.open("Book.pdf", hash), store.open("Book.pdf", hash)]);
  assert.equal(one, two); one.annotations.push(annotation);
  await Promise.all([store.save(one), store.save(two)]);
  assert.equal(parseRecord(disk.files.get(`.reader-annotations/${one.documentId}.json`)).annotations.length, 1);
});
test("rename and external move preserve identity while changed editions are rejected", async () => {
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const record = await store.open("Book.pdf", hash); record.annotations.push(annotation); await store.save(record);
  await store.rename("Book.pdf", "Renamed.pdf"); assert.equal(record.sourcePath, "Renamed.pdf");
  const moved = await new AnnotationStore(disk.adapter).open("Moved.pdf", hash); assert.equal(moved.documentId, record.documentId);
  await assert.rejects(store.open("Renamed.pdf", "b".repeat(64)), /changed/);
});
test("a failed write keeps the previous record and can be retried", async () => {
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const record = await store.open("Book.pdf", hash); record.annotations.push(annotation); disk.fail(".json");
  await assert.rejects(store.save(record), /disk full/);
  assert.equal(parseRecord(disk.files.get(`.reader-annotations/${record.documentId}.json`)).annotations.length, 0);
  disk.fail(""); await store.save(record);
  assert.equal(parseRecord(disk.files.get(`.reader-annotations/${record.documentId}.json`)).annotations.length, 1);
});
test("corrupt selectors are rejected without replacing the record", async () => {
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const record = await store.open("Book.pdf", hash); record.annotations.push({ ...annotation, rects: [{ x: 5, y: 0, width: 1, height: 1 }] });
  const path = `.reader-annotations/${record.documentId}.json`; disk.files.set(path, JSON.stringify(record));
  await assert.rejects(new AnnotationStore(disk.adapter).open("Book.pdf", hash), /Invalid/);
  assert.equal(JSON.parse(disk.files.get(path)).annotations[0].rects[0].x, 5);
});
test("custom color IDs are valid", async () => {
  const disk = storage();
  const store = new AnnotationStore(disk.adapter);
  const record = await store.open("Book.pdf", hash);
  record.annotations.push({ ...annotation, color: "color-k1" });
  await store.save(record);
  assert.equal(parseRecord(disk.files.get(`.reader-annotations/${record.documentId}.json`)).annotations[0].color, "color-k1");
  assert.throws(() => parseRecord(JSON.stringify({ ...record, annotations: [{ ...annotation, color: "not a color" }] })), /Invalid/);
});
test("relocating moves every record, with a Markdown file an older version generated, and later saves use the new folder", async () => {
  const files = new Map(); const folders = new Set();
  const inFolder = (folder, path) => path.startsWith(folder + "/") && !path.slice(folder.length + 1).includes("/");
  const adapter = {
    exists: async path => files.has(path) || folders.has(path), mkdir: async path => { folders.add(path); },
    list: async path => ({ files: [...files.keys()].filter(file => inFolder(path, file)) }), read: async path => files.get(path),
    write: async (path, text) => { files.set(path, text); },
  };
  const store = new AnnotationStore(adapter);
  const record = await store.open("Book.pdf", hash);
  files.set(".reader-annotations/notes.txt", "user file");
  files.set(`.reader-annotations/${record.documentId}.md`, "generated by an older version");
  const moved = [];
  const count = await store.relocate("Reading/Annotations", async (from, to) => { moved.push(to); files.set(to, files.get(from)); files.delete(from); });
  assert.equal(count, 1);
  assert.deepEqual(moved.sort(), [`Reading/Annotations/${record.documentId}.json`, `Reading/Annotations/${record.documentId}.md`]);
  assert.equal(files.get(".reader-annotations/notes.txt"), "user file");
  record.annotations.push(annotation); await store.save(record);
  assert.equal(parseRecord(files.get(`Reading/Annotations/${record.documentId}.json`)).annotations.length, 1);
  assert.equal(files.has(`.reader-annotations/${record.documentId}.json`), false);
  const reopened = await new AnnotationStore(adapter, { folder: "Reading/Annotations" }).open("Book.pdf", hash);
  assert.equal(reopened.documentId, record.documentId);
});
after(() => rm(directory, { recursive: true, force: true }));

test("identical PDFs at existing paths have separate annotation identities", async () => {
  const disk = storage(); disk.files.set("Original.pdf", "PDF bytes");
  const store = new AnnotationStore(disk.adapter);
  const original = await store.open("Original.pdf", hash);
  const copy = await store.open("Copy.pdf", hash);
  assert.notEqual(original.documentId, copy.documentId);
  assert.equal(original.sourcePath, "Original.pdf");
});

test("folder renames update nested source paths without changing document IDs", async () => {
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const record = await store.open("Books/Chapters/Book.pdf", hash);
  const id = record.documentId;
  await store.rename("Books", "Reading");
  assert.equal(record.sourcePath, "Reading/Chapters/Book.pdf");
  assert.equal(record.documentId, id);
  assert.equal(parseRecord(disk.files.get(`.reader-annotations/${id}.json`)).sourcePath, "Reading/Chapters/Book.pdf");
});
test("edits notify every subscriber immediately and saving state reflects the latest revision", async () => {
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const record = await store.open("Book.pdf", hash);
  const observed = []; const secondView = [];
  const off = store.subscribe(r => observed.push({ comment: r.annotations[0]?.comment, ...store.state(r) }));
  store.subscribe(r => secondView.push(r.annotations[0]?.comment));
  record.annotations.push({ ...annotation, comment: "First edit" });
  const first = store.save(record);
  assert.equal(observed[0].comment, "First edit"); assert.equal(observed[0].saving, true);
  record.annotations[0].comment = "Second edit";
  const second = store.save(record);
  assert.equal(secondView.at(-1), "Second edit");
  await Promise.all([first, second]);
  assert.equal(store.state(record).saving, false);
  assert.equal(parseRecord(disk.files.get(`.reader-annotations/${record.documentId}.json`)).annotations[0].comment, "Second edit");
  off(); store.dispose();
});
test("a failed save retries automatically after the local write problem clears", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const record = await store.open("Book.pdf", hash);
  record.annotations.push(annotation); disk.fail(".json");
  await assert.rejects(store.save(record), /disk full/);
  assert.equal(store.state(record).error, "disk full");
  disk.fail("");
  const saved = new Promise(resolve => store.subscribe(r => { if (!store.state(r).saving && !store.state(r).error) resolve(); }));
  t.mock.timers.tick(2000);
  await saved;
  assert.equal(parseRecord(disk.files.get(`.reader-annotations/${record.documentId}.json`)).annotations.length, 1);
  store.dispose();
});
test("an edit made during a write goes into the next write", async () => {
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const record = await store.open("Book.pdf", hash); record.annotations.push({ ...annotation, comment: "Before" });
  const writes = []; const original = disk.adapter.write;
  let editing = true;
  disk.adapter.write = async (path, content) => {
    writes.push({ path, content }); await original(path, content);
    if (editing && path.endsWith(".json")) { editing = false; record.annotations[0].comment = "After"; void store.save(record); }
  };
  await store.save(record);
  // Waiting on one more queued save also waits for the edit generated during the first JSON write.
  await store.save(record);
  assert.equal(JSON.parse(writes[0].content).annotations[0].comment, "Before");
  assert.equal(JSON.parse(writes[1].content).annotations[0].comment, "After");
  store.dispose();
});

test("the book note path and export flag are optional and checked", () => {
  const record = { version: 1, documentId: "doc-1", sourcePath: "Book.pdf", fingerprint: hash, annotations: [] };
  assert.equal(parseRecord(JSON.stringify({ ...record, notePath: "Book notes/Book.md", exportRetired: true })).exportRetired, true);
  assert.throws(() => parseRecord(JSON.stringify({ ...record, exportRetired: "yes" })), /Unsupported/);
});
