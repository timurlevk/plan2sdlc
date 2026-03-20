---
name: sdlc-enable
description: Enable optional integrations
user-invocable: true
---

# /sdlc enable

Enable optional integrations for the SDLC plugin.

## Available Integrations

### Notifications

```
/sdlc enable notifications
```

Configure notification integrations in `.sdlc/config.yaml`:

```yaml
notifications:
  slack:
    enabled: true
    mcp: "@modelcontextprotocol/server-slack"
    channel: "#dev-sdlc"
    events: [hitl-needed, workflow-complete, budget-warning, hotfix-started]

  github:
    enabled: true
    mcp: "@modelcontextprotocol/server-github"
    events: [pr-created, review-requested, issue-created]

  webhook:
    enabled: true
    url: "https://your-webhook-url"
    events: [all]
    format: json
```

All integrations use MCP servers. The plugin works without any — they're purely optional.

### Pixel Agents

```
/sdlc enable pixel-agents
```

Visual team dashboard for VS Code. See pixel-agents integration docs.
