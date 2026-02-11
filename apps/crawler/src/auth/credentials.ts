import { createClient, type Client } from "@1password/sdk";
import { debug, error } from "../logger.js";

interface Credentials {
  username: string;
  password: string;
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
    integrationName: "moneyforward-daily-action",
    integrationVersion: "1.0.0",
  });

  return _opClient;
}

export async function getCredentials(): Promise<Credentials> {
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
