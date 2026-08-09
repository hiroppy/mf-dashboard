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
  date: "2099-10-15",
  amount: 120_000,
  direction: "expense",
  description: "予定納税",
  groupId: "group-a",
} as const;

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/api/bank-forecast/manual-events", () => {
  it("creates a future manual event and revalidates forecasts", async () => {
    createMock.mockResolvedValue({ id: 1, ...validBody });
    const response = await POST(
      new Request("http://localhost/api/bank-forecast/manual-events", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(
      {
        accountId: 1,
        date: "2099-10-15",
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
    [{ ...validBody, date: "2099-02-31" }, "calendar date"],
    [{ ...validBody, amount: 0 }, "zero amount"],
    [{ ...validBody, amount: Number.MAX_SAFE_INTEGER + 1 }, "unsafe amount"],
    [{ ...validBody, direction: "transfer" }, "direction"],
    [{ ...validBody, description: "   " }, "description"],
  ])("rejects invalid %s (%s)", async (body, _label) => {
    const response = await POST(
      new Request("http://localhost/api/bank-forecast/manual-events", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("updates an event after trimming its description", async () => {
    updateMock.mockResolvedValue({ id: 2, ...validBody, description: "予定納税" });
    const response = await PATCH(
      new Request("http://localhost/api/bank-forecast/manual-events", {
        method: "PATCH",
        body: JSON.stringify({ ...validBody, id: 2, description: "  予定納税  " }),
      }),
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      2,
      {
        accountId: 1,
        date: "2099-10-15",
        amount: 120_000,
        direction: "expense",
        description: "予定納税",
      },
      validBody.groupId,
    );
  });

  it("deletes an event in the selected group", async () => {
    deleteMock.mockResolvedValue(true);
    const response = await DELETE(
      new Request("http://localhost/api/bank-forecast/manual-events", {
        method: "DELETE",
        body: JSON.stringify({ id: 2, groupId: "group-a" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith(2, "group-a");
  });

  it("rejects writes on hosted demos", async () => {
    vi.stubEnv("VERCEL", "1");
    const response = await POST(
      new Request("http://localhost/api/bank-forecast/manual-events", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
    );
    expect(response.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });
});
