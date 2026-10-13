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
    exists: async path => path === "Reader annotations" || files.has(path), mkdir: async () => {},
    list: async () => ({ files: [...files.keys()] }), read: async path => files.get(path),
    write: async (path, text) => { if (path.endsWith(failing) && failing) throw new Error("disk full"); files.set(path, text); },
  }};
}
const annotation = { id: "annotation-1", page: 2, color: "green", quote: { exact: "Evidence\nmatters", prefix: "", suffix: "" }, position: { start: 10, end: 26 }, rects: [{ x: .1, y: .2, width: .3, height: .04 }], comment: "My reading note", createdAt: new Date().toISOString() };
test("reopens annotations with stable identity and generates linkable Markdown", async () => {
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const record = await store.open("Books/Book.pdf", hash);
  record.annotations.push(annotation); await store.save(record);
  const reopened = await new AnnotationStore(disk.adapter).open("Books/Book.pdf", hash);
  assert.deepEqual(reopened, record);
  const md = disk.files.get(`Reader annotations/${record.documentId}.md`);
  assert.match(md, /> Evidence\n> matters/); assert.match(md, /\^annotation-1/); assert.match(md, /page=2/); assert.match(md, /My reading note/);
});
test("serializes simultaneous opens and retains edits from multiple leaves", async () => {
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const [one, two] = await Promise.all([store.open("Book.pdf", hash), store.open("Book.pdf", hash)]);
  assert.equal(one, two); one.annotations.push(annotation);
  await Promise.all([store.save(one), store.save(two)]);
  assert.equal(parseRecord(disk.files.get(`Reader annotations/${one.documentId}.json`)).annotations.length, 1);
});
test("rename and external move preserve identity while changed editions are rejected", async () => {
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const record = await store.open("Book.pdf", hash); record.annotations.push(annotation); await store.save(record);
  await store.rename("Book.pdf", "Renamed.pdf"); assert.equal(record.sourcePath, "Renamed.pdf");
  const moved = await new AnnotationStore(disk.adapter).open("Moved.pdf", hash); assert.equal(moved.documentId, record.documentId);
  await assert.rejects(store.open("Renamed.pdf", "b".repeat(64)), /changed/);
});
test("failed Markdown writes preserve authoritative JSON and can be retried", async () => {
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const record = await store.open("Book.pdf", hash); record.annotations.push(annotation); disk.fail(".md");
  await assert.rejects(store.save(record), /disk full/);
  assert.equal(parseRecord(disk.files.get(`Reader annotations/${record.documentId}.json`)).annotations.length, 1);
  disk.fail(""); await store.save(record); assert.match(disk.files.get(`Reader annotations/${record.documentId}.md`), /My reading note/);
});
test("corrupt selectors are rejected without replacing the record", async () => {
  const disk = storage(); const store = new AnnotationStore(disk.adapter);
  const record = await store.open("Book.pdf", hash); record.annotations.push({ ...annotation, rects: [{ x: 5, y: 0, width: 1, height: 1 }] });
  const path = `Reader annotations/${record.documentId}.json`; disk.files.set(path, JSON.stringify(record));
  await assert.rejects(new AnnotationStore(disk.adapter).open("Book.pdf", hash), /Invalid/);
  assert.equal(JSON.parse(disk.files.get(path)).annotations[0].rects[0].x, 5);
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
  assert.match(disk.files.get(`Reader annotations/${id}.md`), /Reading\/Chapters\/Book.pdf/);
});
