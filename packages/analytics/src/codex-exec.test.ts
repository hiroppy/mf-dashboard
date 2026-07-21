import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

const spawnMock = vi.hoisted(() => vi.fn<typeof import("node:child_process").spawn>());

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const { generateWithCodexExec } = await import("./codex-exec.js");
const originalEnv = { ...process.env };
const temporaryDirectories: string[] = [];

afterEach(async () => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

function createFakeCodex(
  options: { exitCode?: number; mcpServers?: unknown[]; output?: string } = {},
) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let input = "";
  let child: ChildProcessWithoutNullStreams;
  const kill = vi.fn<() => boolean>(() => {
    queueMicrotask(() => child.emit("close", null));
    return true;
  });
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      input += chunk.toString();
      callback();
    },
    async final(callback) {
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
      stderr.write("model: codex-test-model\n");
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
    process.env.UNTRUSTED_SECRET = "must-not-be-forwarded";
    const mcp = createFakeCodex();
    const fake = createFakeCodex();
    spawnMock.mockReturnValueOnce(mcp.child).mockReturnValueOnce(fake.child);
    const execute = vi.fn<() => Promise<{ value: string }>>(async () => ({
      value: "tool-value",
    }));

    const result = await generateWithCodexExec({
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
  });

  test("does not execute tools that are absent from the instructions", async () => {
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ output: "plain result" });
    spawnMock.mockReturnValueOnce(mcp.child).mockReturnValueOnce(fake.child);
    const execute = vi.fn<() => string>(() => "unused");

    const result = await generateWithCodexExec({
      system: "Answer directly.",
      prompt: "Hello.",
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

  test("aborts a slow preloaded tool when the command times out", async () => {
    process.env.CODEX_EXEC_TIMEOUT_MS = "5";
    let aborted = false;

    await expect(
      generateWithCodexExec({
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
    ).rejects.toThrow("codex exec timed out after 5ms");
    expect(aborted).toBe(true);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("reports non-zero Codex exits", async () => {
    const mcp = createFakeCodex();
    const fake = createFakeCodex({ exitCode: 2 });
    spawnMock.mockReturnValueOnce(mcp.child).mockReturnValueOnce(fake.child);

    await expect(generateWithCodexExec({ system: "System.", prompt: "Prompt." })).rejects.toThrow(
      "codex exited with code 2",
    );
    expect(fake.kill).toHaveBeenCalledOnce();
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
      "CODEX_EXEC_TIMEOUT_MS must be a positive number",
    );
    expect(spawnMock).not.toHaveBeenCalled();
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
});
