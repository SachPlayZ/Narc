import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { hashMandate } from "./mandate.js";
import { MandateSchema, type Mandate } from "./schemas.js";

export const MandateArtifactSchema = z.object({
  mandate: MandateSchema,
  mandateHash: z.string().min(1),
  writtenAt: z.number().int().positive(),
  source: z.enum(["trader"]).default("trader")
});
export type MandateArtifact = z.infer<typeof MandateArtifactSchema>;

export function createMandateArtifact(
  mandate: Mandate,
  writtenAt = Date.now()
): MandateArtifact {
  return MandateArtifactSchema.parse({
    mandate,
    mandateHash: hashMandate(mandate),
    writtenAt,
    source: "trader"
  });
}

export function writeMandateArtifact(path: string, mandate: Mandate, writtenAt = Date.now()): MandateArtifact {
  const artifact = createMandateArtifact(mandate, writtenAt);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return artifact;
}

export function readMandateArtifact(path: string): MandateArtifact | null {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (parsed && typeof parsed === "object" && "mandate" in parsed) {
    return MandateArtifactSchema.parse(parsed);
  }

  const mandate = MandateSchema.parse(parsed);
  return createMandateArtifact(mandate);
}
