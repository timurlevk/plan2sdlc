# Claude SDLC v2 — Self-Contained Architecture Design Spec

**Status:** Draft
**Date:** 2026-03-20
**Version:** 2.0.0
**Author:** Plan2Skill
**Supersedes:** `claude-sdlc-plugin-design.md` (v0.2.1)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Adapted Patterns (with Attribution)](#2-adapted-patterns-with-attribution)
3. [Domain Isolation Enforcement](#3-domain-isolation-enforcement)
4. [Orchestrator v2](#4-orchestrator-v2)
5. [Session Skills v2](#5-session-skills-v2)
6. [New Hooks](#6-new-hooks)
7. [Attribution](#7-attribution)
8. [Migration from v1](#8-migration-from-v1)
9. [What Gets Removed](#9-what-gets-removed)
10. [Implementation Phases](#10-implementation-phases)

---

## Problem Statement

claude-sdlc v0.2.1 has 50 requirements implemented but suffers from four critical problems:

1. **Orchestrator does everything itself.** Instead of delegating to domain agents, the orchestrator reads code, writes files, runs tests. It is simultaneously manager and developer, violating single-responsibility and making sessions unpredictable.

2. **Superpowers dependency for execution patterns.** Session skills like BRAINSTORM, PLAN, EXECUTE, REVIEW, and POST_MORTEM have a "with superpowers (preferred)" path and a "without superpowers (fallback)" path. The fallback paths are shallow — bullet-point outlines rather than actionable protocols. This creates a hard dependency on an external plugin for quality execution.

3. **Weak fallback flows.** The "otherwise" branches in session skills are 5-10 line summaries that give the agent no structure. Example from `skills/sessions/brainstorm.md`: the fallback is "ask questions, propose approaches, draft spec" with no protocol for subagent dispatch, review loops, or quality checks.

4. **No enforcement of domain boundaries beyond prompts.** The existing `sdlc-write-guard.cjs` protects `.claude/` and `.sdlc/` paths. But nothing prevents a frontend-developer agent from editing backend files. Domain isolation is advisory (mentioned in prompts) rather than enforced (blocked by hooks).

## Goal

Make claude-sdlc fully self-contained by internalizing the best patterns from official and community plugins. After v2, claude-sdlc requires zero external plugin dependencies for full SDLC governance.

**If superpowers is installed alongside claude-sdlc:** The `sdlc-superpowers-guard.cjs` hook blocks superpowers auto-invocation when the orchestrator is active, preventing flow conflicts.

---

## 1. Architecture Overview

SDLC v2 consists of three layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                     GOVERNANCE LAYER                            │
│  Orchestrator, session state machine, backlog, cost tracking    │
│  Tools: Read, Bash, Glob, Grep, Agent (NO Edit, NO Write)      │
├─────────────────────────────────────────────────────────────────┤
│                     EXECUTION LAYER                             │
│  Domain agents, TDD loops, subagent dispatch, review agents     │
│  Tools: Read, Edit, Write, Bash, Glob, Grep (domain-scoped)    │
├─────────────────────────────────────────────────────────────────┤
│                   DOMAIN ISOLATION LAYER                        │
│  Domain guard hook, registry-based path enforcement, facades    │
│  Mechanism: PreToolUse hook on Edit|Write|Bash                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key principle:** The governance layer dispatches work to the execution layer. The execution layer operates within domain boundaries enforced by the isolation layer. No layer can bypass the one below it.

### 1.1 What Changed from v1

| Aspect | v1 (0.2.1) | v2 |
|--------|-----------|-----|
| Execution patterns | Delegated to superpowers plugin | Internalized (adapted with attribution) |
| Domain isolation | Prompt-based ("stay in your domain") | Hook-enforced (PreToolUse blocks violations) |
| Session fallbacks | 5-10 line outlines | Full protocols with subagent dispatch |
| Orchestrator role | Manager + developer | Manager only (no Edit/Write) |
| Review quality | Single reviewer or external plugin | 5-agent parallel review with confidence scoring |
| Iteration control | Manual retry | Stop hook (Ralph Loop pattern) with max_iterations |
| Debug protocol | "collect evidence, find cause" | 4-phase systematic debugging |

### 1.2 External Plugin Compatibility

| Plugin | Compatibility | Notes |
|--------|--------------|-------|
| superpowers | Blocked when SDLC active | `sdlc-superpowers-guard.cjs` blocks auto-invocation; patterns internalized |
| code-review | Not invoked | Patterns internalized; plugin can coexist but SDLC does not call it |
| frontend-design | Compatible | Can be invoked by UI-domain agents if installed |
| playwright-mcp | Compatible | Can be invoked by e2e-tester agents |

---

## 2. Adapted Patterns (with Attribution)

Each subsection describes a pattern adapted from an external plugin. All source plugins are MIT-licensed. Adaptations are documented per the MIT license requirement.

### 2.1 Subagent Dispatch Protocol

**Source:** `obra/superpowers` — `subagent-driven-development` skill
**License:** MIT
**Author:** Jesse Vincent

#### Original Implementation

Superpowers dispatches subagents with a structured prompt template. Each subagent:
- Receives a focused task description
- Works independently (fresh context, no pollution from parent)
- Self-reviews before reporting back
- Returns a status code: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`
- Can honestly escalate: "this is too hard for me"

The parent agent reads the status code and decides next steps.

#### SDLC Adaptation

The protocol is adapted for domain-scoped execution. Changes:

1. **Domain context injection.** Each subagent prompt includes the agent's domain path, allowed file patterns, domain-specific test command, and cross-domain facade paths (read-only).

2. **Registry-driven agent selection.** Instead of a generic "implementer," the orchestrator selects agents from `.sdlc/registry.yaml` based on domain, tier, and task type.

3. **Domain guard enforcement.** Subagents operate under the `disallowedTools in agent frontmatter` hook, which blocks writes outside their domain path. This is hardware-level enforcement, not prompt-level trust.

4. **Status codes extended.** Added `DOMAIN_VIOLATION` status for when an agent detects it needs to modify files outside its domain (escalates to orchestrator for cross-domain coordination).

#### Where It Lives

- Prompt template: `agents/templates/subagent-dispatch.md`
- Status code handling: `skills/sessions/execute.md` (dispatch section)
- Registry lookup: `scripts/registry-builder.ts` (unchanged)

#### Subagent Prompt Template

```markdown
## Task
{task_description}

## Domain Scope
- Domain: {domain_name}
- Path: {domain_path}
- Test command: {test_command}
- Allowed write paths: {domain_path}/**
- Read-only cross-domain: {facade_paths}

## Rules
- You MUST NOT edit files outside {domain_path}/
- You MUST run {test_command} before reporting DONE
- You MUST self-review your changes before reporting

## Reporting
When finished, report your status using EXACTLY one of:
- DONE — task complete, tests pass, self-review clean
- DONE_WITH_CONCERNS — task complete but you have concerns (list them)
- NEEDS_CONTEXT — you need information you cannot find (specify what)
- BLOCKED — you cannot complete this task (explain why)
- DOMAIN_VIOLATION — you need to modify files outside your domain (list which files and why)

Be honest. If this task is beyond your capability, say BLOCKED with a clear explanation.
Do not attempt partial solutions that leave the codebase in a broken state.
```

### 2.2 Two-Stage Review

**Source (Stage 1):** `obra/superpowers` — `requesting-code-review` / spec-reviewer pattern
**Source (Stage 2):** `anthropic/code-review` plugin
**License:** MIT (both)
**Authors:** Jesse Vincent (superpowers), Anthropic (code-review)

#### Original Implementations

**Superpowers spec-reviewer:** Reviews implementation against the original spec. Checks completeness, correctness, adherence to design decisions. Single-pass review by one agent.

**Code-review plugin:** Dispatches 5 parallel review agents, each focused on a different concern. Each agent assigns a confidence score (0-100) to each issue found. Only issues scoring >= 80 are reported to the user. This eliminates false positives and noise.

The 5 agents in the original code-review plugin:
1. CLAUDE.md compliance checker
2. Bug detection (focused on changed lines only)
3. Design and architecture review
4. Test coverage verification
5. Security vulnerability scanner

#### SDLC Adaptation

Combined into a two-stage pipeline. Changes:

1. **Stage 1: Spec compliance.** A single reviewer agent checks the implementation against the spec/plan from the BRAINSTORM/PLAN session. This is adapted from the superpowers spec-reviewer pattern. If Stage 1 fails, the review short-circuits — no point checking code quality if the wrong thing was built.

2. **Stage 2: Code quality (5 parallel agents).** Adapted from the code-review plugin's parallel review architecture. Agent 3 is replaced with a domain boundary violation checker (new, not from any source plugin).

3. **Confidence scoring.** Retained from code-review plugin. Each issue is scored 0-100. Only issues with confidence >= 80 are reported. This is critical for reducing review noise.

4. **Domain-scoped review.** Each review agent only examines files within the domain being reviewed. Cross-domain changes are flagged for architect review.

#### Stage 2 Review Agents

| Agent | Focus | Source |
|-------|-------|--------|
| Agent 1 | CLAUDE.md / governance compliance | Adapted from code-review Agent 1 |
| Agent 2 | Bug detection (changed files only) | Adapted from code-review Agent 2 |
| Agent 3 | Domain boundary violations | **NEW** — not from any source plugin |
| Agent 4 | Test coverage verification | Adapted from code-review Agent 4 |
| Agent 5 | Security scan (secrets, injection, auth) | Adapted from code-review Agent 5 |

#### Agent 3: Domain Boundary Violation Checker (NEW)

This agent is unique to claude-sdlc. It checks:

- **Import violations:** Does code in domain A import directly from domain B internals (bypassing facades)?
- **Path violations:** Were files created/modified outside the domain boundary?
- **Shared state:** Does the code introduce shared mutable state across domains?
- **Database violations:** Does a domain query tables owned by another domain?
- **API contract violations:** Does a domain call another domain's internal API (not its public facade)?

```markdown
## Agent 3 Prompt: Domain Boundary Review

Review the changed files for domain isolation violations.

Domain map: {domain_map_yaml}

For each changed file, check:
1. Imports from other domains must go through facade paths only
2. No direct database queries to tables owned by other domains
3. No shared mutable state (global variables, singletons shared across domains)
4. API calls to other domains must use the public facade/contract

For each violation found:
- File and line number
- Violation type (import | database | shared-state | api-contract)
- Confidence score (0-100)
- Suggested fix

Only report violations with confidence >= 80.
```

#### Where It Lives

- Stage 1 prompt: `skills/sessions/review.md` (spec compliance section)
- Stage 2 dispatch: `skills/sessions/review.md` (code quality section)
- Agent prompts: inline in `skills/sessions/review.md` (one per agent)
- Confidence scoring logic: described in review session prompt (agents self-score)

### 2.3 TDD Discipline

**Source:** `obra/superpowers` — `test-driven-development` skill
**License:** MIT
**Author:** Jesse Vincent

#### Original Implementation

Superpowers enforces a strict RED-GREEN-REFACTOR cycle:
1. **RED:** Write a failing test. Run it. Verify it fails for the right reason.
2. **GREEN:** Write the minimum code to make the test pass. Run it. Verify it passes.
3. **REFACTOR:** Clean up without changing behavior. Run tests. Verify still green.

The key insight: running tests at each step (not just at the end) catches false passes and ensures tests actually test what they claim.

#### SDLC Adaptation

1. **Tests run within domain boundary only.** Each domain has its own test command in the registry (e.g., `pnpm --filter @app/auth test` rather than `pnpm test`). The TDD loop uses the domain-specific command.

2. **Domain-specific test commands from registry.** The orchestrator passes the test command to the domain agent at dispatch time. The agent does not discover or choose its own test command.

3. **Test file path enforcement.** Test files must be created within the domain path. The domain guard hook enforces this — an agent cannot create a test file in another domain's directory.

4. **Integration tests deferred.** During TDD within a domain, only unit tests and domain-scoped integration tests run. Cross-domain integration tests run in the INTEGRATION_CHECK session after all domains complete.

#### Where It Lives

- TDD protocol: `skills/sessions/execute.md` (TDD section)
- Domain test command: `.sdlc/registry.yaml` → `agents[].domain.testCommand`
- Test path enforcement: `hooks/disallowedTools in agent frontmatter`

#### TDD Protocol for Domain Agents

```markdown
## TDD Discipline

For each task in the plan, follow this cycle strictly:

### RED
1. Write a test that describes the expected behavior
2. Run: {test_command}
3. Verify the test FAILS
4. If it passes: your test is wrong — it is not testing new behavior. Fix the test.

### GREEN
1. Write the MINIMUM code to make the test pass
2. Run: {test_command}
3. Verify the test PASSES
4. If it fails: fix the implementation, not the test (unless the test was wrong)

### REFACTOR
1. Clean up the code (extract functions, rename, simplify)
2. Run: {test_command}
3. Verify tests still PASS
4. If any test fails: your refactor changed behavior. Revert and try again.

Do NOT skip steps. Do NOT batch multiple features before running tests.
One test, one implementation, one refactor. Then next.
```

### 2.4 Iterative Execution Loop (Ralph Loop)

**Source:** `anthropic/ralph-loop` plugin
**License:** MIT
**Author:** Anthropic

#### Original Implementation

Ralph Loop uses Claude Code's `Stop` hook to intercept session completion. When the agent signals it is done:

1. The stop hook runs a check (e.g., test suite)
2. If the check fails, the hook injects a new prompt telling the agent to continue
3. The agent gets another iteration
4. This repeats until the check passes or a maximum iteration count is reached

The key insight: the agent does not manage its own iteration count. The hook manages it externally, preventing the agent from prematurely declaring victory.

#### SDLC Adaptation

1. **Iteration state in `.sdlc/state.json`.** The hook reads and writes `activeWorkflows[].context.iterationCount` and `activeWorkflows[].context.maxIterations`.

2. **Completion detection per domain.** The hook runs the domain-specific test command (from registry) rather than a global test suite. A domain is "done" when its tests pass.

3. **Max iterations from config.** Default 5, configurable in `.sdlc/config.yaml` under `execution.maxIterations`. This prevents infinite loops when an agent cannot fix a test.

4. **Budget check per iteration.** Before re-injecting, the hook checks if the session cost has exceeded the per-session budget from `.sdlc/config.yaml`. If so, it allows exit and escalates to HITL.

5. **Scoped to EXECUTE session.** The stop hook only activates during EXECUTE sessions. Other sessions (BRAINSTORM, PLAN, REVIEW) exit normally.

#### Where It Lives

- Stop hook: `hooks/sdlc-iteration-hook.cjs`
- State tracking: `.sdlc/state.json` → `activeWorkflows[].context.iterationCount`
- Config: `.sdlc/config.yaml` → `execution.maxIterations` (default: 5)

#### Hook Implementation Spec

```javascript
// hooks/sdlc-iteration-hook.cjs
// Type: Stop hook
// Trigger: Agent session ends during EXECUTE

// 1. Read .sdlc/state.json
// 2. Find active workflow where currentSession === 'EXECUTE'
// 3. If no active EXECUTE workflow: allow exit (exit code 0)
// 4. Get domain test command from registry for the active agent's domain
// 5. Run domain test command (child_process.execSync)
// 6. If tests pass:
//    - Set workflow.context.testsGreen = true
//    - Write state.json
//    - Allow exit (exit code 0)
// 7. If tests fail:
//    a. Increment workflow.context.iterationCount
//    b. If iterationCount > maxIterations:
//       - Set workflow.context.maxIterationsReached = true
//       - Write state.json
//       - Allow exit (exit code 0) — orchestrator will escalate to HITL
//    c. If budget exceeded:
//       - Set workflow.context.budgetExceeded = true
//       - Write state.json
//       - Allow exit (exit code 0)
//    d. Otherwise:
//       - Write state.json
//       - Output JSON: { "decision": "block", "reason": "Tests still failing. Iteration {n}/{max}. Fix the remaining failures." }
//       - Exit code 2 (block exit, re-inject prompt)
```

### 2.5 Systematic Debugging

**Source:** `obra/superpowers` — `systematic-debugging` skill
**License:** MIT
**Author:** Jesse Vincent

#### Original Implementation

Superpowers enforces a 4-phase debugging protocol:
1. **Root cause analysis:** Reproduce the bug, read logs, identify the actual cause (not symptoms)
2. **Pattern analysis:** Check if this is part of a broader pattern (similar bugs elsewhere)
3. **Hypothesis formation:** Form a specific, testable hypothesis about the fix
4. **Implementation:** Fix the root cause, add regression test, verify

Key discipline: no fixing until the root cause is understood. Prevents whack-a-mole debugging.

#### SDLC Adaptation

1. **Investigation scoped to domain.** The debugging agent starts investigation within the affected domain. It can read files anywhere (cross-domain context) but cannot edit outside its domain.

2. **Cross-domain issues escalate to architect.** If root cause analysis reveals the bug spans multiple domains (e.g., API contract mismatch), the agent reports `DOMAIN_VIOLATION` and the orchestrator dispatches the governance-architect for cross-domain coordination.

3. **Regression test required.** The fix must include a test that reproduces the original failure (RED) and then passes with the fix (GREEN). This uses the TDD discipline from section 2.3.

4. **Evidence log.** The debugging agent writes a structured evidence log to `.sdlc/history/` documenting: reproduction steps, root cause, hypothesis, fix description, regression test path. This feeds into RETRO sessions.

#### Where It Lives

- Debugging protocol: `skills/sessions/post-mortem.md`
- Evidence log schema: `schema/debug-evidence.schema.json`
- Cross-domain escalation: handled by orchestrator (reads `DOMAIN_VIOLATION` status)

#### 4-Phase Protocol for Domain Agents

```markdown
## Systematic Debugging Protocol

### Phase 1: Root Cause Analysis
1. Reproduce the failure: run the failing test or trigger the error
2. Read the error output carefully — what EXACTLY fails?
3. Trace backward: which line throws? What calls it? What data causes it?
4. Identify the ROOT CAUSE, not the symptom
   - Symptom: "test times out"
   - Root cause: "async handler missing await on database call"

Do NOT proceed to Phase 2 until you can state the root cause in one sentence.

### Phase 2: Pattern Analysis
1. Is this an isolated bug or part of a pattern?
2. Search for similar patterns in the codebase: {grep for the anti-pattern}
3. If pattern found: note all instances (they may need fixing too)

### Phase 3: Hypothesis
State your fix hypothesis:
"Changing {what} in {where} will fix {the root cause} because {why}"

### Phase 4: Implementation
1. Write a regression test that reproduces the failure (RED)
2. Run {test_command} — verify the test fails
3. Apply the fix
4. Run {test_command} — verify the test passes
5. Run full domain test suite — verify no regressions

Report: DONE | DONE_WITH_CONCERNS | BLOCKED
```

### 2.6 Verification Before Completion

**Source:** `obra/superpowers` — `verification-before-completion` skill
**License:** MIT
**Author:** Jesse Vincent

#### Original Implementation

Superpowers requires evidence before claims. When an agent says "tests pass," it must have run the tests in that same session (not referencing cached or previous results). The verification run must be fresh — a new execution, not a remembered result.

#### SDLC Adaptation

1. **Domain-specific verification commands.** Each domain has a verification checklist in the registry: test command, build command, lint command, type-check command. All must pass.

2. **Fresh run requirement.** The MERGE session runs all verification commands in a fresh shell, ignoring any previous results. The agent must include the actual command output in its report.

3. **Cross-domain verification.** For multi-domain changes, verification runs per-domain first, then cross-domain integration tests. Both must pass.

4. **Evidence format.** The agent must report verification results in a structured format:

```markdown
## Verification Results

### Domain: {domain_name}
- [ ] Tests: `{test_command}` — {PASS|FAIL} ({n} tests, {n} passed, {n} failed)
- [ ] Build: `{build_command}` — {PASS|FAIL}
- [ ] Lint: `{lint_command}` — {PASS|FAIL} ({n} warnings, {n} errors)
- [ ] TypeCheck: `{typecheck_command}` — {PASS|FAIL} ({n} errors)

### Integration (if multi-domain)
- [ ] Integration tests: `{integration_test_command}` — {PASS|FAIL}
```

#### Where It Lives

- Verification protocol: `skills/sessions/merge.md`
- Verification commands: `.sdlc/registry.yaml` → `agents[].domain.verifyCommands`

### 2.7 Visual Brainstorming

**Source:** `obra/superpowers` — `brainstorm-server` companion
**License:** MIT
**Author:** Jesse Vincent

#### Original Implementation

Superpowers includes a brainstorm companion that launches an Express server on localhost. The AI generates HTML pages dynamically — mockups, diagrams, flowcharts — for each brainstorming question. The user views them in a browser alongside the terminal conversation. Per question, the AI decides: should this be shown in browser (visual) or terminal (text)?

#### SDLC Adaptation

1. **Integrated into BRAINSTORM session.** Rather than a separate companion plugin, the Express server is launched by the BRAINSTORM session skill when the complexity warrants it (L/XL tasks).

2. **Per-question routing.** The brainstorm agent decides for each question:
   - **Browser:** Architecture diagrams, UI mockups, data flow visualizations, comparison tables
   - **Terminal:** Clarifying questions, text-heavy analysis, code snippets

3. **Server lifecycle.** The Express server starts at BRAINSTORM session begin and stops at session end. Port is configurable (default: 3456). The server serves only from a temporary directory (`/tmp/sdlc-brainstorm/` or OS equivalent).

4. **No persistent artifacts.** The generated HTML is ephemeral — it is not saved to the project. The spec document (output of BRAINSTORM) is the persistent artifact.

#### Where It Lives

- Server script: `scripts/brainstorm-server.ts`
- Session integration: `skills/sessions/brainstorm.md`
- Config: `.sdlc/config.yaml` → `brainstorm.serverPort` (default: 3456)

### 2.8 Quality Rubric Scoring

**Source:** `anthropic/claude-md-management` plugin
**License:** MIT
**Author:** Anthropic

#### Original Implementation

The claude-md-management plugin scores CLAUDE.md file quality using a 6-criterion rubric. Each criterion gets an A-F grade with specific improvement recommendations. The overall score drives whether the file needs updating.

#### SDLC Adaptation

1. **Agent health scoring in RETRO session.** The rubric is adapted to score agent effectiveness rather than file quality. Used during RETRO sessions to identify underperforming agents and recommend prompt improvements.

2. **6 criteria for agent health:**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Success rate | 20% | % of tasks completed as DONE (not BLOCKED/NEEDS_CONTEXT) |
| Cost efficiency | 15% | Average cost per task vs. budget allocation |
| Domain compliance | 20% | % of sessions with zero domain boundary violations |
| Test coverage | 20% | Average test coverage delta (did the agent improve coverage?) |
| Escalation rate | 10% | % of tasks escalated to HITL (lower is better, but 0% is suspicious) |
| Response quality | 15% | Quality of status reports (structured, honest, complete) |

3. **Grading scale:**

| Grade | Score | Action |
|-------|-------|--------|
| A | 90-100 | No action needed |
| B | 80-89 | Minor prompt tuning recommended |
| C | 70-79 | Prompt revision needed |
| D | 60-69 | Agent may need template change |
| F | < 60 | Agent should be replaced or significantly reworked |

4. **Data source.** Scores are computed from `.sdlc/history/` session logs. Each session log records the agent, task, status code, cost, domain violations, and test results.

#### Where It Lives

- Scoring logic: `skills/sessions/retro.md` (rubric section)
- Data aggregation: `scripts/cost-tracker.ts` (extended with agent metrics)
- Output: `.sdlc/costs/agent-health-{date}.json`

---

## 3. Domain Isolation Enforcement

This is the key differentiator from superpowers and the single most important new capability in v2. Superpowers trusts agents via prompts. SDLC v2 enforces domain boundaries via hooks.

### 3.1 Domain Isolation via disallowedTools (Platform-Enforced)

**Mechanism:** Claude Code `disallowedTools` frontmatter with path patterns.

**Why not a hook?** `disallowedTools path patterns` env var does not exist in Claude Code. Hooks cannot determine which agent triggered a tool call. `disallowedTools` is enforced at platform level — reliable, no bypass possible.

#### Mechanism

```
/sdlc init detects 3 domains: auth (packages/auth/), billing (packages/billing/), web (apps/web/)

Generates .claude/agents/auth-developer.md with frontmatter:
  disallowedTools: "Edit(packages/billing/**), Write(packages/billing/**),
                    Edit(apps/web/**), Write(apps/web/**),
                    Edit(.claude/**), Write(.claude/**),
                    Edit(.sdlc/**), Write(.sdlc/**)"

Auth-developer attempts Edit on "packages/billing/src/service.ts"
  → Claude Code platform blocks it (disallowedTools match)
  → No hook needed — enforcement at tool resolution level
```

#### Implementation: Init generates disallowedTools per agent

`/sdlc init` → `generateDomainAgents()` in `src/services/init.ts`:

```typescript
// For each domain, generate disallowedTools blocking ALL other domains
const otherDomainPaths = domains
  .filter(d => d.name !== domain.name)
  .map(d => `Edit(${d.path}/**), Write(${d.path}/**)`)
  .join(', ');

// Also block .claude/ and .sdlc/
const disallowedPaths = `${otherDomainPaths}, Edit(.claude/**), Write(.claude/**), Edit(.sdlc/**), Write(.sdlc/**)`;
```

Result in `.claude/agents/auth-developer.md`:
```yaml
---
name: auth-developer
disallowedTools: "Edit(packages/billing/**), Write(packages/billing/**), Edit(apps/web/**), Write(apps/web/**), Edit(.claude/**), Write(.claude/**), Edit(.sdlc/**), Write(.sdlc/**)"
tools: Read, Edit, Write, Bash, Glob, Grep
---
```

#### Edge Cases

| Case | Behavior |
|------|----------|
| Shared files (root package.json) | Not in any domain path → not blocked by disallowedTools |
| Agent needs to read other domains | Read is NOT in disallowedTools — read anywhere is allowed |
| New domain added later | `/sdlc add-domain` regenerates all agent files with updated disallowedTools |
| Governance agents (architect, etc.) | No disallowedTools — can write anywhere |
| Bash commands | Best-effort: `Bash(cd /other-domain)` patterns can be added but shell is hard to fully restrict |

#### Key Advantage over Hook-Based Approach

- **Platform-enforced:** Claude Code blocks the tool BEFORE execution — no race condition, no bypass
- **No env var dependency:** No `disallowedTools path patterns` needed — restrictions baked into agent .md file
- **Visible:** Developer can read the agent file and see exactly what's blocked
- **Testable:** `claude plugin validate .` checks disallowedTools syntax

  - name: governance-architect
    # No domain field — exempt from domain guarding
    tier: mandatory
```

### 3.2 Per-Domain Agent Dispatch

The orchestrator dispatches domain agents with explicit constraints. The dispatch is NOT a generic "go implement this" — it is a structured message containing:

```markdown
## Dispatch: {agent_name}

### Task
{task_description}

### Domain Constraint
- Domain: {domain_name}
- Writable path: {domain_path}
- Test command: {test_command}
- Build command: {build_command}

### Cross-Domain Context (READ ONLY)
- Facade: {facade_path_1} — {description}
- Facade: {facade_path_2} — {description}
You may READ these files for context. You MUST NOT edit them.

### Plan Reference
{plan_path} — see tasks {task_numbers} assigned to you

### Status Protocol
Report when done: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED | DOMAIN_VIOLATION
```

### 3.3 Cross-Domain Coordination

For tasks that span multiple domains:

#### Single-Domain Tasks (Most Common)
One agent does everything within its domain. Simple dispatch, simple collection.

#### Multi-Domain Tasks (Hybrid Mode)
1. **Orchestrator decomposes** the task into per-domain subtasks (during PLAN session)
2. **Orchestrator dispatches** one agent per domain in parallel (using Claude Code's Agent tool)
3. **Each agent works in isolation** within its domain boundary
4. **Orchestrator collects** status reports from all agents
5. **Integration check** runs after all domains report DONE:
   - Cross-domain test suite
   - API contract verification
   - Import path validation

#### Cross-Domain Dependencies
When domain A needs domain B to expose a new facade method:
1. Domain A agent reports `DOMAIN_VIOLATION: need billing.getFoo() facade method`
2. Orchestrator dispatches domain B agent to add the facade method
3. Domain B agent completes, reports DONE
4. Orchestrator re-dispatches domain A agent with updated context
5. Domain A agent continues its task

This is sequential by necessity — domain B must complete before domain A can continue. The orchestrator manages the ordering.

---

## 4. Orchestrator v2

### 4.1 Tool Restrictions

```yaml
tools: Read, Bash, Glob, Grep, Agent
# Explicitly NO: Edit, Write
```

The orchestrator is a **manager, not a developer**. It:
- Reads code and state (Read, Glob, Grep)
- Runs commands to check status (Bash)
- Dispatches agents (Agent tool)
- NEVER directly modifies source code or configuration files

This is enforced by the agent definition in `agents/orchestrator.md`. The orchestrator literally cannot call Edit or Write — Claude Code's tool system will not offer those tools to it.

### 4.2 SessionStart Injection (Enhanced)

**Adapted from:** superpowers session context injection pattern

The `hooks/entry-check.cjs` is enhanced to inject SDLC state when the orchestrator starts. This gives the orchestrator full context without requiring it to read files on every session.

#### Injection Payload

When SDLC is initialized and the orchestrator starts, the hook injects:

```
=== SDLC STATE (EXTREMELY_IMPORTANT) ===

Project: {project_name}
Mode: initialized
Version: claude-sdlc v2.0.0

## Active Workflows
{compact workflow summary — id, task, current session, iteration count}

## Backlog Summary
- Inbox: {n} items
- Executing: {n} items
- Reviewing: {n} items
- Blocked: {n} items (NEEDS ATTENTION)

## Domain Map
{domain_name}: {domain_path} ({n} agents)
{domain_name}: {domain_path} ({n} agents)

## Session Budget
Per-session cap: ${amount}
Today's spend: ${amount} / ${daily_cap}

## Rules
- Orchestrator MUST NOT edit files directly
- All changes go through domain agents
- Domain agents are constrained to their domain path
- Review gate is mandatory before merge
- HITL required for: blocked tasks, budget exceeded, cross-domain conflicts

=== END SDLC STATE ===
```

#### Implementation

```javascript
// hooks/entry-check.cjs v2 — SessionStart hook
// Enhancement: inject SDLC state for orchestrator

// 1. Check if SDLC initialized (same as v1)
// 2. If orchestrator:
//    a. Read .sdlc/config.yaml (compact)
//    b. Read .sdlc/state.json (active workflows)
//    c. Read .sdlc/backlog.json (summary counts)
//    d. Read .sdlc/registry.yaml (domain map extract)
//    e. Format injection payload
//    f. Output as { "result": "{payload}" }
// 3. If not orchestrator: same warning as v1
```

### 4.3 Classification and Routing

Unchanged from v1. The classification system works well and does not need redesign.

**Classification dimensions:**
- **Type:** feature | bugfix | refactor | research | docs | ops
- **Complexity:** S | M | L | XL
- **Domains:** list of affected domains (from domain map)

**Routing table (unchanged):**

| Complexity | Session Chain |
|-----------|---------------|
| S (quick fix) | QUICK_FIX → (optional REVIEW) → MERGE |
| M (standard) | PLAN → EXECUTE → REVIEW → MERGE |
| L (complex) | BRAINSTORM → PLAN → EXECUTE → REVIEW → INTEGRATION_CHECK → MERGE |
| XL (major) | BRAINSTORM → PLAN → EXECUTE → REVIEW → INTEGRATION_CHECK → MERGE → RELEASE |

### 4.4 Progress Display

Unchanged from v1. After each session completes, the orchestrator displays:

```
Pipeline: BRAINSTORM ✅ → PLAN ✅ → EXECUTE ▶ → REVIEW ⬚ → MERGE ⬚
Domain: auth (iteration 2/5) | billing (DONE)
```

---

## 5. Session Skills v2

Each session skill is rewritten to be fully self-contained. No "with superpowers (preferred)" / "without superpowers (fallback)" branching. One flow, complete and actionable.

### 5.1 BRAINSTORM v2

**File:** `skills/sessions/brainstorm.md`

#### Flow

```
1. CONTEXT GATHERING
   - Orchestrator dispatches governance-architect as subagent
   - Architect reads: codebase structure, domain map, existing specs, related code
   - Architect summarizes context for brainstorm

2. VISUAL SERVER (L/XL only)
   - Launch brainstorm Express server on port {brainstorm.serverPort}
   - Per-question routing: browser (diagrams, mockups) or terminal (text)

3. CLARIFYING QUESTIONS
   - Architect asks user clarifying questions (one at a time, max 5)
   - Each question may include a visual aid (diagram of current state, etc.)
   - HITL: user answers each question

4. APPROACH PROPOSALS
   - Architect proposes 2-3 design approaches
   - Each approach includes: description, pros, cons, affected domains, estimated effort
   - Visual comparison table (browser if server running, terminal otherwise)
   - HITL: user selects approach (or requests modifications)

5. SPEC DRAFTING
   - Architect drafts design spec based on selected approach
   - Spec structure:
     - Problem statement
     - Selected approach + rationale
     - Domain boundaries and affected areas
     - Data model changes (if any)
     - API contracts (if any)
     - Acceptance criteria (checkboxes)
     - Risk assessment
     - Anti-patterns to avoid (adapted from frontend-design plugin)
   - Saves to: docs/specs/{TASK-ID}-{slug}.md

6. SPEC REVIEW (subagent)
   - Dispatch a fresh subagent to review the spec
   - Reviewer checks: completeness, feasibility, domain boundary clarity
   - If concerns: architect revises (max 2 review rounds)

7. USER APPROVAL
   - HITL: user approves spec (or requests changes)
   - On approval: write SessionHandoff with specPath

8. CLEANUP
   - Stop brainstorm server (if running)
   - Chain to PLAN session
```

#### Anti-Pattern Lists (from Frontend Design Plugin)

**Source:** `anthropic/frontend-design` plugin (MIT, Anthropic)

The spec includes an anti-patterns section specific to the task's domain:

```markdown
## Anti-Patterns to Avoid

{Generated based on affected domains and task type}

### Architecture
- Do NOT create circular dependencies between domains
- Do NOT add shared mutable state outside a domain facade
- Do NOT bypass the facade pattern for "quick" fixes

### Data Model
- Do NOT add nullable foreign keys "to be filled later"
- Do NOT store derived data that can be computed
- Do NOT create generic "metadata" JSON columns

### API Design
- Do NOT create endpoints that return unbounded lists
- Do NOT mix mutation and query in the same endpoint
- Do NOT expose internal IDs without a mapping layer
```

#### Participants
- governance-architect (mandatory, dispatched as subagent)
- Relevant domain developers (on-demand, dispatched for domain expertise)
- ux-designer (if UI feature, dispatched as subagent)
- product-analyst (for L/XL features)
- Relevant SMEs (on-demand consultation)

### 5.2 PLAN v2

**File:** `skills/sessions/plan.md`

#### Flow

```
1. CONTEXT LOADING
   - Read spec from handoff artifacts (specPath)
   - Read domain map from .sdlc/registry.yaml
   - Read current codebase state for affected domains

2. TASK DECOMPOSITION
   - Governance-architect decomposes spec into per-domain tasks
   - Each task specifies:
     - [ ] Task ID (PLAN-{n})
     - [ ] Domain: {domain_name}
     - [ ] Agent: {agent_name} (from registry)
     - [ ] Description: what to implement
     - [ ] Files to create/modify: {list}
     - [ ] Acceptance criteria: {from spec}
     - [ ] Test requirements: {what to test}
     - [ ] Dependencies: {other PLAN-{n} tasks that must complete first}
     - [ ] Verification: {command to verify completion}

3. EXECUTION WAVE PLANNING
   - Group tasks into waves (parallel where no dependencies)
   - Wave 1: independent tasks (all domains can work simultaneously)
   - Wave 2: tasks depending on Wave 1 outputs
   - Wave N: final integration tasks

4. PLAN DOCUMENT
   - Write plan to: docs/plans/{TASK-ID}-{slug}.md
   - Format: checkbox syntax for each task (trackable)
   - Include domain assignments and wave structure

5. PLAN REVIEW (subagent)
   - Dispatch fresh subagent to review the plan
   - Reviewer checks:
     - Does every spec acceptance criterion have a task?
     - Are dependencies correctly ordered?
     - Are domain assignments correct (right agent for right domain)?
     - Is the wave structure optimal (maximize parallelism)?
   - If concerns: architect revises (max 2 review rounds)

6. USER APPROVAL
   - HITL: user approves plan
   - On approval: write SessionHandoff with planPath and domain assignments
   - Chain to EXECUTE
```

#### Plan Document Format

```markdown
# Implementation Plan: {TASK-ID} — {title}

**Spec:** docs/specs/{TASK-ID}-{slug}.md
**Domains:** {list}
**Estimated waves:** {n}

## Wave 1 (parallel)

### PLAN-1: {description}
- **Domain:** auth
- **Agent:** auth-developer
- **Files:** packages/auth/src/guards/api-key.guard.ts (create), packages/auth/src/guards/api-key.guard.spec.ts (create)
- **Acceptance criteria:**
  - [ ] API key validation guard created
  - [ ] Guard rejects invalid keys with 401
  - [ ] Guard allows valid keys
- **Test:** `pnpm --filter @app/auth test -- --grep "ApiKeyGuard"`
- **Dependencies:** none

### PLAN-2: {description}
- **Domain:** billing
- **Agent:** billing-developer
- **Files:** ...
- **Dependencies:** none

## Wave 2 (after Wave 1)

### PLAN-3: {description}
- **Domain:** auth
- **Agent:** auth-developer
- **Dependencies:** PLAN-2 (needs billing facade)
```

### 5.3 EXECUTE v2

**File:** `skills/sessions/execute.md`

This is the most significantly changed session. It combines three adapted patterns: subagent dispatch (2.1), TDD discipline (2.3), and Ralph Loop iteration (2.4).

#### Flow

```
1. CONTEXT LOADING
   - Read plan from handoff artifacts (planPath)
   - Read domain map from .sdlc/registry.yaml
   - Identify agents needed from plan

2. PER-WAVE DISPATCH
   For each wave in the plan:

   a. DISPATCH DOMAIN AGENTS (parallel within wave)
      - For each task in the wave:
        - Select agent from registry (by domain)
        - Dispatch using subagent dispatch protocol (section 2.1)
        - Include: task description, domain constraints, TDD protocol, plan reference
        - Agent works with Ralph Loop (section 2.4):
          - TDD: RED → verify fail → GREEN → verify pass → REFACTOR
          - Stop hook checks: domain tests pass?
          - If not: re-inject (up to maxIterations)
          - If yes: agent reports DONE

   b. COLLECT STATUS REPORTS
      - Wait for all agents in wave to complete
      - For each agent, read status:
        - DONE → mark task complete in plan
        - DONE_WITH_CONCERNS → mark complete, log concerns for REVIEW
        - NEEDS_CONTEXT → provide context and re-dispatch
        - BLOCKED → escalate to HITL
        - DOMAIN_VIOLATION → orchestrator handles cross-domain coordination (section 3.3)

   c. WAVE GATE
      - All tasks in wave must be DONE or DONE_WITH_CONCERNS before next wave
      - If any BLOCKED: pause pipeline, HITL

3. POST-EXECUTION
   - All waves complete
   - Write SessionHandoff with:
     - Worktree branches (one per domain)
     - Test results (per domain)
     - Files changed (per domain)
     - Concerns list (from DONE_WITH_CONCERNS agents)
   - Chain to REVIEW
```

#### Budget Management

```
Per-domain budget = config.budget.perSession.EXECUTE / number_of_domains
Per-iteration budget = per_domain_budget / maxIterations

Before each re-dispatch (Ralph Loop iteration):
  if session_cost > per_domain_budget:
    allow exit, set budgetExceeded = true
    orchestrator escalates to HITL
```

#### Execution State in `.sdlc/state.json`

```json
{
  "activeWorkflows": [{
    "id": "WF-012",
    "backlogItemId": "TASK-045",
    "currentSession": "EXECUTE",
    "context": {
      "planPath": "docs/plans/TASK-045-api-keys.md",
      "specPath": "docs/specs/TASK-045-api-keys.md",
      "currentWave": 1,
      "totalWaves": 2,
      "domains": {
        "auth": {
          "agent": "auth-developer",
          "status": "in-progress",
          "iterationCount": 2,
          "maxIterations": 5,
          "testsGreen": false,
          "branch": "feat/TASK-045-auth"
        },
        "billing": {
          "agent": "billing-developer",
          "status": "done",
          "iterationCount": 1,
          "testsGreen": true,
          "branch": "feat/TASK-045-billing"
        }
      }
    }
  }]
}
```

### 5.4 REVIEW v2

**File:** `skills/sessions/review.md`

#### Flow

```
1. CONTEXT LOADING
   - Read execution results from handoff artifacts
   - Identify changed files per domain
   - Read spec and plan for compliance checking

2. STAGE 1: SPEC COMPLIANCE REVIEW
   - Dispatch governance-reviewer as subagent
   - Reviewer reads:
     - Spec (acceptance criteria)
     - Plan (task list with checkboxes)
     - Changed files
   - Checks:
     - Every acceptance criterion addressed?
     - Every planned task completed?
     - No unplanned changes (scope creep)?
   - If FAIL: short-circuit to needs-changes with spec compliance feedback
   - If PASS: proceed to Stage 2

3. STAGE 2: CODE QUALITY REVIEW (5 parallel agents)
   - Dispatch 5 review agents simultaneously (Agent tool, parallel):

   AGENT 1: CLAUDE.md / Governance Compliance
     - Check: do changes follow project conventions from CLAUDE.md?
     - Check: are naming conventions followed?
     - Check: are architectural rules respected?
     - Score each issue 0-100

   AGENT 2: Bug Detection
     - Review ONLY changed/added lines (not entire files)
     - Check: off-by-one, null handling, async/await, error handling
     - Check: edge cases, boundary conditions
     - Score each issue 0-100

   AGENT 3: Domain Boundary Violations (NEW)
     - Check: imports cross domain boundaries via internals (not facades)?
     - Check: database queries to other domains' tables?
     - Check: shared mutable state across domains?
     - Score each issue 0-100

   AGENT 4: Test Coverage Verification
     - Check: are new features tested?
     - Check: are edge cases tested?
     - Check: do tests actually assert meaningful behavior (not just "no error")?
     - Check: coverage delta (did coverage go up or down)?
     - Score each issue 0-100

   AGENT 5: Security Scan
     - Check: hardcoded secrets, API keys, passwords?
     - Check: SQL injection, XSS, CSRF vulnerabilities?
     - Check: authentication/authorization gaps?
     - Check: input validation on new endpoints?
     - Score each issue 0-100

4. AGGREGATE RESULTS
   - Collect all issues from all 5 agents
   - Filter: only issues with confidence >= 80
   - Group by severity: critical (must fix) | warning (should fix) | info (nice to fix)
   - Critical issues → needs-changes (chain back to EXECUTE with feedback)
   - Warnings only → approved with notes
   - Clean → approved

5. OUTCOMES
   - approved → chain to INTEGRATION_CHECK (if multi-domain) or MERGE
   - needs-changes (reviewAttempt < maxRetries) → chain to EXECUTE with feedback
   - rejected (reviewAttempt >= maxRetries) → HITL escalation
```

#### Confidence Scoring Rules for Review Agents

Each review agent follows these scoring guidelines:

```markdown
## Confidence Scoring

Score each issue 0-100 based on:
- 90-100: Definitely a real issue. Clear evidence in the code.
- 70-89: Likely an issue but context-dependent. Could be intentional.
- 50-69: Possible issue. Needs human judgment.
- 0-49: Uncertain. Might be a false positive.

Only issues scoring >= 80 will be reported to the developer.

Guidelines:
- Score HIGHER when: the issue is in new/changed code, pattern is clearly wrong,
  security implication is clear, test is missing for critical path
- Score LOWER when: the pattern exists elsewhere in codebase (might be intentional),
  the "issue" is stylistic, the code is in a test file, the behavior is documented
```

### 5.5 POST_MORTEM v2

**File:** `skills/sessions/post-mortem.md`

#### Flow

```
1. EVIDENCE COLLECTION
   - Dispatch governance-tech-lead as subagent
   - Tech lead collects:
     - Failing test output (exact error messages)
     - Recent git log (what changed?)
     - Related code (where does the failure occur?)
     - Previous session logs (was this area recently modified?)

2. SYSTEMATIC DEBUGGING (4-phase protocol — section 2.5)
   - Phase 1: Root Cause Analysis
     - Reproduce the failure
     - Trace to root cause (not symptom)
     - State root cause in one sentence
   - Phase 2: Pattern Analysis
     - Is this isolated or part of a pattern?
     - Search for similar anti-patterns
   - Phase 3: Hypothesis
     - "Changing X in Y will fix Z because W"
   - Phase 4: Implementation
     - RED: regression test that fails
     - GREEN: fix that makes it pass
     - REFACTOR: clean up

3. DOMAIN SCOPING
   - If root cause is within one domain: domain agent fixes it
   - If root cause spans domains: report DOMAIN_VIOLATION
     - Orchestrator dispatches governance-architect
     - Architect coordinates cross-domain fix
     - Each domain agent implements its part

4. PREVENTIVE MEASURES
   - New tests to catch this class of bug
   - Rule changes (add to CLAUDE.md anti-patterns)
   - Agent prompt improvements (if agent caused the issue)
   - Tech debt items for systemic issues (add to .sdlc/tech-debt.json)

5. EVIDENCE LOG
   - Write structured report to .sdlc/history/
   - Include: reproduction, root cause, hypothesis, fix, prevention
   - Feeds into RETRO session scoring
```

#### Depth Limit

Post-mortem action items (preventive measures) do NOT trigger another post-mortem. Max depth is 1. If a preventive measure itself fails, it escalates to HITL rather than entering a post-mortem loop.

### 5.6 MERGE v2

**File:** `skills/sessions/merge.md`

#### Flow

```
1. PRE-MERGE VERIFICATION (verification-before-completion — section 2.6)
   - For each domain with changes:
     a. Run domain test command: {test_command}
     b. Run domain build command: {build_command}
     c. Run domain lint command: {lint_command}
     d. Run domain typecheck command: {typecheck_command}
   - All commands run FRESH (not cached results)
   - Agent must include actual command output in report

2. CROSS-DOMAIN VERIFICATION (if multi-domain)
   - Run integration test suite: {integration_test_command}
   - Run E2E tests (if configured): {e2e_test_command}
   - Verify API contract compatibility between domains

3. VERIFICATION REPORT
   Format per section 2.6 evidence format.
   All checks must pass. ANY failure → back to EXECUTE.

4. MERGE EXECUTION
   - If worktrees: merge each domain branch to main/release branch
   - If single branch: fast-forward or merge commit
   - Run full test suite post-merge
   - If post-merge tests fail: revert merge, escalate to POST_MORTEM

5. CLEANUP
   - Update backlog item status to 'done'
   - Record final cost in session log
   - Delete worktrees (if used)
   - Write completion entry to .sdlc/history/

6. CADENCE CHECK
   - mergesSinceRetro++
   - If mergesSinceRetro >= threshold (default 5): suggest RETRO
   - If lastGapAnalysis > 2 weeks: suggest GAP_ANALYSIS
```

---

## 6. New Hooks

### 6.1 disallowedTools in agent frontmatter (PreToolUse)

**File:** `hooks/disallowedTools in agent frontmatter`
**Type:** PreToolUse
**Triggers on:** Edit, Write, Bash

Full specification in section 3.1. This is a new file — does not replace any existing hook.

**Summary:**
- Reads `disallowedTools path patterns` env var
- Looks up agent's domain in `.sdlc/registry.yaml`
- Blocks Edit/Write calls targeting files outside the agent's domain path
- Allows Read anywhere (agents need cross-domain context for facades)
- For Bash: blocks write-like operations (mv, cp, rm, redirects) targeting outside domain path
- Exempt agents: orchestrator, governance-architect, governance-reviewer, tech-lead, release-manager

**Relationship to existing hooks:**
- `sdlc-write-guard.cjs` — still active, protects `.claude/` and `.sdlc/` paths. Domain guard is additive.
- `sdlc-secrets-guard.cjs` — still active, protects credential files. Domain guard is additive.
- Both hooks run independently. A file write must pass ALL hooks to succeed.

### 6.2 entry-check.cjs v2 (SessionStart)

**File:** `hooks/entry-check.cjs` (existing file, enhanced)
**Type:** SessionStart

Full specification in section 4.2. This is a modification of the existing file.

**Changes from v1:**
- When orchestrator starts with SDLC initialized: inject full state payload (section 4.2)
- When not orchestrator: same warning as v1 (unchanged)
- When SDLC not initialized: same welcome message as v1 (unchanged)

**New behavior:**
```
IF sdlcExists AND agentName === 'orchestrator':
  payload = buildStateInjection()  // reads config, state, backlog, registry
  output({ result: payload })
ELSE:
  // existing v1 behavior
```

### 6.3 sdlc-iteration-hook.cjs (Stop Hook — Ralph Pattern)

**File:** `hooks/sdlc-iteration-hook.cjs`
**Type:** Stop
**Triggers:** When any agent session ends

Full specification in section 2.4. This is a new file.

**Summary:**
1. Read `.sdlc/state.json`
2. Find active workflow where `currentSession === 'EXECUTE'`
3. If no active EXECUTE workflow: allow exit
4. Get domain test command from registry for the active agent's domain
5. Run domain test command
6. If tests pass: update state, allow exit
7. If tests fail and iterations remain and budget not exceeded: block exit, re-inject
8. If tests fail and iterations exhausted or budget exceeded: allow exit, orchestrator handles

**State tracking:** `.sdlc/state.json` → `activeWorkflows[].context.domains[].iterationCount`

### 6.4 sdlc-superpowers-guard.cjs (Simplified)

**File:** `hooks/sdlc-superpowers-guard.cjs` (existing file, simplified)
**Type:** PreToolUse
**Triggers on:** Skill tool

**Change from v1:** When SDLC is active (`.sdlc/config.yaml` exists), block ALL superpowers skill invocations. No per-skill toggle. Superpowers patterns are now internalized — there is no reason to invoke them.

```javascript
// Simplified v2 logic:
// IF tool_name === 'Skill' AND skill starts with 'superpowers:'
//   IF .sdlc/config.yaml exists:
//     BLOCK: "claude-sdlc v2 has internalized superpowers patterns.
//             Superpowers skills are blocked when SDLC is active."
//   ELSE:
//     ALLOW (superpowers works standalone without SDLC)
```

---

## 7. Attribution

All adapted patterns are from MIT-licensed plugins. The following must be added to `THIRD_PARTY_NOTICES.md`:

```
## obra/superpowers
Copyright (c) Jesse Vincent
License: MIT
URL: https://github.com/obra/superpowers

Patterns adapted for claude-sdlc v2:
- Subagent dispatch protocol (status codes, fresh subagent per task, self-review,
  honest escalation) — adapted for domain-scoped execution
- TDD discipline (RED → verify fail → GREEN → verify pass → REFACTOR) —
  adapted for domain-scoped test commands
- Systematic debugging (4-phase: root cause → pattern analysis → hypothesis →
  implementation) — adapted for domain-scoped investigation
- Verification before completion (evidence before claims, fresh verification
  runs) — adapted for domain-specific verification commands
- Visual brainstorming with Express companion server (per-question browser/terminal
  routing) — integrated into BRAINSTORM session skill
- Implementation planning (task decomposition with domain assignments) —
  adapted for per-domain wave-based planning
- Session context injection (state payload at session start) —
  adapted for SDLC state injection

## anthropic/code-review
Copyright (c) Anthropic
License: MIT

Patterns adapted for claude-sdlc v2:
- 5-agent parallel review architecture — adapted with domain boundary
  violation checker (Agent 3) replacing design/architecture reviewer
- Confidence scoring system (0-100, threshold >= 80) — used unchanged

## anthropic/ralph-loop
Copyright (c) Anthropic
License: MIT

Patterns adapted for claude-sdlc v2:
- Stop hook iterative execution pattern — adapted for domain-scoped test
  commands, max_iterations config, budget checks per iteration

## anthropic/claude-md-management
Copyright (c) Anthropic
License: MIT

Patterns adapted for claude-sdlc v2:
- Quality rubric scoring system (6-criterion, A-F grades) — adapted from
  file quality scoring to agent health scoring for RETRO sessions

## anthropic/frontend-design
Copyright (c) Anthropic
License: MIT

Patterns adapted for claude-sdlc v2:
- Anti-pattern lists in prompts — adapted for domain-specific anti-patterns
  in BRAINSTORM spec drafting
```

---

## 8. Migration from v1

### 8.1 State File Compatibility

Existing `.sdlc/` state files are forward-compatible:

| File | Migration |
|------|-----------|
| `.sdlc/config.yaml` | Add new fields with defaults: `execution.maxIterations: 5`, `brainstorm.serverPort: 3456`, `domains.sharedPaths: []`, `domains.generatedPaths: []`. Existing fields unchanged. |
| `.sdlc/backlog.json` | No changes. Schema unchanged. |
| `.sdlc/state.json` | Add `iterationCount`, `maxIterations`, `testsGreen`, `budgetExceeded` to workflow context. Existing fields unchanged. Old state files without these fields default to `iterationCount: 0`, `maxIterations: 5`, `testsGreen: false`. |
| `.sdlc/registry.yaml` | Add `domain.buildCommand`, `domain.lintCommand`, `domain.verifyCommands` to agent entries. Existing fields unchanged. Missing commands default to project-level commands. |
| `.sdlc/history/` | No changes. New session logs have additional fields but old logs are still valid. |
| `.sdlc/costs/` | No changes. Agent health metrics are additive. |

**Schema version check:** `.sdlc/config.yaml` gains a `schemaVersion: 2` field. The orchestrator checks this on startup. If `schemaVersion: 1` (or missing), it runs a one-time migration adding default values for new fields.

### 8.2 Session Skills

Session skills are replaced entirely (markdown files). No data migration needed — they are prompt templates, not data stores.

### 8.3 Hooks

New hooks are added alongside existing ones:
- `disallowedTools in agent frontmatter` — NEW file
- `sdlc-iteration-hook.cjs` — NEW file
- `entry-check.cjs` — MODIFIED (enhanced with state injection)
- `sdlc-superpowers-guard.cjs` — MODIFIED (simplified to block-all)
- `sdlc-write-guard.cjs` — UNCHANGED
- `sdlc-secrets-guard.cjs` — UNCHANGED

### 8.4 Agent Templates

Agent templates in `agents/templates/` are unchanged. A new template is added:
- `agents/templates/subagent-dispatch.md` — the subagent prompt template from section 2.1

### 8.5 Agent Catalog

Agent catalog in `agents/catalog/` is unchanged. No agent definitions need modification.

### 8.6 Orchestrator

`agents/orchestrator.md` is rewritten to remove superpowers integration table and add v2 dispatch protocol. The tool list (`Read, Bash, Glob, Grep, Agent`) is unchanged.

---

## 9. What Gets Removed

### 9.1 Superpowers Integration Table

The orchestrator's "Superpowers Integration" section (mapping SDLC sessions to superpowers skills) is removed entirely. All patterns are now internalized.

**Before (v1 orchestrator.md):**
```markdown
## Superpowers Integration
| SDLC Session | Config Key | Superpowers Skill | When |
...
```

**After (v2 orchestrator.md):**
Section deleted. Orchestrator uses built-in session flows only.

### 9.2 Session Skill Branching

All session skills lose their "With superpowers plugin (preferred)" / "Without superpowers (fallback)" branching. Each session has one flow.

**Before (v1 brainstorm.md):**
```markdown
### With superpowers plugin (preferred)
If superpowers:brainstorming skill is available...

### Without superpowers (fallback)
1. Dispatch governance-architect...
```

**After (v2 brainstorm.md):**
Single flow, fully specified (section 5.1).

### 9.3 Per-Skill Superpowers Toggles

The `.sdlc/config.yaml` `integrations.superpowers` section with per-skill toggles (`brainstorming: true`, `tdd: false`, etc.) is replaced with a single `integrations.superpowers.enabled: false` toggle (always false when SDLC v2 is active, for backward compatibility).

### 9.4 Superpowers Bridge Agent

The agent `agents/catalog/bridges/superpowers-bridge.md` is deprecated. It can remain in the catalog for projects that want to use superpowers without SDLC, but the SDLC orchestrator will never dispatch it.

---

## 10. Implementation Phases

### Phase 1: Domain Guard Hook + Orchestrator v2 (Enforcement Foundation)

**Priority:** Highest — everything else depends on domain isolation
**Estimated effort:** M

**Deliverables:**
1. `hooks/disallowedTools in agent frontmatter` — new PreToolUse hook (section 3.1)
2. `.sdlc/registry.yaml` format update — add `domain.path` to agent entries
3. `agents/orchestrator.md` — rewrite: remove superpowers table, add dispatch protocol, enforce no Edit/Write
4. `agents/templates/subagent-dispatch.md` — new subagent prompt template (section 2.1)
5. Unit tests for domain guard hook (mock registry, test allow/block scenarios)

**Verification:**
- Domain guard blocks agent writes outside domain path
- Domain guard allows governance agents everywhere
- Orchestrator cannot call Edit or Write
- Subagent dispatch template includes domain constraints

### Phase 2: EXECUTE v2 — Ralph Loop + TDD

**Priority:** High — core execution engine
**Estimated effort:** L
**Depends on:** Phase 1

**Deliverables:**
1. `hooks/sdlc-iteration-hook.cjs` — new Stop hook (section 2.4)
2. `skills/sessions/execute.md` — full rewrite with per-wave dispatch, TDD, Ralph Loop (section 5.3)
3. `.sdlc/state.json` schema update — add iteration tracking fields
4. `.sdlc/config.yaml` — add `execution.maxIterations` field
5. Unit tests for iteration hook (mock state, test iteration counting, budget checks)

**Verification:**
- Stop hook re-injects when domain tests fail
- Stop hook allows exit when domain tests pass
- Stop hook respects maxIterations limit
- Stop hook respects budget limit
- Execute session dispatches agents per wave
- Execute session uses TDD protocol

### Phase 3: REVIEW v2 — 5-Agent Parallel + Confidence Scoring

**Priority:** High — quality gate
**Estimated effort:** M
**Depends on:** Phase 1

**Deliverables:**
1. `skills/sessions/review.md` — full rewrite with two-stage review (section 5.4)
2. Agent 3 domain boundary checker prompt (section 2.2, inline in review.md)
3. Confidence scoring guidelines (section 5.4, inline in review.md)

**Verification:**
- Stage 1 short-circuits on spec non-compliance
- 5 agents dispatched in parallel for Stage 2
- Only issues with confidence >= 80 reported
- Agent 3 catches import violations across domains
- Review correctly routes to needs-changes, approved, or rejected

### Phase 4: BRAINSTORM v2 — Visual Server

**Priority:** Medium — enhances quality for L/XL tasks
**Estimated effort:** M
**Depends on:** Phase 1

**Deliverables:**
1. `scripts/brainstorm-server.ts` — Express server for visual brainstorming (section 2.7)
2. `skills/sessions/brainstorm.md` — full rewrite with visual server, spec review loop, anti-patterns (section 5.1)
3. `.sdlc/config.yaml` — add `brainstorm.serverPort` field

**Verification:**
- Brainstorm server starts and serves HTML
- Per-question routing works (browser vs terminal)
- Spec review subagent catches incomplete specs
- Anti-pattern section generated based on task domains
- Server stops cleanly on session end

### Phase 5: POST_MORTEM v2 + PLAN v2

**Priority:** Medium — completes the session skill rewrite
**Estimated effort:** M
**Depends on:** Phase 1, Phase 2

**Deliverables:**
1. `skills/sessions/post-mortem.md` — full rewrite with 4-phase debugging (section 5.5)
2. `skills/sessions/plan.md` — full rewrite with wave-based planning (section 5.2)
3. `schema/debug-evidence.schema.json` — evidence log schema

**Verification:**
- Post-mortem follows 4-phase protocol
- Post-mortem scopes investigation to domain
- Post-mortem escalates cross-domain issues
- Plan decomposes into per-domain tasks with wave structure
- Plan review subagent catches missing acceptance criteria

### Phase 6: Entry-Check v2 + MERGE v2

**Priority:** Medium — state injection and merge verification
**Estimated effort:** S
**Depends on:** Phase 1

**Deliverables:**
1. `hooks/entry-check.cjs` — enhance with state injection for orchestrator (section 6.2)
2. `skills/sessions/merge.md` — full rewrite with verification-before-completion (section 5.6)
3. `hooks/sdlc-superpowers-guard.cjs` — simplify to block-all (section 6.4)

**Verification:**
- Orchestrator receives state payload on startup
- State payload includes backlog summary, domain map, active workflows
- Merge runs fresh verification (not cached)
- Merge fails if any verification check fails
- Superpowers guard blocks all superpowers skills when SDLC active

### Phase 7: RETRO v2 + Attribution + Cleanup

**Priority:** Low — polish and compliance
**Estimated effort:** S
**Depends on:** All previous phases

**Deliverables:**
1. `skills/sessions/retro.md` — add quality rubric scoring (section 2.8)
2. `THIRD_PARTY_NOTICES.md` — add attribution block (section 7)
3. Schema version migration logic in orchestrator
4. Update `CLAUDE.md` with v2 architecture description
5. Remove deprecated superpowers references from any remaining files

**Verification:**
- RETRO scores agents on 6 criteria
- Attribution block is complete and accurate
- Schema version migration runs on first v2 startup
- No remaining superpowers references in active code paths

---

## Appendix A: File Inventory

### New Files

| File | Type | Phase |
|------|------|-------|
| `hooks/disallowedTools in agent frontmatter` | Hook (PreToolUse) | 1 |
| `hooks/sdlc-iteration-hook.cjs` | Hook (Stop) | 2 |
| `agents/templates/subagent-dispatch.md` | Agent template | 1 |
| `scripts/brainstorm-server.ts` | Script | 4 |
| `schema/debug-evidence.schema.json` | Schema | 5 |

### Modified Files

| File | Change | Phase |
|------|--------|-------|
| `agents/orchestrator.md` | Rewrite (remove superpowers, add dispatch protocol) | 1 |
| `hooks/entry-check.cjs` | Enhance (add state injection) | 6 |
| `hooks/sdlc-superpowers-guard.cjs` | Simplify (block-all when SDLC active) | 6 |
| `skills/sessions/brainstorm.md` | Full rewrite | 4 |
| `skills/sessions/plan.md` | Full rewrite | 5 |
| `skills/sessions/execute.md` | Full rewrite | 2 |
| `skills/sessions/review.md` | Full rewrite | 3 |
| `skills/sessions/post-mortem.md` | Full rewrite | 5 |
| `skills/sessions/merge.md` | Full rewrite | 6 |
| `skills/sessions/retro.md` | Add rubric scoring | 7 |
| `THIRD_PARTY_NOTICES.md` | Add attribution block | 7 |
| `CLAUDE.md` | Update architecture description | 7 |

### Unchanged Files

| File | Reason |
|------|--------|
| `hooks/sdlc-write-guard.cjs` | Still needed, additive to domain guard |
| `hooks/sdlc-secrets-guard.cjs` | Still needed, orthogonal concern |
| `agents/catalog/**` | Agent definitions unchanged |
| `agents/templates/domain-*.md` | Templates unchanged |
| `agents/templates/governance-*.md` | Templates unchanged |
| `skills/sdlc-init/SKILL.md` | Init flow unchanged |
| `skills/sdlc-dispatch/SKILL.md` | Dispatch flow unchanged |
| `skills/sdlc-status/SKILL.md` | Status flow unchanged |
| `skills/sessions/quick-fix.md` | Simple flow, no superpowers dependency |
| `skills/sessions/triage.md` | No superpowers dependency |
| `skills/sessions/integration-check.md` | No superpowers dependency |
| `skills/sessions/onboard.md` | No superpowers dependency |
| `schema/*.schema.json` | Additive changes only |
| `scripts/init.ts` | Init logic unchanged |
| `scripts/registry-builder.ts` | Registry builder unchanged |

---

## Appendix B: Configuration Schema Changes

### New `.sdlc/config.yaml` Fields (v2)

```yaml
# Schema version for migration detection
schemaVersion: 2

# Execution settings (new section)
execution:
  maxIterations: 5          # Ralph Loop max iterations per domain
  budgetCheckEnabled: true  # Check budget before re-iteration

# Brainstorm settings (new section)
brainstorm:
  serverPort: 3456          # Express server port for visual brainstorming
  serverEnabled: true       # Set false to disable visual server

# Domain settings (new section)
domains:
  sharedPaths:              # Paths any domain agent can write to
    - "package.json"
    - "pnpm-lock.yaml"
    - ".gitignore"
  generatedPaths:           # Generated paths any domain agent can write to
    - "node_modules/.prisma/"
    - "generated/"

# Existing integrations section — simplified
integrations:
  superpowers:
    enabled: false          # Always false in v2 (patterns internalized)
    # Per-skill toggles REMOVED in v2
```

### New `.sdlc/registry.yaml` Agent Fields (v2)

```yaml
agents:
  - name: auth-developer
    domain:
      name: auth
      path: packages/auth/              # EXISTING (may need adding for some agents)
      testCommand: pnpm --filter @app/auth test    # EXISTING
      buildCommand: pnpm --filter @app/auth build   # NEW
      lintCommand: pnpm --filter @app/auth lint     # NEW
      typecheckCommand: pnpm --filter @app/auth typecheck  # NEW
      verifyCommands:                               # NEW
        - pnpm --filter @app/auth test
        - pnpm --filter @app/auth build
        - pnpm --filter @app/auth lint
```
