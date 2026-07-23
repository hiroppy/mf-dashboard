import type { Db } from "@mf-dashboard/db";
import { describe, expect, it } from "vitest";
import { createFinanceChatTools } from "./tools.js";

const db = {} as Db;
const groupId = "test-group";

describe("createFinanceChatTools", () => {
  it("exposes one general database tool and validated navigation", () => {
    expect(Object.keys(createFinanceChatTools(db, groupId))).toEqual([
      "queryDatabase",
      "presentChart",
      "getFinanceDashboardRoute",
    ]);
  });
});
