import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { keywordsFrom, sign } from "../scripts/fetch-aliexpress.ts";

describe("AliExpress Affiliate API helpers", () => {
  it("signs sorted key+value pairs with HMAC-SHA256, upper-case hex", () => {
    const params = { timestamp: "1", app_key: "k", method: "m" };
    const expected = createHmac("sha256", "s").update("app_keykmethodmtimestamp1").digest("hex").toUpperCase();
    expect(sign(params, "s")).toBe(expected);
    expect(sign({ method: "m", app_key: "k", timestamp: "1" }, "s")).toBe(expected); // order-independent
  });

  it("reads search keywords from AliExpress and Alibaba search links", () => {
    expect(keywordsFrom("https://www.aliexpress.us/w/wholesale-tiffany-table-lamp-rose.html")).toBe("tiffany table lamp rose");
    expect(keywordsFrom("https://www.aliexpress.com/w/wholesale-wooden%20tripod%20table%20lamp.html")).toBe("wooden tripod table lamp");
    expect(keywordsFrom("https://www.alibaba.com/trade/search?SearchText=mahogany+library+bookcase")).toBe("mahogany library bookcase");
    expect(keywordsFrom("https://www.aliexpress.us/item/3256810203276155.html")).toBeNull();
  });
});
