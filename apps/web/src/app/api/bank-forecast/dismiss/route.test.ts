import type { BankForecastDismissalInput } from "@mf-dashboard/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dismissMock =
  vi.fn<(input: BankForecastDismissalInput, groupId?: string) => Promise<boolean>>();
const revalidatePathMock = vi.fn<(path: string, type?: "layout" | "page") => void>();
vi.mock("@mf-dashboard/db", () => ({ dismissBankForecastCandidate: dismissMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

const { POST } = await import("./route");

describe("POST /api/bank-forecast/dismiss", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    dismissMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("rejects writes on Vercel demos", async () => {
    vi.stubEnv("VERCEL", "1");

    const response = await POST(
      new Request("http://localhost/api/bank-forecast/dismiss", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(403);
    expect(dismissMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input", async () => {
    const response = await POST(
      new Request("http://localhost/api/bank-forecast/dismiss", {
        method: "POST",
        body: JSON.stringify({ accountId: 1 }),
      }),
    );

    expect(response.status).toBe(400);
    expect(dismissMock).not.toHaveBeenCalled();
  });

  it.each(["2026-02-31", "2026-99-99"])("rejects invalid calendar date %s", async (date) => {
    const response = await POST(
      new Request("http://localhost/api/bank-forecast/dismiss", {
        method: "POST",
        body: JSON.stringify({
          accountId: 1,
          direction: "expense",
          recurringIdentity: "rent",
          dismissedThroughDate: date,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(dismissMock).not.toHaveBeenCalled();
  });

  it("saves the dismissal watermark and revalidates forecasts", async () => {
    dismissMock.mockResolvedValue(true);
    const response = await POST(
      new Request("http://localhost/api/bank-forecast/dismiss", {
        method: "POST",
        body: JSON.stringify({
          accountId: 1,
          direction: "expense",
          recurringIdentity: "investment transfer",
          dismissedThroughDate: "2026-07-20",
          groupId: "group-a",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(dismissMock).toHaveBeenCalledWith(
      {
        accountId: 1,
        direction: "expense",
        recurringIdentity: "investment transfer",
        dismissedThroughDate: "2026-07-20",
      },
      "group-a",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
