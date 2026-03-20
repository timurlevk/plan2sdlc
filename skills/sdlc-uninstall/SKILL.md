---
name: sdlc-uninstall
description: Remove SDLC plugin and cleanup
user-invocable: true
---

# /sdlc uninstall

Remove the SDLC plugin and clean up generated files.

## Process
1. Check for `.sdlc/backup/` directory (created during init)
2. Show what will be removed vs preserved:
   ```
   WILL REMOVE:
   - .sdlc/ directory (state, backlog, history, costs)
   - .claude/agents/ files created by plugin
   - .claude/skills/ files created by plugin
   - .claude/rules/ files created by plugin
   - Plugin hooks from settings

   WILL NOT TOUCH:
   - Your source code
   - Existing CLAUDE.md (plugin additions remain)
   - Your custom agents/rules
   - Git history

   BACKUP AVAILABLE:
   .sdlc/backup/ contains your original .claude/ structure
      Restore original configuration? [y/n]
   ```
3. Options:
   (A) Full uninstall + restore backup
   (B) Full uninstall (keep current config)
   (C) Keep agent definitions (remove plugin state only)
   (D) Cancel
4. Execute chosen option
