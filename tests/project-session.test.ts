import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProjectSession } from "../src/core/project-session.js";
import { parseProjectsEnv } from "../src/core/project-profile.js";
import { flattenGoogleApiMethods } from "../src/providers/google/api-catalog.js";

describe("project-session multi-project", () => {
  let tempDir: string;
  let prevProjects: string | undefined;
  let prevDir: string | undefined;
  let prevConfig: string | undefined;
  let prevHome: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "storepilot-multi-"));
    prevProjects = process.env.STOREPILOT_PROJECTS;
    prevDir = process.env.STOREPILOT_PROJECTS_DIR;
    prevConfig = process.env.STOREPILOT_CONFIG_PATH;
    prevHome = process.env.STOREPILOT_HOME;
    delete process.env.STOREPILOT_CONFIG_PATH;
    // Registro aislado: no leer los proyectos reales de ~/.config/storepilot.
    process.env.STOREPILOT_HOME = join(tempDir, "home");
    delete process.env.STOREPILOT_PROJECTS_DIR;

    const a = join(tempDir, "alpha");
    const b = join(tempDir, "beta");
    mkdirSync(a);
    mkdirSync(b);
    writeFileSync(
      join(a, "storepilot.yaml"),
      "project: alpha\nname: Alpha App\nstores:\n  android:\n    package: com.alpha.app\n  ios:\n    appId: \"111\"\n",
    );
    writeFileSync(
      join(b, "storepilot.yaml"),
      "project: beta\nname: Beta App\nstores:\n  android:\n    package: com.beta.app\n  ios:\n    appId: \"222\"\n",
    );

    process.env.STOREPILOT_PROJECTS = [
      join(a, "storepilot.yaml"),
      join(b, "storepilot.yaml"),
    ].join(",");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (prevProjects === undefined) delete process.env.STOREPILOT_PROJECTS;
    else process.env.STOREPILOT_PROJECTS = prevProjects;
    if (prevDir === undefined) delete process.env.STOREPILOT_PROJECTS_DIR;
    else process.env.STOREPILOT_PROJECTS_DIR = prevDir;
    if (prevConfig === undefined) delete process.env.STOREPILOT_CONFIG_PATH;
    else process.env.STOREPILOT_CONFIG_PATH = prevConfig;
    if (prevHome === undefined) delete process.env.STOREPILOT_HOME;
    else process.env.STOREPILOT_HOME = prevHome;
  });

  it("lists and selects by slug, name, and package", () => {
    const session = new ProjectSession();
    assert.equal(session.list().length, 2);

    session.select("alpha");
    assert.equal(session.getActive()?.project, "alpha");

    session.select("Beta App");
    assert.equal(session.getActive()?.stores?.android?.package, "com.beta.app");

    session.select("com.alpha.app");
    assert.equal(session.getActive()?.stores?.ios?.appId, "111");
  });

  it("injects store IDs when omitted", () => {
    const session = new ProjectSession();
    session.select("beta");
    const injected = session.injectStoreIds({ locale: "en-US" });
    assert.equal(injected.appId, "222");
    assert.equal(injected.packageName, "com.beta.app");
    assert.equal(injected.appleAppId, "222");
    assert.equal(injected.googlePackageName, "com.beta.app");
  });

  it("does not overwrite explicit IDs", () => {
    const session = new ProjectSession();
    session.select("alpha");
    const injected = session.injectStoreIds({
      appId: "999",
      packageName: "com.explicit",
    });
    assert.equal(injected.appId, "999");
    assert.equal(injected.packageName, "com.explicit");
  });
});

describe("parseProjectsEnv", () => {
  it("parses JSON and comma lists", () => {
    assert.ok(parseProjectsEnv('["/a/storepilot.yaml"]').length === 1);
    assert.ok(parseProjectsEnv("/a/x.yaml,/b/y.yaml").length === 2);
  });
});

describe("google api catalog", () => {
  it("exposes the full androidpublisher method list", () => {
    const methods = flattenGoogleApiMethods();
    assert.ok(methods.length >= 100);
    assert.ok(methods.includes("applications.dataSafety.dataSafety") || methods.some((m) => m.includes("dataSafety")));
    assert.ok(methods.some((m) => m.startsWith("orders.")));
    assert.ok(methods.some((m) => m.startsWith("edits.expansionfiles.")));
  });
});
