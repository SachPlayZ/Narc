import { describe, expect, it } from "vitest";
import {
  formatPolicyEnv,
  parseByteArgument,
  parsePolicyPublishResponse,
  parsePolicyStateResponse
} from "./admin.js";

describe("parsePolicyPublishResponse", () => {
  it("extracts package and object ids from publish output", () => {
    const parsed = parsePolicyPublishResponse({
      digest: "ABCD1234",
      objectChanges: [
        { type: "published", packageId: "0xpackage", digest: "ABCD1234", version: "1", modules: ["narc_policy"] },
        {
          type: "created",
          objectId: "0xowner",
          objectType: "0xpackage::narc_policy::OwnerCap",
          digest: "ABCD1234",
          version: "1",
          owner: { AddressOwner: "0xsender" },
          sender: "0xsender"
        },
        {
          type: "created",
          objectId: "0xguardian",
          objectType: "0xpackage::narc_policy::GuardianCap",
          digest: "ABCD1234",
          version: "1",
          owner: { AddressOwner: "0xsender" },
          sender: "0xsender"
        },
        {
          type: "created",
          objectId: "0xpolicy",
          objectType: "0xpackage::narc_policy::AgentPolicy",
          digest: "ABCD1234",
          version: "1",
          owner: { Shared: { initial_shared_version: "1" } },
          sender: "0xsender"
        }
      ]
    });

    expect(parsed.packageId).toBe("0xpackage");
    expect(parsed.policyObjectId).toBe("0xpolicy");
    expect(formatPolicyEnv(parsed)).toContain("OWNER_CAP_ID=0xowner");
  });
});

describe("parsePolicyStateResponse", () => {
  it("normalizes policy object state", () => {
    const state = parsePolicyStateResponse({
      status: "VersionFound",
      details: {
        objectId: "0xpolicy",
        version: "7",
        type: "0xpackage::narc_policy::AgentPolicy",
        owner: { Shared: { initial_shared_version: "1" } },
        content: {
          dataType: "moveObject",
          fields: {
            paused: true,
            mandate_hash: [1, 2, 255],
            last_reason_blob: { vec: [[114, 101, 97, 115, 111, 110]] }
          }
        }
      }
    });

    expect(state.paused).toBe(true);
    expect(state.mandateHashHex).toBe("0x0102ff");
    expect(state.lastReasonBlobUtf8).toBe("reason");
    expect(state.owner).toBe("shared:1");
  });

  it("handles absent optional reason blobs", () => {
    const state = parsePolicyStateResponse({
      status: "VersionFound",
      details: {
        objectId: "0xpolicy",
        version: "8",
        type: "0xpackage::narc_policy::AgentPolicy",
        owner: { AddressOwner: "0xsender" },
        content: {
          dataType: "moveObject",
          fields: {
            paused: false,
            mandate_hash: "0x1234",
            last_reason_blob: { vec: [] }
          }
        }
      }
    });

    expect(state.lastReasonBlobBytes).toBeNull();
    expect(state.mandateHashBytes).toEqual([0x12, 0x34]);
  });
});

describe("parseByteArgument", () => {
  it("accepts utf8 or hex inputs", () => {
    expect(parseByteArgument("reason")).toEqual([114, 101, 97, 115, 111, 110]);
    expect(parseByteArgument("0x1234")).toEqual([0x12, 0x34]);
  });
});
