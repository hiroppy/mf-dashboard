import { describe, expect, it } from "vitest";
import { txTemplates } from "./transactions";

describe("demo transaction templates", () => {
  it.each(["カード", "給与", "家賃", "ローン", "税"])(
    "%s候補を確認できる匿名の定期取引を含む",
    (keyword) => {
      expect(
        txTemplates.some(
          ({ category, subCategory, description, frequency }) =>
            frequency === "monthly" &&
            [category, subCategory, description].some((value) => value.includes(keyword)),
        ),
      ).toBe(true);
    },
  );
});
