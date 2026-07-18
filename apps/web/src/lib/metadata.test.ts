import { describe, expect, it } from "vitest";
import { createMetadataBase } from "./metadata";

describe("createMetadataBase", () => {
  it("uses the public demo URL when deployment variables are unavailable", () => {
    expect(createMetadataBase({}).href).toBe("https://mf-dashboard-demo.vercel.app/");
  });

  it("prefers the explicitly configured site URL", () => {
    expect(
      createMetadataBase({
        NEXT_PUBLIC_SITE_URL: "https://dashboard.example.com/base/",
        VERCEL_PROJECT_PRODUCTION_URL: "production.example.com",
        VERCEL_URL: "preview.example.com",
      }).href,
    ).toBe("https://dashboard.example.com/base/");
  });

  it("adds HTTPS to Vercel hostnames", () => {
    expect(createMetadataBase({ VERCEL_URL: "preview.example.com" }).href).toBe(
      "https://preview.example.com/",
    );
  });
});
