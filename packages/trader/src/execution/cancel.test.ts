import { describe, expect, it, vi } from "vitest";

vi.mock("./deepbook.js", () => ({
  getOpenOrders: vi.fn(async () => []),
  cancelLiveOrdersForManager: vi.fn()
}));

import { cancelOpenOrders } from "./cancel.js";

describe("cancelOpenOrders", () => {
  it("handles zero open orders without failing", async () => {
    await expect(cancelOpenOrders("0xmanager", {} as never)).resolves.toEqual({
      openOrdersFound: 0,
      canceled: 0,
      status: "SUCCESS"
    });
  });
});
