import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

export const dynamic = "force-dynamic";

const AGENT_POLICY_OBJECT_ID =
  process.env.AGENT_POLICY_OBJECT_ID ??
  "0x2f738d6b04d5804516c160e432f6059e7da196419be62a856801dd9b57441920";

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null;
}

function parseMoveBytes(value: unknown): number[] {
  if (typeof value === "string") {
    if (value.startsWith("0x")) return [...Buffer.from(value.slice(2), "hex")];
    return [...Buffer.from(value, "utf8")];
  }
  if (Array.isArray(value)) {
    return value.map((e) => {
      const n = typeof e === "number" ? e : Number(e);
      return n;
    });
  }
  if (isRecord(value)) {
    if (Array.isArray(value.bytes)) return parseMoveBytes(value.bytes);
    if (Array.isArray(value.vec)) return parseMoveBytes(value.vec);
  }
  return [];
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

function toHex(bytes: number[]): string {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

export async function GET() {
  try {
    const rpcUrl =
      process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl("testnet");
    const client = new SuiJsonRpcClient({ url: rpcUrl, network: "testnet" });

    const object = await client.getObject({
      id: AGENT_POLICY_OBJECT_ID,
      options: { showContent: true, showOwner: true, showType: true },
    });

    const data = isRecord(object) && isRecord(object.data) ? object.data : null;
    if (!data) {
      throw new Error("Policy object not found or missing data");
    }

    const content = isRecord(data.content) ? data.content : null;
    if (!content || content.dataType !== "moveObject") {
      throw new Error("Policy object content was not a moveObject");
    }

    const fields = isRecord(content.fields) ? content.fields : null;
    if (!fields) throw new Error("Missing fields in policy object");

    const mandateHashBytes = parseMoveBytes(fields.mandate_hash);
    const lastReasonBlobBytes = parseMoveOptionalBytes(fields.last_reason_blob);
    const paused =
      typeof fields.paused === "boolean" ? fields.paused : false;

    return Response.json({
      paused,
      mandateHash: toHex(mandateHashBytes),
      objectId: typeof data.objectId === "string" ? data.objectId : AGENT_POLICY_OBJECT_ID,
      lastReasonBlob: lastReasonBlobBytes
        ? Buffer.from(lastReasonBlobBytes).toString("utf8")
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
