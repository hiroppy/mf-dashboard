import type {
  BankForecastManualEvent,
  BankForecastManualEventInput,
} from "@mf-dashboard/db/queries/bank-forecast-manual-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock =
  vi.fn<
    (
      input: BankForecastManualEventInput,
      groupId?: string,
    ) => Promise<BankForecastManualEvent | null>
  >();
const updateMock =
  vi.fn<
    (
      id: number,
      input: BankForecastManualEventInput,
      groupId?: string,
    ) => Promise<BankForecastManualEvent | null>
  >();
const deleteMock = vi.fn<(id: number, groupId?: string) => Promise<boolean>>();
const revalidatePathMock = vi.fn<(path: string, type?: "layout" | "page") => void>();

vi.mock("@mf-dashboard/db/queries/bank-forecast-manual-event", () => ({
  createBankForecastManualEvent: createMock,
  updateBankForecastManualEvent: updateMock,
  deleteBankForecastManualEvent: deleteMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

const { DELETE, PATCH, POST } = await import("./route");

const validBody = {
  accountId: 1,
  date: "2030-10-15",
  amount: 120_000,
  direction: "expense",
  description: "予定納税",
  groupId: "group-a",
} as const;
const persistedFields = {
  accountId: validBody.accountId,
  date: validBody.date,
  amount: validBody.amount,
  direction: validBody.direction,
  description: validBody.description,
};

function mutationRequest(
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
  headers: HeadersInit = {},
) {
  const requestHeaders = new Headers({
    "content-type": "application/json",
    origin: "http://localhost",
  });
  new Headers(headers).forEach((value, key) => requestHeaders.set(key, value));

  return new Request("http://localhost/api/bank-forecast/manual-events", {
    method,
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/api/bank-forecast/manual-events", () => {
  it("creates a future manual event and revalidates forecasts", async () => {
    createMock.mockResolvedValue({ id: 1, ...persistedFields });
    const response = await POST(mutationRequest("POST", validBody));

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(
      {
        accountId: 1,
        date: "2030-10-15",
        amount: 120_000,
        direction: "expense",
        description: "予定納税",
      },
      validBody.groupId,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it.each([
    [{ ...validBody, accountId: 0 }, "account"],
    [{ ...validBody, date: "2020-01-01" }, "past date"],
    [{ ...validBody, date: "2030-02-31" }, "calendar date"],
    [{ ...validBody, date: "2099-10-15" }, "date beyond forecast horizon"],
    [{ ...validBody, amount: 0 }, "zero amount"],
    [{ ...validBody, amount: Number.MAX_SAFE_INTEGER + 1 }, "unsafe amount"],
    [{ ...validBody, amount: 1_000_000_000_001 }, "amount above supported maximum"],
    [{ ...validBody, direction: "transfer" }, "direction"],
    [{ ...validBody, description: "   " }, "description"],
    [{ ...validBody, description: "a".repeat(101) }, "description length"],
  ])("rejects invalid %s (%s)", async (body, _label) => {
    const response = await POST(mutationRequest("POST", body));
    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("updates an event after trimming its description", async () => {
    updateMock.mockResolvedValue({ id: 2, ...persistedFields, description: "予定納税" });
    const response = await PATCH(
      mutationRequest("PATCH", { ...validBody, id: 2, description: "  予定納税  " }),
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      2,
      {
        accountId: 1,
        date: "2030-10-15",
        amount: 120_000,
        direction: "expense",
        description: "予定納税",
      },
      validBody.groupId,
    );
  });

  it("deletes an event in the selected group", async () => {
    deleteMock.mockResolvedValue(true);
    const response = await DELETE(mutationRequest("DELETE", { id: 2, groupId: "group-a" }));

    expect(response.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith(2, "group-a");
  });

  it.each([
    ["POST", () => createMock.mockResolvedValue(null)],
    ["PATCH", () => updateMock.mockResolvedValue(null)],
    ["DELETE", () => deleteMock.mockResolvedValue(false)],
  ] as const)(
    "returns 404 when %s targets an event outside the selected group",
    async (method, mockScopeDenial) => {
      mockScopeDenial();
      const body =
        method === "DELETE"
          ? { id: 2, groupId: "group-a" }
          : { ...validBody, ...(method === "PATCH" ? { id: 2 } : {}) };
      const handler = method === "POST" ? POST : method === "PATCH" ? PATCH : DELETE;
      const response = await handler(mutationRequest(method, body));

      expect(response.status).toBe(404);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["POST", POST, validBody],
    ["PATCH", PATCH, { ...validBody, id: 2 }],
    ["DELETE", DELETE, { id: 2, groupId: "group-a" }],
  ] as const)("rejects cross-origin %s mutations", async (_methodName, handler, body) => {
    const response = await handler(
      mutationRequest(_methodName, body, { origin: "https://attacker.example" }),
    );

    expect(response.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("requires application/json", async () => {
    const response = await POST(
      mutationRequest("POST", validBody, { "content-type": "text/plain" }),
    );

    expect(response.status).toBe(415);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects writes on hosted demos", async () => {
    vi.stubEnv("VERCEL", "1");
    const response = await POST(mutationRequest("POST", validBody));
    expect(response.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });
});
