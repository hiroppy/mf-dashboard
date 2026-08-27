import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { waitForOtpFromFile } from "./otp-file.js";

vi.mock("../logger.js", () => ({
  debug: vi.fn<(...args: unknown[]) => void>(),
  info: vi.fn<(...args: unknown[]) => void>(),
  warn: vi.fn<(...args: unknown[]) => void>(),
}));

describe("waitForOtpFromFile", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "otp-file-"));
    path = join(dir, "otp-code.txt");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /**
   * 時計とスリープは注入する。プロセス全体の時刻を差し替えると、併走する処理が
   * 同じ関数を呼んで値を消費し、待機の判定が静かにずれるため。
   */
  function clock(stepMs: number) {
    let current = 0;
    return {
      now: () => current,
      sleep: async (): Promise<void> => {
        current += stepMs;
      },
    };
  }

  test("returns the code once it appears and consumes the file", async () => {
    const { now, sleep } = clock(1000);
    let ticks = 0;

    const promise = waitForOtpFromFile({
      path,
      timeoutMs: 60_000,
      now,
      sleep: async () => {
        ticks += 1;
        if (ticks === 3) await writeFile(path, "123456\n", "utf8");
        await sleep();
      },
    });

    await expect(promise).resolves.toBe("123456");
    await expect(readFile(path, "utf8")).rejects.toThrow("ENOENT");
  });

  test("discards a code left over from a previous run before waiting", async () => {
    await writeFile(path, "999999", "utf8");
    const { now, sleep } = clock(1000);

    const promise = waitForOtpFromFile({
      path,
      timeoutMs: 5_000,
      now,
      sleep,
    });

    await expect(promise).rejects.toThrow("5 秒以内に");
  });

  test("keeps waiting when the file does not hold a code", async () => {
    const { now, sleep } = clock(1000);
    let ticks = 0;

    const promise = waitForOtpFromFile({
      path,
      timeoutMs: 60_000,
      now,
      sleep: async () => {
        ticks += 1;
        if (ticks === 1) await writeFile(path, "not-a-code", "utf8");
        if (ticks === 4) await writeFile(path, "4242", "utf8");
        await sleep();
      },
    });

    await expect(promise).resolves.toBe("4242");
  });

  test("records the handoff so its frequency can be counted later", async () => {
    const eventLogPath = join(dir, "otp-events.jsonl");
    const { now, sleep } = clock(1000);
    let ticks = 0;
    let stamps = 0;

    await waitForOtpFromFile({
      path,
      timeoutMs: 60_000,
      eventLogPath,
      now,
      nowIso: () => `2026-08-27T00:00:0${stamps++}.000Z`,
      sleep: async () => {
        ticks += 1;
        if (ticks === 2) await writeFile(path, "135790", "utf8");
        await sleep();
      },
    });

    const events = (await readFile(eventLogPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events.map((event) => event.event)).toEqual(["wait_started", "code_received"]);
    expect(events[0]).toMatchObject({ at: "2026-08-27T00:00:00.000Z", path, timeoutSeconds: 60 });
    expect(events[1]).toMatchObject({ waited_seconds: 2 });
  });

  test("records a timeout as its own event", async () => {
    const eventLogPath = join(dir, "otp-events.jsonl");
    const { now, sleep } = clock(10_000);

    await expect(
      waitForOtpFromFile({ path, timeoutMs: 20_000, eventLogPath, now, sleep }),
    ).rejects.toThrow("20 秒以内に");

    const events = (await readFile(eventLogPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.map((event) => event.event)).toEqual(["wait_started", "timed_out"]);
  });

  test("keeps waiting when the alert cannot be delivered", async () => {
    const { now, sleep } = clock(1000);
    let ticks = 0;

    const code = await waitForOtpFromFile({
      path,
      timeoutMs: 60_000,
      onWaitStart: () => {
        throw new Error("webhook down");
      },
      now,
      sleep: async () => {
        ticks += 1;
        if (ticks === 1) await writeFile(path, "864209", "utf8");
        await sleep();
      },
    });

    expect(code).toBe("864209");
  });

  test("fails with the configured timeout in the message", async () => {
    const { now, sleep } = clock(10_000);

    await expect(waitForOtpFromFile({ path, timeoutMs: 30_000, now, sleep })).rejects.toThrow(
      `OTP コードが 30 秒以内に ${path} へ書き込まれませんでした`,
    );
  });
});
