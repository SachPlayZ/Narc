import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

type JsonRecord = Record<string, unknown>;

export type PolicyPublishInfo = {
  digest: string;
  packageId: string;
  policyObjectId: string;
  ownerCapId: string;
  guardianCapId: string;
  explorerUrl: string;
};

export type PolicyState = {
  objectId: string;
  version: string;
  type: string;
  owner: string;
  paused: boolean;
  mandateHashBytes: number[];
  mandateHashHex: string;
  lastReasonBlobBytes: number[] | null;
  lastReasonBlobHex: string | null;
  lastReasonBlobUtf8: string | null;
};

export function parsePolicyPublishResponse(input: unknown): PolicyPublishInfo {
  const response = expectRecord(input, "publish response");
  const digest = expectString(response.digest, "publish response digest");
  const objectChanges = expectArray(response.objectChanges, "publish response objectChanges");

  const published = objectChanges.find(
    (change) => isRecord(change) && change.type === "published"
  );
  if (!published || !isRecord(published)) {
    throw new Error("Publish response did not include a published package change.");
  }

  const packageId = expectString(published.packageId, "published packageId");
  const ownerCapId = findCreatedObjectId(objectChanges, `${packageId}::narc_policy::OwnerCap`);
  const guardianCapId = findCreatedObjectId(objectChanges, `${packageId}::narc_policy::GuardianCap`);
  const policyObjectId = findCreatedObjectId(objectChanges, `${packageId}::narc_policy::AgentPolicy`);

  return {
    digest,
    packageId,
    policyObjectId,
    ownerCapId,
    guardianCapId,
    explorerUrl: explorerTxUrl(digest)
  };
}

export function parsePolicyStateResponse(input: unknown): PolicyState {
  const response = expectRecord(input, "policy object response");
  const data = isRecord(response.data) ? response.data : null;
  const details = data ?? expectRecord(response.details, "policy response details");
  if (!data) {
    const status = expectString(response.status, "policy response status");
    if (status !== "VersionFound") {
      throw new Error(`Policy object lookup returned status ${status}.`);
    }
  }

  const content = expectRecord(details.content, "policy object content");
  if (content.dataType !== "moveObject") {
    throw new Error("Policy object content was not a moveObject.");
  }

  const fields = expectRecord(content.fields, "policy object fields");
  const mandateHashBytes = parseMoveBytes(fields.mandate_hash);
  const lastReasonBlobBytes = parseMoveOptionalBytes(fields.last_reason_blob);

  return {
    objectId: expectString(details.objectId, "policy object id"),
    version: expectString(details.version, "policy object version"),
    type: expectString(details.type ?? content.type, "policy object type"),
    owner: formatOwner(details.owner),
    paused: expectBoolean(fields.paused, "policy paused"),
    mandateHashBytes,
    mandateHashHex: toHex(mandateHashBytes),
    lastReasonBlobBytes,
    lastReasonBlobHex: lastReasonBlobBytes ? toHex(lastReasonBlobBytes) : null,
    lastReasonBlobUtf8: lastReasonBlobBytes ? Buffer.from(lastReasonBlobBytes).toString("utf8") : null
  };
}

export function formatPolicyEnv(info: PolicyPublishInfo): string[] {
  return [
    `NARC_POLICY_PACKAGE_ID=${info.packageId}`,
    `AGENT_POLICY_OBJECT_ID=${info.policyObjectId}`,
    `OWNER_CAP_ID=${info.ownerCapId}`,
    `GUARDIAN_CAP_ID=${info.guardianCapId}`
  ];
}

export async function savePolicyPublishArtifact(input: unknown): Promise<string> {
  const outputPath = resolveRepoRoot(".narc", "policy-publish.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(input, null, 2)}\n`, "utf8");
  return outputPath;
}

export function resolveRepoRoot(...segments: string[]): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  return resolve(here, "..", "..", "..", "..", ...segments);
}

export function policyPackagePath(): string {
  return resolveRepoRoot("packages", "narc_policy");
}

export function explorerTxUrl(digest: string): string {
  return `https://suiexplorer.com/txblock/${digest}?network=testnet`;
}

export function parseByteArgument(value: string): number[] {
  if (/^0x[0-9a-fA-F]*$/.test(value)) {
    const hex = value.slice(2);
    if (hex.length % 2 !== 0) {
      throw new Error(`Hex byte argument must have even length: ${value}`);
    }
    return [...Buffer.from(hex, "hex")];
  }
  return [...Buffer.from(value, "utf8")];
}

export async function runCommand(command: string, args: string[]): Promise<string> {
  return await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun(stdout);
        return;
      }
      reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
    });
  });
}

function findCreatedObjectId(objectChanges: unknown[], objectType: string): string {
  const match = objectChanges.find(
    (change) => isRecord(change) && change.type === "created" && change.objectType === objectType
  );
  if (!match || !isRecord(match)) {
    throw new Error(`Publish response did not include created object ${objectType}.`);
  }
  return expectString(match.objectId, `${objectType} object id`);
}

function formatOwner(owner: unknown): string {
  if (!isRecord(owner)) return "unknown";
  if (typeof owner.AddressOwner === "string") return `address:${owner.AddressOwner}`;
  if (typeof owner.ObjectOwner === "string") return `object:${owner.ObjectOwner}`;
  if (owner.Shared && isRecord(owner.Shared)) {
    return `shared:${String(owner.Shared.initial_shared_version ?? "unknown")}`;
  }
  if (owner.Immutable === true) return "immutable";
  return JSON.stringify(owner);
}

function parseMoveOptionalBytes(value: unknown): number[] | null {
  if (value == null) return null;
  if (Array.isArray(value) && value.length === 0) return null;

  if (isRecord(value) && Array.isArray(value.vec)) {
    if (value.vec.length === 0) return null;
    if (value.vec.length === 1) return parseMoveBytes(value.vec[0]);
  }

  return parseMoveBytes(value);
}

function parseMoveBytes(value: unknown): number[] {
  if (typeof value === "string") {
    if (value.startsWith("0x")) return [...Buffer.from(value.slice(2), "hex")];
    return [...Buffer.from(value, "utf8")];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      const parsed = typeof entry === "number" ? entry : Number(entry);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
        throw new Error(`Invalid byte value ${String(entry)} in Move byte vector.`);
      }
      return parsed;
    });
  }

  if (isRecord(value)) {
    if (Array.isArray(value.bytes)) return parseMoveBytes(value.bytes);
    if (Array.isArray(value.vec)) return parseMoveBytes(value.vec);
  }

  throw new Error(`Unsupported Move byte representation: ${JSON.stringify(value)}`);
}

function toHex(bytes: number[]): string {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function expectRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} to be an object.`);
  }
  return value;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an array.`);
  }
  return value;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }
  return value;
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Expected ${label} to be a boolean.`);
  }
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}
