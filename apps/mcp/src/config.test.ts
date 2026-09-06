import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertDatabasePathConfigured } from "./config.js";

const existingFile = fileURLToPath(import.meta.url);

describe("assertDatabasePathConfigured", () => {
  it.each([undefined, "", "data/demo.db", " /tmp/demo.db", "/tmp/demo.db "])(
    "DB_PATH=%sを拒否する",
    (databasePath) => {
      expect(() => assertDatabasePathConfigured({ DB_PATH: databasePath })).toThrow(
        "DB_PATH is required and must be an absolute path",
      );
    },
  );

  it.each([
    ["存在しないパス", `${existingFile}.missing`],
    ["ディレクトリ", fileURLToPath(new URL(".", import.meta.url))],
  ])("%sを拒否する", (_case, databasePath) => {
    expect(() => assertDatabasePathConfigured({ DB_PATH: databasePath })).toThrow(
      "DB_PATH must reference an existing file",
    );
  });

  it("既存の絶対ファイルパスを受け入れる", () => {
    expect(() => assertDatabasePathConfigured({ DB_PATH: existingFile })).not.toThrow();
  });
});
