import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { createMandateArtifact, readMandateArtifact, writeMandateArtifact } from "./mandateArtifact.js";
import { sampleMandate } from "./fixtures.js";

describe("mandateArtifact", () => {
  it("creates a stable artifact with the mandate hash", () => {
    const artifact = createMandateArtifact(sampleMandate, 1700000000000);
    expect(artifact.mandate).toEqual(sampleMandate);
    expect(artifact.mandateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.writtenAt).toBe(1700000000000);
  });

  it("writes and reads the wrapper format", async () => {
    const dir = await mkdtemp(join(tmpdir(), "narc-mandate-artifact-"));
    try {
      const path = join(dir, "mandate.json");
      const written = writeMandateArtifact(path, sampleMandate, 1700000000001);
      const readBack = readMandateArtifact(path);
      expect(readBack).toEqual(written);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
