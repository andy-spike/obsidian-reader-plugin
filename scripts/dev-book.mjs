import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

// Git's common directory points back to the main checkout even in a T3 worktree.
export function mainCheckoutPath(root) {
  const commonDirectory = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return dirname(commonDirectory);
}

export async function seedDevelopmentBook(root, vaultPath) {
  const mainCheckout = mainCheckoutPath(root);
  const source = join(mainCheckout, ".dev-vault", `Reader Plugin Dev - ${basename(mainCheckout)}`, "Books", "AI Engineering.pdf");
  const destination = join(vaultPath, "Books", "AI Engineering.pdf");
  if (source === destination) return;

  await mkdir(dirname(destination), { recursive: true });
  try {
    // Each vault owns its copy. Never replace a book already used in that vault.
    await copyFile(source, destination, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code === "EEXIST") return;
    if (error.code === "ENOENT") {
      console.warn(`Development book not found at ${source}; skipping AI Engineering.pdf.`);
      return;
    }
    throw error;
  }
}
