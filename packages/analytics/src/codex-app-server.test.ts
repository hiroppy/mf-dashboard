import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

const spawnMock = vi.hoisted(() => vi.fn<typeof import("node:child_process").spawn>());

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const { generateWithCodexAppServer } = await import("./codex-app-server.js");

const originalEnv = { ...process.env };
const temporaryDirectories: string[] = [];

afterEach(async () => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

function createFakeAppServer(
  toolCallCount = 1,
  instructionSources: string[] = [],
  exitDuringTurnStart = false,
  mcpServers: Array<Record<string, unknown>> = [],
  requestInteractiveInput = false,
) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const messages: Array<Record<string, unknown>> = [];
  let completedToolCalls = 0;
  let input = "";
  let child: ChildProcessWithoutNullStreams;

  const respond = (message: Record<string, unknown>) => {
    stdout.write(`${JSON.stringify(message)}\n`);
  };

  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      input += chunk.toString();
      const lines = input.split("\n");
      input = lines.pop() ?? "";

      for (const line of lines) {
        if (!line) continue;
        const message = JSON.parse(line) as Record<string, unknown>;
        messages.push(message);

        if (message.method === "initialize") {
          respond({ id: message.id, result: {} });
        } else if (message.method === "thread/start") {
          respond({
            id: message.id,
            result: {
              thread: { id: "thread-test" },
              instructionSources,
              model: "codex-test-model",
              cwd: (message.params as Record<string, unknown>).cwd,
            },
          });
        } else if (message.method === "mcpServerStatus/list") {
          respond({ id: message.id, result: { data: mcpServers } });
        } else if (message.method === "turn/start") {
          if (exitDuringTurnStart) {
            child.emit("close", 1);
            continue;
          }
          respond({ id: message.id, result: { turn: { id: "turn-test" } } });
          if (requestInteractiveInput) {
            respond({
              id: 98,
              method: "item/tool/requestUserInput",
              params: { questions: [] },
            });
            continue;
          }
          respond({
            id: 99,
            method: "item/tool/call",
            params: { tool: "lookupValue", arguments: {} },
          });
        } else if (typeof message.id === "number" && message.id >= 99) {
          completedToolCalls += 1;
          if (completedToolCalls < toolCallCount) {
            respond({
              id: 99 + completedToolCalls,
              method: "item/tool/call",
              params: { tool: "lookupValue", arguments: {} },
            });
          } else {
            respond({
              method: "item/completed",
              params: { item: { type: "agentMessage", text: '{"value":"tool-result"}' } },
            });
            respond({
              method: "turn/completed",
              params: { turn: { status: "completed" } },
            });
          }
        }
      }
      callback();
    },
  });

  const kill = vi.fn<() => boolean>(() => true);
  child = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    stdin,
    kill,
  }) as unknown as ChildProcessWithoutNullStreams;

  return { child, kill, messages, respond };
}

