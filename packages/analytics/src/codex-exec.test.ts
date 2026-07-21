import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

const { lockMock, mkdirMock, mkdtempMock, openMock, readFileMock, rmMock, spawnMock } = vi.hoisted(
  () => ({
    lockMock: vi.fn<typeof import("proper-lockfile").lock>(),
    mkdirMock: vi.fn<typeof import("node:fs/promises").mkdir>(),
    mkdtempMock: vi.fn<typeof import("node:fs/promises").mkdtemp>(),
    openMock: vi.fn<typeof import("node:fs/promises").open>(),
    readFileMock: vi.fn<typeof import("node:fs/promises").readFile>(),
    rmMock: vi.fn<typeof import("node:fs/promises").rm>(),
    spawnMock: vi.fn<typeof import("node:child_process").spawn>(),
  }),
);

vi.mock("node:child_process", () => ({ spawn: spawnMock }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  mkdirMock.mockImplementation(original.mkdir);
  mkdtempMock.mockImplementation(original.mkdtemp);
  openMock.mockImplementation(original.open);
  readFileMock.mockImplementation(original.readFile);
  rmMock.mockImplementation(original.rm);
  return {
    ...original,
    mkdir: mkdirMock,
    mkdtemp: mkdtempMock,
    open: openMock,
    readFile: readFileMock,
    rm: rmMock,
  };
});

