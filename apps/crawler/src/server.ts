import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import {
  acquireCrawlerRunLock,
  CrawlerAlreadyRunningError,
  getCrawlerRunState,
  type CrawlerRunState,
} from "./crawler-run-lock.js";
import { error, info } from "./logger.js";

const DEFAULT_PORT = 8766;

interface CrawlerTriggerServerOptions {
  getState?: () => Promise<CrawlerRunState>;
  startRun?: () => Promise<CrawlerRunState>;
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
  const state: CrawlerRunState = {
    running: true,
    pid: lock.record.pid,
    source: lock.record.source,
    startedAt: lock.record.startedAt,
  };

  void (async () => {
    try {
      const { runCrawler } = await import("./run.js");
      await runCrawler();
    } catch (err) {
      error("Manual crawler run failed:", err);
    } finally {
      await lock.release();
    }
  })();

  return state;
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
