import { createHmac } from "node:crypto";
import { debug } from "../logger.js";

interface Credentials {
  username: string;
  password: string;
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

function getRequiredEnv(name: string, options: { trim?: boolean } = {}): string {
  const rawValue = process.env[name];
  const value = options.trim ? rawValue?.trim() : rawValue;
  if (!value) {
    throw new Error(`${name} が設定されていません`);
  }

  return value;
}

export async function getCredentials(): Promise<Credentials> {
  debug("環境変数から認証情報を取得しています...");

  return {
    username: getRequiredEnv("MONEY_FORWARD_EMAIL", { trim: true }),
    password: getRequiredEnv("MONEY_FORWARD_PASSWORD"),
  };
}

function extractSecret(input: string): string {
  const value = input.trim();

  if (value.startsWith("otpauth://")) {
    const secret = new URL(value).searchParams.get("secret");
    if (!secret) {
      throw new Error("MONEY_FORWARD_TOTP_SECRET に secret パラメータがありません");
    }
    return secret;
  }

  return value;
}

function decodeBase32(input: string): Buffer {
  const normalized = extractSecret(input)
    .toUpperCase()
    .replace(/[\s=-]/g, "");

  if (!normalized) {
    throw new Error("MONEY_FORWARD_TOTP_SECRET が設定されていません");
  }

  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("MONEY_FORWARD_TOTP_SECRET は base32 形式で設定してください");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotp(secret: string, timestampMs = Date.now()): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

export async function getOTP(): Promise<string> {
  debug("環境変数から OTP を生成しています...");
  return generateTotp(getRequiredEnv("MONEY_FORWARD_TOTP_SECRET"));
}
