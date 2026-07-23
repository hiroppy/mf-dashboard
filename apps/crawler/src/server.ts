import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { createCrawlerProgressReporter } from "./crawler-progress.js";
import {
  acquireCrawlerRunLock,
  CrawlerAlreadyRunningError,
  getCrawlerRunState,
  type CrawlerRunState,
} from "./crawler-run-lock.js";
import { getCrawlerRunStatePath } from "./crawler-run-state.js";
import { error, info } from "./logger.js";

const DEFAULT_PORT = 8766;

interface CrawlerTriggerServerOptions {
  getState?: () => Promise<CrawlerRunState>;
  startRun?: () => Promise<CrawlerRunState>;
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

export async function startCrawlerRun(): Promise<CrawlerRunState> {
  const lock = await acquireCrawlerRunLock("manual");
  let progress: Awaited<ReturnType<typeof createCrawlerProgressReporter>>;
  try {
    progress = await createCrawlerProgressReporter(
      process.env.CRAWLER_STATE_PATH ?? getCrawlerRunStatePath(),
      lock.record,
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

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (url.pathname === "/status") {
        if (request.method !== "GET") {
          methodNotAllowed(response);
          return;
        }

        json(response, 200, await getState());
        return;
      }

      if (url.pathname === "/runs") {
        if (request.method !== "POST") {
          methodNotAllowed(response);
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

export function listenCrawlerTriggerServer(port = DEFAULT_PORT): Server {
  const server = createCrawlerTriggerServer();
  server.listen(port, "0.0.0.0", () => {
    info(`Crawler trigger server listening on ${port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  listenCrawlerTriggerServer(Number(process.env.CRAWLER_PORT) || DEFAULT_PORT);
}
