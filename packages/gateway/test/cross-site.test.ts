import { describe, expect, it } from "vitest";
import { isAllowedRequest } from "../src/cross-site";

describe("isAllowedRequest", () => {
  it.each(["GET", "HEAD", "OPTIONS", "get"])("lascia passare %s da qualunque origine", (method) => {
    expect(isAllowedRequest(method, "cross-site")).toBe(true);
  });

  it.each(["same-origin", "none"])("lascia passare POST con Sec-Fetch-Site %s", (site) => {
    expect(isAllowedRequest("POST", site)).toBe(true);
  });

  it.each(["same-site", "cross-site"])("blocca POST con Sec-Fetch-Site %s", (site) => {
    expect(isAllowedRequest("POST", site)).toBe(false);
  });

  it.each(["PUT", "PATCH", "DELETE"])("blocca %s da un altro tool", (method) => {
    expect(isAllowedRequest(method, "same-site")).toBe(false);
  });

  it("lascia passare client non browser, che non mandano Sec-Fetch-Site", () => {
    expect(isAllowedRequest("POST", null)).toBe(true);
  });
});
