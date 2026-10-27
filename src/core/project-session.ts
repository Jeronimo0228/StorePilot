import { resolve } from "node:path";
import type { ProjectProfile } from "./types.js";
import {
  listRegisteredProjects,
  loadProjectProfile,
  type ProjectRegistryEntry,
} from "./project-profile.js";

/**
 * Mutable multi-project session for one MCP process.
 * Agents select/resolve by project slug, display name, package, appId, or path.
 */
export class ProjectSession {
  private active: ProjectProfile | undefined;
  private registry: ProjectRegistryEntry[] = [];

  constructor(initial?: ProjectProfile) {
    this.reload();
    if (initial) {
      this.active = initial;
      this.ensureInRegistry(initial);
    } else if (this.registry.length === 1) {
      try {
        this.active = loadProjectProfile(this.registry[0].configPath);
      } catch {
        // ignore
      }
    }
  }

  reload(): ProjectRegistryEntry[] {
    this.registry = listRegisteredProjects();
    return this.registry;
  }

  list(): ProjectRegistryEntry[] {
    return this.registry;
  }

  getActive(): ProjectProfile | undefined {
    return this.active;
  }

  /** Set active project from an already-loaded profile. */
  setActive(profile: ProjectProfile): ProjectProfile {
    this.active = profile;
    this.ensureInRegistry(profile);
    return profile;
  }

  /**
   * Resolve a project query against the registry.
   * Matches (case-insensitive): project slug, display name, ios appId,
   * android package, bundleId, config path, or project directory basename.
   */
  resolve(query: string): ProjectProfile {
    const q = query.trim();
    if (!q) {
      throw new Error("Project query is empty");
    }

    this.reload();
    const lower = q.toLowerCase();
    const pathResolved = resolve(q);

    const matches = this.registry.filter((e) => {
      if (e.project.toLowerCase() === lower) return true;
      if (e.name?.toLowerCase() === lower) return true;
      if (e.iosAppId === q) return true;
      if (e.androidPackage?.toLowerCase() === lower) return true;
      if (e.configPath === pathResolved || e.configPath === q) return true;
      if (e.projectDir === pathResolved) return true;
      const base = e.projectDir.split("/").pop()?.toLowerCase();
      if (base && base === lower) return true;
      // Fuzzy: query contained in name/project
      if (e.project.toLowerCase().includes(lower)) return true;
      if (e.name?.toLowerCase().includes(lower)) return true;
      if (e.androidPackage?.toLowerCase().includes(lower)) return true;
      return false;
    });

    if (matches.length === 0) {
      // Direct path to a yaml
      try {
        const profile = loadProjectProfile(q);
        if (profile) {
          this.ensureInRegistry(profile);
          return profile;
        }
      } catch {
        // fall through
      }
      const available = this.registry
        .map((e) => `${e.project}${e.name ? ` (${e.name})` : ""}`)
        .join(", ");
      throw new Error(
        `No project matched "${q}". Registered: ${available || "(none — set STOREPILOT_PROJECTS_DIR or STOREPILOT_PROJECTS)"}`,
      );
    }

    if (matches.length > 1) {
      // Prefer exact slug / name / package matches
      const exact = matches.filter(
        (e) =>
          e.project.toLowerCase() === lower ||
          e.name?.toLowerCase() === lower ||
          e.androidPackage?.toLowerCase() === lower ||
          e.iosAppId === q,
      );
      const pick = exact.length === 1 ? exact[0] : null;
      if (!pick) {
        throw new Error(
          `Ambiguous project "${q}". Matches: ${matches.map((m) => m.project).join(", ")}. Use exact project slug.`,
        );
      }
      const profile = loadProjectProfile(pick.configPath);
      if (!profile) throw new Error(`Failed to load ${pick.configPath}`);
      return profile;
    }

    const profile = loadProjectProfile(matches[0].configPath);
    if (!profile) throw new Error(`Failed to load ${matches[0].configPath}`);
    return profile;
  }

  select(query: string): ProjectProfile {
    const profile = this.resolve(query);
    this.active = profile;
    return profile;
  }

  /**
   * Resolve which profile to use for a tool call.
   * Priority: explicit project query → configPath → active session → default.
   */
  resolveForTool(opts?: {
    project?: string;
    configPath?: string;
  }): ProjectProfile | undefined {
    if (opts?.project) {
      return this.resolve(opts.project);
    }
    if (opts?.configPath) {
      const profile = loadProjectProfile(opts.configPath);
      if (profile) {
        this.ensureInRegistry(profile);
        return profile;
      }
    }
    return this.active;
  }

  /**
   * Fill missing store IDs from the active/resolved profile.
   * Does not overwrite explicit IDs on the tool args.
   */
  injectStoreIds<T extends Record<string, unknown>>(
    args: T,
    profile?: ProjectProfile,
  ): T {
    const p = profile ?? this.active;
    if (!p) return args;

    const out = { ...args } as Record<string, unknown>;
    const ios = p.stores?.ios?.appId;
    const android = p.stores?.android?.package;

    if (ios) {
      if (out.appId === undefined || out.appId === "") out.appId = ios;
      if (out.appleAppId === undefined || out.appleAppId === "") {
        out.appleAppId = ios;
      }
    }
    if (android) {
      if (out.packageName === undefined || out.packageName === "") {
        out.packageName = android;
      }
      if (out.googlePackageName === undefined || out.googlePackageName === "") {
        out.googlePackageName = android;
      }
    }
    return out as T;
  }

  private ensureInRegistry(profile: ProjectProfile): void {
    if (!profile.configPath) return;
    if (this.registry.some((e) => e.configPath === profile.configPath)) return;
    this.registry.push({
      project: profile.project,
      name: profile.name,
      configPath: profile.configPath,
      projectDir: profile.projectDir ?? profile.configPath,
      iosAppId: profile.stores?.ios?.appId,
      androidPackage: profile.stores?.android?.package,
    });
    this.registry.sort((a, b) => a.project.localeCompare(b.project));
  }
}

/** Process-wide session (set once when MCP server starts). */
let globalSession: ProjectSession | undefined;

export function getProjectSession(): ProjectSession {
  if (!globalSession) {
    globalSession = new ProjectSession();
  }
  return globalSession;
}

export function initProjectSession(initial?: ProjectProfile): ProjectSession {
  globalSession = new ProjectSession(initial);
  return globalSession;
}
