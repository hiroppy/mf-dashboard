import { sendDiscordErrorNotification } from "../discord.js";
import { warn } from "../logger.js";
import { sendErrorNotification } from "../slack.js";

/**
 * OTP の手渡し待ちに入ったことを通報する
 *
 * 定時実行の走行がここで止まると、待機上限を過ぎた時点でその日のデータが取れずに
 * 終わる。気付ける経路が無いと、次の走行かログを見るまで停止に気付けない。
 *
 * 通報は既存のエラー通知経路へ相乗りする。「放置すると失敗する」という意味では
 * エラーと同じ扱いでよく、新しい送信経路を増やさずに済む。
 *
 * 通報自体の失敗で走行を止めない (通報が届かなくても、コードを手で渡せば走行は
 * 続けられる)。
 */
export async function alertOtpWaiting(path: string, timeoutSeconds: number): Promise<void> {
  const message = new Error(
    `Money Forward のワンタイムコードを待っています。${timeoutSeconds} 秒以内に ${path} へコードを書いてください`,
  );

  const results = await Promise.allSettled([
    sendErrorNotification(message),
    sendDiscordErrorNotification(message),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      warn(`OTP 待ちの通報に失敗しました: ${String(result.reason)}`);
    }
  }
}
