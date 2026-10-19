// Runs against real, windowless Obsidian through the project's headless launcher.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./dev-vault.mjs";
import { samplePdf } from "./sample-pdf.mjs";

const launcher = join(root, "scripts/headless.mjs");
const run = (...args) => execFileSync(process.execPath, [launcher, ...args], { cwd: root, encoding: "utf8", timeout: 60000 }).trim();
const evaluate = code => JSON.parse(run("eval", `(async () => ({ value: await (async () => { ${code} })() }))()`)).value;
const check = (condition, message) => evaluate(`if (!(${condition})) throw new Error(${JSON.stringify(message)}); return true;`);
const waitFor = (condition, message) => evaluate(`
  for (let i = 0; i < 150; i++) {
    if (await (${condition})) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(${JSON.stringify(message)});
`);
const plugin = 'app.plugins.plugins["reading-desk"]';
const folder = `Reader E2E ${Date.now()}`;
let source = `${folder}/First.pdf`;
const second = `${folder}/Second.pdf`;
const reader = () => `app.workspace.getLeavesOfType("reader-plugin-pdf").find(l => l.view.file?.path === ${JSON.stringify(source)}).view`;
const record = () => `${reader()}.getRecord()`;
const selector = target => `[data-reader-e2e="active"] ${target}`;
const click = target => run("click", selector(target));
/** The text of a highlight's quote note, or null when it has none. */
const quoteNote = (index = 0) => `(async () => { const file = ${plugin}.quoteNotes.find(${record()}.annotations[${index}].id); return file ? await app.vault.read(file) : null; })()`;
const cards = `app.workspace.getLeavesOfType('reader-plugin-annotations').find(l => l.getRoot() === app.workspace.rightSplit)?.view.contentEl`;
const press = key => run("press", key);
let originalSettings;
const recordPaths = new Set();
const notePaths = new Set();
let passed = 0;

function step(name, test) {
  test();
  console.log(`PASS ${name}`);
  passed++;
}

function activate() {
  evaluate(`
    document.querySelectorAll("[data-reader-e2e]").forEach(el => delete el.dataset.readerE2e);
    const view = ${reader()};
    await app.workspace.revealLeaf(view.leaf);
    app.workspace.setActiveLeaf(view.leaf, { focus: true });
    view.contentEl.dataset.readerE2e = "active";
    view.contentEl.querySelector(".reader-stage").focus();
    return true;
  `);
  waitFor(`!${reader()}.contentEl.classList.contains("is-opening") && ${reader()}.contentEl.querySelector(".textLayer span")`, "Reader did not render selectable text");
}

function selectText(text) {
  activate();
  const points = evaluate(`
    const span = [...${reader()}.contentEl.querySelectorAll('.textLayer span')].find(el => el.textContent === ${JSON.stringify(text)});
    if (!span) throw new Error("Missing fixture text");
    const box = span.getBoundingClientRect();
    return [Math.ceil(box.left + 1) + ',' + (box.top + box.height / 2), Math.floor(box.right - 1) + ',' + (box.top + box.height / 2)];
  `);
  run("drag", ...points);
}

function saved() {
  waitFor(`(async () => {
    const record = ${record()};
    const state = ${plugin}.store.state(record);
    if (state.saving || state.error) return false;
    const text = await app.vault.adapter.read(${plugin}.settings.folder + '/' + record.documentId + '.json');
    return JSON.stringify(JSON.parse(text).annotations) === JSON.stringify(record.annotations);
  })()`, "Saved JSON does not match the current annotations");
}

