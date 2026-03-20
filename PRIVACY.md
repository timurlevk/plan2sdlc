# Privacy Policy

## claude-sdlc Plugin

**Last updated:** 2026-03-20

### Data Collection

The claude-sdlc plugin stores operational data **locally** on your machine in the `.sdlc/` directory within your project. No data is transmitted to Plan2Skill, Anthropic, or any third party.

### What Is Stored

| Data | Location | Purpose | Contains PII? |
|------|----------|---------|---------------|
| Task backlog | `.sdlc/backlog.json` | Track tasks and status | No |
| Workflow state | `.sdlc/state.json` | Active workflow tracking | No |
| Session logs | `.sdlc/history/` | Cost tracking, metrics | No |
| Cost data | `.sdlc/costs/` | Budget monitoring | No |
| Plugin config | `.sdlc/config.yaml` | User preferences | No |
| Agent registry | `.sdlc/registry.yaml` | Agent roster | No |
| Tech debt | `.sdlc/tech-debt.json` | Debt tracking | No |

### What Is NOT Collected

- No personal information (names, emails, IPs)
- No source code content (only file paths and metadata)
- No API keys or credentials (blocked by secrets guard hook)
- No telemetry or analytics
- No data sent to external servers

### Data Retention

All data remains in your project directory. Delete `.sdlc/` to remove all plugin data. Run `/sdlc uninstall` for guided cleanup.

### Git Visibility

By default, `.sdlc/state.json`, `.sdlc/history/`, and `.sdlc/costs/` are added to `.gitignore` during init. Configuration files (`config.yaml`, `registry.yaml`, `backlog.json`) are committed to git by default — you can change this in config.

### Contact

For privacy questions: plugins@plan2skill.com
