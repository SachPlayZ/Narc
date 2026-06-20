import { readMandateArtifact } from "@narc/shared";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export const dynamic = "force-dynamic";

function activityDir(): string {
  const configured = process.env.LOCAL_ACTIVITY_DIR;
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  if (configured) {
    return resolve(cwd, "..", configured);
  }
  return resolve(cwd, "../.narc/activity");
}

export async function GET() {
  const path = join(activityDir(), "trader-a-mandate.json");
  if (!existsSync(path)) {
    return Response.json({ artifact: null, exists: false });
  }

  const artifact = readMandateArtifact(path);
  return Response.json({ artifact, exists: Boolean(artifact) });
}
