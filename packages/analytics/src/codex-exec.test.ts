import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

const { mkdtempMock, readFileMock, spawnMock } = vi.hoisted(() => ({
  mkdtempMock: vi.fn<typeof import("node:fs/promises").mkdtemp>(),
  readFileMock: vi.fn<typeof import("node:fs/promises").readFile>(),
  spawnMock: vi.fn<typeof import("node:child_process").spawn>(),
}));

vi.mock("node:child_process", () => ({ spawn: spawnMock }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  mkdtempMock.mockImplementation(original.mkdtemp);
  readFileMock.mockImplementation(original.readFile);
  return { ...original, mkdtemp: mkdtempMock, readFile: readFileMock };
});

const { generateWithCodexExec } = await import("./codex-exec.js");
const originalEnv = { ...process.env };
const temporaryDirectories: string[] = [];

beforeEach(async () => {
  const sourceCodexHome = await mkdtemp(join(tmpdir(), "mf-dashboard-codex-test-"));
  temporaryDirectories.push(sourceCodexHome);
  await writeFile(join(sourceCodexHome, "auth.json"), '{"token":"initial"}');
  process.env.CODEX_HOME = sourceCodexHome;
});

afterEach(async () => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

function createFakeCodex(
  options: {
    exitCode?: number;
    hang?: boolean;
    ignoreKill?: boolean;
    mcpServers?: unknown[];
    output?: string;
    stderr?: string;
  } = {},
) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let input = "";
  let child: ChildProcessWithoutNullStreams;
  const kill = vi.fn<() => boolean>(() => {
    if (!options.ignoreKill) queueMicrotask(() => child.emit("close", null));
    return true;
  });
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      input += chunk.toString();
      callback();
    },
    async final(callback) {
      if (options.hang) {
        callback();
        return;
      }
      const args = spawnMock.mock.calls.at(-1)?.[1] as string[];
      if (args[0] === "mcp") {
        stdout.write(JSON.stringify(options.mcpServers ?? []));
        queueMicrotask(() => child.emit("close", options.exitCode ?? 0));
        callback();
        return;
      }
      const outputIndex = args.indexOf("--output-last-message");
      if (options.exitCode === undefined || options.exitCode === 0) {
        await writeFile(args[outputIndex + 1]!, options.output ?? '{"value":"ok"}');
      }
      stderr.write(options.stderr ?? "model: codex-test-model\n");
      queueMicrotask(() => child.emit("close", options.exitCode ?? 0));
      callback();
    },
  });
  child = Object.assign(new EventEmitter(), {
    kill,
    stderr,
    stdin,
    stdout,
  }) as unknown as ChildProcessWithoutNullStreams;
  return { child, getInput: () => input, kill };
}

