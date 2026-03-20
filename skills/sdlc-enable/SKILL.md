---
name: sdlc-enable
description: Enable optional integrations
user-invocable: true
---

# /sdlc enable

Enable or disable optional integrations for the SDLC plugin.

## Usage

```
/sdlc enable superpowers        — toggle superpowers integration
/sdlc enable pixel-agents       — install + configure visual dashboard
/sdlc enable notifications      — configure Slack/GitHub/webhook
```

## Superpowers Integration

```
/sdlc enable superpowers
```

Toggle superpowers skills usage in SDLC sessions. Edit `.sdlc/config.yaml`:

```yaml
integrations:
  superpowers:
    enabled: true/false              # master toggle
    brainstorming: true/false        # BRAINSTORM session
    writingPlans: true/false         # PLAN session
    tdd: true/false                  # EXECUTE session (TDD)
    debugging: true/false            # POST_MORTEM session
    codeReview: true/false           # REVIEW session
    verification: true/false         # MERGE session
```

When disabled, sessions use built-in flows instead of superpowers skills.

## Pixel Agents (VS Code Visual Dashboard)

```
/sdlc enable pixel-agents
```

### Process:
1. Check if VS Code is available
2. Install extension: `code --install-extension pablodelucca.pixel-agents`
3. Select layout preset based on team size:
   - **small-office** (3-8 agents)
   - **medium-office** (9-25 agents)
   - **large-office** (26-50 agents)
4. Write config to `.sdlc/pixel-agents-config.json`
5. Update `.sdlc/config.yaml`: `integrations.pixelAgents.enabled: true`

### To disable:
```
/sdlc enable pixel-agents --off
```

## Notifications

```
/sdlc enable notifications
```

Configure notification integrations via MCP servers:

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

All integrations use MCP servers. The plugin works without any — purely optional.
