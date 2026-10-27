import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./utils/config.js";
import { AppleClient } from "./providers/apple/client.js";
import { GooglePlayClient } from "./providers/google/client.js";
import { registerAppleTools } from "./tools/apple-tools.js";
import { registerGoogleTools } from "./tools/google-tools.js";
import { registerEscapeTools } from "./tools/escape-tools.js";
import { registerOrchestratorTools } from "./tools/orchestrator-tools.js";
import { registerSharedTools } from "./tools/shared-tools.js";
import { createToolRegistrar } from "./utils/tool-registry.js";
import { initProjectSession } from "./core/project-session.js";
import { logger } from "./utils/logger.js";

declare const __APP_VERSION__: string;

export function createMcpServer(config: Config): McpServer {
  const server = new McpServer({
    name: "storepilot-mcp",
    version: __APP_VERSION__,
  });

  const session = initProjectSession(config.projectProfile);
  const registered = session.list();
  if (registered.length > 0) {
    logger.info(
      `Project registry: ${registered.length} app(s) — ${registered.map((p) => p.project).join(", ")}`,
    );
  }
  if (session.getActive()) {
    logger.info(
      `Active project: ${session.getActive()!.project} (${session.getActive()!.configPath})`,
    );
  }

  const tool = createToolRegistrar(server, config);

  let appleClient: AppleClient | undefined;
  let googleClient: GooglePlayClient | undefined;

  if (config.apple) {
    appleClient = new AppleClient(config.apple);
    registerAppleTools(tool, appleClient);
    logger.info("Apple App Store Connect tools registered");
  } else {
    logger.warn(
      "Apple configuration not found — iOS tools will not be available",
    );
  }

  if (config.google) {
    googleClient = new GooglePlayClient(config.google);
    registerGoogleTools(tool, googleClient);
    logger.info("Google Play Console tools registered");
  } else {
    logger.warn(
      "Google configuration not found — Android tools will not be available",
    );
  }

  registerSharedTools(tool, appleClient, googleClient, config);
  registerOrchestratorTools(tool, appleClient, googleClient, config);
  registerEscapeTools(tool, appleClient, googleClient);
  logger.info(`Shared tools registered (toolset: ${config.toolset})`);

  return server;
}
