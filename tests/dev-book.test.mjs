import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { mainCheckoutPath, seedDevelopmentBook } from "../scripts/dev-book.mjs";

test("worktrees receive independent book copies and keep their existing books", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reader-book-"));
  try {
    const main = join(directory, "main");
    const worktree = join(directory, "worktree");
    await mkdir(main);
    const git = (...args) => execFileSync("git", args, { cwd: main, stdio: "pipe" });
    git("init");
    git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "Initial");
    git("worktree", "add", "-b", "task", worktree);
    assert.equal(mainCheckoutPath(worktree), main);
    const books = join(main, ".dev-vault", "Reader Plugin Dev - main", "Books");
    await mkdir(books, { recursive: true });
    const source = join(books, "AI Engineering.pdf");
    const vault = join(worktree, ".dev-vault", "Reader Plugin Dev - worktree");
    await writeFile(source, "original book");
    await seedDevelopmentBook(worktree, vault);
    const destination = join(vault, "Books", "AI Engineering.pdf");
    assert.equal(await readFile(destination, "utf8"), "original book");
    await writeFile(destination, "local book");
    await seedDevelopmentBook(worktree, vault);
    assert.equal(await readFile(destination, "utf8"), "local book");
    assert.equal(await readFile(source, "utf8"), "original book");
    await seedDevelopmentBook(main, join(main, ".dev-vault", "Reader Plugin Dev - main"));
    assert.equal(await readFile(source, "utf8"), "original book");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
