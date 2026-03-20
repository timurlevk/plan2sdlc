---
name: sdlc-hotfix
description: Emergency production fix
user-invocable: true
---

# /sdlc hotfix

Emergency bypass workflow for production incidents. Skips normal SDLC ceremony.

## Usage
```
/sdlc hotfix "description of production issue"
```

Or say: "hotfix", "production down", "urgent fix", "emergency"

## Process
Delegates to the HOTFIX session. See sessions/hotfix.md.
