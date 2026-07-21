import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { z } from "zod";

interface AppServerTool {
  description?: string;
  inputSchema: z.ZodType;
  execute?: (input: never) => unknown;
}

interface AppServerRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface AppServerResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

interface AppServerNotification {
  method: string;
  params?: Record<string, unknown>;
}

type AppServerMessage = AppServerRequest | AppServerResponse | AppServerNotification;

interface PendingRequest {
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

export interface CodexGenerationOptions<T> {
  system: string;
  prompt: string;
  schema?: z.ZodType<T>;
  tools?: Record<string, AppServerTool>;
}

export interface CodexGenerationResult<T> {
  text: string;
  output: T | undefined;
  toolNames: string[];
}

const DEFAULT_TIMEOUT_MS = 120_000;

function getTimeoutMs(): number {
  const value = process.env.CODEX_APP_SERVER_TIMEOUT_MS;
  if (!value) return DEFAULT_TIMEOUT_MS;

  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error("CODEX_APP_SERVER_TIMEOUT_MS must be a positive number");
  }

  return timeout;
}

function serializeToolResult(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized ?? "null";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown tool error";
}

class CodexAppServerConnection {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly timeoutMs: number;
  private readonly tools: Record<string, AppServerTool>;
  private readonly toolNames: string[] = [];
  private nextId = 1;
  private stderr = "";
  private finalText = "";
  private turnCompletion?: PendingRequest;
  private stopped = false;

  constructor(tools: Record<string, AppServerTool>, timeoutMs: number) {
    this.tools = tools;
    this.timeoutMs = timeoutMs;
    this.child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => this.handleLine(line));
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString()}`.slice(-4_000);
    });
    this.child.on("error", (error) => this.rejectAll(error));
    this.child.on("close", (code) => {
      if (!this.stopped) {
        this.rejectAll(
          new Error(
            `codex app-server exited before completion (code ${code})${this.stderr ? `: ${this.stderr}` : ""}`,
          ),
        );
      }
    });
  }

  async generate<T>(options: CodexGenerationOptions<T>): Promise<CodexGenerationResult<T>> {
    const timeout = setTimeout(() => {
      this.rejectAll(new Error(`codex app-server timed out after ${this.timeoutMs}ms`));
      this.stop();
    }, this.timeoutMs);

    try {
      await this.request("initialize", {
        clientInfo: {
          name: "mf_dashboard",
          title: "mf-dashboard",
          version: "0.1.0",
        },
        capabilities: { experimentalApi: true },
      });
      this.notify("initialized", {});

      const threadResponse = await this.request("thread/start", {
        model: process.env.AI_MODEL,
        cwd: process.cwd(),
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: true,
        dynamicTools: Object.entries(this.tools).map(([name, tool]) => ({
          type: "function",
          name,
          description: tool.description ?? name,
          inputSchema: z.toJSONSchema(tool.inputSchema),
        })),
      });
      const thread = threadResponse.thread as { id?: string } | undefined;
      if (!thread?.id) throw new Error("codex app-server did not return a thread id");

      const completion = new Promise<Record<string, unknown>>((resolve, reject) => {
        this.turnCompletion = { resolve, reject };
      });
      await this.request("turn/start", {
        threadId: thread.id,
        input: [
          {
            type: "text",
            text: [
              options.system,
              "",
              "Use only the supplied dynamic tools when data is required. Do not use shell, filesystem, or network tools.",
              "",
              options.prompt,
            ].join("\n"),
          },
        ],
        outputSchema: options.schema ? z.toJSONSchema(options.schema) : undefined,
      });
      await completion;

      const output = options.schema ? options.schema.parse(JSON.parse(this.finalText)) : undefined;
      return { text: this.finalText, output, toolNames: this.toolNames };
    } finally {
      clearTimeout(timeout);
      this.stop();
    }
  }

  private request(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.send({ id, method, params });
    return promise;
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.send({ method, params });
  }

  private send(message: AppServerMessage): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: AppServerMessage;
    try {
      message = JSON.parse(line) as AppServerMessage;
    } catch {
      this.rejectAll(new Error("codex app-server emitted invalid JSON"));
      return;
    }

    if ("id" in message && !("method" in message)) {
      const response = message as AppServerResponse;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.error) {
        pending.reject(new Error(response.error.message ?? "codex app-server request failed"));
      } else {
        pending.resolve(response.result ?? {});
      }
      return;
    }

    if ("id" in message && "method" in message) {
      void this.handleServerRequest(message as AppServerRequest);
      return;
    }

    this.handleNotification(message as AppServerNotification);
  }

  private async handleServerRequest(request: AppServerRequest): Promise<void> {
    if (request.method !== "item/tool/call") {
      this.send({ id: request.id, result: { decision: "decline" } });
      return;
    }

    const toolName = request.params?.tool;
    const tool = typeof toolName === "string" ? this.tools[toolName] : undefined;
    if (!tool?.execute) {
      this.send({
        id: request.id,
        result: {
          contentItems: [{ type: "inputText", text: `Unknown tool: ${String(toolName)}` }],
          success: false,
        },
      });
      return;
    }

    try {
      this.toolNames.push(toolName as string);
      const input = tool.inputSchema.parse(request.params?.arguments);
      const result = await tool.execute(input as never);
      this.send({
        id: request.id,
        result: {
          contentItems: [{ type: "inputText", text: serializeToolResult(result) }],
          success: true,
        },
      });
    } catch (error) {
      this.send({
        id: request.id,
        result: {
          contentItems: [{ type: "inputText", text: getErrorMessage(error) }],
          success: false,
        },
      });
    }
  }

  private handleNotification(notification: AppServerNotification): void {
    if (notification.method === "item/completed") {
      const item = notification.params?.item as { type?: string; text?: string } | undefined;
      if (item?.type === "agentMessage" && item.text) this.finalText = item.text;
      return;
    }

    if (notification.method !== "turn/completed" || !this.turnCompletion) return;
    const turn = notification.params?.turn as
      | { status?: string; error?: { message?: string } }
      | undefined;
    const completion = this.turnCompletion;
    this.turnCompletion = undefined;
    if (turn?.status === "completed") {
      if (!this.finalText)
        completion.reject(new Error("codex app-server returned no final message"));
      else completion.resolve({});
    } else {
      completion.reject(
        new Error(turn?.error?.message ?? `codex turn ${turn?.status ?? "failed"}`),
      );
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.turnCompletion?.reject(error);
    this.turnCompletion = undefined;
  }

  private stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.child.stdin.end();
    this.child.kill();
  }
}

export async function generateWithCodexAppServer<T>(
  options: CodexGenerationOptions<T>,
): Promise<CodexGenerationResult<T>> {
  return new CodexAppServerConnection(options.tools ?? {}, getTimeoutMs()).generate(options);
}
