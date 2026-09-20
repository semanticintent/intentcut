import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initializeProject } from "../src/scaffold.js";

describe("project initialization", () => {
  it("creates a narration-ready production workspace", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "intentcut-init-"));
    const root = path.join(parent, "demo");
    await initializeProject(root);

    await access(path.join(root, "narration/generated"));
    await access(path.join(root, "narration/human"));
    expect(await readFile(path.join(root, "intentcut.yaml"), "utf8")).toContain("synthetic-prototype");

    // A scaffold that cannot render is a scaffold nobody can try: the cards the
    // manifest names have to exist, or the first render fails on a missing file.
    for (const card of ["assets/opening.png", "assets/closing.png"]) {
      await access(path.join(root, card));
      expect((await readFile(path.join(root, card))).subarray(1, 4).toString()).toBe("PNG");
    }
  });

  it("refuses to overwrite an existing production", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "intentcut-init-"));
    const root = path.join(parent, "demo");
    await initializeProject(root);

    await expect(initializeProject(root)).rejects.toMatchObject({ code: "EEXIST" });
  });
});
