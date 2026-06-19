import { describe, expect, it, vi } from "vitest";

vi.mock("./deepbook.js", () => ({
  getOpenOrders: vi.fn(async () => []),
  cancelLiveOrdersForManager: vi.fn()
}));

import { cancelLiveOrdersForManager, getOpenOrders } from "./deepbook.js";
import { cancelOpenOrders } from "./cancel.js";

describe("cancelOpenOrders", () => {
  it("handles zero open orders without failing", async () => {
    await expect(cancelOpenOrders("0xmanager", {} as never)).resolves.toEqual({
      openOrdersFound: 0,
      canceled: 0,
      status: "SUCCESS"
    });
  });

  it("returns digest when live open orders are canceled", async () => {
    vi.mocked(getOpenOrders).mockResolvedValueOnce(["1", "2"]);
    vi.mocked(cancelLiveOrdersForManager).mockResolvedValueOnce({ digest: "0xabc", raw: {} });

    await expect(cancelOpenOrders("0xmanager", {} as never)).resolves.toEqual({
      openOrdersFound: 2,
      canceled: 2,
      cancelTxDigest: "0xabc",
      status: "SUCCESS"
    });
  });

  it("returns a clear typed error for a bad balance manager id", async () => {
    vi.mocked(getOpenOrders).mockRejectedValueOnce(new Error("BalanceManager 0xbad was not found"));

    await expect(cancelOpenOrders("0xbad", {} as never)).resolves.toEqual({
      openOrdersFound: 0,
      canceled: 0,
      status: "FAILED",
      error: "BalanceManager 0xbad was not found"
    });
  });
});