describe("generateWithCodexExec", () => {
  test("runs an isolated one-shot command with preloaded tool data and structured output", async () => {
    process.env.CODEX_ACCESS_TOKEN = "must-not-be-forwarded";
    process.env.OPENAI_API_KEY = "must-not-be-forwarded";
    process.env.UNTRUSTED_SECRET = "must-not-be-forwarded";
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    spawnMock.mockReturnValueOnce(mcp.child).mockReturnValueOnce(fake.child);
    const execute = vi.fn<() => Promise<{ value: string }>>(async () => ({
      value: "tool-value",
    }));

    const result = await generateWithCodexExec({
      preloadTools: ["lookupValue"],
      system: "Use lookupValue and return its value.",
      prompt: "Return JSON.",
      schema: z.object({ value: z.string() }),
      tools: { lookupValue: { inputSchema: z.object({}), execute } },
    });

    expect(result).toEqual({
      model: "codex-test-model",
      output: { value: "ok" },
      text: '{"value":"ok"}',
      toolNames: ["lookupValue"],
    });
    expect(execute).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    );
    expect(fake.getInput()).toContain('<tool_results>\n{"lookupValue":{"value":"tool-value"}}');

    const [command, args, spawnOptions] = spawnMock.mock.calls[1]!;
    expect(command).toBe("codex");
    expect(args).toEqual(
      expect.arrayContaining([
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--strict-config",
        "--sandbox",
        "read-only",
        "--output-schema",
        expect.stringContaining("developer_instructions="),
      ]),
    );
    expect(spawnOptions?.cwd).toContain("mf-dashboard-codex-");
    expect(spawnOptions?.env).not.toEqual(
      expect.objectContaining({ UNTRUSTED_SECRET: expect.anything() }),
    );
    expect(spawnOptions?.env).not.toEqual(
      expect.objectContaining({
        CODEX_ACCESS_TOKEN: expect.anything(),
        OPENAI_API_KEY: expect.anything(),
      }),
    );
  });

  test("does not execute tools that are absent from the instructions", async () => {
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ output: "plain result" });
    spawnMock.mockReturnValueOnce(mcp.child).mockReturnValueOnce(fake.child);
    const execute = vi.fn<() => string>(() => "unused");

    const result = await generateWithCodexExec({
      system: "Answer directly.",
      prompt: "Untrusted text mentions lookupValue.",
      tools: { lookupValue: { inputSchema: z.object({}), execute } },
    });

    expect(result.output).toBeUndefined();
    expect(result.text).toBe("plain result");
    expect(result.toolNames).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  test("rejects a mentioned tool that requires input before spawning Codex", async () => {
    await expect(
      generateWithCodexExec({
        preloadTools: ["lookupValue"],
        system: "Use lookupValue.",
        prompt: "Answer.",
        tools: {
          lookupValue: {
            inputSchema: z.object({ query: z.string() }),
            execute: () => "value",
          },
        },
      }),
    ).rejects.toThrow("Codex exec cannot preload tool lookupValue without input");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("enforces the preloaded tool limit before spawning Codex", async () => {
    await expect(
      generateWithCodexExec({
        preloadTools: ["firstTool", "secondTool"],
        system: "Use firstTool and secondTool.",
        prompt: "Answer.",
        maxToolCalls: 1,
        tools: {
          firstTool: { inputSchema: z.object({}), execute: () => "first" },
          secondTool: { inputSchema: z.object({}), execute: () => "second" },
        },
      }),
    ).rejects.toThrow("Codex exec input exceeds 1 tool calls");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("preloads tools concurrently before acquiring the credential lock", async () => {
    let releaseFirst!: () => void;
    const firstTool = vi.fn<() => Promise<void>>(
      () => new Promise<void>((resolve) => (releaseFirst = resolve)),
    );
    const secondTool = vi.fn<() => string>(() => "second");
    const secondMcp = createFakeCodex();
    const secondCodex = createFakeCodex({ output: "second result" });
    const firstMcp = createFakeCodex();
    const firstCodex = createFakeCodex({ output: "first result" });
    spawnMock
      .mockReturnValueOnce(secondMcp.child)
      .mockReturnValueOnce(secondCodex.child)
      .mockReturnValueOnce(firstMcp.child)
      .mockReturnValueOnce(firstCodex.child);

    const first = generateWithCodexExec({
      preloadTools: ["lookup"],
      system: "Use lookup.",
      prompt: "First.",
      tools: { lookup: { inputSchema: z.object({}), execute: firstTool } },
    });
    await vi.waitFor(() => expect(firstTool).toHaveBeenCalledOnce());
    const second = generateWithCodexExec({
      preloadTools: ["lookup"],
      system: "Use lookup.",
      prompt: "Second.",
      tools: { lookup: { inputSchema: z.object({}), execute: secondTool } },
    });

    await expect(second).resolves.toEqual(expect.objectContaining({ text: "second result" }));
    releaseFirst();
    await expect(first).resolves.toEqual(expect.objectContaining({ text: "first result" }));
  });

  test("aborts a slow preloaded tool when the command times out", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "1000";
    let aborted = false;

    await expect(
      generateWithCodexExec({
        preloadTools: ["lookupValue"],
        system: "Use lookupValue.",
        prompt: "Answer.",
        tools: {
          lookupValue: {
            inputSchema: z.object({}),
            execute: (_input, { abortSignal }) =>
              new Promise<never>((_resolve, reject) => {
                abortSignal.addEventListener("abort", () => {
                  aborted = true;
                  reject(abortSignal.reason);
                });
              }),
          },
        },
      }),
    ).rejects.toThrow("codex exec timed out after 1000ms");
    expect(aborted).toBe(true);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("reports non-zero Codex exits", async () => {
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ exitCode: 2, stderr: "sensitive tool data" });
    spawnMock.mockReturnValueOnce(mcp.child).mockReturnValueOnce(fake.child);

    const error = await generateWithCodexExec({ system: "System.", prompt: "Prompt." }).catch(
      (error: unknown) => error,
    );
    expect(error).toEqual(new Error("codex exited with code 2"));
    expect(fake.kill).not.toHaveBeenCalled();
  });

  test("waits for the Codex process to close after a timeout", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "1000";
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ hang: true });
    spawnMock.mockReturnValueOnce(mcp.child).mockReturnValueOnce(fake.child);

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "codex exec timed out after 1000ms",
    );
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("returns the timeout when a killed process never emits close", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "1000";
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ hang: true, ignoreKill: true });
    spawnMock.mockReturnValueOnce(mcp.child).mockReturnValueOnce(fake.child);

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "codex exec timed out after 1000ms",
    );
    expect(fake.kill).toHaveBeenNthCalledWith(1);
    expect(fake.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  });

  test("fails closed when effective MCP servers are present", async () => {
    const mcp = createFakeCodex({ mcpServers: [{ name: "managed-server" }] });
    spawnMock.mockReturnValue(mcp.child);

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "codex exec loaded unexpected MCP servers",
    );
    expect(spawnMock).toHaveBeenCalledOnce();
  });

  test("rejects invalid timeout configuration before creating a process", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "invalid";
    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "CODEX_EXEC_TIMEOUT_MS must be an integer from 1 to 2147483647",
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("rejects timeout values above the Node timer limit", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "2147483648";
    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "CODEX_EXEC_TIMEOUT_MS must be an integer from 1 to 2147483647",
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("rejects output whose synchronous validation crosses the deadline", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "100";
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(101);
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    spawnMock.mockReturnValueOnce(mcp.child).mockReturnValueOnce(fake.child);

    await expect(
      generateWithCodexExec({
        system: "System.",
        prompt: "Prompt.",
        schema: z.object({ value: z.string() }),
      }),
    ).rejects.toThrow("codex exec timed out after 100ms");
  });

  test("times out while creating the isolated environment", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "20";
    const originalMkdtemp = mkdtempMock.getMockImplementation()!;
    mkdtempMock.mockImplementation(() => new Promise<never>(() => undefined));

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "codex exec timed out after 20ms",
    );
    expect(spawnMock).not.toHaveBeenCalled();
    mkdtempMock.mockImplementation(originalMkdtemp);
  });

  test("times out while waiting for the credential lock", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "5000";
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ hang: true, ignoreKill: true });
    spawnMock.mockReturnValueOnce(mcp.child).mockReturnValueOnce(fake.child);
    const firstGeneration = generateWithCodexExec({ system: "System.", prompt: "First." });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));

    process.env.CODEX_EXEC_TIMEOUT_MS = "20";
    await expect(generateWithCodexExec({ system: "System.", prompt: "Second." })).rejects.toThrow(
      "codex exec timed out after 20ms",
    );
    expect(spawnMock).toHaveBeenCalledTimes(2);

    fake.child.emit("close", 1);
    await expect(firstGeneration).rejects.toThrow("codex exited with code 1");
  });

  test("persists refreshed credentials from the isolated Codex home", async () => {
    const sourceCodexHome = await mkdtemp(join(tmpdir(), "mf-dashboard-codex-test-"));
    temporaryDirectories.push(sourceCodexHome);
    const sourceAuthPath = join(sourceCodexHome, "auth.json");
    await writeFile(sourceAuthPath, '{"token":"initial"}');
    process.env.CODEX_HOME = sourceCodexHome;
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    spawnMock.mockReturnValueOnce(mcp.child).mockImplementation((_command, _args, options) => {
      const isolatedHome = options?.env?.CODEX_HOME;
      if (typeof isolatedHome !== "string") throw new Error("missing isolated CODEX_HOME");
      void writeFile(join(isolatedHome, "auth.json"), '{"token":"refreshed"}');
      return fake.child;
    });

    await generateWithCodexExec({
      system: "Return JSON.",
      prompt: "Answer.",
      schema: z.object({ value: z.string() }),
    });

    await expect(readFile(sourceAuthPath, "utf8")).resolves.toBe('{"token":"refreshed"}');
  });

  test("persists refreshed credentials after the generation deadline", async () => {
    const sourceCodexHome = await mkdtemp(join(tmpdir(), "mf-dashboard-codex-test-"));
    temporaryDirectories.push(sourceCodexHome);
    const sourceAuthPath = join(sourceCodexHome, "auth.json");
    await writeFile(sourceAuthPath, '{"token":"initial"}');
    process.env.CODEX_HOME = sourceCodexHome;
    process.env.CODEX_EXEC_TIMEOUT_MS = "1000";
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ hang: true });
    spawnMock.mockReturnValueOnce(mcp.child).mockImplementation((_command, _args, options) => {
      const isolatedHome = options?.env?.CODEX_HOME;
      if (typeof isolatedHome !== "string") throw new Error("missing isolated CODEX_HOME");
      void writeFile(join(isolatedHome, "auth.json"), '{"token":"refreshed"}');
      return fake.child;
    });

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "codex exec timed out after 1000ms",
    );
    await expect(readFile(sourceAuthPath, "utf8")).resolves.toBe('{"token":"refreshed"}');
  });

  test("does not overwrite credentials changed by another process", async () => {
    const sourceCodexHome = process.env.CODEX_HOME!;
    const sourceAuthPath = join(sourceCodexHome, "auth.json");
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    spawnMock.mockReturnValueOnce(mcp.child).mockImplementation((_command, _args, options) => {
      const isolatedHome = options?.env?.CODEX_HOME;
      if (typeof isolatedHome !== "string") throw new Error("missing isolated CODEX_HOME");
      void writeFile(join(isolatedHome, "auth.json"), '{"token":"refreshed"}');
      return fake.child;
    });
    const originalReadFile = readFileMock.getMockImplementation()!;
    let sourceReads = 0;
    readFileMock.mockImplementation(async (path, options) => {
      if (path === sourceAuthPath && ++sourceReads === 3) {
        await writeFile(sourceAuthPath, '{"token":"external-refresh"}');
      }
      return originalReadFile(path, options as never) as never;
    });

    await generateWithCodexExec({
      system: "Return JSON.",
      prompt: "Answer.",
      schema: z.object({ value: z.string() }),
    });

    await expect(readFile(sourceAuthPath, "utf8")).resolves.toBe('{"token":"external-refresh"}');
    expect(sourceReads).toBe(4);
    readFileMock.mockImplementation(originalReadFile);
  });

  test("fails closed when bounded credential persistence stalls", async () => {
    const sourceCodexHome = process.env.CODEX_HOME!;
    const sourceAuthPath = join(sourceCodexHome, "auth.json");
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    spawnMock.mockReturnValueOnce(mcp.child).mockImplementation((_command, _args, options) => {
      const isolatedHome = options?.env?.CODEX_HOME;
      if (typeof isolatedHome !== "string") throw new Error("missing isolated CODEX_HOME");
      void writeFile(join(isolatedHome, "auth.json"), '{"token":"refreshed"}');
      return fake.child;
    });
    const originalReadFile = readFileMock.getMockImplementation()!;
    let sourceReads = 0;
    readFileMock.mockImplementation((path, options) => {
      if (path === sourceAuthPath && ++sourceReads === 2) {
        const signal = typeof options === "object" && options !== null ? options.signal : undefined;
        return new Promise<never>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }
      return originalReadFile(path, options as never) as never;
    });

    await expect(
      generateWithCodexExec({
        system: "Return JSON.",
        prompt: "Answer.",
        schema: z.object({ value: z.string() }),
      }),
    ).rejects.toThrow("Codex credential persistence failed");
    expect(sourceReads).toBe(2);
  }, 7_000);

  test("rejects keyring-only authentication before spawning Codex", async () => {
    const emptyCodexHome = await mkdtemp(join(tmpdir(), "mf-dashboard-codex-test-"));
    temporaryDirectories.push(emptyCodexHome);
    process.env.CODEX_HOME = emptyCodexHome;

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "Codex backend requires file-backed authentication",
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
