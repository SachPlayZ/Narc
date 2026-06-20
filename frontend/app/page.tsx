import { redirect } from "next/navigation";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

function activityDir(): string {
  const configured = process.env.LOCAL_ACTIVITY_DIR;
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  if (configured) return resolve(cwd, "..", configured);
  return resolve(cwd, "../.narc/activity");
}

export default function Home() {
  const mandateFile = join(activityDir(), "trader-a-mandate.json");
  const hasMandate = existsSync(mandateFile);

  if (!hasMandate) {
    redirect("/onboard");
  }

  redirect("/dashboard");
}
