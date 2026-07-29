import { createClient, type Client } from "@1password/sdk";
import { debug, error } from "../logger.js";

interface Credentials {
  username: string;
  password: string;
  requiresOtp: boolean;
}

type AuthMethod = "1password" | "basic";

// 1Password SDK client (singleton)
let _opClient: Client | null = null;

function getAuthMethod(): AuthMethod {
  const authMethod = process.env.MF_AUTH_METHOD || "1password";
  if (authMethod === "1password" || authMethod === "basic") {
    return authMethod;
  }

  throw new Error(`未対応の MF_AUTH_METHOD です: ${authMethod}`);
}

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
  if (getAuthMethod() === "basic") {
    const username = process.env.MF_USERNAME || "";
    const password = process.env.MF_PASSWORD || "";

    if (!username || !password) {
      throw new Error("Basic 認証には MF_USERNAME と MF_PASSWORD が必要です");
    }

    return { username, password, requiresOtp: false };
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

  return { username, password, requiresOtp: true };
}

export async function getOTP(): Promise<string> {
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
