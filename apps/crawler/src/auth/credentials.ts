import { createClient, type Client } from "@1password/sdk";
import { debug, error, warn } from "../logger.js";
import { waitForOtpFromFile } from "./otp-file.js";

interface Credentials {
  username: string;
  password: string;
}

type CredentialsSource = "1password" | "env";

/**
 * 資格情報の取得元を決める
 *
 * 既定は 1Password で、上流の挙動と一致する。`env` を選ぶと 1Password SDK を
 * 一切呼ばず、環境変数から直接読む。
 */
function getCredentialsSource(): CredentialsSource {
  return process.env.CREDENTIALS_SOURCE === "env" ? "env" : "1password";
}

const DEFAULT_OTP_WAIT_SECONDS = 300;

/**
 * 手渡しの OTP を待つ
 *
 * MF は新しい端末からのログインでメールにコードを送る。TOTP と違いシークレット
 * からは生成できないため、走行中に外から受け取る。
 */
async function getOTPFromFile(): Promise<string> {
  const path = process.env.OTP_CODE_FILE || "";
  if (!path) {
    throw new Error(
      "CREDENTIALS_SOURCE=env で OTP が要求されました。OTP_CODE_FILE を設定してください",
    );
  }

  const configured = Number.parseInt(process.env.OTP_WAIT_TIMEOUT_SECONDS ?? "", 10);
  const seconds =
    Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_OTP_WAIT_SECONDS;

  return waitForOtpFromFile({ path, timeoutMs: seconds * 1000 });
}

function getCredentialsFromEnv(): Credentials {
  const username = process.env.MF_USERNAME || "";
  const password = process.env.MF_PASSWORD || "";

  if (!username || !password) {
    throw new Error("CREDENTIALS_SOURCE=env では MF_USERNAME と MF_PASSWORD が必要です");
  }

  return { username, password };
}

// 1Password SDK client (singleton)
let _opClient: Client | null = null;

/**
 * 1Password SDK クライアントを取得する
 */
async function getOpClient(): Promise<Client> {
  if (_opClient) {
    return _opClient;
  }

  const token = process.env.OP_SERVICE_ACCOUNT_TOKEN;
  if (!token) {
    error("OP_SERVICE_ACCOUNT_TOKEN が設定されていません");
    process.exit(1);
  }

  debug("1Password SDK クライアントを初期化しています...");
  _opClient = await createClient({
    auth: token,
    integrationName: "mf-dashboard",
    integrationVersion: "1.0.0",
  });

  return _opClient;
}

export async function getCredentials(): Promise<Credentials> {
  if (getCredentialsSource() === "env") {
    debug("環境変数から認証情報を取得しています...");
    return getCredentialsFromEnv();
  }

  const vault = process.env.OP_VAULT || "";
  const item = process.env.OP_ITEM || "";

  const client = await getOpClient();

  debug("1Password から認証情報を取得しています...");
  const [username, password] = await Promise.all([
    client.secrets.resolve(`op://${vault}/${item}/username`),
    client.secrets.resolve(`op://${vault}/${item}/password`),
  ]);

  if (!username || !password) {
    throw new Error("Failed to get credentials from 1Password");
  }

  return { username, password };
}

export async function getOTP(): Promise<string> {
  if (getCredentialsSource() === "env") {
    try {
      return await getOTPFromFile();
    } catch (err) {
      // 呼び出し元の maybeHandleOtp は OTP 処理全体を try/catch で包んで例外を
      // 握り潰し、debug ログに「OTP not required」と残すだけなので、ここで理由を
      // 出さないと「MF ME へ到達しなかった」という原因を隠した失敗になる。
      warn(`OTP を取得できませんでした: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  const vault = process.env.OP_VAULT || "";
  const item = process.env.OP_ITEM || "";
  const totpField = process.env.OP_TOTP_FIELD || "";

  if (!totpField) {
    throw new Error("OP_TOTP_FIELD が設定されていません");
  }

  const client = await getOpClient();

  debug("1Password から OTP を取得しています...");
  const otp = await client.secrets.resolve(`op://${vault}/${item}/${totpField}?attribute=totp`);

  if (!otp) {
    throw new Error("OTP の取得に失敗しました");
  }

  return otp;
}

/**
 * テスト用: クライアントをリセット
 */
export function _resetOpClient(): void {
  _opClient = null;
}
