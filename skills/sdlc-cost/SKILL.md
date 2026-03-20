---
name: sdlc-cost
description: Show cost breakdown for current period
user-invocable: true
---

# /sdlc cost

Show cost breakdown report.

## Instructions

1. Read session logs from `.sdlc/history/`
2. Read budget config from `.sdlc/config.yaml`
3. Generate cost report for the current month
4. Format and display

## Output Format

```
COST REPORT — {Month Year} ({days} days)
───────────────────────────────────────────────────────
Total:        ${total} / ${warning} warning / ${hardCap or "no hard cap"}

By session type:
  {type:<20} ${cost}  ({count} sessions, avg ${avg})
  ...

By domain:
  {domain:<20} ${cost}  ({percentage}%)
  ...

By model:
  {model:<20} ${cost}  ({percentage}%)
  ...
```

If no data: "No cost data yet. Costs are tracked automatically during SDLC sessions."
If `.sdlc/` not found: "⚠ SDLC not initialized. Run /sdlc init first."
