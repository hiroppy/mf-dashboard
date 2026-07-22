import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { generateWithCodexExec } from "./codex-exec.js";

const originalEnv = { ...process.env };
const temporaryDirectories: string[] = [];

afterEach(async () => {
  process.env = { ...originalEnv };
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("terminates a timed-out Codex process group including grandchildren", async () => {
  if (process.platform === "win32") return;

  const root = await mkdtemp(join(tmpdir(), "mf-dashboard-codex-process-tree-test-"));
  temporaryDirectories.push(root);
  const executable = join(root, "fake-codex");
  const grandchildPidPath = join(root, "grandchild.pid");
  await writeFile(join(root, "auth.json"), '{"token":"test"}');
  await writeFile(
    executable,
    `#!/bin/sh\nsleep 30 &\ngrandchild=$!\nprintf '%s' "$grandchild" > ${JSON.stringify(grandchildPidPath)}\nwait\n`,
  );
  await chmod(executable, 0o700);
  process.env.CODEX_HOME = root;
  process.env.CODEX_EXEC_PATH = executable;
  process.env.CODEX_EXEC_TIMEOUT_MS = "1000";

  let grandchildPid: number | undefined;
  try {
    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "codex exec timed out after 1000ms",
    );

    await vi.waitFor(async () =>
      expect(await readFile(grandchildPidPath, "utf8")).toMatch(/^\d+$/),
    );
    grandchildPid = Number(await readFile(grandchildPidPath, "utf8"));
    await vi.waitFor(() => expect(() => process.kill(grandchildPid!, 0)).toThrow("kill ESRCH"), {
      timeout: 1_000,
    });
  } finally {
    if (grandchildPid !== undefined) {
      try {
        process.kill(grandchildPid, "SIGKILL");
      } catch {
        // Expected when process-group termination succeeded.
      }
    }
  }
});
