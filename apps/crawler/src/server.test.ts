import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CrawlerAlreadyRunningError, type CrawlerRunState } from "./crawler-run-lock.js";
import {
  createCrawlerTriggerServer,
  listenCrawlerTriggerServer,
  recordManualRunFailure,
} from "./server.js";

const runningState: CrawlerRunState = {
  running: true,
  pid: 123,
  source: "manual",
  startedAt: "2026-01-01T00:00:00.000Z",
};

const idleState: CrawlerRunState = {
  running: false,
  pid: null,
  source: null,
  startedAt: null,
};

const authorizationHeaders = { authorization: "Bearer refresh-token" };

let server: Server | null = null;
const originalRefreshToken = process.env.REFRESH_TOKEN;

beforeEach(() => {
  process.env.REFRESH_TOKEN = "refresh-token";
});

afterEach(async () => {
  if (originalRefreshToken === undefined) delete process.env.REFRESH_TOKEN;
  else process.env.REFRESH_TOKEN = originalRefreshToken;
  if (!server) return;

  await new Promise<void>((resolve, reject) => {
    server?.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  server = null;
});

async function listen(testServer: Server): Promise<string> {
  server = testServer;
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("crawler trigger server", () => {
  test("binds to localhost by default", async () => {
    server = listenCrawlerTriggerServer(0);
    await once(server, "listening");

    expect((server.address() as AddressInfo).address).toBe("127.0.0.1");
  });

  test("terminal state の保存失敗を detached run へ再送出しない", async () => {
    const progress = {
      finish: vi.fn<() => Promise<void>>().mockRejectedValue(new Error("disk full")),
    } as unknown as Parameters<typeof recordManualRunFailure>[0];

    await expect(recordManualRunFailure(progress)).resolves.toBeUndefined();
    expect(progress.finish).toHaveBeenCalledWith("failed");
  });

  test("returns crawler status", async () => {
    const baseUrl = await listen(createCrawlerTriggerServer({ getState: async () => idleState }));

    const res = await fetch(`${baseUrl}/status`, { headers: authorizationHeaders });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(idleState);
  });

  test.each(["/status", "/events"])("rejects unauthenticated reads from %s", async (path) => {
    const getState = vi.fn<() => Promise<CrawlerRunState>>(async () => idleState);
    const baseUrl = await listen(createCrawlerTriggerServer({ getState }));

    const res = await fetch(`${baseUrl}${path}`);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    expect(getState).not.toHaveBeenCalled();
  });

  test.each(["/status", "/events"])("rejects reads with an invalid token from %s", async (path) => {
    const getState = vi.fn<() => Promise<CrawlerRunState>>(async () => idleState);
    const baseUrl = await listen(createCrawlerTriggerServer({ getState }));

    const res = await fetch(`${baseUrl}${path}`, {
      headers: { authorization: "Bearer invalid-token" },
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    expect(getState).not.toHaveBeenCalled();
  });

  test("streams crawler state changes and releases the watcher on disconnect", async () => {
    let state = idleState;
    let notifyChange = () => {};
    const stopWatching = vi.fn<() => void>();
    const baseUrl = await listen(
      createCrawlerTriggerServer({
        getState: async () => state,
        watchState: async (onChange) => {
          notifyChange = onChange;
          return stopWatching;
        },
      }),
    );

    const res = await fetch(`${baseUrl}/events`, { headers: authorizationHeaders });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    await expect(reader.read()).resolves.toMatchObject({
      value: expect.any(Uint8Array),
      done: false,
    });

    state = runningState;
    notifyChange();
    const update = await reader.read();
    expect(decoder.decode(update.value)).toContain(JSON.stringify(runningState));

    await reader.cancel();
    await vi.waitFor(() => expect(stopWatching).toHaveBeenCalledTimes(1));
  });

  test("releases a watcher that finishes setup after the client disconnects", async () => {
    let finishWatching: ((stop: () => void) => void) | undefined;
    const stopWatching = vi.fn<() => void>();
    const watcherSetup = new Promise<() => void>((resolve) => {
      finishWatching = resolve;
    });
    let markSetupStarted: (() => void) | undefined;
    const setupStarted = new Promise<void>((resolve) => {
      markSetupStarted = resolve;
    });
    const baseUrl = await listen(
      createCrawlerTriggerServer({
        getState: async () => idleState,
        watchState: async () => {
          markSetupStarted?.();
          return watcherSetup;
        },
      }),
    );
    const controller = new AbortController();

    const request = fetch(`${baseUrl}/events`, {
      headers: authorizationHeaders,
      signal: controller.signal,
    });
    await setupStarted;
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    finishWatching?.(stopWatching);

    await vi.waitFor(() => expect(stopWatching).toHaveBeenCalledTimes(1));
  });

  test("closes the SSE stream when its filesystem watcher fails", async () => {
    let reportWatcherError: ((err: Error) => void) | undefined;
    const stopWatching = vi.fn<() => void>();
    const baseUrl = await listen(
      createCrawlerTriggerServer({
        getState: async () => idleState,
        watchState: async (_onChange, onError) => {
          reportWatcherError = onError;
          return stopWatching;
        },
      }),
    );

    const res = await fetch(`${baseUrl}/events`, { headers: authorizationHeaders });
    const reader = res.body!.getReader();
    await reader.read();
    reportWatcherError?.(new Error("watch failed"));

    await vi.waitFor(() => expect(stopWatching).toHaveBeenCalledTimes(1));
  });

  test("starts a manual run", async () => {
    const startRun = vi.fn<() => Promise<CrawlerRunState>>(async () => runningState);
    const baseUrl = await listen(createCrawlerTriggerServer({ startRun }));

    const res = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: authorizationHeaders,
    });

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual(runningState);
    expect(startRun).toHaveBeenCalledTimes(1);
  });

  test("returns conflict when a run is already active", async () => {
    const startRun = vi.fn<() => Promise<CrawlerRunState>>(async () => {
      throw new CrawlerAlreadyRunningError(runningState);
    });
    const baseUrl = await listen(createCrawlerTriggerServer({ startRun }));

    const res = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: authorizationHeaders,
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual(runningState);
  });

  test("rejects a manual run without the shared token", async () => {
    const startRun = vi.fn<() => Promise<CrawlerRunState>>(async () => runningState);
    const baseUrl = await listen(createCrawlerTriggerServer({ startRun }));

    const res = await fetch(`${baseUrl}/runs`, { method: "POST" });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    expect(startRun).not.toHaveBeenCalled();
  });
});
