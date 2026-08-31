import { describe, expect, it } from "vitest";
import { assertDatabasePathConfigured } from "./config.js";

describe("assertDatabasePathConfigured", () => {
  it.each([undefined, "", "data/demo.db"])("DB_PATH=%sを拒否する", (databasePath) => {
    expect(() => assertDatabasePathConfigured({ DB_PATH: databasePath })).toThrow(
      "DB_PATH is required and must be an absolute path",
    );
  });

  it("絶対パスを受け入れる", () => {
    expect(() => assertDatabasePathConfigured({ DB_PATH: "/tmp/demo.db" })).not.toThrow();
  });
});
