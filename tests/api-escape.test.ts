import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertAppleApiPath,
  assertGoogleMethod,
  isGoogleWriteMethod,
  parseGoogleResource,
} from "../src/utils/api-escape.js";

describe("api-escape", () => {
  it("accepts valid Apple API paths", () => {
    assert.doesNotThrow(() => assertAppleApiPath("/v1/apps"));
    assert.doesNotThrow(() => assertAppleApiPath("/v2/inAppPurchases/abc"));
  });

  it("rejects invalid Apple API paths", () => {
    assert.throws(() => assertAppleApiPath("/v3/apps"));
    assert.throws(() => assertAppleApiPath("https://evil.com/v1/apps"));
    assert.throws(() => assertAppleApiPath("/v1/../secrets"));
  });

  it("parses Google resource paths", () => {
    assert.deepEqual(parseGoogleResource("edits.tracks.list"), [
      "edits",
      "tracks",
      "list",
    ]);
  });

  it("classifies Google write methods", () => {
    assert.equal(isGoogleWriteMethod("get"), false);
    assert.equal(isGoogleWriteMethod("list"), false);
    assert.equal(isGoogleWriteMethod("upload"), true);
    assert.equal(isGoogleWriteMethod("delete"), true);
  });

  it("validates Google method names", () => {
    assert.doesNotThrow(() => assertGoogleMethod("list"));
    assert.throws(() => assertGoogleMethod("explode"));
  });

  it("accepts camelCase Google methods as googleapis names them", () => {
    assert.deepEqual(parseGoogleResource("monetization.subscriptions.batchMigratePrices").at(-1), "batchMigratePrices");
    assert.doesNotThrow(() => assertGoogleMethod("batchUpdate"));
    assert.doesNotThrow(() => assertGoogleMethod("addTargeting"));
    assert.doesNotThrow(() => assertGoogleMethod("getExternalTransaction"));
    assert.throws(() => parseGoogleResource("edits.tracks.list;drop"));
    assert.throws(() => parseGoogleResource("Edits.tracks.list"));
  });

  it("treats batchGet as read and batch writes as writes", () => {
    assert.equal(isGoogleWriteMethod("batchGet"), false);
    assert.equal(isGoogleWriteMethod("batchUpdate"), true);
    assert.equal(isGoogleWriteMethod("migratePrices"), true);
  });
});