describe("generateWithCodexAppServer", () => {
  test("runs an ephemeral read-only turn and answers dynamic tool calls", async () => {
    process.env.UNTRUSTED_SECRET = "must-not-be-forwarded";
    const fake = createFakeAppServer();
    spawnMock.mockReturnValue(fake.child);

    const execute = vi.fn<() => Promise<{ value: string }>>(async () => ({
      value: "tool-result",
    }));
    const result = await generateWithCodexAppServer({
      system: "Return the tool value.",
      prompt: "Call lookupValue.",
      schema: z.object({ value: z.string() }),
      tools: {
        lookupValue: {
          description: "Returns a test value",
          inputSchema: z.object({}),
          execute,
        },
      },
    });

    expect(result).toEqual({
      text: '{"value":"tool-result"}',
      output: { value: "tool-result" },
      toolNames: ["lookupValue"],
      model: "codex-test-model",
    });
    expect(execute).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
        context: undefined,
        messages: [],
        toolCallId: "99",
      }),
    );
    expect(spawnMock).toHaveBeenCalledWith("codex", ["app-server", "--listen", "stdio://"], {
      cwd: expect.stringContaining("mf-dashboard-codex-"),
      env: expect.objectContaining({
        CODEX_HOME: expect.stringContaining("mf-dashboard-codex-"),
        HOME: expect.stringContaining("mf-dashboard-codex-"),
      }),
      stdio: "pipe",
    });
    const spawnOptions = spawnMock.mock.calls[0]?.[2];
    expect(spawnOptions?.env).not.toEqual(
      expect.objectContaining({ UNTRUSTED_SECRET: expect.anything() }),
    );
    expect(spawnOptions?.cwd).not.toBe(process.cwd());

    const threadStart = fake.messages.find((message) => message.method === "thread/start");
    expect(threadStart?.params).toMatchObject({
      approvalPolicy: "never",
      sandbox: "read-only",
      ephemeral: true,
      environments: [],
      selectedCapabilityRoots: [],
      developerInstructions: expect.stringContaining("Return the tool value."),
      config: {
        "features.apps": false,
        "features.shell_tool": false,
        "features.unified_exec": false,
        mcp_servers: {},
        web_search: "disabled",
      },
      dynamicTools: [expect.objectContaining({ name: "lookupValue", type: "function" })],
    });
    const turnStart = fake.messages.find((message) => message.method === "turn/start");
    expect(turnStart?.params).toMatchObject({
      input: [{ type: "text", text: "Call lookupValue." }],
    });
    expect(threadStart?.params).toMatchObject({ cwd: spawnOptions?.cwd });
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("fails closed when app-server reports inherited instruction sources", async () => {
    const fake = createFakeAppServer(1, ["AGENTS.md"]);
    spawnMock.mockReturnValue(fake.child);

    await expect(
      generateWithCodexAppServer({ system: "System", prompt: "Prompt" }),
    ).rejects.toThrow("codex app-server loaded unexpected instruction sources");
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("fails closed when app-server reports inherited MCP servers", async () => {
    const fake = createFakeAppServer(1, [], false, [{ name: "inherited-server" }]);
    spawnMock.mockReturnValue(fake.child);

    await expect(
      generateWithCodexAppServer({ system: "System", prompt: "Prompt" }),
    ).rejects.toThrow("codex app-server loaded unexpected MCP servers");
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("stops the process when the dynamic tool limit is exceeded", async () => {
    const fake = createFakeAppServer(2);
    spawnMock.mockReturnValue(fake.child);

    await expect(
      generateWithCodexAppServer({
        system: "System",
        prompt: "Call twice.",
        maxToolCalls: 1,
        tools: {
          lookupValue: {
            inputSchema: z.object({}),
            execute: () => "value",
          },
        },
      }),
    ).rejects.toThrow("codex app-server exceeded 1 tool calls");
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("rejects an invalid timeout before spawning a process", async () => {
    process.env.CODEX_APP_SERVER_TIMEOUT_MS = "invalid";

    await expect(
      generateWithCodexAppServer({ system: "System", prompt: "Prompt" }),
    ).rejects.toThrow("CODEX_APP_SERVER_TIMEOUT_MS must be a positive number");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("rejects an invalid tool limit before spawning a process", async () => {
    await expect(
      generateWithCodexAppServer({ system: "System", prompt: "Prompt", maxToolCalls: 0 }),
    ).rejects.toThrow("maxToolCalls must be a positive integer");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("does not write a slow tool result after a timeout stops the process", async () => {
    process.env.CODEX_APP_SERVER_TIMEOUT_MS = "5";
    const fake = createFakeAppServer();
    spawnMock.mockReturnValue(fake.child);
    let finishTool: (() => void) | undefined;
    const execute = vi.fn<() => Promise<string>>(
      () =>
        new Promise((resolve) => {
          finishTool = () => resolve("late-result");
        }),
    );

    await expect(
      generateWithCodexAppServer({
        system: "System",
        prompt: "Call lookupValue.",
        tools: { lookupValue: { inputSchema: z.object({}), execute } },
      }),
    ).rejects.toThrow("codex app-server timed out after 5ms");

    fake.respond({
      id: 100,
      method: "item/tool/call",
      params: { tool: "lookupValue", arguments: {} },
    });
    finishTool?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(execute).toHaveBeenCalledOnce();
    expect(fake.messages).not.toContainEqual(expect.objectContaining({ id: 99 }));
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("aborts an in-flight tool when the connection times out", async () => {
    process.env.CODEX_APP_SERVER_TIMEOUT_MS = "5";
    const fake = createFakeAppServer();
    spawnMock.mockReturnValue(fake.child);
    let aborted = false;
    const execute = vi.fn<
      (input: unknown, options: { abortSignal: AbortSignal }) => Promise<never>
    >(
      (_input: unknown, { abortSignal }: { abortSignal: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          abortSignal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(abortSignal.reason);
            },
            { once: true },
          );
        }),
    );

    await expect(
      generateWithCodexAppServer({
        system: "System",
        prompt: "Call lookupValue.",
        tools: { lookupValue: { inputSchema: z.object({}), execute } },
      }),
    ).rejects.toThrow("codex app-server timed out after 5ms");

    expect(aborted).toBe(true);
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("rejects child stdin errors instead of emitting an unhandled error", async () => {
    const fake = createFakeAppServer();
    spawnMock.mockReturnValue(fake.child);

    const generation = generateWithCodexAppServer({
      system: "System",
      prompt: "Prompt",
      tools: {
        lookupValue: {
          inputSchema: z.object({}),
          execute: () => new Promise(() => undefined),
        },
      },
    });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    setTimeout(() => fake.child.stdin.emit("error", new Error("write EPIPE")), 0);

    await expect(generation).rejects.toThrow("write EPIPE");
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("handles turn completion rejection while turn start is pending", async () => {
    const fake = createFakeAppServer(1, [], true);
    spawnMock.mockReturnValue(fake.child);

    await expect(
      generateWithCodexAppServer({ system: "System", prompt: "Prompt" }),
    ).rejects.toThrow("codex app-server exited before completion (code 1)");
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("rejects interactive input requests with a schema-valid response", async () => {
    const fake = createFakeAppServer(1, [], false, [], true);
    spawnMock.mockReturnValue(fake.child);

    await expect(
      generateWithCodexAppServer({ system: "System", prompt: "Prompt" }),
    ).rejects.toThrow("codex app-server requested unsupported interactive input");
    expect(fake.messages).toContainEqual({ id: 98, result: { answers: {} } });
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("persists credentials refreshed in the isolated Codex home", async () => {
    const sourceCodexHome = await mkdtemp(join(tmpdir(), "mf-dashboard-codex-test-"));
    temporaryDirectories.push(sourceCodexHome);
    const sourceAuthPath = join(sourceCodexHome, "auth.json");
    await writeFile(sourceAuthPath, '{"token":"initial"}');
    process.env.CODEX_HOME = sourceCodexHome;

    const fake = createFakeAppServer();
    spawnMock.mockReturnValue(fake.child);
    let finishTool: (() => void) | undefined;
    const execute = vi.fn<() => Promise<string>>(
      () =>
        new Promise<string>((resolve) => {
          finishTool = () => resolve("tool-result");
        }),
    );
    const generation = generateWithCodexAppServer({
      system: "System",
      prompt: "Prompt",
      tools: { lookupValue: { inputSchema: z.object({}), execute } },
    });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    const isolatedCodexHome = spawnMock.mock.calls[0]?.[2]?.env?.CODEX_HOME;
    if (typeof isolatedCodexHome !== "string") throw new Error("missing isolated CODEX_HOME");
    await writeFile(join(isolatedCodexHome, "auth.json"), '{"token":"refreshed"}');
    finishTool?.();

    await generation;
    await expect(readFile(sourceAuthPath, "utf8")).resolves.toBe('{"token":"refreshed"}');
  });

  test("removes the isolated Codex home when credential persistence fails", async () => {
    const sourceCodexHome = await mkdtemp(join(tmpdir(), "mf-dashboard-codex-test-"));
    temporaryDirectories.push(sourceCodexHome);
    await writeFile(join(sourceCodexHome, "auth.json"), '{"token":"initial"}');
    process.env.CODEX_HOME = sourceCodexHome;

    const fake = createFakeAppServer();
    spawnMock.mockReturnValue(fake.child);
    let finishTool: (() => void) | undefined;
    const execute = vi.fn<() => Promise<string>>(
      () =>
        new Promise<string>((resolve) => {
          finishTool = () => resolve("tool-result");
        }),
    );
    const generation = generateWithCodexAppServer({
      system: "System",
      prompt: "Prompt",
      tools: { lookupValue: { inputSchema: z.object({}), execute } },
    });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    const isolatedCodexHome = spawnMock.mock.calls[0]?.[2]?.env?.CODEX_HOME;
    if (typeof isolatedCodexHome !== "string") throw new Error("missing isolated CODEX_HOME");
    await writeFile(join(isolatedCodexHome, "auth.json"), "invalid-json");
    finishTool?.();

    await expect(generation).rejects.toThrow(/JSON|Unexpected/);
    await expect(access(isolatedCodexHome)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
