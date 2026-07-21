import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

const spawnMock = vi.hoisted(() => vi.fn<typeof import("node:child_process").spawn>());

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const { generateWithCodexAppServer } = await import("./codex-app-server.js");

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

function createFakeAppServer() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const messages: Array<Record<string, unknown>> = [];
  let input = "";

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
          respond({ id: message.id, result: { thread: { id: "thread-test" } } });
        } else if (message.method === "turn/start") {
          respond({ id: message.id, result: { turn: { id: "turn-test" } } });
          respond({
            id: 99,
            method: "item/tool/call",
            params: { tool: "lookupValue", arguments: {} },
          });
        } else if (message.id === 99) {
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
      callback();
    },
  });

  const kill = vi.fn<() => boolean>(() => true);
  const child = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    stdin,
    kill,
  }) as unknown as ChildProcessWithoutNullStreams;

  return { child, kill, messages };
}

describe("generateWithCodexAppServer", () => {
  test("runs an ephemeral read-only turn and answers dynamic tool calls", async () => {
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
    });
    expect(execute).toHaveBeenCalledWith({});
    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      ["app-server", "--listen", "stdio://"],
      expect.objectContaining({ cwd: process.cwd(), stdio: "pipe" }),
    );

    const threadStart = fake.messages.find((message) => message.method === "thread/start");
    expect(threadStart?.params).toMatchObject({
      approvalPolicy: "never",
      sandbox: "read-only",
      ephemeral: true,
      dynamicTools: [expect.objectContaining({ name: "lookupValue", type: "function" })],
    });
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("rejects an invalid timeout before spawning a process", async () => {
    process.env.CODEX_APP_SERVER_TIMEOUT_MS = "invalid";

    await expect(
      generateWithCodexAppServer({ system: "System", prompt: "Prompt" }),
    ).rejects.toThrow("CODEX_APP_SERVER_TIMEOUT_MS must be a positive number");
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
