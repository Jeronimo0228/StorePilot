import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ProjectMemory, ProjectMemoryEntry, ProjectProfile } from "./types.js";

const CONFIG_FILENAMES = ["storepilot.yaml", "storepilot.yml", ".storepilot/project.yaml"];

function parseProfile(raw: unknown, configPath: string): ProjectProfile {
  if (!raw || typeof raw !== "object") {
    throw new Error("storepilot config must be a YAML object");
  }

  const doc = raw as Record<string, unknown>;
  const project = doc.project;
  if (typeof project !== "string" || !project.trim()) {
    throw new Error('storepilot config requires a non-empty "project" field');
  }

  const profile: ProjectProfile = {
    project: project.trim(),
    configPath,
    projectDir: dirname(configPath),
  };

  if (typeof doc.name === "string") profile.name = doc.name;

  const stores = doc.stores;
  if (stores && typeof stores === "object") {
    profile.stores = {};
    const s = stores as Record<string, unknown>;

    if (s.ios && typeof s.ios === "object") {
      const ios = s.ios as Record<string, unknown>;
      if (typeof ios.appId !== "string") {
        throw new Error("stores.ios.appId is required when stores.ios is set");
      }
      profile.stores.ios = {
        appId: ios.appId,
        bundleId: typeof ios.bundleId === "string" ? ios.bundleId : undefined,
      };
    }

    if (s.android && typeof s.android === "object") {
      const android = s.android as Record<string, unknown>;
      const pkg =
        typeof android.package === "string"
          ? android.package
          : typeof android.packageName === "string"
            ? android.packageName
            : undefined;
      if (!pkg) {
        throw new Error(
          "stores.android.package is required when stores.android is set",
        );
      }
      profile.stores.android = { package: pkg };
    }
  }

  if (doc.build && typeof doc.build === "object") {
    const build = doc.build as Record<string, unknown>;
    profile.build = {
      provider:
        typeof build.provider === "string" ? build.provider : undefined,
      projectId:
        typeof build.projectId === "string" ? build.projectId : undefined,
    };
  }

  if (doc.release && typeof doc.release === "object") {
    const release = doc.release as Record<string, unknown>;
    profile.release = {};
    if (typeof release.defaultRollout === "number") {
      profile.release.defaultRollout = release.defaultRollout;
    }
    if (release.tracks && typeof release.tracks === "object") {
      const tracks = release.tracks as Record<string, unknown>;
      profile.release.tracks = {
        internal:
          typeof tracks.internal === "string" ? tracks.internal : undefined,
        closed: typeof tracks.closed === "string" ? tracks.closed : undefined,
        open: typeof tracks.open === "string" ? tracks.open : undefined,
        production:
          typeof tracks.production === "string" ? tracks.production : undefined,
      };
    }
  }

  if (Array.isArray(doc.locales)) {
    profile.locales = doc.locales.filter(
      (l): l is string => typeof l === "string",
    );
  }

  return profile;
}

export function findProjectConfigPath(startDir = process.cwd()): string | undefined {
  let dir = resolve(startDir);
  const root = resolve("/");

  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    if (dir === root) break;
    dir = dirname(dir);
  }

  return undefined;
}

