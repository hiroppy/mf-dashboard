import { createServer, type ServerResponse } from "node:http";

const port = Number(process.env.MOCK_CRAWLER_PORT ?? 18_766);
const expectedToken = process.env.MOCK_CRAWLER_TOKEN ?? "e2e-refresh-token";
const clients = new Set<ServerResponse>();

const startedAt = "2026-01-01T00:00:00.000Z";
const finishedAt = "2026-01-01T00:00:10.000Z";
const authenticationDetails = {
  label: "MoneyForward に認証",
  step: "authentication",
  metadata: null,
} as const;
const currentAuthentication = {
  timelineItemId: "authentication",
  ...authenticationDetails,
};
const authenticationFailure = { code: "auth_failed", message: "E2E用の認証エラー" } as const;

type MockState = Record<string, unknown> & { running: boolean };

let state: MockState = idleState();
let runCount = 0;

function idleState(): MockState {
  return { available: true, running: false };
}

function currentRunDetails() {
  return {
    version: 1,
    runId: `e2e-run-${runCount}`,
    source: "manual",
    startedAt,
  } as const;
}

function runningState(): MockState {
  return {
    ...currentRunDetails(),
    running: true,
    runStatus: "running",
    finishedAt: null,
    current: currentAuthentication,
    progress: { completed: 0, total: 1 },
    timeline: [
      {
        id: "authentication",
        ...authenticationDetails,
        status: "running",
        startedAt,
        finishedAt: null,
        reason: null,
      },
    ],
    reason: null,
  };
}

function completedState(): MockState {
  return {
    ...currentRunDetails(),
    running: false,
    runStatus: "success",
    finishedAt,
    current: null,
    progress: { completed: 1, total: 1 },
    timeline: [
      {
        id: "authentication",
        ...authenticationDetails,
        status: "done",
        startedAt,
        finishedAt,
        reason: null,
      },
    ],
    reason: null,
  };
}

function failedState(): MockState {
  return {
    ...currentRunDetails(),
    running: false,
    runStatus: "failed",
    finishedAt,
    current: currentAuthentication,
    progress: null,
    timeline: [
      {
        id: "authentication",
        ...authenticationDetails,
        status: "failed",
        startedAt,
        finishedAt,
        reason: authenticationFailure,
      },
    ],
    reason: authenticationFailure,
  };
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function eventMessage(): string {
  return `data: ${JSON.stringify(state)}\n\n`;
}

function broadcast(): void {
  for (const client of clients) client.write(eventMessage());
}

function setState(nextState: MockState): void {
  state = nextState;
  broadcast();
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

  if (url.pathname === "/__test/health") {
    writeJson(response, 200, { ready: true });
    return;
  }

  if (url.pathname === "/__test/reset" && request.method === "POST") {
    runCount = 0;
    setState(idleState());
    writeJson(response, 200, state);
    return;
  }

  if (url.pathname === "/__test/complete" && request.method === "POST") {
    setState(completedState());
    writeJson(response, 200, state);
    return;
  }

  if (url.pathname === "/__test/fail" && request.method === "POST") {
    setState(failedState());
    writeJson(response, 200, state);
    return;
  }

  if (url.pathname === "/__test/state") {
    writeJson(response, 200, { runCount, state });
    return;
  }

  if (request.headers.authorization !== `Bearer ${expectedToken}`) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }

  if (url.pathname === "/events" && request.method === "GET") {
    response.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream",
    });
    clients.add(response);
    response.write(eventMessage());
    request.once("close", () => clients.delete(response));
    return;
  }

  if (url.pathname === "/runs" && request.method === "POST") {
    if (state.running) {
      writeJson(response, 409, state);
      return;
    }

    runCount += 1;
    setState(runningState());
    writeJson(response, 202, state);
    return;
  }

  writeJson(response, 404, { error: "not found" });
});

server.listen(port, "127.0.0.1");

function close(): void {
  for (const client of clients) client.end();
  server.close(() => process.exit(0));
}

process.once("SIGINT", close);
process.once("SIGTERM", close);
