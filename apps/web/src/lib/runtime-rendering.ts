import { connection } from "next/server";

function isStaticDemoBuild() {
  return process.env.DEMO_MODE === "true" || process.env.GITHUB_PAGES === "true";
}

export async function waitForRuntimeData() {
  if (isStaticDemoBuild()) return;

  await connection();
}
