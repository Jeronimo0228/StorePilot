# Multi-project registry

StorePilot can keep **many apps** in one MCP process. Tools resolve which
`storepilot.yaml` to use from the **active project**, an explicit `project`
argument, or store IDs you pass.

## Register apps

### Option A — explicit paths (`STOREPILOT_PROJECTS`)

```bash
# JSON array
export STOREPILOT_PROJECTS='["/apps/plazario/storepilot.yaml","/apps/xisti/storepilot.yaml"]'

# or comma-separated
export STOREPILOT_PROJECTS=/apps/plazario/storepilot.yaml,/apps/xisti/storepilot.yaml
```

### Option B — projects directory (`STOREPILOT_PROJECTS_DIR`)

```text
~/.config/storepilot/projects/
  plazario/storepilot.yaml
  xisti/storepilot.yaml
```

```bash
export STOREPILOT_PROJECTS_DIR=~/.config/storepilot/projects
```

### Option C — single default

```bash
export STOREPILOT_CONFIG_PATH=/apps/plazario/storepilot.yaml
```

You can combine A/B/C — all discovered configs are registered.

## Agent workflow

```text
list_projects
  → select_project("plazario")   # or project name / package / Apple appId
  → get_release_snapshot()       # appId/packageName filled automatically
  → google_update_listing(...)   # same
```

Or pass per call without switching session:

```json
{ "name": "get_release_snapshot", "arguments": { "project": "xisti" } }
```

Every typed tool accepts optional `project`. Matching is case-insensitive on:

- `project` slug in YAML
- `name` display name
- Android `package`
- Apple `appId`
- config path / project directory basename

## Cursor MCP example

```json
{
  "mcpServers": {
    "storepilot": {
      "command": "npx",
      "args": ["-y", "storepilot-mcp@latest"],
      "env": {
        "APPLE_KEY_ID": "...",
        "APPLE_ISSUER_ID": "...",
        "APPLE_PRIVATE_KEY_PATH": "...",
        "GOOGLE_SERVICE_ACCOUNT_KEY_PATH": "...",
        "MCP_TOOLSET": "all",
        "STOREPILOT_PROJECTS": "/apps/plazario/storepilot.yaml,/apps/xisti/storepilot.yaml"
      }
    }
  }
}
```

Tools: `list_projects`, `select_project`, `resolve_project`, `get_active_project`, `load_project`.
