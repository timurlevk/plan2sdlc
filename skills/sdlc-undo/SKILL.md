---
name: sdlc-undo
description: Revert last plugin action
user-invocable: true
---

# /sdlc undo

Revert the last SDLC plugin action.

## Process
1. Read git log for recent SDLC commits (look for `chore(sdlc):` or `feat(` prefixes)
2. Show last action:
   ```
   Last plugin action: {description}
   Commits: {list}

   Options:
   (A) Revert all commits
   (B) Revert only last commit
   (C) Show full diff before deciding
   (D) Cancel
   ```
3. Execute user's choice via `git revert`
