import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { debug, info, warn } from "../logger.js";

/**
 * 手渡しの OTP コードを 1 つのファイル経由で受け取る
 *
 * Money Forward ME は新しい端末からのログインでメールにワンタイムコードを送る。
 * TOTP と違い手元のシークレットからは生成できないため、走行中の crawler へ外から
 * コードを渡す口が要る。
 *
 * コードは一度きりの値なので、読み取ったら成否に関わらずファイルを消す。待機を
 * 始める時点で残っているファイルは前回の走行の残骸 (コードはこの待機が始まった
 * 後にしか届かない) とみなして捨てる。
 */

const OTP_CODE_PATTERN = /^\d{4,8}$/;

export interface WaitForOtpFileOptions {
  path: string;
  timeoutMs: number;
  pollIntervalMs?: number;
  noticeIntervalMs?: number;
  /** 時計とスリープは注入して、テストがプロセス全体の時刻を差し替えずに済むようにする */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

async function consumeCode(path: string): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }

  await rm(path, { force: true });

  const code = raw.trim();
  if (!OTP_CODE_PATTERN.test(code)) {
    warn(
      `${path} の内容が OTP コードとして読めないため捨てました (4 桁から 8 桁の数字を書いてください)`,
    );
    return null;
  }

  return code;
}

async function discardStaleCode(path: string): Promise<void> {
  try {
    await readFile(path, "utf8");
  } catch {
    return;
  }

  await rm(path, { force: true });
  warn(`${path} に前回の残骸があったため捨てました`);
}

export async function waitForOtpFromFile(options: WaitForOtpFileOptions): Promise<string> {
  const { path, timeoutMs } = options;
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const noticeIntervalMs = options.noticeIntervalMs ?? 30000;
  const now = options.now ?? (() => Date.now());
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutSeconds = Math.round(timeoutMs / 1000);

  await mkdir(dirname(path), { recursive: true });
  await discardStaleCode(path);

  const deadline = now() + timeoutMs;
  let lastNoticeAt = now();
  info(
    `OTP コードを待っています: 届いたコードを ${path} へ書いてください (最大 ${timeoutSeconds} 秒)`,
  );

  for (;;) {
    const code = await consumeCode(path);
    if (code) {
      info("OTP コードを受け取りました");
      return code;
    }

    const current = now();
    if (current >= deadline) {
      throw new Error(`OTP コードが ${timeoutSeconds} 秒以内に ${path} へ書き込まれませんでした`);
    }

    if (current - lastNoticeAt >= noticeIntervalMs) {
      lastNoticeAt = current;
      info(`OTP コードを待っています (残り ${Math.round((deadline - current) / 1000)} 秒)`);
    }

    debug("OTP コードのファイルはまだありません");
    await sleep(pollIntervalMs);
  }
}