vi.mock("proper-lockfile", async (importOriginal) => {
  const original = await importOriginal<typeof import("proper-lockfile")>();
  lockMock.mockImplementation(original.lock);
  return { ...original, lock: lockMock };
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
  vi.restoreAllMocks();
  vi.clearAllMocks();
  spawnMock.mockReset();
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
    materializeSystemSkill?: boolean;
    output?: string;
    outputWhileHanging?: string;
    promptInput?: string;
    stderr?: string;
    stdout?: string;
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
      const args = spawnMock.mock.calls.at(-1)?.[1] as string[];
      if (options.hang) {
        if (options.outputWhileHanging !== undefined) {
          const outputIndex = args.indexOf("--output-last-message");
          await writeFile(args[outputIndex + 1]!, options.outputWhileHanging);
        }
        callback();
        return;
      }
      if (args[0] === "mcp") {
        stdout.write(options.stdout ?? JSON.stringify(options.mcpServers ?? []));
        queueMicrotask(() => child.emit("close", options.exitCode ?? 0));
        callback();
        return;
      }
      if (args[0] === "debug") {
        if (options.materializeSystemSkill) {
          const codexHome = spawnMock.mock.calls.at(-1)?.[2]?.env?.CODEX_HOME as string;
          const skillDirectory = join(codexHome, "skills", ".system", "bundled");
          await mkdirMock(skillDirectory, { recursive: true });
          await writeFile(join(skillDirectory, "SKILL.md"), "# Bundled skill");
        }
        stdout.write(options.promptInput ?? "[]");
        queueMicrotask(() => child.emit("close", options.exitCode ?? 0));
        callback();
        return;
      }
      const outputIndex = args.indexOf("--output-last-message");
      if (options.exitCode === undefined || options.exitCode === 0) {
        await writeFile(args[outputIndex + 1]!, options.output ?? '{"value":"ok"}');
      }
      if (options.stdout) stdout.write(options.stdout);
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

function mockCodexRun(
  mcp: ReturnType<typeof createFakeCodex>,
  codex: ReturnType<typeof createFakeCodex>,
  initialize = createFakeCodex(),
) {
  const verify = createFakeCodex();
  spawnMock
    .mockReturnValueOnce(mcp.child)
    .mockReturnValueOnce(initialize.child)
    .mockReturnValueOnce(verify.child)
    .mockReturnValueOnce(codex.child);
}

describe("generateWithCodexExec", () => {
  test("runs an isolated one-shot command with preloaded tool data and structured output", async () => {
    process.env.CODEX_ACCESS_TOKEN = "must-not-be-forwarded";
    process.env.OPENAI_API_KEY = "must-not-be-forwarded";
    process.env.UNTRUSTED_SECRET = "must-not-be-forwarded";
    process.env.all_proxy = "socks5://proxy.example.com";
    process.env.DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/user/1000/bus";
    process.env.http_proxy = "http://proxy.example.com";
    process.env.https_proxy = "http://secure-proxy.example.com";
    process.env.no_proxy = "localhost";
    process.env.XDG_RUNTIME_DIR = "/run/user/1000";
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    mockCodexRun(mcp, fake);
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

    const [command, args, spawnOptions] = spawnMock.mock.calls[3]!;
    expect(command).toBe("codex");
    expect(spawnMock.mock.calls[0]?.[2]?.env?.CODEX_HOME).not.toBe(process.env.CODEX_HOME);
    expect(spawnOptions?.env?.CODEX_HOME).not.toBe(process.env.CODEX_HOME);
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
        'default_permissions="isolated"',
        'permissions.isolated.filesystem={":workspace_roots"={ "."="read"}}',
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
    expect(spawnOptions?.env).toEqual(
      expect.objectContaining({
        all_proxy: "socks5://proxy.example.com",
        DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus",
        http_proxy: "http://proxy.example.com",
        https_proxy: "http://secure-proxy.example.com",
        no_proxy: "localhost",
        XDG_RUNTIME_DIR: "/run/user/1000",
      }),
    );
  });

  test("does not expose the mutable canonical skill tree to Codex", async () => {
    await mkdirMock(join(process.env.CODEX_HOME!, "skills", "custom"), { recursive: true });
    await writeFile(join(process.env.CODEX_HOME!, "skills", "custom", "SKILL.md"), "# Skill");
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    mockCodexRun(mcp, fake);

    await generateWithCodexExec({ system: "System.", prompt: "Prompt." });

    expect(spawnMock).toHaveBeenCalledTimes(4);
    expect(spawnMock.mock.calls[3]?.[2]?.env?.CODEX_HOME).not.toBe(process.env.CODEX_HOME);
  });

  test("rejects oversized preloaded tool data before spawning Codex", async () => {
    await expect(
      generateWithCodexExec({
        preloadTools: ["lookupValue"],
        system: "System.",
        prompt: "Prompt.",
        tools: {
          lookupValue: {
            inputSchema: z.object({}),
            execute: async () => ({ value: "x".repeat(600_000) }),
          },
        },
      }),
    ).rejects.toThrow("Codex tool result exceeds the byte limit");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("rejects oversized prompt input before spawning Codex", async () => {
    await expect(
      generateWithCodexExec({ system: "System.", prompt: "x".repeat(2_100_000) }),
    ).rejects.toThrow("Codex prompt exceeds the byte limit");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("aborts when Codex stdout exceeds the byte limit", async () => {
    const mcp = createFakeCodex({ stdout: "x".repeat(1_100_000) });
    spawnMock.mockReturnValue(mcp.child);

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "Codex stdout exceeds the byte limit",
    );
    expect(mcp.kill).toHaveBeenCalled();
  });

  test("aborts and deletes an oversized Codex output file", async () => {
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ hang: true, outputWhileHanging: "x".repeat(1_100_000) });
    mockCodexRun(mcp, fake);

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "Codex output exceeds the byte limit",
    );
    expect(fake.kill).toHaveBeenCalled();
    expect(rmMock).toHaveBeenCalledWith(expect.stringMatching(/output\.txt$/), { force: true });
  });

  test("resolves a relative temporary root before spawning Codex", async () => {
    const isolatedRoot = await mkdtemp(join(tmpdir(), "mf-dashboard-codex-relative-"));
    temporaryDirectories.push(isolatedRoot);
    mkdtempMock.mockResolvedValueOnce(relative(process.cwd(), isolatedRoot));
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    mockCodexRun(mcp, fake);

    await generateWithCodexExec({ system: "System.", prompt: "Prompt." });

    expect(isAbsolute(spawnMock.mock.calls[3]?.[2]?.env?.CODEX_HOME ?? "")).toBe(true);
    expect(isAbsolute(spawnMock.mock.calls[3]?.[2]?.env?.HOME ?? "")).toBe(true);
  });

  test("bounds a stalled final-output open by the request deadline", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "20";
    const originalOpen = openMock.getMockImplementation()!;
    openMock.mockImplementation(() => new Promise<never>(() => undefined));
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    mockCodexRun(mcp, fake);

    try {
      await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
        "codex exec timed out after 20ms",
      );
    } finally {
      openMock.mockImplementation(originalOpen);
    }
  }, 500);

  test("uses the remaining request budget for credential-lock acquisition", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "100";
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(40);
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const originalLock = lockMock.getMockImplementation()!;
    lockMock.mockImplementation(() => new Promise<never>(() => undefined));

    try {
      await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
        "codex exec timed out after 100ms",
      );

      expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 60);
      expect(spawnMock).not.toHaveBeenCalled();
    } finally {
      lockMock.mockImplementation(originalLock);
    }
  });

  test("materializes and disables bundled system skills before Codex exec", async () => {
    const mcp = createFakeCodex();
    const initialize = createFakeCodex({ materializeSystemSkill: true });
    const fake = createFakeCodex();
    mockCodexRun(mcp, fake, initialize);

    await generateWithCodexExec({ system: "System.", prompt: "Prompt." });

    const codexHome = spawnMock.mock.calls[3]?.[2]?.env?.CODEX_HOME as string;
    const skillPath = join(codexHome, "skills", ".system", "bundled", "SKILL.md");
    expect(spawnMock.mock.calls[2]?.[1]).toContain(
      `skills.config=[{path=${JSON.stringify(skillPath)},enabled=false}]`,
    );
    expect(spawnMock.mock.calls[3]?.[1]).toContain(
      `skills.config=[{path=${JSON.stringify(skillPath)},enabled=false}]`,
    );
  });

  test("does not execute tools that are absent from the instructions", async () => {
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ output: "plain result" });
    mockCodexRun(mcp, fake);
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

  test("preloads tools concurrently before starting Codex processes", async () => {
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
      .mockReturnValueOnce(createFakeCodex().child)
      .mockReturnValueOnce(createFakeCodex().child)
      .mockReturnValueOnce(secondCodex.child)
      .mockReturnValueOnce(firstMcp.child)
      .mockReturnValueOnce(createFakeCodex().child)
      .mockReturnValueOnce(createFakeCodex().child)
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
    mockCodexRun(mcp, fake);

    const error = await generateWithCodexExec({ system: "System.", prompt: "Prompt." }).catch(
      (error: unknown) => error,
    );
    expect(error).toEqual(new Error("codex exited with code 2"));
    expect(fake.kill).not.toHaveBeenCalled();
  });

  test("does not persist credentials from a failed Codex process", async () => {
    const sourceCodexHome = await mkdtemp(join(tmpdir(), "mf-dashboard-codex-test-"));
    temporaryDirectories.push(sourceCodexHome);
    const sourceAuthPath = join(sourceCodexHome, "auth.json");
    await writeFile(sourceAuthPath, '{"token":"initial"}');
    process.env.CODEX_HOME = sourceCodexHome;
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ exitCode: 2 });
    spawnMock
      .mockReturnValueOnce(mcp.child)
      .mockReturnValueOnce(createFakeCodex().child)
      .mockReturnValueOnce(createFakeCodex().child)
      .mockImplementation((_command, _args, options) => {
        writeFileSync(join(options?.env?.CODEX_HOME as string, "auth.json"), "{}");
        return fake.child;
      });

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "codex exited with code 2",
    );

    await expect(readFile(sourceAuthPath, "utf8")).resolves.toBe('{"token":"initial"}');
  });

  test("redacts malformed structured output from parser errors", async () => {
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ output: "private financial summary is malformed" });
    mockCodexRun(mcp, fake);

    const error = await generateWithCodexExec({
      system: "Return JSON.",
      prompt: "Answer.",
      schema: z.object({ value: z.string() }),
    }).catch((error: unknown) => error);

    expect(error).toEqual(new Error("Codex returned invalid structured output"));
    expect(String(error)).not.toContain("private financial summary");
  });

  test("waits for the Codex process to close after a timeout", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "1000";
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ hang: true });
    mockCodexRun(mcp, fake);

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "codex exec timed out after 1000ms",
    );
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("returns the timeout when a killed process never emits close", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "1000";
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ hang: true, ignoreKill: true });
    mockCodexRun(mcp, fake);

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "codex exec timed out after 1000ms",
    );
    expect(fake.kill).toHaveBeenNthCalledWith(1);
    expect(fake.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  });

  test("waits for isolated workspace cleanup after a timeout", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "20";
    const originalRm = rmMock.getMockImplementation()!;
    let releaseCleanup!: () => void;
    rmMock.mockImplementation((path, options) => {
      if (String(path).includes("mf-dashboard-codex-") && !String(path).includes("-test-")) {
        return new Promise<void>((resolve) => (releaseCleanup = resolve));
      }
      return originalRm(path, options);
    });
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ hang: true });
    mockCodexRun(mcp, fake);

    let settled = false;
    const outcome = generateWithCodexExec({ system: "System.", prompt: "Prompt." })
      .then(
        (result) => ({ result, error: undefined }),
        (error: unknown) => ({ result: undefined, error }),
      )
      .finally(() => {
        settled = true;
      });
    await vi.waitFor(() => expect(releaseCleanup).toBeTypeOf("function"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);

    releaseCleanup();
    const { error } = await outcome;
    expect(error).toEqual(new Error("codex exec timed out after 20ms"));
    rmMock.mockImplementation(originalRm);
  });

  test("bounds stalled isolated workspace cleanup independently", async () => {
    const originalRm = rmMock.getMockImplementation()!;
    const originalSetTimeout = globalThis.setTimeout;
    let releaseCleanup!: () => void;
    rmMock.mockImplementation((path, options) => {
      if (String(path).includes("mf-dashboard-codex-") && !String(path).includes("-test-")) {
        return new Promise<void>((resolve) => (releaseCleanup = resolve));
      }
      return originalRm(path, options);
    });
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => originalSetTimeout(callback, delay === 5_000 ? 50 : delay, ...args)) as typeof setTimeout);
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ output: "completed" });
    mockCodexRun(mcp, fake);

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).resolves.toEqual(
      expect.objectContaining({ text: "completed" }),
    );
    expect(releaseCleanup).toBeTypeOf("function");
    releaseCleanup();
    rmMock.mockImplementation(originalRm);
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
    const originalLock = lockMock.getMockImplementation()!;
    lockMock.mockResolvedValue(async () => undefined);
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(101);
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    mockCodexRun(mcp, fake);

    await expect(
      generateWithCodexExec({
        system: "System.",
        prompt: "Prompt.",
        schema: z.object({ value: z.string() }),
      }),
    ).rejects.toThrow("codex exec timed out after 100ms");
    lockMock.mockImplementation(originalLock);
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

  test("times out while acquiring the credential lock", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "20";
    const originalLock = lockMock.getMockImplementation()!;
    lockMock.mockImplementation(() => new Promise<never>(() => undefined));

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "codex exec timed out after 20ms",
    );
    expect(spawnMock).not.toHaveBeenCalled();
    lockMock.mockImplementation(originalLock);
  });

  test("bounds a stalled credential lock release", async () => {
    const originalLock = lockMock.getMockImplementation()!;
    const originalRm = rmMock.getMockImplementation()!;
    const originalSetTimeout = globalThis.setTimeout;
    let removedTemporaryAuth = false;
    lockMock.mockResolvedValue(() => new Promise<never>(() => undefined));
    rmMock.mockImplementation((path, options) => {
      if (String(path).includes("mf-dashboard-codex-") && !String(path).includes("-test-")) {
        removedTemporaryAuth = true;
      }
      return originalRm(path, options);
    });
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => originalSetTimeout(callback, delay === 5_000 ? 20 : delay, ...args)) as typeof setTimeout);
    mockCodexRun(createFakeCodex(), createFakeCodex());

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "Codex credential lock release timed out",
    );
    expect(spawnMock).toHaveBeenCalled();
    expect(removedTemporaryAuth).toBe(true);
    lockMock.mockImplementation(originalLock);
    rmMock.mockImplementation(originalRm);
  });

  test("fails closed when credential lock ownership is compromised", async () => {
    const originalLock = lockMock.getMockImplementation()!;
    const release = vi.fn<() => Promise<void>>(async () => undefined);
    lockMock.mockImplementation(async (_file, options) => {
      setImmediate(() => options?.onCompromised?.(new Error("ownership lost")));
      return release;
    });
    mockCodexRun(createFakeCodex(), createFakeCodex({ hang: true }));

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "Codex credential lock was compromised: ownership lost",
    );
    expect(release).toHaveBeenCalledOnce();
    lockMock.mockImplementation(originalLock);
  });

  test("ignores an orphaned legacy empty credential lock", async () => {
    const sourceCodexHome = await mkdtemp(join(tmpdir(), "mf-dashboard-codex-test-"));
    temporaryDirectories.push(sourceCodexHome);
    const sourceAuthPath = join(sourceCodexHome, "auth.json");
    const lockPath = `${sourceAuthPath}.mf-dashboard.lock`;
    await writeFile(sourceAuthPath, '{"token":"initial"}');
    await writeFile(lockPath, "");
    process.env.CODEX_HOME = sourceCodexHome;
    mockCodexRun(createFakeCodex(), createFakeCodex());

    await generateWithCodexExec({ system: "System.", prompt: "Prompt." });

    await expect(readFile(lockPath, "utf8")).resolves.toBe("");
  });

  test("holds the credential lock across Codex token refresh", async () => {
    const originalLock = lockMock.getMockImplementation()!;
    const release = vi.fn<() => Promise<void>>(async () => undefined);
    lockMock.mockResolvedValue(release);
    mockCodexRun(createFakeCodex(), createFakeCodex());

    await generateWithCodexExec({ system: "System.", prompt: "Prompt." });

    expect(release).toHaveBeenCalledOnce();
    expect(lockMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ retries: 0 }),
    );
    expect(spawnMock.mock.invocationCallOrder.at(-1)).toBeLessThan(
      release.mock.invocationCallOrder[0]!,
    );
    lockMock.mockImplementation(originalLock);
  });

  test("times out while creating isolated subdirectories", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "20";
    const originalMkdir = mkdirMock.getMockImplementation()!;
    mkdirMock.mockImplementation(() => new Promise<never>(() => undefined));

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "codex exec timed out after 20ms",
    );
    expect(spawnMock).not.toHaveBeenCalled();
    mkdirMock.mockImplementation(originalMkdir);
  });

  test("rejects when tool-data serialization crosses the deadline", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "100";
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(101);

    await expect(
      generateWithCodexExec({
        preloadTools: ["lookup"],
        system: "Use lookup.",
        prompt: "Prompt.",
        tools: { lookup: { inputSchema: z.object({}), execute: () => ({ value: "data" }) } },
      }),
    ).rejects.toThrow("codex exec timed out after 100ms");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("fails closed instead of copying an isolated refresh to a relative canonical home", async () => {
    const sourceCodexHome = await mkdtemp(join(tmpdir(), "mf-dashboard-codex-test-"));
    temporaryDirectories.push(sourceCodexHome);
    const sourceAuthPath = join(sourceCodexHome, "auth.json");
    await writeFile(sourceAuthPath, '{"token":"initial"}');
    process.env.CODEX_HOME = relative(process.cwd(), sourceCodexHome);
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    spawnMock
      .mockReturnValueOnce(mcp.child)
      .mockReturnValueOnce(createFakeCodex().child)
      .mockReturnValueOnce(createFakeCodex().child)
      .mockImplementation((_command, _args, options) => {
        const codexHome = options?.env?.CODEX_HOME;
        if (!codexHome || codexHome === sourceCodexHome)
          throw new Error("missing isolated CODEX_HOME");
        void writeFile(join(codexHome, "auth.json"), '{"token":"refreshed"}');
        return fake.child;
      });

    await expect(
      generateWithCodexExec({
        system: "Return JSON.",
        prompt: "Answer.",
        schema: z.object({ value: z.string() }),
      }),
    ).rejects.toThrow("Codex credential persistence failed");

    await expect(readFile(sourceAuthPath, "utf8")).resolves.toBe('{"token":"initial"}');
  });

  test("fails closed when refreshed credentials cannot be persisted", async () => {
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    spawnMock
      .mockReturnValueOnce(mcp.child)
      .mockReturnValueOnce(createFakeCodex().child)
      .mockReturnValueOnce(createFakeCodex().child)
      .mockImplementation((_command, _args, options) => {
        void writeFile(join(options?.env?.CODEX_HOME as string, "auth.json"), "invalid refreshed");
        return fake.child;
      });

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "Codex credential persistence failed",
    );
  });

  test("does not overwrite credentials refreshed by an external Codex process", async () => {
    const sourceAuthPath = join(process.env.CODEX_HOME!, "auth.json");
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    spawnMock
      .mockReturnValueOnce(mcp.child)
      .mockReturnValueOnce(createFakeCodex().child)
      .mockReturnValueOnce(createFakeCodex().child)
      .mockImplementation((_command, _args, options) => {
        writeFileSync(
          join(options?.env?.CODEX_HOME as string, "auth.json"),
          '{"token":"isolated-refresh"}',
        );
        writeFileSync(sourceAuthPath, '{"token":"external-refresh"}');
        return fake.child;
      });

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).resolves.toEqual(
      expect.objectContaining({ text: '{"value":"ok"}' }),
    );
    await expect(readFile(sourceAuthPath, "utf8")).resolves.toBe('{"token":"external-refresh"}');
  });
});
