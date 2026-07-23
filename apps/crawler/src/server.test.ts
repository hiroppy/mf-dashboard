import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test, vi } from "vitest";
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

let server: Server | null = null;

afterEach(async () => {
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

    const res = await fetch(`${baseUrl}/status`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(idleState);
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

    const res = await fetch(`${baseUrl}/events`);
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

  test("starts a manual run", async () => {
    const startRun = vi.fn<() => Promise<CrawlerRunState>>(async () => runningState);
    const baseUrl = await listen(createCrawlerTriggerServer({ startRun }));

    const res = await fetch(`${baseUrl}/runs`, { method: "POST" });

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual(runningState);
    expect(startRun).toHaveBeenCalledTimes(1);
  });

  test("returns conflict when a run is already active", async () => {
    const startRun = vi.fn<() => Promise<CrawlerRunState>>(async () => {
      throw new CrawlerAlreadyRunningError(runningState);
    });
    const baseUrl = await listen(createCrawlerTriggerServer({ startRun }));

    const res = await fetch(`${baseUrl}/runs`, { method: "POST" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual(runningState);
  });
});
