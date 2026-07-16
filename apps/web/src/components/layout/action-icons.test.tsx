import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActionIcons } from "./action-icons";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("ActionIcons", () => {
  it("does not render a link to the removed daily update workflow", () => {
    process.env.NEXT_PUBLIC_GITHUB_ORG = "org-a";
    process.env.NEXT_PUBLIC_GITHUB_REPO = "repo-a";

    render(<ActionIcons variant="header" />);

    expect(screen.queryByLabelText("ワークフローを実行")).toBeNull();
  });
});
