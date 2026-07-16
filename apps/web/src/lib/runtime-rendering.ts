import { connection } from "next/server";

function isStaticDemoBuild() {
  return process.env.DEMO_MODE === "true";
}

export async function waitForRuntimeData() {
  if (isStaticDemoBuild()) return;

  await connection();
}
