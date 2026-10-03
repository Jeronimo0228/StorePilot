import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { buildDataSafetyCsv } from "../src/providers/google/data-safety.js";
import spec from "./fixtures-data-safety-academia.json" with { type: "json" };

describe("data safety CSV", () => {
  it("coincide con el script validado contra la API de Play", () => {
    const fromScript = execFileSync("node", ["scripts/data-safety/build.mjs", "tests/fixtures-data-safety-academia.json"], { encoding: "utf8" });
    assert.equal(buildDataSafetyCsv(spec), fromScript);
  });

  it("rechaza tipos y propósitos desconocidos", () => {
    assert.throws(() => buildDataSafetyCsv({ types: { PSL_INVENTADO: { collected: true, purposes: ["PSL_APP_FUNCTIONALITY"] } } }));
    assert.throws(() => buildDataSafetyCsv({ types: { PSL_EMAIL: { collected: true, purposes: ["PSL_OTRA_COSA"] } } }));
  });

  it("sin datos declara que no recolecta", () => {
    assert.match(buildDataSafetyCsv({}), /^PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA,,false,/m);
  });
});
