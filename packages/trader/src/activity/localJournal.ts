import { mkdir, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DecisionRecord, OutcomeRecord } from "@narc/shared";

export type LocalJournal = {
  writeDecision(record: DecisionRecord): Promise<string>;
  writeOutcome(record: OutcomeRecord): Promise<string>;
};

export function createLocalJournal(rootDir = ".narc/activity"): LocalJournal {
  return {
    async writeDecision(record) {
      const path = join(rootDir, `${record.agentId}-decisions.jsonl`);
      await appendJsonLine(path, record);
      return `local:${path}:${record.recordId}`;
    },
    async writeOutcome(record) {
      const path = join(rootDir, `${record.agentId}-outcomes.jsonl`);
      await appendJsonLine(path, record);
      return `local:${path}:${record.recordId}`;
    }
  };
}

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}
