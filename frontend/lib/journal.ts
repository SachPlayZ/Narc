import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ZodSchema } from "zod";

function activityDir(): string {
  const configured = process.env.LOCAL_ACTIVITY_DIR;
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  if (configured) {
    // If relative, resolve from the repo root (one level up from frontend/)
    return resolve(cwd, "..", configured);
  }
  return resolve(cwd, "../.narc/activity");
}

export function readJsonl<T>(filename: string, schema: ZodSchema<T>): T[] {
  const dir = activityDir();
  const filePath = join(dir, filename);
  if (!existsSync(filePath)) {
    return [];
  }
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const results: T[] = [];
  for (const line of lines) {
    try {
      const parsed = schema.parse(JSON.parse(line));
      results.push(parsed);
    } catch {
      // Skip malformed lines
    }
  }
  return results;
}
