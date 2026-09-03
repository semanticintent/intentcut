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
  });

  it("refuses to overwrite an existing production", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "intentcut-init-"));
    const root = path.join(parent, "demo");
    await initializeProject(root);

    await expect(initializeProject(root)).rejects.toMatchObject({ code: "EEXIST" });
  });
});