export function loadProjectProfile(explicitPath?: string): ProjectProfile | undefined {
  const configPath =
    explicitPath ||
    process.env.STOREPILOT_CONFIG_PATH ||
    findProjectConfigPath();

  if (!configPath) return undefined;
  if (!existsSync(configPath)) {
    throw new Error(`StorePilot config not found: ${configPath}`);
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = parseYaml(raw);
  return parseProfile(parsed, resolve(configPath));
}

function memoryPath(profile: ProjectProfile): string {
  const base = profile.projectDir || process.cwd();
  return join(base, ".storepilot", "memory.json");
}

export function loadProjectMemory(profile: ProjectProfile): ProjectMemory {
  const path = memoryPath(profile);
  if (!existsSync(path)) {
    return {
      projectId: profile.project,
      lastUpdated: new Date().toISOString(),
      resolved: {},
      history: [],
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as ProjectMemory;
    return {
      projectId: profile.project,
      lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
      resolved: parsed.resolved ?? {},
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return {
      projectId: profile.project,
      lastUpdated: new Date().toISOString(),
      resolved: {},
      history: [],
    };
  }
}

export function saveProjectMemory(
  profile: ProjectProfile,
  memory: ProjectMemory,
): void {
  const path = memoryPath(profile);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        ...memory,
        projectId: profile.project,
        lastUpdated: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );
}

export function appendProjectHistory(
  profile: ProjectProfile,
  entry: Omit<ProjectMemoryEntry, "at">,
): ProjectMemory {
  const memory = loadProjectMemory(profile);
  memory.history.push({ ...entry, at: new Date().toISOString() });
  if (memory.history.length > 100) {
    memory.history = memory.history.slice(-100);
  }
  saveProjectMemory(profile, memory);
  return memory;
}

export function resolveStoreIds(
  profile: ProjectProfile | undefined,
  overrides?: { appleAppId?: string; googlePackageName?: string },
): { appleAppId?: string; googlePackageName?: string } {
  return {
    appleAppId: overrides?.appleAppId ?? profile?.stores?.ios?.appId,
    googlePackageName:
      overrides?.googlePackageName ?? profile?.stores?.android?.package,
  };
}

export function resolveAndroidTrack(
  profile: ProjectProfile | undefined,
  kind: "internal" | "closed" | "open" | "production",
  fallback: string,
): string {
  return profile?.release?.tracks?.[kind] ?? fallback;
}

export interface ProjectRegistryEntry {
  project: string;
  name?: string;
  configPath: string;
  projectDir: string;
  iosAppId?: string;
  androidPackage?: string;
}

/** Carpeta base de StorePilot (registro de proyectos). STOREPILOT_HOME permite aislarla, p. ej. en pruebas. */
export function storepilotHome(): string {
  return process.env.STOREPILOT_HOME ? resolve(process.env.STOREPILOT_HOME) : join(homedir(), ".config", "storepilot");
}

function projectRegistryDirs(): string[] {
  const dirs = new Set<string>();
  if (process.env.STOREPILOT_PROJECTS_DIR) {
    for (const part of process.env.STOREPILOT_PROJECTS_DIR.split(/[:;,]/)) {
      const trimmed = part.trim();
      if (trimmed) dirs.add(resolve(trimmed));
    }
  }
  dirs.add(join(storepilotHome(), "projects"));
  return [...dirs];
}

/**
 * Explicit project config paths from STOREPILOT_PROJECTS.
 * Accepts JSON array of paths, or comma/colon/semicolon-separated paths.
 */
export function parseProjectsEnv(raw = process.env.STOREPILOT_PROJECTS): string[] {
  if (!raw?.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
          .map((p) => resolve(p.trim()));
      }
    } catch {
      // fall through to delimiter split
    }
  }
  return trimmed
    .split(/[,:;]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => resolve(p));
}

export function listRegisteredProjects(
  startDir = process.cwd(),
): ProjectRegistryEntry[] {
  const seen = new Set<string>();
  const entries: ProjectRegistryEntry[] = [];

  const addProfile = (profile: ProjectProfile) => {
    if (!profile.configPath) return;
    if (seen.has(profile.configPath)) return;
    seen.add(profile.configPath);
    entries.push({
      project: profile.project,
      name: profile.name,
      configPath: profile.configPath,
      projectDir: profile.projectDir ?? dirname(profile.configPath),
      iosAppId: profile.stores?.ios?.appId,
      androidPackage: profile.stores?.android?.package,
    });
  };

  // 1) Explicit paths from STOREPILOT_PROJECTS
  for (const configPath of parseProjectsEnv()) {
    try {
      if (!existsSync(configPath)) continue;
      addProfile(loadProjectProfile(configPath)!);
    } catch {
      // skip invalid
    }
  }

  // 2) Subdirectories under STOREPILOT_PROJECTS_DIR / ~/.config/storepilot/projects
  for (const dir of projectRegistryDirs()) {
    if (!existsSync(dir)) continue;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (!item.isDirectory()) continue;
      const subdir = join(dir, item.name);
      const configPath = findProjectConfigPath(subdir);
      if (!configPath) continue;
      try {
        addProfile(loadProjectProfile(configPath)!);
      } catch {
        // skip invalid profiles
      }
    }
    // Also accept yaml files directly in the registry dir
    for (const name of CONFIG_FILENAMES) {
      // only flat filenames, not .storepilot/...
      if (name.includes("/")) continue;
      const flat = join(dir, name);
      if (!existsSync(flat)) continue;
      try {
        addProfile(loadProjectProfile(flat)!);
      } catch {
        // skip
      }
    }
  }

  // 3) Current / default single-project pointer
  const cwdConfig =
    process.env.STOREPILOT_CONFIG_PATH ?? findProjectConfigPath(startDir);
  if (cwdConfig && existsSync(cwdConfig)) {
    try {
      addProfile(loadProjectProfile(cwdConfig)!);
    } catch {
      // skip
    }
  }

  return entries.sort((a, b) => a.project.localeCompare(b.project));
}
