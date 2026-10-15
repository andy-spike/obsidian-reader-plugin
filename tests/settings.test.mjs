import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const directory = await mkdtemp(join(tmpdir(), "reader-settings-tests-"));
// Settings code imports Obsidian, which only exists inside the app. These stand-ins cover what loading settings needs.
const obsidian = {
  name: "obsidian-stub",
  setup(build) {
    build.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `export class AbstractInputSuggest {} export class PluginSettingTab {} export class Setting {} export class Scope {} export class Notice {} export class TFolder {}
        export const setIcon = () => {}; export const normalizePath = path => path.replace(/\\/+/g, "/").replace(/^\\/|\\/$/g, "");`,
      loader: "js",
    }));
  },
};
await build({ entryPoints: ["src/settings.ts"], bundle: true, platform: "node", format: "esm", outfile: join(directory, "settings.mjs"), plugins: [obsidian] });
const { loadSettings, FIXED_COLORS } = await import(pathToFileURL(join(directory, "settings.mjs")));
after(() => rm(directory, { recursive: true, force: true }));

const ids = settings => settings.colors.map(color => color.id);

test("new installs start with Primary and Secondary", () => {
  assert.equal(FIXED_COLORS, 2);
  assert.deepEqual(loadSettings(null).colors.map(color => color.name), ["Primary", "Secondary"]);
});

test("Primary and Secondary come first and keep their own name and color", () => {
  const settings = loadSettings({ colors: [
    { id: "color-a", name: "Question", value: "#112233" },
    { id: "blue", name: "Idea", value: "#445566" },
    { id: "yellow", name: "Key point", value: "#778899" },
  ] });
  assert.deepEqual(settings.colors, [
    { id: "yellow", name: "Key point", value: "#778899" },
    { id: "blue", name: "Idea", value: "#445566" },
    { id: "color-a", name: "Question", value: "#112233" },
  ]);
});

test("removed defaults come back, and added colors keep their order", () => {
  const settings = loadSettings({ colors: [
    { id: "color-b", name: "B", value: "#000000" },
    { id: "color-a", name: "A", value: "#ffffff" },
  ] });
  assert.deepEqual(ids(settings), ["yellow", "blue", "color-b", "color-a"]);
});

test("duplicate and invalid colors are dropped", () => {
  const settings = loadSettings({ colors: [
    { id: "yellow", name: "Primary", value: "#f5d94d" },
    { id: "color-a", name: "A", value: "#ffffff" },
    { id: "color-a", name: "A again", value: "#000000" },
    { id: "bad id!", name: "Bad", value: "#ffffff" },
    { id: "color-c", name: "C", value: "red" },
  ] });
  assert.deepEqual(ids(settings), ["yellow", "blue", "color-a"]);
  assert.equal(settings.colors[2].name, "A");
});

test("version 0.1 names load with the defaults first", () => {
  const settings = loadSettings({ labels: { yellow: "Main", green: "Example", blue: "Detail", pink: "Doubt" } });
  assert.deepEqual(settings.colors.map(color => `${color.id}:${color.name}`), ["yellow:Main", "blue:Detail", "green:Example", "pink:Doubt"]);
});

test("book note settings have defaults and clean paths", () => {
  const defaults = loadSettings(null);
  assert.equal(defaults.notesFolder, "Book notes");
  assert.equal(defaults.folder, ".reader-annotations");
  assert.equal(loadSettings({ folder: "Reader annotations" }).folder, "Reader annotations", "kept, so the plugin can move it once");
  assert.equal(defaults.noteTemplate, "");
  assert.equal(defaults.highlightMode, false);
  assert.equal(defaults.showAnnotationsOnOpen, true);
  assert.equal(defaults.notePlace, "sidebar");
  assert.equal(defaults.keepWritingOfDeletedHighlights, false);
  assert.equal(loadSettings({ keepWritingOfDeletedHighlights: true }).keepWritingOfDeletedHighlights, true);
  assert.equal(loadSettings({ keepWritingOfDeletedHighlights: "yes" }).keepWritingOfDeletedHighlights, false);
  assert.equal(loadSettings({ notePlace: "beside" }).notePlace, "beside");
  assert.equal(loadSettings({ notePlace: "window" }).notePlace, "sidebar");
  assert.equal(loadSettings({ showAnnotationsOnOpen: false }).showAnnotationsOnOpen, false);
  assert.equal(loadSettings({ showAnnotationsOnOpen: "no" }).showAnnotationsOnOpen, true);
  assert.equal(defaults.highlightModeColor, "yellow");
  assert.equal(loadSettings({ highlightModeColor: "blue" }).highlightModeColor, "blue");
  assert.equal(loadSettings({ highlightModeColor: "not an id" }).highlightModeColor, "yellow");
  assert.equal(loadSettings({ highlightMode: true }).highlightMode, true);
  assert.equal(loadSettings({ highlightMode: "yes" }).highlightMode, false);
  const saved = loadSettings({ notesFolder: " /Reading/Notes/ ", noteTemplate: "Templates/Book.md" });
  assert.equal(saved.notesFolder, "Reading/Notes");
  assert.equal(saved.noteTemplate, "Templates/Book.md");
  assert.equal(loadSettings({ notesFolder: "/" }).notesFolder, "Book notes");
});
