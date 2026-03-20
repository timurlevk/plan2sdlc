# Claude SDLC Plugin - User Guide

## Installation

Install the plugin into your Claude Code project:

```bash
claude plugin add plan2skill/claude-sdlc
```

This adds the plugin to your project. No source files are modified until you run `/sdlc init`.

## Quick Start

1. **Initialize the plugin** in your project directory:

   ```
   /sdlc init
   ```

   The init process will:
   - Scan your project structure (monorepo vs single app)
   - Detect tech stack (frameworks, ORMs, testing tools)
   - Generate agents tailored to your domains
   - Create `.sdlc/` directory for state tracking
   - Back up your existing `.claude/` configuration

2. **Describe a task** to the orchestrator:

   ```
   /sdlc dispatch "Add user authentication with JWT"
   ```

   The orchestrator classifies the task, selects a session type, composes the right team of agents, and begins the workflow.

3. **Check progress** at any time:

   ```
   /sdlc status
   ```

## Daily Workflow

The recommended daily workflow uses the orchestrator as your entry point:

```bash
# Start a session with the orchestrator
claude --agent orchestrator
# Or use the alias if configured:
p2s
```

Once in a session:

1. **Describe what you need** in plain language. The orchestrator determines the appropriate session type (QUICK_FIX, PLAN, EXECUTE, etc.) and assembles the right agents.

2. **Approve changes** at HITL (Human-In-The-Loop) gates. Every code change, file creation, or destructive action requires your explicit approval. Agents propose; you decide.

3. **Review status** with `/sdlc status` to see the backlog, active workflows, and completed items.

4. **Run retrospectives** with `/sdlc retro` to review what went well and improve agent configurations.

## Commands Reference

| Command | Description |
|---------|-------------|
| `/sdlc init` | Initialize plugin for this project |
| `/sdlc dispatch "X"` | Submit a task to the orchestrator |
| `/sdlc status` | Show backlog and active workflows |
| `/sdlc triage` | Prioritize inbox items |
| `/sdlc retro` | Run a retrospective |
| `/sdlc release` | Cut a release (version, changelog, deploy) |
| `/sdlc hotfix` | Emergency production fix workflow |
| `/sdlc cost` | Cost breakdown report |
| `/sdlc team` | Show agent registry and health |
| `/sdlc add-agent` | Create a new agent (guided) |
| `/sdlc add-domain` | Register a new domain with agents and rules |
| `/sdlc add-sme "X"` | Create a subject matter expert agent |
| `/sdlc undo` | Revert the last plugin action |
| `/sdlc uninstall` | Remove the plugin and clean up |
| `/sdlc enable` | Enable optional integrations |
| `/sdlc help` | Show help and available commands |

## Session Types

The orchestrator automatically selects the appropriate session type based on your task:

| Session | When Used | Typical Size |
|---------|-----------|--------------|
| QUICK_FIX | Small bug fix, typo, config change | S |
| TRIAGE | Multiple tasks need prioritization | - |
| BRAINSTORM | Design a new feature | L/XL |
| PLAN | Decompose large task into subtasks | L/XL |
| EXECUTE | Domain teams implement planned work | M/L |
| REVIEW | Code review and acceptance testing | M |
| MERGE | Merge feature branch to release | S |
| RELEASE | Version bump, changelog, deploy | M |
| HOTFIX | Emergency production fix | S/M |
| RETRO | Process review and improvement | S |
| SPIKE | Time-boxed research/investigation | M |
| REFACTOR | Code restructuring without behavior change | M/L |
| MIGRATE | Framework/library migration | L/XL |
| ONBOARD | New team member/domain onboarding | M |
| AUDIT | Security or compliance audit | M/L |
| DEBT | Tech debt reduction sprint | M/L |
| CUSTOM | User-defined workflow | varies |

## Configuration

After initialization, plugin configuration lives in `.sdlc/config.yaml`:

```yaml
project:
  name: my-project
  type: monorepo          # or single-app
  domains:
    - name: api
      path: apps/api
      techStack: [nestjs, prisma, postgresql]
    - name: web
      path: apps/web
      techStack: [nextjs, react, tailwind]

workflow:
  defaultBranch: main
  branchPrefix: sdlc/
  commitPrefix: "feat|fix|chore"
  hitlMode: full          # full | approve-only | auto (dangerous)

budget:
  maxCostPerSession: 5.00
  warningThreshold: 3.00
  currency: USD

notifications:
  slack:
    enabled: false
  github:
    enabled: false
```

Key configuration options:

- **project.type**: Detected automatically. Controls how agents are generated.
- **workflow.hitlMode**: Controls approval gates. `full` requires approval for all changes. `approve-only` auto-approves reads. `auto` skips approvals (not recommended).
- **budget**: Cost tracking thresholds per session.

## Recovery

If something goes wrong, you have several options:

### Revert last plugin action

```
/sdlc undo
```

This shows recent SDLC commits and lets you revert selectively.

### Manual git revert

```bash
git revert <commit-hash>
```

### Stash all changes

```bash
git stash
```

### Remove the plugin entirely

```
/sdlc uninstall
```

This removes all plugin state while preserving your source code. A backup of your original `.claude/` configuration is available for restoration.

## FAQ

**Q: Does the plugin modify my source code during initialization?**
A: No. The init phase is read-only. It scans your project and generates configuration files in `.sdlc/` and agent definitions in `.claude/agents/`. Your source code is never touched until you explicitly approve a task.

**Q: Can I use my existing agents alongside plugin agents?**
A: Yes. The plugin inherits your existing configuration and adds to it. Your custom agents remain untouched and can be referenced by the orchestrator.

**Q: What happens if I run out of budget?**
A: The orchestrator pauses and asks for approval to continue. You can increase the budget in `.sdlc/config.yaml` or end the session.

**Q: Can I customize which agents are created during init?**
A: Yes. After init, you can add agents with `/sdlc add-agent`, remove agent files you don't need, and the registry updates accordingly.

**Q: Does the plugin work without MCP servers?**
A: Yes. MCP integrations (Slack, GitHub notifications) are entirely optional. The core plugin works with just Claude Code.

**Q: How do I update the plugin?**
A: Run `claude plugin update claude-sdlc`. Your `.sdlc/` state and custom agents are preserved across updates.

**Q: Can I use this in a CI/CD pipeline?**
A: The plugin is designed for interactive use with HITL gates. For CI/CD, you would use the generated agents directly with `claude --agent <name>` and appropriate automation flags.
