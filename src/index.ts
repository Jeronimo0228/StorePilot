import { serve } from "@hono/node-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  loadConfig,
  validateConfig,
  logConfigValidation,
} from "./utils/config.js";
import { logger } from "./utils/logger.js";
import { createMcpServer } from "./server.js";
import { registerResources } from "./resources/status.js";
import { createHttpApp } from "./http/app.js";
import { createWebhookApp } from "./webhook/handler.js";

declare const __APP_VERSION__: string;

const USAGE = `StorePilot ${__APP_VERSION__} — MCP server for App Store Connect and Google Play releases.

It is meant to be launched by an MCP client (Claude Code, Claude Desktop, Cursor...):

  claude mcp add storepilot -- npx -y storepilot-mcp@latest

Credentials (environment variables, at least one store):
  Apple:  APPLE_KEY_ID, APPLE_ISSUER_ID, APPLE_PRIVATE_KEY_PATH
  Google: GOOGLE_SERVICE_ACCOUNT_KEY_PATH

Options:
  -h, --help     Show this help
  -v, --version  Print the version

Docs: https://github.com/Jeronimo0228/StorePilot#readme`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`${__APP_VERSION__}\n`);
    return;
  }
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const config = loadConfig();
  const validation = validateConfig(config);

  if (!validation.valid) {
    process.stderr.write(
      `StorePilot can't start:\n${validation.errors.map((e) => `- ${e}`).join("\n")}\n\n${USAGE}\n`,
    );
    process.exit(1);
  }
  logConfigValidation(validation);

  const mcpServer = createMcpServer(config);
  registerResources(mcpServer);

  if (config.transport === "http") {
    const app = createHttpApp(config, mcpServer);
    serve({
      fetch: app.fetch,
      port: config.mcpPort,
    });
    logger.info(
      `HTTP server listening on port ${config.mcpPort} (MCP: /mcp, webhooks: /webhook/*)`,
    );
    return;
  }

  const webhooksConfigured =
    config.webhook.easSecret && config.webhook.githubSecret;

  if (webhooksConfigured) {
    const webhookApp = createWebhookApp(
      config.webhook,
      config.easProjectMappings,
    );
    serve({
      fetch: webhookApp.fetch,
      port: config.webhook.port,
    });
    logger.info(`Webhook server listening on port ${config.webhook.port}`);
  } else if (!config.webhook.requireSecrets) {
    logger.warn(
      "Webhook secrets not configured — webhook server not started. Configure EAS_WEBHOOK_SECRET and GITHUB_WEBHOOK_SECRET to enable.",
    );
  }

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  logger.info(
    `MCP server running on stdio transport (toolset: ${config.toolset})`,
  );
}

main().catch((err) => {
  logger.error("Fatal error", err);
  process.exit(1);
});