try {
  run("start");
  // Successful runs remove their PDFs. Drop their cached records before creating byte-identical fixtures.
  run("reload");
  originalSettings = evaluate(`return structuredClone(${plugin}.settings);`);
  evaluate(`
    // A failed run retains its files, but its split panes must not affect later runs.
    const previousLeaves = [];
    app.workspace.iterateAllLeaves(leaf => previousLeaves.push(leaf));
    previousLeaves.filter(leaf => /^Reader E2E \\d+\\//.test(leaf.getViewState().state?.file ?? '')).forEach(leaf => leaf.detach());
    await app.vault.createFolder(${JSON.stringify(folder)});
    const buffer = Buffer.from(${JSON.stringify(samplePdf({ outline: true }).toString("base64"))}, 'base64');
    const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    await app.vault.createBinary(${JSON.stringify(source)}, bytes);
    await app.vault.createBinary(${JSON.stringify(second)}, bytes);
    Object.assign(${plugin}.settings, {highlightMode:false, showAnnotationsOnOpen:true, notePlace:"sidebar", notesFolder:${JSON.stringify(folder)}});
    await ${plugin}.saveSettings();
    return true;
  `);

  step("ordinary PDF opening routes to Reader and renders both pages", () => {
    evaluate(`await app.workspace.getLeaf("tab").openFile(app.vault.getAbstractFileByPath(${JSON.stringify(source)})); return true;`);
    waitFor(`app.workspace.getLeavesOfType("reader-plugin-pdf").some(l => l.view.file?.path === ${JSON.stringify(source)} && l.view.getRecord())`, "PDF was not routed to Reader");
    activate();
    waitFor(`${reader()}.contentEl.querySelectorAll('.reader-page canvas').length === 2 && ${reader()}.contentEl.querySelectorAll('.textLayer').length === 2`, "Expected both PDF pages to render");
  });

  step("bundled decoders render JPEG 2000, CCITT, and JBIG2 images and apply ICC color profiles", () => {
    // Without the decoders these images render blank, or with uncorrected color, and PDF.js reports no error.
    const fixtures = [
      { file: "jpeg2000.pdf", expectCenter: [230, 30, 60] },
      { file: "ccitt.pdf", expectDarkShare: [0.4, 0.6] },
      { file: "jbig2.pdf", expectDarkShare: [0.001, 1] },
      // An uncorrected render shows [128, 64, 32].
      { file: "icc-linear.pdf", expectCenter: [188, 137, 99] },
    ];
    for (const { file, expectCenter, expectDarkShare } of fixtures) {
      const path = `${folder}/${file}`;
      const pixels = evaluate(`
        const buffer = Buffer.from(${JSON.stringify(readFileSync(join(root, "tests/fixtures/pdf-decoders", file)).toString("base64"))}, 'base64');
        const file = await app.vault.createBinary(${JSON.stringify(path)}, buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
        const leaf = app.workspace.getLeaf("tab");
        await leaf.openFile(file);
        let canvas;
        for (let i = 0; i < 150 && !(canvas = leaf.view.contentEl?.querySelector('.reader-page canvas')); i++) await new Promise(resolve => setTimeout(resolve, 100));
        if (!canvas) throw new Error("Decoder fixture did not render: " + ${JSON.stringify(file)});
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let dark = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] < 128 && data[i + 1] < 128 && data[i + 2] < 128) dark++;
        const center = (Math.floor(canvas.height / 2) * canvas.width + Math.floor(canvas.width / 2)) * 4;
        leaf.detach();
        return { center: [...data.slice(center, center + 3)], darkShare: dark / (data.length / 4) };
      `);
      if (expectCenter) {
        assert.ok(pixels.center.every((value, index) => Math.abs(value - expectCenter[index]) <= 4),
          `${file}: center pixel ${JSON.stringify(pixels.center)}, expected about ${JSON.stringify(expectCenter)}`);
      }
      if (expectDarkShare) {
        assert.ok(pixels.darkShare >= expectDarkShare[0] && pixels.darkShare <= expectDarkShare[1],
          `${file}: ${(pixels.darkShare * 100).toFixed(1)}% dark pixels, expected ${expectDarkShare.map(share => share * 100).join("–")}%`);
      }
    }
  });

  step("page field, next/previous, zoom and reset work through real input", () => {
    click('.reader-page-input'); run("type", "2"); press("Enter");
    waitFor(`${reader()}.contentEl.querySelector(".reader-page-input").value === "2"`, "Page field did not navigate");
    click('[aria-label="Previous page"]');
    waitFor(`${reader()}.contentEl.querySelector(".reader-page-input").value === "1"`, "Previous page did not navigate");
    click('[aria-label="Next page"]');
    waitFor(`${reader()}.contentEl.querySelector(".reader-page-input").value === "2"`, "Next page did not navigate");
    click('[aria-label="Zoom in (+)"]');
    waitFor(`typeof ${reader()}.getState().zoom === 'number'`, "Zoom did not become a fixed scale");
    click('[aria-label="Reset zoom to fit width (0)"]');
    waitFor(`${reader()}.getState().zoom === 'width'`, "Zoom reset failed");
    click('.reader-page-input'); run("type", "1"); press("Enter");
    waitFor(`${reader()}.contentEl.querySelector(".reader-page-input").value === "1"`, "Could not return to page one");
  });

  step("page navigation survives a narrow pane and a document that fits entirely onscreen", () => {
    const size = evaluate(`return {width:innerWidth, height:innerHeight};`);
    const assertPage = page => {
      evaluate(`await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return true;`);
      check(`${reader()}.contentEl.querySelector('.reader-page-input').value === '${page}'`, `Expected page ${page} after layout settled`);
      check(`${reader()}.contentEl.querySelector('[aria-label="Next page"]').disabled === ${page === 2}`, 'Next page has the wrong disabled state');
    };
    try {
      click('.reader-page-input'); run('type', '2'); press('Enter');
      assertPage(2);
      evaluate(`const width = innerWidth + 446 - ${reader()}.contentEl.querySelector('.reader-stage').clientWidth; require('@electron/remote').getCurrentWindow().setSize(width, innerHeight); return true;`);
      waitFor(`Math.abs(${reader()}.contentEl.querySelector('.reader-stage').clientWidth - 446) <= 2`, 'Could not reproduce the narrow Reader pane');
      assertPage(2);
      click('.reader-page-input'); run('type', '2'); press('Enter');
      assertPage(2);
      click('[aria-label="Previous page"]');
      assertPage(1);
      click('[aria-label="Next page"]');
      assertPage(2);
      click('[aria-label="Previous page"]');
      evaluate(`const stage = ${reader()}.contentEl.querySelector('.reader-stage'); stage.scrollTop = stage.scrollHeight; return true;`);
      assertPage(2);
      evaluate(`${reader()}.contentEl.querySelector('.reader-stage').scrollTop = 0; return true;`);
      assertPage(1);
      click('[aria-label="Next page"]');
      assertPage(2);
      // Keep a main tab group alive when this fixture is the only open document.
      evaluate(`const next = app.workspace.getLeaf('tab'); ${reader()}.leaf.detach(); await next.openFile(app.vault.getAbstractFileByPath(${JSON.stringify(source)})); return true;`);
      waitFor(`app.workspace.getLeavesOfType('reader-plugin-pdf').some(l => l.view.file?.path === ${JSON.stringify(source)} && l.view.getRecord?.())`, 'Could not reopen the narrow Reader');
      activate();
      assertPage(2);
      // At 25% both pages fit in the viewport, so page changes cannot move the scrollbar.
      for (let i = 0; i < 10 && evaluate(`return ${reader()}.getState().zoom !== 0.25;`); i++) click('[aria-label="Zoom out (-)"]');
      waitFor(`(() => {const stage = ${reader()}.contentEl.querySelector('.reader-stage'); return stage.scrollHeight <= stage.clientHeight;})()`, 'Expected the entire fixture to fit onscreen');
      click('.reader-page-input'); run('type', '2'); press('Enter');
      assertPage(2);
      click('[aria-label="Previous page"]');
      assertPage(1);
      click('[aria-label="Next page"]');
      assertPage(2);
    } finally {
      evaluate(`require('@electron/remote').getCurrentWindow().setSize(${size.width}, ${size.height}); return true;`);
      click('[aria-label="Reset zoom to fit width (0)"]');
      click('.reader-page-input'); run('type', '1'); press('Enter');
    }
  });

  step("table of contents searches and navigates with the keyboard", () => {
    activate(); press('t');
    waitFor(`document.querySelectorAll('.reader-outline-row').length === 2`, "Table of contents did not load");
    run('type', 'Returning');
    waitFor(`document.querySelectorAll('.reader-outline-row').length === 1`, "Outline search failed");
    press('Enter');
    waitFor(`!document.querySelector('.reader-outline-row') && ${reader()}.contentEl.querySelector('.reader-page-input').value === '2'`, "Outline did not navigate to page two");
    click('.reader-page-input'); run('type', '1'); press('Enter');
  });

  step("mouse selection opens the popup and creates a durable highlight and book note", () => {
    selectText("A reader pauses at a passage and writes a question.");
    waitFor(`!${reader()}.contentEl.querySelector('.reader-popup').hidden`, "Selection popup did not appear");
    click('.reader-popup [data-color="yellow"]');
    waitFor(`${record()}.annotations.length === 1 && !!${record()}.notePath`, "Highlight or book note missing");
    saved();
    const data = evaluate(`return ${record()};`);
    assert.match(data.annotations[0].quote.exact, /reader pauses at a passage/);
    recordPaths.add(`${originalSettings.folder}/${data.documentId}.json`);
    notePaths.add(data.notePath);
    waitFor(`(async () => (await app.vault.adapter.read(${record()}.notePath)).includes(${JSON.stringify(data.annotations[0].id.slice(0, 8))}))()`, "Book note section missing");
    waitFor(`(async () => (await ${quoteNote()})?.includes('annotation: ' + ${record()}.annotations[0].id))()`, "Quote note missing");
    waitFor(`(async () => { const path = ${plugin}.quoteNotes.find(${record()}.annotations[0].id).path.replace(/\\.md$/, ''); return (await app.vault.adapter.read(${record()}.notePath)).includes('[[' + path + '|'); })()`, "Book note quote does not link to the quote note");
  });

  step("recolor, copy, Note and writing update the PDF and Markdown", () => {
    click('.reader-mark');
    click('.reader-popup [data-color="blue"]');
    waitFor(`${record()}.annotations[0].color === 'blue'`, "Recolor failed");
    click('.reader-popup [aria-label="Copy text"]');
    check(`require('electron').clipboard.readText().includes('reader pauses at a passage')`, "Copy did not reach clipboard");
    // Copy dismisses the popup, so open it again before choosing Note.
    click('.reader-mark');
    evaluate(`const buttons = [...${reader()}.contentEl.querySelectorAll('.reader-popup button')]; buttons.find(b => b.textContent.includes('Write about it')).click(); return true;`);
    waitFor(`document.activeElement?.matches('.reader-card-comment-field') && ${cards}?.contains(document.activeElement)`, "Note did not focus the card's comment field");
    run("type", "E2E personal writing");
    press("Shift+Enter");
    run("type", "must survive deletion.");
    press("Enter");
    waitFor(`!document.activeElement?.matches('.reader-card-comment-field')`, "Enter did not submit the comment");
    waitFor(`(async () => (await ${quoteNote()})?.includes('E2E personal writing\\nmust survive deletion.'))()`, "Comment was not saved to the quote note with its new line");
    waitFor(`${cards}.querySelector('.reader-card-comment')?.textContent.includes('E2E personal writing')`, "The card did not show the saved comment");
    waitFor(`!!${reader()}.contentEl.querySelector('.reader-mark-note')`, "Writing indicator did not update");
    saved();
  });

  step("book-note quote colors render without injected styles and follow recoloring", () => {
    evaluate(`const leaf = app.workspace.getLeaf('tab'); await leaf.setViewState({type:'markdown', state:{file:${record()}.notePath, mode:'preview'}}); return true;`);
    const quote = `app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${record()}.notePath)?.view.containerEl.querySelector('.callout[data-callout="quote"]')`;
    waitFor(`!!${quote} && (${quote}).style.getPropertyValue('--reader-color') === ${JSON.stringify(originalSettings.colors.find(color => color.id === 'blue').value)}`, 'Rendered quote did not take the highlight color');
    check(`!document.getElementById('reader-plugin-quote-colors')`, 'Quote colors injected a style element');
    activate(); click('.reader-mark'); click('.reader-popup [data-color="yellow"]');
    waitFor(`!!${quote} && (${quote}).style.getPropertyValue('--reader-color') === ${JSON.stringify(originalSettings.colors.find(color => color.id === 'yellow').value)}`, 'Rendered quote did not follow recoloring');
    waitFor(`${cards}.querySelector('.reader-card').style.getPropertyValue('--reader-color') === ${JSON.stringify(originalSettings.colors.find(color => color.id === 'yellow').value)}`, 'The card did not follow recoloring');
    evaluate(`app.workspace.getLeavesOfType('markdown').filter(l => l.view.file?.path === ${record()}.notePath).forEach(l => l.detach()); return true;`);
    saved();
  });

  step("delete removes the quote and its quote note, and Undo restores both", () => {
    const id = evaluate(`return ${record()}.annotations[0].id;`);
    activate(); click('.reader-mark'); press("Delete");
    waitFor(`${record()}.annotations.length === 0`, "Delete did not remove highlight");
    waitFor(`(async () => !(await app.vault.adapter.read(${record()}.notePath)).includes(${JSON.stringify(id.slice(0, 8))}))()`, "Deleting a highlight kept its quote");
    waitFor(`!${plugin}.quoteNotes.find(${JSON.stringify(id)}) && !app.vault.getMarkdownFiles().some(f => f.path.startsWith(${JSON.stringify(folder + "/")}) && f.basename.startsWith('A reader pauses'))`, "Deleting a highlight kept its quote note");
    evaluate(`const undo = [...document.querySelectorAll('.notice a')].find(el => el.textContent === 'Undo'); if (!undo) throw new Error('Missing Undo'); undo.click(); return true;`);
    waitFor(`${record()}.annotations.length === 1`, "Undo did not restore highlight");
    waitFor(`(async () => (await ${quoteNote()})?.includes('E2E personal writing'))()`, "Undo did not restore the comment");
    saved();
  });

  step("two Reader tabs share edits immediately", () => {
    evaluate(`const leaf = app.workspace.getLeaf('split'); await leaf.setViewState({type:'reader-plugin-pdf', state:{file:${JSON.stringify(source)}}}); await app.workspace.revealLeaf(leaf); return true;`);
    waitFor(`app.workspace.getLeavesOfType('reader-plugin-pdf').filter(l => l.view.file?.path === ${JSON.stringify(source)} && l.view.contentEl.querySelector('.reader-mark')).length === 2`, "Second tab did not render shared highlight");
    activate(); click('.reader-mark'); click('.reader-popup [data-color="yellow"]');
    check(`app.workspace.getLeavesOfType('reader-plugin-pdf').filter(l => l.view.file?.path === ${JSON.stringify(source)}).every(l => l.view.getRecord().annotations[0].color === 'yellow' && l.view.contentEl.querySelector('.reader-mark').style.getPropertyValue('--reader-color') === ${JSON.stringify(originalSettings.colors[0].value)})`, "A second tab did not update its highlight");
    saved();
    click('.reader-page-input'); run('type', '2'); press('Enter');
    evaluate(`await new Promise(resolve => setTimeout(resolve, 300)); return true;`);
    check(`${reader()}.contentEl.querySelector('.reader-page-input').value === '2'`, "Navigation reset the requested page in a narrow split pane");
    click('.reader-page-input'); run('type', '1'); press('Enter');
    evaluate(`const leaves = app.workspace.getLeavesOfType('reader-plugin-pdf').filter(l => l.view.file?.path === ${JSON.stringify(source)}); leaves.slice(1).forEach(l => l.detach()); return true;`);
    activate();
  });

  step("book note follows PDFs, stays dismissed, and reopens beside the Reader", () => {
    activate();
    waitFor(`${cards}?.querySelector('.reader-annotations-title')?.textContent === 'First' && !!${cards}.querySelector('.reader-card')`, "Sidebar cards did not follow the first PDF");
    evaluate(`const leaf = app.workspace.getLeaf('tab'); await leaf.openFile(app.vault.getAbstractFileByPath(${JSON.stringify(second)})); app.workspace.setActiveLeaf(leaf, {focus:true}); return true;`);
    waitFor(`app.workspace.getLeavesOfType('reader-plugin-annotations').some(l => l.view.contentEl.textContent.includes('Second'))`, "Second PDF did not get a placeholder");
    activate(); press('a');
    waitFor(`app.workspace.rightSplit.collapsed`, "Toggle did not dismiss the sidebar");
    evaluate(`const leaf = app.workspace.getLeavesOfType('reader-plugin-pdf').find(l => l.view.file?.path === ${JSON.stringify(second)}); await app.workspace.revealLeaf(leaf); app.workspace.setActiveLeaf(leaf, {focus:true}); return true;`);
    check(`app.workspace.rightSplit.collapsed`, "Switching PDFs reopened a dismissed sidebar");
    evaluate(`${plugin}.settings.notePlace = 'beside'; await ${plugin}.saveSettings(); return true;`);
    activate(); press('a');
    waitFor(`app.workspace.getLeavesOfType('markdown').some(l => l.view.file?.path === ${record()}.notePath && l.getRoot() === app.workspace.rootSplit)`, "Book note did not open beside the PDF");
    activate(); press('a');
    waitFor(`!app.workspace.getLeavesOfType('markdown').some(l => l.view.file?.path === ${record()}.notePath && l.getRoot() === app.workspace.rootSplit)`, "Toggle did not close the beside note");
    evaluate(`${plugin}.settings.notePlace = 'sidebar'; await ${plugin}.saveSettings(); return true;`);
    activate(); press('a');
  });

  step("Open passage links return to the highlight without replacing the note", () => {
    const note = evaluate(`return ${record()}.notePath;`);
    evaluate(`const leaf = app.workspace.getLeaf('split'); await leaf.setViewState({type:'markdown',state:{file:${JSON.stringify(note)},mode:'preview'}}); await app.workspace.revealLeaf(leaf); return true;`);
    waitFor(`(() => { const link = [...document.querySelectorAll('a[href^="obsidian://reader-plugin?"]')].find(el => el.getBoundingClientRect().width > 0); if (!link) return false; link.dataset.readerE2eLink = 'visible'; return true; })()`, "Passage link did not render");
    run('click', '[data-reader-e2e-link="visible"]');
    waitFor(`!!${reader()}.contentEl.querySelector('.reader-mark.is-flashing')`, "Passage link did not reveal and pulse the highlight");
    check(`app.workspace.getLeavesOfType('markdown').some(l => l.view.file?.path === ${JSON.stringify(note)})`, "Passage navigation replaced the note");
    evaluate(`app.workspace.getLeavesOfType('markdown').filter(l => l.view.file?.path === ${JSON.stringify(note)}).forEach(l => l.detach()); return true;`);
    activate();
  });

  step("clicking a card's quote reveals and pulses the highlight", () => {
    activate();
    waitFor(`!${reader()}.contentEl.querySelector('.reader-mark.is-flashing')`, "The earlier pulse did not end");
    evaluate(`const quote = ${cards}.querySelector('.reader-card .reader-card-quote'); quote.dataset.readerE2eQuote = 'first'; return true;`);
    run('click', '[data-reader-e2e-quote="first"]');
    waitFor(`!!${reader()}.contentEl.querySelector('.reader-mark.is-flashing')`, "Clicking the quote did not pulse the highlight");
  });

  step("highlight mode creates a passage directly and Escape clears an ordinary selection", () => {
    activate(); press('h');
    check(`${plugin}.settings.highlightMode`, "H did not enable highlight mode");
    selectText("The question connects an argument to the reader’s life.");
    waitFor(`${record()}.annotations.length === 2`, "Highlight mode did not create a passage");
    check(`${reader()}.contentEl.querySelector('.reader-popup').hidden`, "Highlight mode unexpectedly opened a popup");
    press('h');
    selectText("Select this passage, highlight it, and add a comment.");
    waitFor(`!${reader()}.contentEl.querySelector('.reader-popup').hidden`, "Selection popup missing");
    press('Escape');
    check(`${reader()}.contentEl.querySelector('.reader-popup').hidden && !window.getSelection().toString()`, "Escape did not clear popup and selection");
    saved();
  });

  step("the selection's Note button highlights the passage and focuses its new card", () => {
    selectText("Select this passage, highlight it, and add a comment.");
    waitFor(`!${reader()}.contentEl.querySelector('.reader-popup').hidden`, "Note selection popup missing");
    click('.reader-popup .reader-text-button');
    waitFor(`${record()}.annotations.length === 3 && document.activeElement?.matches('.reader-card-comment-field') && ${cards}?.contains(document.activeElement)`, "Note did not create a highlight and focus its card");
    run('type', 'E2E writing for the selection Note action.');
    const index = evaluate(`return ${record()}.annotations.findIndex(a => a.quote.exact.startsWith('Select this passage'));`);
    waitFor(`(async () => (await ${quoteNote(index)})?.includes('E2E writing for the selection Note action.'))()`, "Selection Note comment was not saved");
    evaluate(`document.activeElement.blur(); return true;`);
    saved();
    activate();
  });

  step("failed annotation writes report the error and retry automatically", () => {
    evaluate(`window.__readerE2EWrite = app.vault.adapter.write; app.vault.adapter.write = async function(path, ...args) { if (path.endsWith('/' + ${record()}.documentId + '.json')) throw new Error('E2E injected write failure'); return window.__readerE2EWrite.call(this, path, ...args); }; return true;`);
    try {
      click('.reader-mark'); click('.reader-popup [data-color="blue"]');
      waitFor(`!!${plugin}.store.state(${record()}).error`, "Save failure was not reported");
      check(`document.querySelector('.notice-container').textContent.includes('Retrying automatically')`, "Missing retry notice");
      check(`JSON.parse(await app.vault.adapter.read(${plugin}.settings.folder + '/' + ${record()}.documentId + '.json')).annotations[0].color === 'yellow'`, "Failed save overwrote the previous record");
    } finally {
      evaluate(`app.vault.adapter.write = window.__readerE2EWrite; delete window.__readerE2EWrite; return true;`);
    }
    saved();
    check(`JSON.parse(await app.vault.adapter.read(${plugin}.settings.folder + '/' + ${record()}.documentId + '.json')).annotations[0].color === 'blue'`, "Retry lost the edit");
  });

  step("native viewer fallback stays native while new PDF tabs route to Reader", () => {
    activate();
    evaluate(`app.commands.executeCommandById('reading-desk:open-native-pdf'); return true;`);
    waitFor(`app.workspace.getLeavesOfType('pdf').some(l => l.view.file?.path === ${JSON.stringify(source)})`, "Native viewer fallback failed");
    evaluate(`await app.workspace.getLeaf('tab').openFile(app.vault.getAbstractFileByPath(${JSON.stringify(second)})); return true;`);
    waitFor(`app.workspace.getLeavesOfType('reader-plugin-pdf').some(l => l.view.file?.path === ${JSON.stringify(second)} && l.view.getRecord())`, "New PDF did not route to Reader");
    const data = evaluate(`return app.workspace.getLeavesOfType('reader-plugin-pdf').find(l => l.view.file?.path === ${JSON.stringify(second)}).view.getRecord();`);
    recordPaths.add(`${originalSettings.folder}/${data.documentId}.json`);
    check(`app.workspace.getLeavesOfType('pdf').some(l => l.view.file?.path === ${JSON.stringify(source)})`, "Fallback tab was rerouted unexpectedly");
    evaluate(`app.workspace.getLeavesOfType('pdf').filter(l => l.view.file?.path === ${JSON.stringify(source)}).forEach(l => l.detach()); return true;`);
  });

  step("PDF rename retains annotation identity and persisted reading position", () => {
    activate();
    const id = evaluate(`return ${record()}.documentId;`);
    const renamed = `${folder}/Renamed.pdf`;
    evaluate(`
      const rename = app.fileManager.renameFile(app.vault.getAbstractFileByPath(${JSON.stringify(source)}), ${JSON.stringify(renamed)});
      // Obsidian can ask to update the book note's source link during a rename.
      for (let i = 0; i < 20; i++) {
        const button = [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Just once');
        if (button) { button.click(); break; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      await rename;
      return true;
    `);
    source = renamed;
    waitFor(`${record()}.sourcePath === ${JSON.stringify(source)}`, "Rename was not reflected in the annotation record");
    check(`${record()}.documentId === ${JSON.stringify(id)}`, "Rename changed document identity");
    activate(); click('.reader-page-input'); run("type", "2"); press("Enter"); click('[aria-label="Zoom in (+)"]');
    waitFor(`${reader()}.contentEl.querySelector(".reader-page-input").value === "2" && typeof ${reader()}.getState().zoom === 'number'`, "Position setup failed");
    const state = evaluate(`return ${reader()}.getState();`);
    // Close background copies first so their older positions cannot become the last read position.
    evaluate(`const leaves = app.workspace.getLeavesOfType('reader-plugin-pdf').filter(l => l.view.file?.path === ${JSON.stringify(source)}); for (const leaf of leaves.slice(1)) leaf.detach(); return true;`);
    activate();
    evaluate(`${reader()}.leaf.detach(); return true;`);
    evaluate(`await app.workspace.getLeaf('tab').openFile(app.vault.getAbstractFileByPath(${JSON.stringify(source)})); return true;`);
    waitFor(`app.workspace.getLeavesOfType('reader-plugin-pdf').some(l => l.view.file?.path === ${JSON.stringify(source)} && l.view.getRecord())`, "Reopen failed");
    activate();
    check(`${reader()}.contentEl.querySelector(".reader-page-input").value === "2" && Math.abs(${reader()}.getState().zoom - ${state.zoom}) < 0.01`, "Reopened PDF lost page or zoom");
  });

  step("plugin reload restores highlights, writing, page and zoom from disk", () => {
    const before = evaluate(`return {state:${reader()}.getState(), id:${record()}.documentId, annotations:${record()}.annotations};`);
    saved();
    run("reload");
    waitFor(`app.workspace.getLeavesOfType('reader-plugin-pdf').some(l => l.getViewState().state?.file === ${JSON.stringify(source)})`, "Reload lost the PDF tab");
    evaluate(`const leaf = app.workspace.getLeavesOfType('reader-plugin-pdf').find(l => l.getViewState().state?.file === ${JSON.stringify(source)}); await app.workspace.revealLeaf(leaf); return true;`);
    waitFor(`!!${reader()}.getRecord()`, "Reload did not load annotations");
    activate();
    const after = evaluate(`return {state:${reader()}.getState(), id:${record()}.documentId, annotations:${record()}.annotations};`);
    assert.equal(after.id, before.id);
    assert.deepEqual(after.annotations, before.annotations);
    assert.equal(after.state.page, before.state.page);
    assert.equal(after.state.zoom, before.state.zoom);
    assert.ok(Math.abs(after.state.offset - before.state.offset) < 0.02, 'Reload changed the position within the page');
    check(`(await ${quoteNote()})?.includes('E2E personal writing')`, "Reload lost the comment");
  });

  step("searchable settings refresh added colors and save drag reordering", () => {
    const colors = evaluate(`return structuredClone(${plugin}.settings.colors);`);
    const tab = `${plugin}.settingTab`;
    try {
      evaluate(`app.setting.open(); app.setting.openTabById('reading-desk'); return true;`);
      run('eval', `require('@electron/remote').getCurrentWindow().setSize(1100, 950)`, '--window=Settings');
      waitFor(`${tab}.containerEl.querySelectorAll('.reader-color-setting').length === ${colors.length}`, 'Declarative settings did not render the palette');
      check(`['Show the book note with PDFs','Open book notes','Book notes folder','Book note template','Annotation folder'].every(name => ${tab}.settingItems.flatMap(group => group.items ?? []).some(item => item.name === name))`, 'Settings definitions are missing searchable names');
      for (let i = 0; i < 2; i++) {
        evaluate(`const button = [...${tab}.containerEl.querySelectorAll('button')].find(el => el.textContent === 'Add color'); button.dataset.readerE2eAddColor = ''; return true;`);
        run('click', '[data-reader-e2e-add-color]', '--window=Settings');
        waitFor(`${tab}.containerEl.querySelectorAll('.reader-color-setting').length === ${colors.length + i + 1}`, 'Added color did not refresh the settings UI');
      }
      const before = evaluate(`return ${plugin}.settings.colors.slice(-2).map(color => color.id);`);
      const points = evaluate(`const rows = [...${tab}.containerEl.querySelectorAll('.reader-color-setting')].slice(-2); return rows.map(row => { const rect = row.querySelector('.reader-color-handle').getBoundingClientRect(); return [rect.x + rect.width / 2, rect.y + rect.height / 2].join(','); });`);
      run('drag', points[0], points[1], '--window=Settings');
      waitFor(`${plugin}.settings.colors.at(-1).id === ${JSON.stringify(before[0])}`, 'Dragging did not reorder added colors');
      check(`JSON.stringify((await ${plugin}.loadData()).colors.slice(-2).map(color => color.id)) === ${JSON.stringify(JSON.stringify([...before].reverse()))}`, 'Reordered colors were not saved');
    } finally {
      evaluate(`${plugin}.settings.colors = ${JSON.stringify(colors)}; await ${plugin}.saveSettings(); ${tab}.update(); app.setting.close(); return true;`);
    }
  });

  step("a fresh Obsidian process reopens the saved reading position and annotations", () => {
    const before = evaluate(`return {state:${reader()}.getState(), annotations:${record()}.annotations, id:${record()}.documentId};`);
    evaluate(`await ${plugin}.saveSettings(); return true;`);
    run('stop');
    run('start');
    evaluate(`
      const existing = app.workspace.getLeavesOfType('reader-plugin-pdf').find(l => l.getViewState().state?.file === ${JSON.stringify(source)});
      if (existing) await app.workspace.revealLeaf(existing);
      else await app.workspace.getLeaf('tab').openFile(app.vault.getAbstractFileByPath(${JSON.stringify(source)}));
      return true;
    `);
    waitFor(`!!${reader()}.getRecord()`, "Fresh process did not load the PDF");
    activate();
    const after = evaluate(`return {state:${reader()}.getState(), annotations:${record()}.annotations, id:${record()}.documentId};`);
    assert.equal(after.id, before.id);
    assert.deepEqual(after.annotations, before.annotations);
    assert.equal(after.state.page, before.state.page);
    assert.equal(after.state.zoom, before.state.zoom);
    assert.ok(Math.abs(after.state.offset - before.state.offset) < 0.02, 'Restart changed the position within the page');
    check(`(await ${quoteNote()})?.includes('E2E personal writing')`, "Restart lost the comment");
  });
  console.log(`Passed ${passed} real Obsidian workflow checks.`);
} catch (error) {
  const screenshot = join(root, ".dev-vault", "e2e-failure.png");
  try { run("screenshot", screenshot); } catch { /* Keep the original failure. */ }
  console.error(`E2E failed. Fixture retained in ${folder}. Screenshot: ${screenshot}`);
  throw error;
} finally {
  if (originalSettings) {
    evaluate(`
      if (window.__readerE2EWrite) { app.vault.adapter.write = window.__readerE2EWrite; delete window.__readerE2EWrite; }
      Object.assign(${plugin}.settings, ${JSON.stringify(originalSettings)});
      await ${plugin}.saveSettings();
      return true;
    `);
  }
}

// Keep failed fixtures for diagnosis. A successful run removes only its own files and tabs.
evaluate(`
  const leaves = [];
  app.workspace.iterateAllLeaves(leaf => leaves.push(leaf));
  leaves.filter(leaf => leaf.getViewState().state?.file?.startsWith(${JSON.stringify(folder + "/")})).forEach(leaf => leaf.detach());
  const folder = app.vault.getAbstractFileByPath(${JSON.stringify(folder)});
  if (folder) await app.vault.delete(folder, true);
  for (const path of ${JSON.stringify([...recordPaths])}) if (await app.vault.adapter.exists(path)) await app.vault.adapter.remove(path);
  for (const path of ${JSON.stringify([...notePaths])}) { const file = app.vault.getAbstractFileByPath(path); if (file) await app.vault.delete(file); }
  return true;
`);
