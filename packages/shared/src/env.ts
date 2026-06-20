import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const optionalId = z.string().min(1).optional();

export const ASideEnvSchema = z.object({
  SUI_NETWORK: z.literal("testnet"),
  SUI_RPC_URL: z.string().url().optional(),
  TRADER_PRIVATE_KEY: z.string().min(1),
  OWNER_ADDRESS: z.string().min(1),
  NARC_ADDRESS: z.string().min(1),
  DEEPBOOK_POOL: z.string().min(1),
  DEEPBOOK_BALANCE_MANAGER_ID: optionalId,
  NARC_POLICY_PACKAGE_ID: optionalId,
  AGENT_POLICY_OBJECT_ID: optionalId,
  GUARDIAN_CAP_ID: optionalId,
  OWNER_CAP_ID: optionalId,
  LOCAL_ACTIVITY_DIR: z.string().min(1).default(".narc/activity")
});
export type ASideEnv = z.infer<typeof ASideEnvSchema>;

export function loadASideEnv(source: NodeJS.ProcessEnv = process.env): ASideEnv {
  const fileEnv = source === process.env ? loadRepoEnvFile() : {};
  const repoRoot = source === process.env ? findRepoRoot() : null;
  const rawActivityDir = source.LOCAL_ACTIVITY_DIR || fileEnv.LOCAL_ACTIVITY_DIR || ".narc/activity";
  const activityDir = repoRoot && !rawActivityDir.startsWith("/")
    ? resolve(repoRoot, rawActivityDir)
    : rawActivityDir;
  const normalized = {
    ...fileEnv,
    ...source,
    SUI_NETWORK: source.SUI_NETWORK || "testnet",
    SUI_RPC_URL: source.SUI_RPC_URL || fileEnv.SUI_RPC_URL || undefined,
    DEEPBOOK_BALANCE_MANAGER_ID: source.DEEPBOOK_BALANCE_MANAGER_ID || fileEnv.DEEPBOOK_BALANCE_MANAGER_ID || undefined,
    NARC_POLICY_PACKAGE_ID: source.NARC_POLICY_PACKAGE_ID || fileEnv.NARC_POLICY_PACKAGE_ID || undefined,
    AGENT_POLICY_OBJECT_ID: source.AGENT_POLICY_OBJECT_ID || fileEnv.AGENT_POLICY_OBJECT_ID || undefined,
    GUARDIAN_CAP_ID: source.GUARDIAN_CAP_ID || fileEnv.GUARDIAN_CAP_ID || undefined,
    OWNER_CAP_ID: source.OWNER_CAP_ID || fileEnv.OWNER_CAP_ID || undefined,
    LOCAL_ACTIVITY_DIR: activityDir
  };

  return ASideEnvSchema.parse(normalized);
}

export function requirePolicyEnv(env: ASideEnv): Required<Pick<ASideEnv, "NARC_POLICY_PACKAGE_ID" | "AGENT_POLICY_OBJECT_ID">> {
  if (!env.NARC_POLICY_PACKAGE_ID || !env.AGENT_POLICY_OBJECT_ID) {
    throw new Error("NARC_POLICY_PACKAGE_ID and AGENT_POLICY_OBJECT_ID are required for policy-gated execution.");
  }
  return {
    NARC_POLICY_PACKAGE_ID: env.NARC_POLICY_PACKAGE_ID,
    AGENT_POLICY_OBJECT_ID: env.AGENT_POLICY_OBJECT_ID
  };
}

export function loadRepoEnvFile(startDir = process.cwd()): NodeJS.ProcessEnv {
  const envPath = findUp(".env", startDir);
  if (!envPath) {
    return {};
  }

  const parsed: NodeJS.ProcessEnv = {};
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }

  return parsed;
}

export const BSideEnvSchema = z.object({
  SUI_NETWORK: z.literal("testnet"),
  SUI_RPC_URL: z.string().url().optional(),
  NARC_PRIVATE_KEY: z.string().min(1),
  NARC_AGENT_ID: z.string().min(1).default("trader-a"),
  NARC_AUDITOR_ID: z.string().min(1).default("narc"),
  NARC_POLICY_PACKAGE_ID: optionalId,
  AGENT_POLICY_OBJECT_ID: optionalId,
  GUARDIAN_CAP_ID: optionalId,
  DEEPBOOK_POOL: z.string().min(1).default("SUI_DBUSDC"),
  DEEPBOOK_BALANCE_MANAGER_ID: optionalId,
  MEMWAL_RELAYER_URL: z.string().url().optional(),
  MEMWAL_ACCOUNT_ID: z.string().min(1).optional(),
  MEMWAL_DELEGATE_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().min(1).default("qwen/qwen3-32b"),
  LOCAL_ACTIVITY_DIR: z.string().min(1).default(".narc/activity")
});
export type BSideEnv = z.infer<typeof BSideEnvSchema>;

export function loadBSideEnv(source: NodeJS.ProcessEnv = process.env): BSideEnv {
  const repoRoot = source === process.env ? findRepoRoot() : null;
  const fileEnv = source === process.env ? loadRepoEnvFile() : {};
  const merged = { ...fileEnv, ...source };

  const rawActivityDir = merged.LOCAL_ACTIVITY_DIR || ".narc/activity";
  // Resolve relative paths from the repo root so auditor/memory/dashboard
  // all write/read the same directory regardless of their cwd.
  const activityDir = repoRoot && !rawActivityDir.startsWith("/")
    ? resolve(repoRoot, rawActivityDir)
    : rawActivityDir;

  const normalized = {
    SUI_NETWORK: merged.SUI_NETWORK || "testnet",
    SUI_RPC_URL: merged.SUI_RPC_URL || undefined,
    NARC_PRIVATE_KEY: merged.NARC_PRIVATE_KEY || merged.TRADER_PRIVATE_KEY || "",
    NARC_AGENT_ID: merged.NARC_AGENT_ID || "trader-a",
    NARC_AUDITOR_ID: merged.NARC_AUDITOR_ID || "narc",
    NARC_POLICY_PACKAGE_ID: merged.NARC_POLICY_PACKAGE_ID || undefined,
    AGENT_POLICY_OBJECT_ID: merged.AGENT_POLICY_OBJECT_ID || undefined,
    GUARDIAN_CAP_ID: merged.GUARDIAN_CAP_ID || undefined,
    DEEPBOOK_POOL: merged.DEEPBOOK_POOL || "SUI_DBUSDC",
    DEEPBOOK_BALANCE_MANAGER_ID: merged.DEEPBOOK_BALANCE_MANAGER_ID || undefined,
    MEMWAL_RELAYER_URL: merged.MEMWAL_RELAYER_URL || undefined,
    MEMWAL_ACCOUNT_ID: merged.MEMWAL_ACCOUNT_ID || undefined,
    MEMWAL_DELEGATE_KEY: merged.MEMWAL_DELEGATE_KEY || undefined,
    GROQ_API_KEY: merged.GROQ_API_KEY || undefined,
    GROQ_MODEL: merged.GROQ_MODEL || "qwen/qwen3-32b",
    LOCAL_ACTIVITY_DIR: activityDir
  };
  return BSideEnvSchema.parse(normalized);
}

function findRepoRoot(startDir = process.cwd()): string | null {
  return findUp(".env", startDir) ? dirname(findUp(".env", startDir)!) : null;
}

function findUp(target: string, startDir: string): string | null {
  let current = resolve(startDir);
  while (true) {
    const candidate = resolve(current, target);
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
