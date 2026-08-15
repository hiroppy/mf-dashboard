import { timingSafeEqual } from "node:crypto";
import { watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createCrawlerProgressReporter } from "./crawler-progress.js";
import {
  acquireCrawlerRunLock,
  CrawlerAlreadyRunningError,
  getCrawlerRunLockPath,
  getCrawlerRunState,
  type CrawlerRunState,
} from "./crawler-run-lock.js";
import { getCrawlerRunStatePath } from "./crawler-run-state.js";
import { error, info } from "./logger.js";

const DEFAULT_PORT = 8766;
const DEFAULT_HOST = "127.0.0.1";

interface CrawlerTriggerServerOptions {
  getState?: () => Promise<CrawlerRunState>;
  startRun?: () => Promise<CrawlerRunState>;
  watchState?: (onChange: () => void, onError: (err: Error) => void) => Promise<() => void>;
}

type ProgressReporter = Awaited<ReturnType<typeof createCrawlerProgressReporter>>;

export async function recordManualRunFailure(progress: ProgressReporter): Promise<void> {
  try {
    await progress.finish("failed");
  } catch (err) {
    error("Failed to record manual crawler failure:", err);
  }
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function methodNotAllowed(response: ServerResponse): void {
  response.writeHead(405, { allow: "GET, POST" });
  response.end();
}

function hasValidRefreshToken(request: IncomingMessage): boolean {
  const expectedToken = process.env.REFRESH_TOKEN;
  const authorization = request.headers.authorization;
  if (!expectedToken || !authorization?.startsWith("Bearer ")) return false;

  const suppliedToken = authorization.slice("Bearer ".length);
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

async function watchCrawlerState(
  onChange: () => void,
  onError: (err: Error) => void,
): Promise<() => void> {
  const statePath = process.env.CRAWLER_STATE_PATH ?? getCrawlerRunStatePath();
  const lockPath = getCrawlerRunLockPath();
  const watchedPaths = [statePath, lockPath];
  const targetsByDirectory = new Map<string, string[]>();
  for (const filePath of watchedPaths) {
    const directory = path.dirname(filePath);
    targetsByDirectory.set(directory, [...(targetsByDirectory.get(directory) ?? []), filePath]);
  }
  await Promise.all(
    [...targetsByDirectory.keys()].map((directory) => mkdir(directory, { recursive: true })),
  );
  const watchers: ReturnType<typeof watch>[] = [];
  const closeWatchers = () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
  const handleError = (err: Error) => {
    closeWatchers();
    onError(err);
  };

  try {
    for (const [directory, targets] of targetsByDirectory) {
      const filenames = new Set(targets.map((target) => path.basename(target)));
      const watcher = watch(directory, (_event, filename) => {
        const changedFilename = filename?.toString();
        if (shouldNotifyCrawlerStateChange(changedFilename, filenames)) {
          onChange();
        }
      });
      watcher.once("error", handleError);
      watchers.push(watcher);
    }
  } catch (err) {
    closeWatchers();
    throw err;
  }

  return closeWatchers;
}

export function shouldNotifyCrawlerStateChange(
  changedFilename: string | undefined,
  watchedFilenames: ReadonlySet<string>,
): boolean {
  // Some platforms omit the filename, so conservatively re-read in that case.
  // Mutation guard files are deliberately excluded: reading idle state creates
  // and removes them, and observing those writes would trigger an endless loop.
  return !changedFilename || watchedFilenames.has(changedFilename);
}

async function streamCrawlerState(
  request: IncomingMessage,
  response: ServerResponse,
  getState: () => Promise<CrawlerRunState>,
  watchState: (onChange: () => void, onError: (err: Error) => void) => Promise<() => void>,
): Promise<void> {
  let closed = false;
  let stopWatching: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let requestedVersion = 0;
  let sentVersion = -1;
  let sending = false;

  const close = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    stopWatching?.();
  };
  request.once("close", close);
  response.once("close", close);

  async function sendLatestState(): Promise<void> {
    requestedVersion += 1;
    if (sending) return;

    sending = true;
    try {
      while (!closed && sentVersion !== requestedVersion) {
        const version = requestedVersion;
        const state = await getState();
        if (!closed) {
          response.write(`data: ${JSON.stringify(state)}\n\n`);
          sentVersion = version;
        }
      }
    } finally {
      sending = false;
    }
  }

  const stopWatcher = await watchState(
    () => {
      void sendLatestState().catch((err) => {
        error("Failed to stream crawler state:", err);
        response.destroy(err instanceof Error ? err : undefined);
      });
    },
    (err) => {
      error("Failed to stream crawler state:", err);
      response.destroy(err);
    },
  );
  if (closed) {
    stopWatcher();
    return;
  }
  stopWatching = stopWatcher;
  response.writeHead(200, {
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "content-type": "text/event-stream",
  });
  response.flushHeaders();
  heartbeat = setInterval(() => {
    if (!closed) response.write(": heartbeat\n\n");
  }, 15_000);
  heartbeat.unref();

  try {
    await sendLatestState();
  } catch (err) {
    error("Failed to stream initial crawler state:", err);
    close();
    response.destroy(err instanceof Error ? err : undefined);
  }
}

export async function startCrawlerRun(): Promise<CrawlerRunState> {
  const lock = await acquireCrawlerRunLock("manual");
  let progress: Awaited<ReturnType<typeof createCrawlerProgressReporter>>;
  try {
    progress = await createCrawlerProgressReporter(
      process.env.CRAWLER_STATE_PATH ?? getCrawlerRunStatePath(),
      lock.record,
      { onUpdate: lock.refreshLease },
    );
  } catch (err) {
    await lock.release();
    throw err;
  }

  void (async () => {
    try {
      const { runCrawler } = await import("./run.js");
      await runCrawler(progress);
      await progress.finish("success");
    } catch (err) {
      await recordManualRunFailure(progress);
      error("Manual crawler run failed:", err);
    } finally {
      await lock.release();
    }
  })().catch((err) => {
    error("Manual crawler run finalization failed:", err);
  });

  return { ...progress.getState(), running: true, pid: lock.record.pid };
}

export function createCrawlerTriggerServer(options: CrawlerTriggerServerOptions = {}): Server {
  const getState = options.getState ?? getCrawlerRunState;
  const startRun = options.startRun ?? startCrawlerRun;
  const watchState = options.watchState ?? watchCrawlerState;

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (url.pathname === "/status") {
        if (request.method !== "GET") {
          methodNotAllowed(response);
          return;
        }
        if (!hasValidRefreshToken(request)) {
          json(response, 401, { error: "unauthorized" });
          return;
        }

        json(response, 200, await getState());
        return;
      }

      if (url.pathname === "/events") {
        if (request.method !== "GET") {
          methodNotAllowed(response);
          return;
        }
        if (!hasValidRefreshToken(request)) {
          json(response, 401, { error: "unauthorized" });
          return;
        }

        await streamCrawlerState(request, response, getState, watchState);
        return;
      }

      if (url.pathname === "/runs") {
        if (request.method !== "POST") {
          methodNotAllowed(response);
          return;
        }
        if (!hasValidRefreshToken(request)) {
          json(response, 401, { error: "unauthorized" });
          return;
        }

        try {
          json(response, 202, await startRun());
        } catch (err) {
          if (err instanceof CrawlerAlreadyRunningError) {
            json(response, 409, err.state);
            return;
          }

          throw err;
        }
        return;
      }

      json(response, 404, { error: "not found" });
    } catch (err) {
      error("Crawler trigger request failed:", err);
      json(response, 500, { error: "internal server error" });
      return;
    }
  });
}

export function listenCrawlerTriggerServer(port = DEFAULT_PORT, host = DEFAULT_HOST): Server {
  const server = createCrawlerTriggerServer();
  server.listen(port, host, () => {
    info(`Crawler trigger server listening on ${host}:${port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  listenCrawlerTriggerServer(
    Number(process.env.CRAWLER_PORT) || DEFAULT_PORT,
    process.env.CRAWLER_HOST?.trim() || DEFAULT_HOST,
  );
}
