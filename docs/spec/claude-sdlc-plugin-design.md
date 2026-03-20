# Claude SDLC Plugin — Design Spec

**Status:** Draft (brainstorming)
**Date:** 2026-03-20
**Parent spec:** `2026-03-20-monorepo-context-isolation-design.md` (workflow design)
**Goal:** Package the SDLC workflow engine as a reusable, project-agnostic Claude Code plugin.

## Scope Split

| Concern | Lives in |
|---------|----------|
| Plan2Skill modular monolith, facades, domain map | Parent spec |
| Plan2Skill-specific agents, skills, rules | Parent spec |
| Plugin infrastructure, state, CLI, config, distribution | **This spec** |
| Session type definitions (generic) | **This spec** |
| Workflow engine, triggers, chaining | **This spec** (generalized from parent) |

## Plugin Identity

```yaml
name: claude-sdlc
description: Full SDLC governance for Claude Code — orchestrator, agent teams, workflow engine
version: 0.1.0
author: plan2skill
license: MIT
claude-code-min-version: "1.0.0"
```

## 1. Plugin Structure

```
claude-sdlc/
├── manifest.json                    # plugin metadata + entry points
├── README.md                        # user guide
│
├── skills/
│   ├── sdlc-init/SKILL.md          # /sdlc init — project bootstrap
│   ├── sdlc-dispatch/SKILL.md      # /sdlc dispatch — entry point for tasks
│   ├── sdlc-status/SKILL.md        # /sdlc status — backlog + active work
│   ├── sdlc-triage/SKILL.md        # /sdlc triage — manual triage
│   ├── sdlc-retro/SKILL.md         # /sdlc retro — retrospective
│   ├── sdlc-release/SKILL.md       # /sdlc release — cut release
│   ├── sdlc-cost/SKILL.md          # /sdlc cost — spending report
│   ├── sdlc-team/SKILL.md          # /sdlc team — agent registry health
│   ├── sdlc-add-agent/SKILL.md     # /sdlc add-agent — guided agent creation
│   ├── sdlc-add-domain/SKILL.md    # /sdlc add-domain — register domain
│   │
│   └── sessions/                    # internal session skills (not user-invocable)
│       ├── classify.md              # task classifier
│       ├── quick-fix.md
│       ├── triage.md
│       ├── brainstorm.md
│       ├── plan.md
│       ├── execute.md
│       ├── review.md
│       ├── integration-check.md
│       ├── merge.md
│       ├── gap-analysis.md
│       ├── retro.md
│       ├── post-mortem.md
│       ├── architecture-review.md
│       ├── security-review.md
│       ├── release.md
│       ├── docs-sync.md
│       └── onboard.md
│
├── agents/
│   ├── orchestrator.md              # main entry point agent
│   └── templates/                   # starter agent templates
│       ├── governance-architect.md
│       ├── governance-reviewer.md
│       ├── domain-developer.md      # parameterized by domain
│       ├── domain-tester.md
│       └── qa-e2e-writer.md
│
├── hooks/
│   ├── session-start.md             # inject orchestrator identity check
│   ├── post-tool-use.md             # cost tracking on every tool call
│   └── task-completed.md            # update backlog on task completion
│
├── rules/
│   └── sdlc-governance.md           # always-loaded: facade pattern, cross-domain rules
│
├── templates/                       # project-type starters
│   ├── nestjs-monorepo/
│   │   ├── config.yaml
│   │   ├── agents/
│   │   └── domain-map.yaml
│   ├── nextjs-app/
│   ├── django/
│   ├── express-api/
│   ├── react-spa/
│   └── generic/
│       ├── config.yaml
│       ├── agents/
│       └── domain-map.yaml
│
├── scripts/
│   ├── init.ts                      # bootstrap: scan project → generate config
│   ├── registry-builder.ts          # regenerate REGISTRY.yaml from agent frontmatter
│   ├── cost-tracker.ts              # aggregate cost data from session logs
│   ├── domain-detector.ts           # auto-detect project domains from file structure
│   └── tech-stack-detector.ts       # detect frameworks, languages, tools
│
└── schema/
    ├── config.schema.json           # JSON Schema for .sdlc/config.yaml
    ├── backlog.schema.json          # JSON Schema for .sdlc/backlog.json
    ├── state.schema.json            # JSON Schema for .sdlc/state.json
    ├── registry.schema.json         # JSON Schema for .sdlc/registry.yaml
    └── session-log.schema.json      # JSON Schema for session history
```

## 2. State Management

### 2.1 Project State Directory

Plugin creates `.sdlc/` in project root (gitignored by default, opt-in to commit):

```
.sdlc/
├── config.yaml                # user preferences (committed)
├── registry.yaml              # agent registry (committed)
├── backlog.json               # persistent task backlog (committed)
├── state.json                 # active workflow state (gitignored — ephemeral)
├── history/                   # session logs (gitignored)
│   ├── 2026-03-20T14-30-BRAINSTORM-WF007.json
│   ├── 2026-03-20T15-00-EXECUTE-WF007.json
│   └── ...
└── costs/                     # aggregated cost data (gitignored)
    ├── 2026-03-weekly.json
    └── 2026-03-monthly.json
```

### 2.2 Backlog Schema

```typescript
interface BacklogItem {
  id: string;                    // TASK-001 format, auto-incremented
  title: string;
  description: string;
  type: 'feature' | 'bugfix' | 'refactor' | 'research' | 'docs' | 'ops';
  complexity: 'S' | 'M' | 'L' | 'XL';
  domains: string[];             // from registry domain names
  tags: string[];
  status: BacklogStatus;
  priority: 'critical' | 'high' | 'medium' | 'low' | 'unprioritized';
  specPath?: string;             // link to design spec
  planPath?: string;             // link to implementation plan
  workflowId?: string;          // active workflow tracking this item
  created: string;               // ISO 8601
  updated: string;
  sessions: SessionRef[];        // history of sessions that touched this
  estimatedCost?: number;
  actualCost?: number;
}

type BacklogStatus =
  | 'inbox'          // just created, unclassified
  | 'triaged'        // classified but not planned
  | 'planned'        // has spec and/or plan
  | 'executing'      // domain teams working
  | 'reviewing'      // in review gate
  | 'done'           // merged
  | 'blocked'        // needs HITL
  | 'abandoned';     // cancelled

interface SessionRef {
  sessionType: SessionType;
  timestamp: string;
  result: 'approved' | 'rejected' | 'needs-changes' | 'completed' | 'escalated';
  cost: number;
  agentsUsed: string[];
}
```

### 2.3 Workflow State (Active Work Tracking)

```typescript
interface WorkflowState {
  activeWorkflows: ActiveWorkflow[];   // currently executing
  cadence: {
    lastRetro: string;                 // ISO 8601
    lastGapAnalysis: string;
    lastArchReview: string;
    mergesSinceRetro: number;
  };
  sessionQueue: QueuedSession[];       // next sessions to run
}

interface ActiveWorkflow {
  id: string;                          // WF-001 format
  backlogItemId: string;               // TASK-xxx
  currentSession: SessionType;
  context: {
    specPath?: string;
    planPath?: string;
    worktrees: Record<string, WorktreeInfo>;
    reviewAttempt: number;
    maxRetries: number;
  };
  history: SessionRef[];
  startedAt: string;
  totalCost: number;
}

interface WorktreeInfo {
  branch: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  agentSessionId?: string;            // for resume
}
```

### 2.4 Cross-Session Context Protocol

When one session completes, it writes a handoff artifact that the next session reads:

```typescript
// Written by each session to .sdlc/state.json → activeWorkflows[].context
interface SessionHandoff {
  from: SessionType;
  to: SessionType;
  backlogItemId: string;
  artifacts: {
    spec?: string;           // path to spec doc
    plan?: string;           // path to plan doc
    worktrees?: Record<string, string>;  // domain → branch
    testResults?: string;    // path to test output
    reviewReport?: string;   // path to review report
    gapReport?: string;      // path to gap analysis
  };
  decisions: string[];       // key decisions made in this session
  openIssues: string[];      // unresolved items for next session
}
```

The orchestrator reads this when resuming work:
```
User: "continue"
  → orchestrator reads .sdlc/state.json
  → finds active workflow WF-007
  → last session was PLAN (approved)
  → next session: EXECUTE
  → loads handoff: spec path, plan path, domain assignments
  → composes team from registry
  → dispatches
```

## 3. Configuration

### 3.1 Config Schema

```yaml
# .sdlc/config.yaml — created by /sdlc init, user-editable

# Project metadata
project:
  name: ""                         # auto-detected from package.json
  type: auto                       # auto | monorepo | single-app | microservices
  techStack: auto                  # auto | explicit list

# Domains (auto-generated by init, user-editable)
domains:
  # Each domain maps to a directory + agent team
  # Example for detected monorepo:
  # api:
  #   path: "apps/api"
  #   techStack: [nestjs, prisma]
  #   rules: ["api.md", "security.md"]
  #   claudeMd: "apps/api/CLAUDE.md"

# Workflow behavior
workflow:
  # Complexity auto-classification thresholds
  complexity:
    S: { maxFiles: 3, singleDomain: true }
    M: { maxFiles: 10, maxDomains: 2 }
    L: { maxFiles: 30, maxDomains: 4 }
    XL: "everything else"

  # Auto-dispatch vs HITL
  autoQuickFix: true               # S/bugfix → auto-dispatch
  autoMerge: false                 # always HITL for merge
  maxRetries: 2                    # review→execute loops before HITL
  requireArchReview: [XL]          # complexities needing arch review

# Session triggers
triggers:
  retro:
    cadence: bi-weekly             # weekly | bi-weekly | monthly | manual-only
    mergeThreshold: 5
  gapAnalysis:
    cadence: weekly
    postMergeFor: [L, XL]
  architectureReview:
    cadence: monthly
  securityReview:
    autoFor: [auth, middleware, endpoint]  # file patterns that trigger

# Budget
budget:
  perSession:
    QUICK_FIX: 1.00
    TRIAGE: 2.00
    BRAINSTORM: 5.00
    PLAN: 3.00
    EXECUTE: 5.00                  # per domain
    REVIEW: 3.00
    INTEGRATION_CHECK: 2.00
    MERGE: 0.50
    GAP_ANALYSIS: 3.00
    RETRO: 3.00
    POST_MORTEM: 3.00
    ARCHITECTURE_REVIEW: 4.00
    SECURITY_REVIEW: 2.00
    RELEASE: 3.00
    DOCS_SYNC: 2.00
    ONBOARD: 2.00
  monthlyWarning: 200
  monthlyHardCap: 0                # 0 = no hard cap
  preferredModels:
    governance: opus               # architect, reviewer, tech-lead
    development: sonnet            # domain developers
    testing: sonnet                # testers
    quickfix: sonnet               # S tasks
    docs: sonnet                   # documentation

# HITL preferences
hitl:
  mergeApproval: [L, XL]          # complexities needing merge HITL
  budgetApproval: 10.00           # ask if single session exceeds this
  silentMode: false               # minimize AskUserQuestion calls

# Git conventions
git:
  releaseBranch: "release/next"
  mainBranch: "master"
  commitPrefix: "conventional"    # conventional | none | custom
  tagFormat: "v{version}"
```

### 3.2 Init Flow

```
/sdlc init

Step 1: DETECT
  ├── Scan package.json / pyproject.toml / Cargo.toml / go.mod
  ├── Detect tech stack (frameworks, languages, tools)
  ├── Detect monorepo structure (workspaces, apps/, packages/)
  ├── Detect existing CI/CD (GitHub Actions, GitLab CI)
  ├── Detect existing CLAUDE.md / .claude/ config
  └── Output: ProjectProfile

Step 2: MAP DOMAINS
  ├── Analyze directory structure for bounded contexts
  ├── Analyze import graph for coupling clusters
  ├── Propose domain groupings
  ├── HITL: user confirms/adjusts domains
  └── Output: DomainMap

Step 3: GENERATE
  ├── .sdlc/config.yaml (from template matching tech stack)
  ├── .sdlc/registry.yaml (agents per domain)
  ├── .sdlc/backlog.json (empty)
  ├── .sdlc/state.json (empty)
  ├── .claude/agents/orchestrator.md (from plugin template)
  ├── .claude/agents/{domain}-developer.md (per domain)
  ├── .claude/agents/{domain}-tester.md (per domain)
  ├── .claude/agents/governance-*.md (standard set)
  ├── Per-domain CLAUDE.md files (if monorepo)
  ├── Path-scoped rules (from detected tech stack)
  ├── .gitignore additions (.sdlc/state.json, .sdlc/history/, .sdlc/costs/)
  └── HITL: user reviews generated files

Step 4: VERIFY
  ├── Run orchestrator agent in dry-run mode
  ├── Classify a sample task to verify routing
  ├── Check all agents are resolvable
  └── Output: "SDLC plugin initialized. Use `p2s` or `/sdlc dispatch` to start."
```

## 4. CLI Commands (Skills)

### 4.1 Core Commands

```yaml
# /sdlc init
sdlc-init:
  user-invocable: true
  description: "Initialize SDLC plugin for this project"
  process: detect → map domains → generate config → verify

# /sdlc dispatch "task description"
sdlc-dispatch:
  user-invocable: true
  description: "Submit a task to the orchestrator"
  process: create backlog item → classify → route to session type → execute pipeline

# /sdlc status
sdlc-status:
  user-invocable: true
  description: "Show backlog, active work, and recent completions"
  output: |
    BACKLOG (6 items)
    ─────────────────────────────────────────────────────
    TASK-042  [L] feature   high    "Daily rewards system"        planned
    TASK-043  [M] bugfix    critical "Login redirect loop"        executing (api-developer)
    TASK-044  [S] refactor  medium  "Extract stat utils"          triaged
    TASK-045  [L] feature   medium  "Leaderboard redesign"        inbox
    TASK-046  [S] bugfix    low     "Tooltip overflow on mobile"  inbox
    TASK-047  [M] docs      medium  "API endpoint documentation"  inbox

    ACTIVE WORKFLOWS
    ─────────────────────────────────────────────────────
    WF-012  TASK-043  EXECUTE → api-developer (worktree: task-api-1710934200)
    WF-013  TASK-042  REVIEW  → governance-reviewer

    RECENT (last 7 days)
    ─────────────────────────────────────────────────────
    TASK-040  [M] feature  done   "Party quest soft cap"     $8.20  3 sessions
    TASK-041  [S] bugfix   done   "Streak reset timezone"    $0.80  1 session

# /sdlc triage
sdlc-triage:
  user-invocable: true
  description: "Classify and prioritize all inbox/triaged backlog items"

# /sdlc retro
sdlc-retro:
  user-invocable: true
  description: "Run a retrospective on recent work"

# /sdlc release
sdlc-release:
  user-invocable: true
  description: "Cut a release — version bump, changelog, tag, deploy"
```

### 4.2 Observability Commands

```yaml
# /sdlc cost
sdlc-cost:
  user-invocable: true
  description: "Show cost breakdown for current period"
  output: |
    COST REPORT — March 2026 (20 days)
    ─────────────────────────────────────────────────────
    Total:        $164.30 / $200 warning / no hard cap

    By session type:
      EXECUTE       $75.00  (15 sessions, avg $5.00)
      REVIEW        $45.00  (15 sessions, avg $3.00)
      BRAINSTORM    $10.00  (2 sessions, avg $5.00)
      TRIAGE        $8.00   (4 sessions, avg $2.00)
      Other         $26.30

    By domain:
      api           $72.00  (44%)
      web           $55.00  (33%)
      governance    $28.00  (17%)
      qa            $9.30   (6%)

    By model:
      opus          $48.00  (29%)
      sonnet        $116.30 (71%)

    Trend: ↓8% vs last week (fewer L features)

# /sdlc team
sdlc-team:
  user-invocable: true
  description: "Show agent registry health and performance"
  output: |
    AGENT REGISTRY                  STATUS   SUCCESS  AVG $   AVG TURNS  LAST USED
    ────────────────────────────────────────────────────────────────────────────────
    governance-architect            active   92%      $2.10   8          2h ago
    governance-reviewer             active   100%     $1.50   5          1h ago
    api-developer                   active   85%      $3.80   22         30m ago
    api-tester                      active   90%      $1.20   12         1h ago
    web-developer                   active   88%      $3.50   20         2h ago
    web-tester                      active   95%      $1.00   10         2h ago
    qa-e2e-writer                   active   80%      $2.50   15         1d ago
    db-migration-specialist         idle     —        —       —          never

    ALERTS:
    ⚠ api-developer retry rate 15% (was 8%) — prompt refinement needed?
    ⚠ qa-e2e-writer 20% failure — E2E flakiness or spec clarity issue?

# /sdlc add-agent
sdlc-add-agent:
  user-invocable: true
  description: "Guided creation of a new agent with registry integration"
  process:
    1. Ask role (developer/tester/specialist/reviewer)
    2. Ask domain
    3. Suggest tools, skills, model based on role
    4. Generate agent.md from template
    5. Update registry.yaml
    6. Verify agent resolves

# /sdlc add-domain
sdlc-add-domain:
  user-invocable: true
  description: "Register a new domain with agents and rules"
  process:
    1. Ask domain name, path, tech stack
    2. Generate domain CLAUDE.md
    3. Generate domain-developer + domain-tester agents
    4. Generate path-scoped rules
    5. Update registry.yaml and config.yaml
```

## 5. Session Types (Generic)

### 5.1 Full Session Catalog

14 session types, generalized from parent spec:

| Session | Trigger | Participants | HITL | Output |
|---------|---------|-------------|------|--------|
| **QUICK_FIX** | S + bugfix + single-domain | domain-developer | None | Commit |
| **TRIAGE** | >3 inbox items, weekly, manual | governance-architect | Priority approval | Prioritized backlog |
| **BRAINSTORM** | XL, L+feature, vague request | governance-architect + domain experts | Heavy (questions, approval) | Design spec |
| **PLAN** | After approved spec, L task | governance-architect | Plan approval | Task list + waves |
| **EXECUTE** | After plan, after triage dispatch | domain teams (from registry) | Only on block | Code in worktrees |
| **REVIEW** | After execute completes | governance-reviewer | On reject (after retries) | Approved/rejected |
| **INTEGRATION_CHECK** | Multi-domain review pass | qa-e2e-writer | On merge conflict | Integration report |
| **MERGE** | After review/integration pass | orchestrator (direct) | XL only | Merged commits |
| **GAP_ANALYSIS** | Post-merge L/XL, weekly cron | governance-architect + reviewer | Gap prioritization | Gap report + tasks |
| **RETRO** | Bi-weekly, after N merges | governance agents | Improvement approval | Process updates |
| **POST_MORTEM** | E2E red, integration fails 2x | governance-tech-lead | Root cause approval | Action items |
| **ARCHITECTURE_REVIEW** | Pre-XL, monthly, coupling detected | governance-architect + tech-lead | Direction approval | Health report + ADR |
| **SECURITY_REVIEW** | Auth/middleware/endpoint files touched | governance-tech-lead | Always | Security report |
| **RELEASE** | Manual trigger | governance-tech-lead | Version + deploy approval | Tag + changelog |
| **DOCS_SYNC** | Post-merge L/XL, manual | governance-architect | Doc review | Updated docs |
| **ONBOARD** | After retro/post-mortem changes | governance-architect | Config review | Updated agents/rules |

### 5.2 Session Chaining (State Machine)

```
User message
  │
  ▼
CLASSIFY → determines session type + complexity + domains
  │
  ├─ S/bugfix ──────────────→ QUICK_FIX ──→ MERGE
  │
  ├─ M/clear ───────────────→ PLAN ──→ EXECUTE ──→ REVIEW ──→ MERGE
  │                                                    │
  │                                                    ├─ needs-changes (retry < max)
  │                                                    │   └──→ EXECUTE
  │                                                    └─ rejected → HITL
  │
  ├─ L/feature ─────────────→ BRAINSTORM ──→ PLAN ──→ EXECUTE ──→ REVIEW
  │                                                        │
  │                                                  (multi-domain?)
  │                                                        ├─ yes → INTEGRATION_CHECK ──→ MERGE
  │                                                        └─ no  → MERGE
  │
  ├─ XL ────────────────────→ ARCHITECTURE_REVIEW ──→ BRAINSTORM ──→ PLAN ──→ ...
  │
  ├─ "triage" / batch ──────→ TRIAGE ──→ (dispatches top items to appropriate chain)
  │
  ├─ "retro" / cadence ─────→ RETRO ──→ ONBOARD (if changes)
  │
  ├─ "release" ─────────────→ RELEASE
  │
  ├─ failure detected ──────→ POST_MORTEM ──→ TRIAGE (action items) + ONBOARD
  │
  ├─ cadence / post-merge ──→ GAP_ANALYSIS ──→ TRIAGE (gap items)
  │
  ├─ auth/security files ───→ SECURITY_REVIEW (parallel with REVIEW)
  │
  └─ post-merge L/XL ──────→ DOCS_SYNC
```

### 5.3 Retry & Escalation Policy

```yaml
retryPolicy:
  REVIEW → EXECUTE:
    maxRetries: 2
    onMaxRetries: HITL           # "Review failed 2x. Options: (A) fix manually, (B) adjust spec, (C) abandon"

  INTEGRATION_CHECK → EXECUTE:
    maxRetries: 1
    onMaxRetries: HITL

  QUICK_FIX (tests fail):
    maxRetries: 0
    onMaxRetries: TRIAGE         # escalate to full workflow

  POST_MORTEM → TRIAGE:
    maxDepth: 1                  # post-mortem action items don't trigger another post-mortem
    onMaxDepth: HITL

  anySession (budget exceeded):
    action: pause + HITL         # "Session $X exceeded budget ($Y). Continue? Options: (A) yes, (B) abort"
```

## 6. Observability

### 6.1 Cost Tracking

Built into plugin hooks — every agent invocation is logged:

```typescript
interface SessionLog {
  id: string;
  workflowId: string;
  backlogItemId: string;
  sessionType: SessionType;
  startTime: string;
  endTime: string;
  agents: AgentLog[];
  totalCost: number;
  result: SessionResult;
  turnsUsed: number;
}

interface AgentLog {
  name: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  turnsUsed: number;
  toolCalls: number;
  result: 'success' | 'failure' | 'escalated';
}
```

**Collection mechanism:**
- `PostToolUse` hook on Agent tool calls → capture agent name, model
- `Stop` hook → capture session totals
- Plugin aggregates into `.sdlc/history/` and `.sdlc/costs/`

### 6.2 Agent Health Metrics

Aggregated from session logs:

```typescript
interface AgentMetrics {
  name: string;
  totalSessions: number;
  successRate: number;           // completed without escalation
  avgCost: number;
  avgTurns: number;
  avgDuration: number;           // minutes
  retryRate: number;             // % of sessions that needed retry
  lastUsed: string;
  trend: 'improving' | 'stable' | 'degrading';
  alerts: string[];              // e.g., "retry rate up 7% this week"
}
```

**Health checks (run in RETRO):**
- Success rate < 80% → "agent needs prompt refinement"
- Avg cost > 2x budget → "model downgrade or prompt optimization"
- Retry rate > 15% → "spec quality issue or agent capability gap"
- Unused > 30 days → "consider removing or repurposing"

### 6.3 Workflow Metrics

```typescript
interface WorkflowMetrics {
  totalWorkflows: number;
  avgCycleTime: Record<string, number>;    // per complexity: S=10min, M=45min, etc.
  firstTimePassRate: number;               // % approved on first review
  escalationRate: number;                  // % needing HITL intervention
  costPerComplexity: Record<string, number>;
  mostExpensiveSessions: SessionType[];
  bottlenecks: string[];                   // e.g., "REVIEW takes 3x longer than EXECUTE"
}
```

## 7. Plugin Interop

### 7.1 Integration Map

```yaml
# How claude-sdlc delegates to other plugins

superpowers:
  brainstorming:
    used-in: BRAINSTORM session
    how: "governance-architect invokes superpowers:brainstorming skill"
  test-driven-development:
    used-in: EXECUTE session
    how: "domain-developer agents invoke superpowers:test-driven-development"
  systematic-debugging:
    used-in: POST_MORTEM session
    how: "governance-tech-lead invokes superpowers:systematic-debugging"
  requesting-code-review:
    used-in: REVIEW session
    how: "governance-reviewer invokes superpowers:requesting-code-review"
  writing-plans:
    used-in: PLAN session
    how: "governance-architect invokes superpowers:writing-plans"
  verification-before-completion:
    used-in: MERGE session
    how: "orchestrator invokes before merge commit"

code-review:
  code-review:
    used-in: REVIEW session
    how: "alternative to superpowers:requesting-code-review if installed"

playwright:
  browser tools:
    used-in: INTEGRATION_CHECK, qa-e2e-writer agent
    how: "qa-e2e-writer uses playwright MCP tools for E2E tests"

frontend-design:
  frontend-design:
    used-in: EXECUTE session (web domain)
    how: "web-developer agent invokes for UI implementation"

claude-md-management:
  claude-md-improver:
    used-in: ONBOARD session
    how: "governance-architect invokes after process changes"
```

### 7.2 Graceful Degradation

Plugin works without other plugins — just with reduced capability:

```yaml
without-superpowers:
  BRAINSTORM: uses built-in session skill (simpler, no visual companion)
  EXECUTE: no TDD enforcement (still works, less disciplined)
  POST_MORTEM: manual debugging instead of systematic-debugging

without-playwright:
  INTEGRATION_CHECK: skips E2E, runs unit + integration only
  qa-e2e-writer: disabled (logged as gap)

without-code-review:
  REVIEW: uses built-in review checklist (less thorough)

without-frontend-design:
  web-developer: uses standard prompting (less polished UI output)
```

## 8. Agent Templates

### 8.1 Template Parameterization

Agent templates use `{{variables}}` replaced during `/sdlc init`:

```yaml
# agents/templates/domain-developer.md
---
name: {{domain}}-developer
description: Developer for {{domain}} domain. Implements specs within {{path}}.
model: {{models.development}}
effort: high
tools: Read, Edit, Write, Bash, Glob, Grep
isolation: worktree
skills: {{domain_skills}}
permissionMode: acceptEdits
maxTurns: 50
memory: project
---

You are a developer for the {{project_name}} project, specializing in the {{domain}} domain.

Tech stack: {{techStack}}
Working directory: {{path}}

## Rules
- Follow existing patterns in the codebase
- Cross-domain calls MUST go through facades (never import internal services directly)
- Write tests for new functionality
- Run tests after implementation: `{{test_command}}`

## Domain context
{{domain_description}}
```

### 8.2 Tech Stack Templates

```yaml
# templates/nestjs-monorepo/config.yaml
project:
  type: monorepo
  techStack: [nestjs, prisma, trpc, typescript]

defaultAgentConfig:
  development:
    model: sonnet
    skills: [api-conventions]
    testCommand: "cd {{path}} && pnpm test"
  testing:
    model: sonnet
    skills: [test-patterns]
    testCommand: "cd {{path}} && pnpm test:coverage"

domainDetection:
  strategy: "directory-scan"
  patterns:
    - match: "apps/*/src/**/*.module.ts"
      type: "nestjs-module"
    - match: "apps/*/src/**/*.service.ts"
      type: "service"
    - match: "packages/*/src/index.ts"
      type: "shared-package"

rules:
  - name: "api-patterns"
    paths: ["apps/api/**"]
    content: |
      NestJS patterns: Injectable services, module imports/exports.
      Prisma for database access.
      tRPC for type-safe API layer.
```

## 9. Testing Matrix

### 9.1 Per-Session Test Requirements

```yaml
testMatrix:
  QUICK_FIX:
    before-commit:
      mandatory: [affected-unit-tests]    # run only tests for changed files
      optional: []
    gate: "tests pass"

  EXECUTE:
    during:
      mandatory: [unit]                   # TDD: write test first
      optional: [integration]             # if touching DB/external
    after:
      mandatory: [domain-test-suite]      # full domain tests
    gate: "coverage >= domain threshold"

  REVIEW:
    checks:
      mandatory: [typecheck, lint]
      optional: [integration]
    gate: "zero type errors, zero lint errors"

  INTEGRATION_CHECK:
    full-suite:
      mandatory: [unit, integration, e2e]
      optional: [a11y, performance]
    gate: "all green"

  SECURITY_REVIEW:
    scans:
      mandatory: [dependency-audit]       # npm audit
      optional: [custom-security-rules]   # project-specific
    gate: "no critical/high vulnerabilities"

  RELEASE:
    pre-release:
      mandatory: [unit, integration, e2e, typecheck, lint]
      optional: [performance, visual-regression]
    gate: "100% green, coverage above all thresholds"
```

## 10. Distribution & Installation

### 10.1 Installation

```bash
# Install as Claude Code plugin
claude plugin add claude-sdlc

# Or from git
claude plugin add https://github.com/user/claude-sdlc

# Initialize in project
claude --agent orchestrator
# > /sdlc init
```

### 10.2 Update & Versioning

```bash
# Update plugin
claude plugin update claude-sdlc

# Pin version
claude plugin add claude-sdlc@1.2.0
```

Plugin versioning follows semver:
- **Patch:** Bug fixes in session skills, agent templates
- **Minor:** New session types, new CLI commands, new templates
- **Major:** Breaking changes to config schema, state schema, or agent API

### 10.3 Migration

When plugin updates change schemas:
```
claude-sdlc upgrade
  → reads current .sdlc/ version
  → applies migrations (schema changes, new defaults)
  → HITL: reviews changes before applying
```

## 11. Implementation Roadmap (Plugin-Specific)

| Phase | What | Time | Priority |
|-------|------|------|----------|
| **P1** | Plugin manifest + directory structure | 1 hour | Critical |
| **P2** | State schemas (backlog, state, session-log) | 2 hours | Critical |
| **P3** | `/sdlc init` — tech stack detection + domain mapping | 4 hours | Critical |
| **P4** | `/sdlc dispatch` — classifier + session routing | 3 hours | Critical |
| **P5** | Core sessions (QUICK_FIX, EXECUTE, REVIEW, MERGE) | 4 hours | Critical |
| **P6** | Backlog persistence + cross-session handoff | 3 hours | Critical |
| **P7** | Agent templates (parameterized by domain) | 2 hours | High |
| **P8** | Governance sessions (BRAINSTORM, PLAN, TRIAGE) | 3 hours | High |
| **P9** | `/sdlc status` + `/sdlc team` | 2 hours | High |
| **P10** | Cost tracking hooks + `/sdlc cost` | 2 hours | High |
| **P11** | Quality sessions (GAP_ANALYSIS, RETRO, POST_MORTEM) | 3 hours | Medium |
| **P12** | RELEASE + DOCS_SYNC + SECURITY_REVIEW sessions | 3 hours | Medium |
| **P13** | ARCHITECTURE_REVIEW + ONBOARD sessions | 2 hours | Medium |
| **P14** | Plugin interop (superpowers, playwright, code-review) | 2 hours | Medium |
| **P15** | Tech stack templates (nestjs, nextjs, django, generic) | 3 hours | Medium |
| **P16** | Agent health metrics + workflow metrics | 2 hours | Low |
| **P17** | `/sdlc add-agent` + `/sdlc add-domain` | 2 hours | Low |
| **P18** | Distribution (manifest, installation, migration) | 2 hours | Low |
| **P19** | User guide + agent authoring guide | 3 hours | Low |

**Total:** ~48 hours across ~3-4 weeks

**Week 1:** P1-P6 (core infrastructure — plugin works for basic flow)
**Week 2:** P7-P10 (usable product — governance, status, costs)
**Week 3:** P11-P15 (complete SDLC — all sessions, templates)
**Week 4:** P16-P19 (polish — metrics, guides, distribution)

## 12. Agent Assignment Engine

### 12.1 Assignment Tiers

Every agent in the catalog falls into one of 4 tiers based on how they get assigned to a domain/subproject:

```
Tier 1: MANDATORY              Tier 2: AUTO-DETECTED
Always present, cannot remove   Detected by signals, user can remove
┌──────────────────────────┐   ┌──────────────────────────────────┐
│ orchestrator              │   │ Signals: tech stack, file patterns│
│ {domain}-developer        │   │ project features, CI config       │
│ {domain}-tester           │   │                                   │
│ product-analyst           │   │ "I see Prisma → db-migration"    │
│ architect (for L/XL)      │   │ "I see .github/ → devops"        │
│ qa-lead (for M/L/XL)     │   │ "I see i18n config → i18n-spec"  │
└──────────────────────────┘   └──────────────────────────────────┘

Tier 3: GOVERNANCE-REQUESTED    Tier 4: USER-REQUESTED
Pulled in by governance during  User adds via /sdlc add-agent
a session when gap detected     or /sdlc add-sme
┌──────────────────────────┐   ┌──────────────────────────────────┐
│ "Task needs security      │   │ /sdlc add-agent performance      │
│  review but no security   │   │ /sdlc add-sme fintech            │
│  auditor assigned"        │   │ /sdlc add-agent custom-name      │
│ → orchestrator pulls in   │   │                                   │
│ → or HITL if doesn't exist│   │ Persists in registry for future  │
└──────────────────────────┘   └──────────────────────────────────┘
```

### 12.2 Detection Signals

During `/sdlc init` and ongoing project analysis, the engine scans for:

```yaml
signals:

  # ── Tech Stack Detection ──────────────────────────────
  techStack:
    nestjs:
      detect: ["package.json contains @nestjs/core"]
      assigns: [backend-dev]
      specialists: [db-migration, monitoring-specialist]
      sme: [postgres-sme]

    nextjs:
      detect: ["package.json contains next", "next.config.*"]
      assigns: [frontend-dev]
      testing: [visual-qa, interaction-tester, cross-browser-tester]
      design: [ui-designer, ux-designer]

    react:
      detect: ["package.json contains react"]
      assigns: [frontend-dev]
      testing: [interaction-tester]
      sme: [react-sme]

    expo:
      detect: ["package.json contains expo", "app.json with expo config"]
      assigns: [mobile-dev]
      testing: [cross-browser-tester]

    prisma:
      detect: ["prisma/schema.prisma exists"]
      specialists: [db-migration, data-modeler]
      sme: [postgres-sme]

    trpc:
      detect: ["package.json contains @trpc"]
      assigns: [api-designer]

    django:
      detect: ["manage.py exists", "requirements.txt contains django"]
      assigns: [backend-dev]
      specialists: [db-migration]

    rails:
      detect: ["Gemfile contains rails"]
      assigns: [backend-dev]
      specialists: [db-migration]

  # ── Feature Detection ────────────────────────────────
  features:
    i18n:
      detect: ["i18n config file", "translation files", "tr() or t() calls"]
      specialists: [i18n-specialist]

    ai-generators:
      detect: ["imports from @ai-sdk", "anthropic/openai SDK usage", "generator files"]
      specialists: [ai-prompt-eng]
      sme: [llm-sme]

    auth:
      detect: ["JWT middleware", "auth guard", "passport config", "OAuth"]
      testing: [security-auditor]
      sme: [security-sme]

    gamification:
      detect: ["XP", "level", "achievement", "quest", "leaderboard patterns"]
      sme: [gamedev-sme]

    e-commerce:
      detect: ["payment", "stripe", "checkout", "cart"]
      sme: [fintech-sme]

    real-time:
      detect: ["WebSocket", "SSE", "Socket.io", "Redis pub/sub"]
      specialists: [monitoring-specialist]

    cms:
      detect: ["contentful", "sanity", "strapi", "markdown content"]
      business: [content-strategist]

  # ── Infrastructure Detection ──────────────────────────
  infra:
    docker:
      detect: ["Dockerfile", "docker-compose.yml"]
      specialists: [devops]

    ci-cd:
      detect: [".github/workflows/", ".gitlab-ci.yml", "Jenkinsfile"]
      specialists: [devops]

    monitoring:
      detect: ["sentry config", "datadog", "grafana", "prometheus"]
      specialists: [monitoring-specialist]

  # ── Project Shape Detection ───────────────────────────
  shape:
    monorepo:
      detect: ["pnpm-workspace.yaml", "turbo.json", "nx.json", "lerna.json"]
      governance: [tech-lead]  # cross-domain coordination needed

    has-tests:
      detect: ["vitest.config.*", "jest.config.*", "playwright.config.*"]
      testing: [e2e-tester]

    has-design-system:
      detect: ["tokens.ts", "theme.ts", "design-system/", "storybook config"]
      design: [design-system-lead, ui-designer]

    has-a11y:
      detect: ["axe-core", "a11y test files", "aria- attributes"]
      testing: [a11y-tester]

    has-perf:
      detect: ["lighthouse config", "web-vitals", "bundle-analyzer"]
      testing: [performance-auditor]

    has-visual-tests:
      detect: ["argos", "chromatic", "percy", "visual regression config"]
      testing: [visual-regression-tester]
```

### 12.3 Domain → Agent Assignment Matrix

After detection, agents are assigned to domains. This is the default matrix:

```
                    │ Backend  │ Frontend │ Mobile  │ Notif.  │ Packages │ Infra
────────────────────┼──────────┼──────────┼─────────┼─────────┼──────────┼──────
MANDATORY (Tier 1)  │          │          │         │         │          │
 {domain}-developer │    ✓     │    ✓     │    ✓    │    ✓    │    ✓     │
 {domain}-tester    │    ✓     │    ✓     │    ✓    │    ✓    │    ✓     │
────────────────────┼──────────┼──────────┼─────────┼─────────┼──────────┼──────
AUTO-DETECT (Tier 2)│          │          │         │         │          │
 backend-dev        │    ✓     │          │         │    ✓    │          │
 frontend-dev       │          │    ✓     │         │         │          │
 mobile-dev         │          │          │    ✓    │         │          │
 api-designer       │    ✓     │          │         │         │          │
 db-migration       │    ✓     │          │         │         │          │
 security-auditor   │    ✓     │          │         │         │          │
 e2e-tester         │          │    ✓     │    ✓    │         │          │
 visual-qa          │          │    ✓     │    ✓    │         │          │
 interaction-tester │          │    ✓     │    ✓    │         │          │
 a11y-tester        │          │    ✓     │    ✓    │         │          │
 performance-auditor│    ✓     │    ✓     │         │         │          │
 cross-browser      │          │    ✓     │         │         │          │
 ux-designer        │          │    ✓     │    ✓    │         │          │
 ui-designer        │          │    ✓     │    ✓    │         │          │
 devops             │          │          │         │         │          │   ✓
 monitoring         │    ✓     │          │         │    ✓    │          │   ✓
────────────────────┼──────────┼──────────┼─────────┼─────────┼──────────┼──────
GOVERNANCE (global) │          spans all domains                         │
 orchestrator       │    ✓  ✓  ✓  ✓  ✓  ✓                              │
 architect          │    ✓  ✓  ✓  ✓  ✓  ✓     (for L/XL)              │
 qa-lead            │    ✓  ✓  ✓  ✓  ✓  ✓     (for M/L/XL)           │
 product-analyst    │    ✓  ✓  ✓  ✓  ✓  ✓     (for features)          │
 code-reviewer      │    ✓  ✓  ✓  ✓  ✓  ✓     (for M/L/XL)           │
 tech-lead          │    ✓  ✓  ✓  ✓  ✓  ✓     (for L/XL, monorepo)   │
```

### 12.4 Assignment Principles

**Principle 1: Domain type determines developer + tester specialization**
```
Backend domain  → backend-dev + unit-tester (vitest/jest)
Frontend domain → frontend-dev + component-tester (RTL) + visual-qa
Mobile domain   → mobile-dev + device-tester
Packages        → fullstack-dev + unit-tester (library focus)
```

**Principle 2: Detected features trigger specialists**
```
Prisma detected      → db-migration specialist auto-assigned
AI SDK detected      → ai-prompt-eng specialist auto-assigned
i18n config detected → i18n-specialist auto-assigned
Auth middleware found → security-auditor auto-assigned
Docker found         → devops auto-assigned
```

**Principle 3: Complexity determines governance depth**
```
S task:  orchestrator → domain-developer (direct, no governance)
M task:  + product-analyst + qa-lead + code-reviewer
L task:  + architect + tech-lead + acceptance-tester
XL task: + architecture-review + product-manager + full design team
```

**Principle 4: Session type determines temporary participants**
```
BRAINSTORM:  + ux-designer, ui-designer, product-manager, relevant SMEs
REVIEW:      + visual-qa, interaction-tester, a11y-tester (for UI changes)
RELEASE:     + release-manager, marketing-specialist, pr-specialist, tech-writer
RETRO:       + process-coach, data-analyst, cost-optimizer
POST_MORTEM: + security-sme (if security incident)
GAP_ANALYSIS:+ performance-auditor, a11y-tester, dependency-manager
```

**Principle 5: Governance can pull agents dynamically**
```
During EXECUTE, orchestrator detects:
  "api-developer touched auth middleware but no security-auditor assigned"
  → auto-pull security-auditor for REVIEW phase
  → log in session history for RETRO analysis

During BRAINSTORM, architect realizes:
  "Need PostgreSQL expertise for query optimization design"
  → pull postgres-sme as consultant
  → SME advises, architect incorporates into spec
```

**Principle 6: SMEs are always on-demand, never pre-assigned**
```
SMEs are NOT assigned to domains.
SMEs are consultants — invoked by orchestrator when any agent signals
"I need domain expertise on X."

Trigger patterns:
  - Agent explicitly asks: "What's the best approach for X?"
  - Orchestrator detects domain-specific question outside agent's expertise
  - Governance flags knowledge gap during BRAINSTORM/PLAN

SME returns advice → orchestrator injects into requesting agent's context.
```

### 12.5 Init Output Example (Plan2Skill)

```
/sdlc init

Scanning project...

DETECTED:
  Type: monorepo (pnpm workspaces + turborepo)
  Tech: NestJS, Prisma, tRPC, Next.js 14, React 19, Expo, Zustand
  Features: i18n, AI generators (Anthropic SDK), auth (JWT),
            gamification (XP/quests/streaks), dual-theme design system,
            notification service (Redis + BullMQ),
            TTS/STT sidecars, Playwright E2E

DOMAINS DETECTED (6):
  api          apps/api/              NestJS + Prisma + tRPC
  web          apps/web/              Next.js + React + Zustand
  mobile       apps/mobile/           Expo + React Native
  notification apps/notification-service/  NestJS microservice + Redis
  pixelforge   packages/pixelforge/   TypeScript library
  store        packages/store/        Zustand stores

PROPOSED TEAM:

  MANDATORY (cannot remove):
  ✅ orchestrator              global    routing + pipeline
  ✅ product-analyst           global    requirements + acceptance
  ✅ architect                 global    decomposition (L/XL)
  ✅ qa-lead                   global    test strategy (M/L/XL)
  ✅ api-developer             api       NestJS + Prisma
  ✅ api-tester                api       vitest + prismock
  ✅ web-developer             web       Next.js + React
  ✅ web-tester                web       vitest + RTL
  ✅ mobile-developer          mobile    Expo
  ✅ mobile-tester             mobile    jest + RNTL
  ✅ notification-developer    notif     NestJS microservice
  ✅ notification-tester       notif     vitest
  ✅ pixelforge-developer      pixelforge TypeScript library
  ✅ pixelforge-tester         pixelforge vitest

  AUTO-DETECTED (recommended, can remove):
  ☑ backend-dev               api       NestJS specialization
  ☑ frontend-dev              web       Next.js + React specialization
  ☑ mobile-dev                mobile    Expo specialization
  ☑ api-designer              api       tRPC contract design
  ☑ db-migration              api       Prisma migrations detected
  ☑ security-auditor          api       JWT auth detected
  ☑ e2e-tester                web       Playwright config detected
  ☑ visual-qa                 web       dual-theme system detected
  ☑ interaction-tester        web       React components detected
  ☑ a11y-tester               web       a11y test config detected
  ☑ performance-auditor       web+api   Lighthouse config detected
  ☑ ai-prompt-eng             api       AI generators detected (19+)
  ☑ i18n-specialist           api+web   i18n system detected (100+ locales)
  ☑ devops                    infra     Docker + GitHub Actions detected
  ☑ monitoring-specialist     api+notif Notification + Redis detected
  ☑ ux-designer               web+mobile UI-heavy project
  ☑ ui-designer               web+mobile dual-theme design system detected
  ☑ design-system-lead        web+mobile tokens.ts + theme system detected
  ☑ tech-lead                 global    monorepo complexity
  ☑ code-reviewer             global    recommended for M/L/XL

  GOVERNANCE (available for sessions):
  ☐ acceptance-tester         for features (M/L/XL)
  ☐ release-manager           for RELEASE sessions
  ☐ tech-writer               for DOCS_SYNC sessions
  ☐ process-coach             for RETRO sessions
  ☐ product-manager           for XL features + TRIAGE
  ☐ frontend-architect        for frontend L/XL (component architecture, rendering strategy, state design)
  ☐ backend-architect         for backend L/XL (API design, data flow, scaling, caching)
  ☐ data-architect            for data L/XL (schema design, migration strategy, query optimization, indexing)

  SPECIALISTS (on-demand):
  ☐ dependency-manager        monthly audits
  ☐ refactoring-specialist    for refactor tasks
  ☐ data-modeler              schema design tasks
  ☐ cross-browser-tester      pre-release checks
  ☐ visual-regression-tester  Argos CI detected
  ☐ cost-optimizer            when monthly spend > $150
  ☐ ux-auditor                UX review tasks

  CONSULTANTS (on-demand, invoked by any agent):
  ☐ edtech-sme                EdTech domain (gamified learning platform)
  ☐ gamedev-sme               RPG mechanics (XP, quests, equipment)
  ☐ postgres-sme              PostgreSQL optimization
  ☐ react-sme                 React 19 + Next.js patterns
  ☐ llm-sme                   AI generator pipeline
  ☐ security-sme              JWT + auth patterns

  BUSINESS (on-demand):
  ☐ marketing-specialist      RELEASE announcements
  ☐ pr-specialist             blog posts, press
  ☐ content-strategist        content calendar
  ☐ growth-analyst            retention analysis

  BRIDGES (auto-detected):
  ☑ superpowers-bridge        superpowers plugin installed
  ☑ code-review-bridge        code-review plugin installed
  ☑ playwright-bridge         playwright plugin installed
  ☑ frontend-design-bridge    frontend-design plugin installed
  ☐ pixel-agents-bridge       VS Code + pixel-agents (not detected)

  TOTALS:
    Mandatory:     14 agents (6 global + 8 per-domain)
    Auto-detected: 20 agents (recommended)
    Available:     23 agents (on-demand)
    ─────────────────────────
    Total:         57 agents in registry

  Modify selections? (Enter to accept, or type agent names to toggle):
  > _
```

### 12.6 Runtime Assignment Rules

After init, the orchestrator uses these rules for **every task dispatch**:

```yaml
runtime-assignment:

  # Step 1: Which domains are affected?
  affected-domains:
    method: "file-pattern analysis + keyword detection"
    example:
      task: "Fix login redirect loop"
      detected-files: ["apps/api/src/auth/**", "apps/web/app/(auth)/**"]
      domains: [api, web]

  # Step 2: Mandatory agents for affected domains
  mandatory:
    - "{domain}-developer" for each affected domain
    - "{domain}-tester" for each affected domain (skip for S tasks)
    - orchestrator (always)
    - product-analyst (for features M/L/XL)
    - architect (for L/XL)
    - qa-lead (for M/L/XL)

  # Step 3: Auto-detected agents for affected domains
  auto-detected:
    - lookup: registry[domain].auto-detected agents
    - filter: only agents relevant to task-type
    - example: "UI bugfix in web → visual-qa yes, db-migration no"

  # Step 4: Session-specific temporary agents
  session-specific:
    BRAINSTORM: [ux-designer, ui-designer, product-manager, relevant SMEs]
    REVIEW: [code-reviewer, visual-qa (if UI), security-auditor (if auth)]
    RELEASE: [release-manager, marketing-specialist, tech-writer]
    RETRO: [process-coach, cost-optimizer (if over budget)]

  # Step 5: Dynamic pull (during execution)
  dynamic-pull:
    trigger: "agent signals knowledge gap or unexpected domain intersection"
    action: "orchestrator pulls relevant agent or SME"
    example:
      agent: api-developer
      signal: "Touching Redis pub/sub, need to understand notification service"
      pull: monitoring-specialist OR notification-developer (as consultant)
    log: "pulled {agent} into {session} for {reason}" → session history
```

## 13. Agent Catalog

### 12.1 Full Role Roster (57 roles)

```
GOVERNANCE (13)          PRODUCT (3)            DESIGN (5)
├ orchestrator*          ├ product-analyst*     ├ ux-designer
├ architect*             ├ product-manager      ├ ui-designer
├ qa-lead*               └ data-analyst         ├ design-system-lead
├ product-analyst*                              ├ ux-researcher
├ tech-lead              BUSINESS (4)           └ ux-writer
├ code-reviewer          ├ marketing-specialist
├ acceptance-tester      ├ pr-specialist        BRIDGES (5)
├ release-manager        ├ content-strategist   ├ superpowers-bridge
├ tech-writer            └ growth-analyst       ├ code-review-bridge
├ process-coach                                 ├ playwright-bridge
├ frontend-architect                            ├ frontend-design-bridge
├ backend-architect                             └ pixel-agents-bridge
└ data-architect
                                                * = mandatory
DEVELOPMENT (7)          TESTING (10)
├ {domain}-developer*    ├ {domain}-tester*
├ backend-dev            ├ e2e-tester           CONSULTANTS (7)
├ frontend-dev           ├ security-auditor     ├ {topic}-sme (template)
├ fullstack-dev          ├ a11y-tester          ├ edtech-sme
├ mobile-dev             ├ performance-auditor  ├ postgres-sme
└ api-designer           ├ visual-qa            ├ react-sme
                         ├ interaction-tester   ├ llm-sme
SPECIALISTS (10)         ├ cross-browser-tester ├ security-sme
├ db-migration           ├ visual-regression    └ gamedev-sme
├ ai-prompt-eng          └ a11y-tester
├ i18n-specialist
├ devops                 * = mandatory
├ dependency-manager
├ refactoring-specialist
├ data-modeler
├ monitoring-specialist
├ cost-optimizer
└ ux-auditor
```

### 12.2 Prompt Source Audit

All MIT-licensed repos verified. Attribution required — consolidated in `THIRD_PARTY_NOTICES.md`.

**Sources:**
- **R1:** VoltAgent/awesome-claude-code-subagents (MIT, 100+ agents)
- **R2:** affaan-m/everything-claude-code (MIT, 27 agents + 100+ skills)
- **R3:** davepoon/buildwithclaude (MIT, 40+ agents + 40+ skills)
- **R4:** alirezarezvani/claude-skills (MIT, 350+ skills + agents)
- **R5:** iannuttall/claude-agents (MIT, 7 agents)
- **BLOCKED:** hesreallyhim/awesome-claude-code — CC BY-NC-ND 4.0, cannot use

#### Coverage Map

| Role | Source | Status |
|------|--------|--------|
| **GOVERNANCE** | | |
| orchestrator | R1 `workflow-orchestrator.md` | Ready — adapt |
| product-analyst | R4 `cs-product-analyst` | Ready — exact |
| architect | R2 `architect.md`, R4 `senior-architect` | Ready — exact |
| qa-lead | R1 `qa-expert.md`, R4 `senior-qa` | Light custom — scope to lead |
| tech-lead | R4 `cs-engineering-lead` | Light custom — scope |
| code-reviewer | R1, R2, R3, R4 — 4 repos have it | Ready — best of breed |
| acceptance-tester | R2 `e2e-runner.md` | Custom — needs acceptance criteria focus |
| release-manager | R4 `release-manager` | Ready — exact |
| tech-writer | R1 `technical-writer.md` | Ready — exact |
| process-coach | R1 `scrum-master.md`, R4 `scrum-master` | Light custom — broader scope |
| frontend-architect | R4 `senior-frontend`, R1 `frontend-developer.md` | Light custom — architecture focus |
| backend-architect | R4 `senior-backend`, R3 `backend-architect.md` | Ready — exact (R3) |
| data-architect | R4 `database-schema-designer`, `senior-data-engineer` | Light custom — architecture scope |
| **PRODUCT** | | |
| product-manager | R1 `product-manager.md`, R4 `product-manager-toolkit` | Ready — multiple exact |
| data-analyst | R1 `data-analyst.md`, R3 `data-analyst.md` | Ready — exact |
| **DESIGN** | | |
| ux-designer | R4 `ux-researcher-designer`, R3 `ui-ux-designer.md` | Ready — exact |
| ui-designer | R1 `ui-designer.md`, R4 `ui-design-system` | Ready — exact |
| design-system-lead | R4 `ui-design-system` | Custom — governance focus |
| ux-researcher | R1 `ux-researcher.md`, R4 `cs-ux-researcher` | Ready — exact |
| ux-writer | R4 `copy-editing`, `copywriting` | Custom — UX microcopy focus |
| **DEVELOPMENT** | | |
| backend-dev | R1 `backend-developer.md`, R4 `senior-backend` | Ready — exact |
| frontend-dev | R1 `frontend-developer.md`, R4 `senior-frontend` | Ready — exact |
| fullstack-dev | R1 `fullstack-developer.md`, R4 `senior-fullstack` | Ready — exact |
| mobile-dev | R1 `mobile-developer.md`, R3 `mobile-developer.md` | Ready — exact |
| api-designer | R1 `api-designer.md`, R2 `skills/api-design` | Ready — exact |
| **TESTING** | | |
| e2e-tester | R2 `e2e-runner.md`, `skills/e2e-testing` | Ready — exact |
| security-auditor | R1, R2, R3, R5 — 5 repos have it | Ready — best of breed |
| a11y-tester | R1 `accessibility-tester.md`, R4 `a11y-audit` | Ready — exact |
| performance-auditor | R1 `performance-engineer.md`, R4 `performance-profiler` | Ready — exact |
| visual-qa | — | Custom — fully new |
| interaction-tester | — | Custom — fully new |
| cross-browser-tester | R4 `browserstack` (partial) | Custom — needs agent prompt |
| visual-regression | R3 `setup-visual-testing` (partial) | Custom — needs agent prompt |
| **SPECIALISTS** | | |
| db-migration | R2 `database-migrations`, R4 `migration-architect` | Ready — exact |
| ai-prompt-eng | R1 `prompt-engineer.md`, R4 `prompt-engineer-toolkit` | Ready — exact |
| i18n-specialist | — | Custom — fully new |
| devops | R1 `devops-engineer.md`, R4 `senior-devops` | Ready — exact |
| dependency-manager | R1 `dependency-manager.md`, R4 `dependency-auditor` | Ready — exact |
| refactoring-specialist | R1, R2, R5 — 3 repos | Ready — exact |
| data-modeler | R4 `database-schema-designer` | Light custom — scope |
| monitoring-specialist | R4 `observability-designer` | Light custom — scope |
| cost-optimizer | — | Custom — fully new |
| ux-auditor | R4 `ux-researcher-designer` (partial) | Custom — audit focus |
| **CONSULTANTS** | | |
| SME template | R4 `agents/template.md` | Ready — exact |
| **BUSINESS** | | |
| marketing-specialist | R4 `marketing-strategy-pmm`, `marketing-ops` | Light custom — consolidate |
| pr-specialist | R4 `internal-narrative` (weak) | Custom — PR/comms focus |
| content-strategist | R4 `content-strategist.md` | Ready — exact |
| growth-analyst | R4 `cs-growth-strategist` | Light custom — analytics |

#### Summary

| Status | Count | % |
|--------|-------|---|
| **Ready (exact match from MIT repos)** | 28 | 47% |
| **Light custom (adapt existing)** | 10 | 17% |
| **Fully custom (write from scratch)** | 9 | 15% |
| **Per-domain templates** | 2 | 3% |
| **Bridges (integration wrappers)** | 5 | 8% |
| **SME instances (from template)** | 6 | 10% |
| **Total** | **60** | 100% |

Effort: ~28 ready to use + 10 adapt + 9 write = **~22 hours for full catalog**.

### 12.3 Pixel Agents Integration

**Repo:** [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents)
**License:** MIT (2026 Pablo De Lucca) — compatible
**Type:** VS Code extension — visualizes Claude Code agents as pixel art characters in isometric office

**What it does:**
- Each agent/terminal gets an animated pixel character
- Activity tracking: typing (writing code), reading (searching), waiting (idle)
- Sub-agent visualization: spawned agents appear as linked characters
- Office layout editor: furniture, walls, floors, customizable
- Speech bubbles with agent status
- Sound notifications

**Art asset caveat:** Character sprites based on JIK-A-4 Metro City pack (itch.io) — verify upstream license separately. Office assets are open-source.

**Integration as optional feature:**

```yaml
# Bridge agent in catalog
- name: pixel-agents-bridge
  category: bridge
  required: false
  auto-install-when: { ide: vscode, plugin-installed: pixel-agents }
  description: >
    Visual SDLC dashboard — shows entire agent team as pixel art
    characters in isometric office. Real-time activity visualization.
  integration:
    layout-mapping:
      orchestrator: "Boss desk (center)"
      governance: "Meeting room (top-left)"
      api-team: "Dev pod A (left)"
      web-team: "Dev pod B (right)"
      testing: "QA lab (bottom-left)"
      specialists: "Appear on-demand, fade after completion"
      sme: "Library corner (top-right)"
      business: "Marketing suite (bottom-right)"
    activity-mapping:
      BRAINSTORM: "characters gather in meeting room"
      EXECUTE: "developers at their desks, typing animation"
      REVIEW: "reviewer walks between dev pods"
      MERGE: "orchestrator stamps document animation"
      RETRO: "all characters in meeting room"
    sub-agent-spawn: "new character fades in at assigned desk"
    session-complete: "character does celebration animation"
    hitl-needed: "character raises hand, speech bubble with question"
```

**Init integration:**
```
/sdlc init

...

Step 5: OPTIONAL FEATURES

  ☐ Pixel Agents dashboard (VS Code)
    Visual office with animated agent characters.
    Install: code --install-extension pixel-agents

    Configure office layout for your team? [y/n]
```

**Plugin structure addition:**
```
claude-sdlc/
├── integrations/
│   └── pixel-agents/
│       ├── layout-presets/
│       │   ├── small-team.json      # 3-5 agents
│       │   ├── medium-team.json     # 6-15 agents
│       │   └── full-team.json       # 16+ agents
│       ├── activity-hooks.ts        # map session types to animations
│       └── README.md                # setup guide
```

### 12.4 Third-Party Attribution

```markdown
# THIRD_PARTY_NOTICES.md

This plugin includes adapted agent prompts from the following MIT-licensed projects.
Original copyright notices are preserved as required by the MIT License.

## VoltAgent/awesome-claude-code-subagents
Copyright (c) 2025 VoltAgent
License: MIT
Files adapted: backend-developer.md, frontend-developer.md, fullstack-developer.md,
  mobile-developer.md, api-designer.md, ui-designer.md, code-reviewer.md,
  security-auditor.md, qa-expert.md, performance-engineer.md, accessibility-tester.md,
  technical-writer.md, product-manager.md, ux-researcher.md, data-analyst.md,
  devops-engineer.md, dependency-manager.md, refactoring-specialist.md,
  prompt-engineer.md, workflow-orchestrator.md, scrum-master.md,
  database-administrator.md, content-marketer.md

## affaan-m/everything-claude-code
Copyright (c) 2026 Affaan Mustafa
License: MIT
Files adapted: architect.md, code-reviewer.md, e2e-runner.md,
  refactor-cleaner.md, security-reviewer.md, doc-updater.md,
  skills/api-design, skills/e2e-testing, skills/database-migrations

## davepoon/buildwithclaude
Copyright (c) 2025 davepoon
License: MIT
Files adapted: ui-ux-designer.md, data-analyst.md, security-auditor.md,
  performance-engineer.md, accessibility-specialist.md, mobile-developer.md,
  cloud-architect.md, backend-architect.md, frontend-developer.md,
  code-reviewer.md, prompt-engineer.md

## alirezarezvani/claude-skills
Copyright (c) 2025 Alireza Rezvani
License: MIT
Files adapted: cs-product-analyst, senior-architect, senior-qa, cs-engineering-lead,
  release-manager, senior-backend, senior-frontend, senior-fullstack, code-reviewer,
  ux-researcher-designer, ui-design-system, cs-ux-researcher, migration-architect,
  prompt-engineer-toolkit, senior-devops, dependency-auditor, content-strategy,
  marketing-strategy-pmm, cs-growth-strategist, observability-designer,
  database-schema-designer, product-manager-toolkit, a11y-audit,
  performance-profiler, agents/template.md

## iannuttall/claude-agents
Copyright (c) 2025 ian nuttall
License: MIT
Files adapted: security-auditor.md, code-refactorer.md, frontend-designer.md

## pablodelucca/pixel-agents (optional integration)
Copyright (c) 2026 Pablo De Lucca
License: MIT
Integration: visual dashboard layout presets and activity hooks
Note: character sprites based on JIK-A-4 Metro City pack — verify upstream license
```

## 13. Data Layer Isolation Strategy

### 13.1 Problem (Generic)

When multiple domain agents share a single database, agent context isolation breaks at the data layer. A domain-developer for "payments" can accidentally query or modify "users" tables, bypassing the facade pattern. This applies to ANY tech stack:

- **SQL databases** (PostgreSQL, MySQL, SQLite) with any ORM (Prisma, TypeORM, Sequelize, Django ORM, ActiveRecord, Hibernate)
- **NoSQL** (MongoDB, DynamoDB, Firestore) with any ODM (Mongoose, Typegoose, Prisma)
- **Multi-database** setups (Redis, Elasticsearch alongside primary DB)

The governance team needs a **framework-agnostic** strategy for data ownership.

### 13.2 Core Principles

**Principle 1: Every data entity has exactly ONE owning domain**
```
Entity "Order"        → owned by "commerce" domain
Entity "User"         → owned by "identity" domain
Entity "ChatMessage"  → owned by "messaging" domain

No entity is "shared" for writes. One domain writes, others read via facade.
```

**Principle 2: Cross-domain data access goes through facades, never direct queries**
```
WRONG:  payments-developer queries users table directly
RIGHT:  payments-developer calls IdentityFacade.getUserById(id)

The facade returns a DTO (data transfer object), not the raw entity.
Cross-domain code never sees internal schema details.
```

**Principle 3: Schema files are partitioned by domain (where ORM supports it)**
```
One schema definition file per domain → agent context isolation by file path.
Domain agent's rules reference only their own schema file.
```

**Principle 4: Migrations for own models only; cross-domain = escalate**
```
domain-developer can create migrations for models they own.
If a migration touches models from 2+ domains → escalate to architect.
```

### 13.3 Three-Phase Isolation (any stack)

**Phase 1 — Soft Ownership (day 1, zero structural changes)**

Annotate existing schema with domain ownership. Enforce via agent rules only.

| ORM/Stack | Annotation method |
|-----------|-------------------|
| Prisma | `// @domain:commerce @owner:commerce-developer` comment above model |
| TypeORM | `@Entity({ schema: 'commerce' })` decorator or JSDoc comment |
| Django | `class Meta: app_label = 'commerce'` (built-in) |
| Rails | `self.table_name_prefix = 'commerce_'` or schema comment |
| Sequelize | `tableName: 'commerce.orders'` or JSDoc comment |
| Mongoose | Collection naming convention: `commerce_orders` or comment |
| Raw SQL | `-- @domain:commerce` comment in migration files |

Agent isolation via CLAUDE.md:
```
# Domain CLAUDE.md for commerce-developer:
Your data entities: Order, OrderItem, Payment, Refund, Cart
Read-only via facade: User (IdentityFacade), Product (CatalogFacade)
DO NOT query or modify entities outside your domain.
```

**Phase 2 — Schema Partitioning (week 2)**

Split schema definitions into one file per domain. Implementation varies by stack:

| ORM/Stack | Partitioning approach |
|-----------|----------------------|
| **Prisma** | Multi-file schema (v5.15+): `prisma/domains/{domain}.prisma` |
| **TypeORM** | Entity directories: `src/domains/{domain}/entities/*.entity.ts` |
| **Django** | Already built-in: each app = domain with own `models.py` |
| **Rails** | Engines or module namespacing: `app/models/{domain}/` |
| **Sequelize** | Model directories: `src/domains/{domain}/models/` |
| **Mongoose** | Schema directories: `src/domains/{domain}/schemas/` |
| **Drizzle** | Schema files: `src/domains/{domain}/schema.ts` |

Generic directory pattern:
```
{project}/
├── {data-layer-config}           ← connection, generator config
└── domains/
    ├── {domain-a}/
    │   ├── models/entities/      ← this domain's data definitions
    │   ├── migrations/           ← this domain's migrations (if supported)
    │   └── seeds/                ← this domain's seed data
    ├── {domain-b}/
    │   └── ...
    └── shared/
        ├── identity/             ← User, Auth (read by all, write restricted)
        └── infrastructure/       ← Config, i18n, audit logs
```

Agent path-scoped rule:
```yaml
# .claude/rules/db-{domain}.md
---
paths:
  - "{data-layer}/domains/{domain}/**"
---
You own data entities in this directory.
Cross-domain access: use facades only.
DO NOT modify files in other domain directories.
```

**Phase 3 — Database-Level Enforcement (optional, when team grows)**

| Database | Enforcement mechanism |
|----------|----------------------|
| **PostgreSQL** | One schema per domain (`CREATE SCHEMA commerce`), GRANT per role |
| **MySQL** | Separate databases per domain, cross-db joins explicit |
| **MongoDB** | Separate collections with naming convention, Atlas roles per namespace |
| **DynamoDB** | Table naming: `{domain}-{entity}`, IAM policies per prefix |
| **SQLite** | ATTACH per domain DB file |

Cross-schema/cross-db references remain via foreign keys or application-level joins through facades.

### 13.4 Entity Ownership Classification

During `/sdlc init`, the engine classifies every data entity:

```yaml
entity-classification:

  owned:
    description: "One domain owns all CRUD operations"
    rule: "Only owning domain's agents can Write/Update/Delete"
    example: "Order belongs to commerce domain"

  shared-read:
    description: "One domain writes, ALL domains can read"
    rule: "Anyone reads via facade. Only owner writes."
    example: "User belongs to identity domain, read by all"
    typical: [User, Tenant, Organization, Config, Locale]

  reference-data:
    description: "Read-only, seeded/imported, nobody modifies at runtime"
    rule: "Infrastructure task seeds. All domains read."
    example: "Country, Currency, Timezone, Translation"

  cross-domain-aggregate:
    description: "Read model combining data from 2+ domains"
    rule: "Materialized via CQRS read service or event-driven projection"
    example: "UserDashboard (user + orders + notifications)"
    owner: "Dedicated read service, NOT any single domain"
```

Governance agent assigns classification during ARCHITECTURE_REVIEW:
```
architect analyzes entity usage:
  Entity "Product":
    Written by: catalog-developer (CRUD)
    Read by: commerce-developer (pricing), search-developer (indexing)
    → Classification: owned by "catalog", shared-read

  Entity "User":
    Written by: identity-developer (registration, profile update)
    Read by: ALL domains (FK reference)
    → Classification: shared-read, owner = identity

  Entity "AnalyticsDashboard":
    Combines: User (identity) + Order (commerce) + PageView (analytics)
    → Classification: cross-domain-aggregate → dedicated read service
```

### 13.5 Agent Data Access Rules (Generic)

```yaml
agent-data-rules:

  domain-developer:
    own-entities:
      scope: "entities defined in {data-layer}/domains/{own-domain}/"
      operations: [create, read, update, delete]
    shared-read-entities:
      scope: "entities classified as shared-read"
      operations: [read]
      method: "ONLY via owning domain's facade"
    reference-data:
      scope: "entities classified as reference-data"
      operations: [read]
      method: "direct read allowed (immutable data)"
    forbidden:
      - "query entities from other domains directly"
      - "modify schema files outside own domain"
      - "write raw queries touching cross-domain tables"
      - "create foreign keys to non-shared entities without architect approval"

  db-migration-specialist:
    scope: "dispatched by architect for specific migration task"
    can: "modify schema files as specified in task"
    requires: "architect review before applying migration"
    escalate: "if migration affects 2+ domains → HITL"

  governance-architect:
    scope: "any schema file"
    when: "ARCHITECTURE_REVIEW, cross-domain schema change, new domain creation"
    requires: "HITL approval for changes affecting 2+ domains"
```

### 13.6 Cross-Domain Data Access Patterns

**Pattern 1: Facade (synchronous, same process)**
```
Payments domain needs user email for receipt:
  → PaymentsService calls IdentityFacade.getUserEmail(userId)
  → IdentityFacade queries own User entity, returns DTO
  → PaymentsService never sees User entity internals
```

**Pattern 2: Event-Driven (async, decoupled)**
```
Commerce domain completes an order:
  → Emits event: ORDER_COMPLETED { orderId, userId, total }
  → Analytics domain listens, updates own AnalyticsEvent entity
  → Notification domain listens, sends email via own channel
  → Neither domain queries commerce tables directly
```

**Pattern 3: Read Model / CQRS (cross-domain aggregation)**
```
Dashboard needs data from 3 domains:
  → Dedicated DashboardReadService aggregates via facades
  → NOT owned by any single domain
  → Updated via events or scheduled refresh
  → Domain agents cannot modify the read model directly
```

**Pattern 4: Data Replication (for performance)**
```
Search domain needs product data:
  → CatalogFacade publishes product changes via event
  → Search domain maintains denormalized copy in own index (Elasticsearch)
  → Search domain NEVER queries catalog DB directly
```

### 13.7 Migration Governance

```yaml
migration-rules:

  who-can-create:
    own-domain: "domain-developer creates migration for own entities"
    cross-domain: "ONLY architect or db-migration-specialist"
    shared-entity: "ONLY architect with HITL approval"

  review-requirements:
    single-domain:
      reviewer: "domain-tester (automated) + code-reviewer"
      checks: [syntax, rollback-plan, no-data-loss]
    cross-domain:
      reviewer: "architect + tech-lead + affected domain developers"
      checks: [impact-analysis, rollback-plan, zero-downtime, HITL-approval]
    destructive:
      definition: "DROP TABLE, DROP COLUMN, ALTER TYPE, TRUNCATE"
      reviewer: "architect + HITL (always)"
      requires: "backup verification + rollback tested"

  ci-enforcement:
    pre-merge:
      - "migration only touches entities owned by PR author's domain"
      - "no cross-domain schema changes without architect label"
      - "destructive migrations flagged for manual review"
```

### 13.8 Init: Data Layer Discovery

During `/sdlc init`, the engine detects data layer configuration:

```yaml
data-layer-detection:

  orm-detection:
    prisma: "prisma/schema.prisma or prisma/*.prisma"
    typeorm: "ormconfig.* or data-source.ts with TypeORM imports"
    sequelize: "sequelize config or .sequelizerc"
    django: "models.py in app directories"
    mongoose: "mongoose.Schema usage"
    drizzle: "drizzle.config.*"
    raw-sql: "migrations/ directory without ORM"

  database-detection:
    postgresql: "DATABASE_URL contains postgres://"
    mysql: "DATABASE_URL contains mysql://"
    mongodb: "MONGODB_URI or mongoose connection"
    sqlite: "DATABASE_URL contains file: or .sqlite"
    redis: "REDIS_URL (secondary data store)"
    elasticsearch: "ELASTICSEARCH_URL (search index)"

  entity-discovery:
    method: "parse ORM schema files → extract entity/model names"
    output: "list of entities with current file location"
    classification: "architect reviews and assigns domain ownership"

  output:
    - detected ORM + database
    - entity list with proposed domain ownership
    - recommended isolation phase (1/2/3)
    - generated path-scoped rules per domain
    - HITL: user reviews entity-to-domain mapping
```

### 13.9 Comparison: Isolation Phases

| Aspect | Phase 1: Soft | Phase 2: Schema Split | Phase 3: DB-Level |
|--------|--------------|----------------------|-------------------|
| Agent isolation | Rules only | Rules + file paths | Rules + files + DB grants |
| Enforcement | Agent prompt | Agent prompt + path-scope | Agent + ORM + database |
| Break isolation? | Agent ignores rule | Agent edits wrong file | DB rejects query |
| Migration effort | 0 | 2-8 hours | 4-16 hours |
| Works for solo dev | Yes | Yes | Overkill |
| Works for team | Fragile | Good | Strong |
| Recommended for | Start here | When domains stabilize | When team > 3 |
| Stack-specific | No | ORM-dependent | DB-dependent |

## 14. Project Ecosystem Integration

When `/sdlc init` runs on an existing project, the plugin MUST NOT impose its own conventions blindly. It inherits what exists, identifies gaps, and proposes enhancements — with HITL approval at every step.

### 14.1 Integration Principle

```
INHERIT first → IDENTIFY gaps → PROPOSE enhancements → HITL approves → APPLY
     │                │                  │                    │            │
     ▼                ▼                  ▼                    ▼            ▼
  "What does      "What's           "How to fill       "User          "Commit
   the project     missing for        the gaps           reviews        changes"
   already do?"    full SDLC?"        gracefully?"       each change"
```

**Hard rule:** The plugin NEVER silently overrides existing conventions. If the project uses kebab-case file naming and the plugin defaults to camelCase — the plugin adapts to kebab-case. The project is the authority.

### 14.2 What Gets Analyzed

```yaml
ecosystem-scan:

  # ── Naming Conventions ────────────────────────────────
  naming:
    files:
      detect: "scan src/ for dominant pattern"
      patterns: [kebab-case, camelCase, PascalCase, snake_case]
      example: "80% of files use kebab-case → adopt kebab-case for all generated files"
    variables:
      detect: "parse AST for variable naming"
      patterns: [camelCase, snake_case, UPPER_CASE]
    branches:
      detect: "git branch --list → extract pattern"
      patterns: ["feature/xxx", "feat/xxx", "xxx-yyy", "JIRA-123-xxx"]
    commits:
      detect: "git log --oneline -50 → extract pattern"
      patterns: [conventional-commits, prefix-type, free-form, jira-prefixed]
      example: "90% of commits use 'feat:', 'fix:' → adopt conventional commits"

  # ── Code Organization ─────────────────────────────────
  structure:
    module-pattern:
      detect: "how are modules/components organized?"
      patterns:
        - feature-based: "src/features/{feature}/ with co-located files"
        - layer-based: "src/controllers/, src/services/, src/models/"
        - domain-based: "src/domains/{domain}/ with internal layers"
        - hybrid: "mix of above"
    test-location:
      detect: "where do tests live?"
      patterns:
        - co-located: "__tests__/ next to source"
        - separate: "tests/ or test/ at root"
        - mixed: "unit co-located, e2e separate"
    barrel-exports:
      detect: "does the project use index.ts barrel files?"
      adopt: "if yes, generate index.ts for new domains"

  # ── Documentation ─────────────────────────────────────
  documentation:
    existing-docs:
      detect: "scan docs/, README.md, CHANGELOG.md, CONTRIBUTING.md"
      patterns:
        - directory: "docs/ with subdirectories? flat? topic-based?"
        - format: "markdown? RST? AsciiDoc? MDX?"
        - naming: "date-prefixed? numbered? descriptive?"
        - templates: "do templates exist? (docs/templates/)"
    claude-config:
      detect: "existing CLAUDE.md, .claude/rules/, .claude/skills/"
      action: "inherit and enhance, never overwrite"
    api-docs:
      detect: "OpenAPI/Swagger? JSDoc? TypeDoc? Postman?"
      adopt: "use existing format for new endpoints"
    changelog:
      detect: "CHANGELOG.md format? auto-generated? manual?"
      patterns: [keep-a-changelog, conventional-changelog, custom]

  # ── Code Style & Linting ──────────────────────────────
  style:
    linter:
      detect: ".eslintrc*, .prettierrc*, biome.json, ruff.toml, rubocop.yml"
      adopt: "all generated code MUST pass existing linter"
    formatter:
      detect: "prettier, black, gofmt, rustfmt"
      adopt: "format all generated code with project formatter"
    type-system:
      detect: "tsconfig strict mode? mypy? flow? type hints?"
      adopt: "match strictness level in generated code"
    import-style:
      detect: "absolute vs relative? path aliases? barrel imports?"
      adopt: "follow existing import convention"

  # ── Testing ───────────────────────────────────────────
  testing:
    framework:
      detect: "vitest, jest, pytest, rspec, go test, cargo test"
      adopt: "use same framework for generated tests"
    patterns:
      detect: "AAA? BDD? property-based? snapshot?"
      adopt: "follow existing test patterns"
    coverage:
      detect: "coverage config? thresholds? CI gates?"
      adopt: "respect existing thresholds, propose increase if low"
    fixtures:
      detect: "factories, fixtures, mocks — how are test data created?"
      adopt: "use existing factories for generated tests"
    naming:
      detect: "describe/it? test()? should_xxx? test_xxx?"
      adopt: "match existing test naming convention"

  # ── CI/CD ─────────────────────────────────────────────
  ci-cd:
    pipeline:
      detect: "GitHub Actions, GitLab CI, Jenkins, CircleCI, Vercel"
      adopt: "generated workflows follow existing pipeline structure"
    environments:
      detect: "staging, preview, production — what exists?"
      adopt: "RELEASE session uses existing deploy flow"
    checks:
      detect: "what checks run on PR? lint, test, build, type-check?"
      adopt: "don't add checks that conflict with existing"

  # ── Git Workflow ──────────────────────────────────────
  git:
    branching:
      detect: "gitflow? trunk-based? GitHub flow? custom?"
      patterns:
        - branch-per-feature: "feature/xxx, bugfix/xxx"
        - trunk-based: "short-lived branches off main"
        - release-branches: "release/x.y.z"
      adopt: "worktree branches follow existing naming"
    merge-strategy:
      detect: "merge commits? squash? rebase?"
      adopt: "MERGE session uses same strategy"
    protected-branches:
      detect: "which branches have protection rules?"
      adopt: "never force-push to protected branches"
    hooks:
      detect: "pre-commit, commit-msg, pre-push hooks?"
      adopt: "all generated commits must pass existing hooks"

  # ── Project Management ────────────────────────────────
  project-management:
    issue-tracker:
      detect: "GitHub Issues, Jira, Linear, Notion, Trello"
      adopt: "TRIAGE session creates items in existing tracker if possible"
    issue-format:
      detect: "templates? labels? custom fields?"
      adopt: "generated issues follow existing format"
    versioning:
      detect: "semver? calver? custom?"
      adopt: "RELEASE session uses existing versioning scheme"
```

### 14.3 Inheritance vs Enhancement Decision

For each detected convention, the engine makes a judgment:

```
┌──────────────────────────────────────────────────────────┐
│ Convention detected?                                      │
├──────┬───────────────────────────────────────────────────┤
│ YES  │ Is it sufficient for SDLC governance?             │
│      ├──────┬────────────────────────────────────────────┤
│      │ YES  │ INHERIT: adopt as-is, no changes           │
│      │      │ Example: "eslint config is comprehensive   │
│      │      │ → use it, don't add competing rules"       │
│      ├──────┼────────────────────────────────────────────┤
│      │ NO   │ ENHANCE: keep existing + add missing parts │
│      │      │ Example: "has unit tests but no E2E        │
│      │      │ → keep unit framework, propose E2E setup"  │
│      │      │ ALWAYS show: what exists, what's missing,  │
│      │      │ proposed addition. HITL approves.           │
├──────┼──────┴────────────────────────────────────────────┤
│ NO   │ PROPOSE: suggest convention with rationale        │
│      │ Example: "no commit convention detected           │
│      │ → propose conventional commits. HITL approves."   │
│      │ If user rejects → plugin works without it.        │
└──────┴───────────────────────────────────────────────────┘
```

### 14.4 Init Output: Ecosystem Report

```
/sdlc init

Analyzing project ecosystem...

CONVENTIONS DETECTED:
  ✅ Naming: kebab-case files, camelCase variables        → INHERIT
  ✅ Commits: conventional commits (feat:, fix:, chore:)  → INHERIT
  ✅ Branches: feature/xxx, release/xxx                   → INHERIT
  ✅ Linter: ESLint + Prettier (strict TypeScript)        → INHERIT
  ✅ Tests: Vitest (unit), Playwright (E2E)               → INHERIT
  ✅ Test location: co-located __tests__/                  → INHERIT
  ✅ Docs: docs/ with date-prefix naming                  → INHERIT
  ✅ CI: GitHub Actions (lint → test → e2e → deploy)      → INHERIT
  ✅ Versioning: semver                                    → INHERIT

ENHANCEMENTS PROPOSED:
  ⚡ Coverage: unit 45% (no gate) → propose 60% gate      → HITL approve?
  ⚡ CLAUDE.md: exists (12K) but monolithic               → propose domain split
  ⚡ Rules: 16 files, none path-scoped                    → propose path: frontmatter
  ⚡ Docs: no templates for specs/plans                   → propose templates
  ⚡ Git hooks: pre-commit (lint) only                    → propose commit-msg hook

GAPS (no existing convention):
  ❌ No CHANGELOG.md                                      → propose keep-a-changelog?
  ❌ No API documentation (OpenAPI/Swagger)               → propose auto-generation?
  ❌ No architecture decision records                     → propose docs/adr/ directory?
  ❌ No visual regression testing                         → propose Argos/Chromatic?

  Review each proposal? [y/enter-to-accept-all/n-to-skip]
  > _
```

### 14.5 Convention Conflict Resolution

When plugin defaults conflict with project conventions:

```yaml
conflict-resolution:

  # Plugin wants conventional commits, project uses "JIRA-123: description"
  rule: "Project wins. Plugin adapts."
  action: |
    orchestrator.commitFormat = project.detected.commitFormat
    All agents use project's commit format in their prompts.

  # Plugin wants docs/superpowers/specs/, project uses docs/design/
  rule: "Project wins. Plugin adapts."
  action: |
    sdlc.specDirectory = project.detected.docsDirectory + "/design/"
    BRAINSTORM writes specs to project's existing location.

  # Plugin wants .sdlc/, project already has .planning/
  rule: "Offer choice: merge into existing or keep separate."
  action: |
    HITL: "Detected .planning/ directory. Options:
    (A) Use .planning/ for SDLC state (rename to .sdlc/ internally)
    (B) Keep .sdlc/ separate, archive .planning/
    (C) Use both: .planning/ for specs, .sdlc/ for plugin state"

  # Plugin generates kebab-case files, project uses PascalCase
  rule: "Plugin generates in project's convention."
  action: |
    All file generators use project.detected.naming.files pattern.
    Agent prompts include: "File naming: PascalCase (project convention)."
```

### 14.6 Existing CLAUDE.md / Rules Integration

Most critical case — project already has Claude Code configuration:

```yaml
claude-config-integration:

  existing-claude-md:
    action: "READ, understand, enhance — never overwrite"
    process:
      1. Parse existing CLAUDE.md sections
      2. Identify: what's covered, what's missing for SDLC
      3. Propose additions (new sections for domain isolation, facade rules)
      4. HITL: user reviews additions as diff
      5. If monolithic (>8K): propose domain split with references
    rule: "Existing content is authoritative. Plugin adds, doesn't replace."

  existing-rules:
    action: "Keep all existing rules. Add path: frontmatter where missing. Add new rules for SDLC."
    process:
      1. Inventory existing .claude/rules/*.md
      2. Check which have paths: frontmatter (conditional loading)
      3. Propose paths: for domain-specific rules
      4. Propose new rules for SDLC governance (facade enforcement, etc.)
      5. HITL: user approves each change
    rule: "Never modify existing rule content. Only add frontmatter or new files."

  existing-skills:
    action: "Inventory existing skills. SDLC delegates to them where possible."
    process:
      1. List .claude/skills/ and installed plugins
      2. Map to SDLC sessions (e.g., superpowers:brainstorming → BRAINSTORM)
      3. Avoid duplicating existing skill functionality
    rule: "If existing skill covers a need, SDLC delegates. No duplication."

  existing-agents:
    action: "Keep existing agents. SDLC agents supplement."
    process:
      1. List .claude/agents/*.md
      2. Check for overlap with SDLC catalog roles
      3. If overlap: offer to enhance existing agent or keep both
      4. Register existing agents in SDLC registry with appropriate role tags
    rule: "User's existing agents take precedence."

  existing-memory:
    action: "Read project memory. Import relevant decisions into governance state."
    process:
      1. Read ~/.claude/projects/.../memory/
      2. Identify architectural decisions, feedback, project context
      3. Import as initial governance memory
    rule: "Memory is read-only during init. Plugin adds new memories, never modifies existing."
```

### 14.7 Progressive Enhancement Strategy

Plugin doesn't demand everything at once. It enhances progressively:

```
Week 1: INHERIT
  └── Adopt all existing conventions
  └── Add path-scoped rules (zero behavior change)
  └── Add orchestrator agent + governance skill
  └── Minimal .sdlc/ state (config + registry)

Week 2: FILL GAPS
  └── Add missing coverage gates (if HITL approved)
  └── Add domain CLAUDE.md files (if monorepo)
  └── Add first specialist agents (detected by signals)
  └── First RETRO identifies further gaps

Week 3+: OPTIMIZE
  └── RETRO-driven enhancements
  └── Agent prompt refinement based on actual usage
  └── Convention improvements based on patterns
  └── Each improvement goes through ONBOARD → HITL
```

**Anti-pattern: Big Bang Init**
```
WRONG: /sdlc init generates 50 files, rewrites CLAUDE.md,
       adds 20 rules, changes git hooks — overwhelming.

RIGHT: /sdlc init generates minimal viable config.
       Progressive enhancement via RETRO/GAP_ANALYSIS sessions.
       Each change is small, reviewed, approved.
```

## 15. New Service / Cross-Service Layer Detection

### 14.1 When to Create a New Domain

Governance agents (architect + tech-lead) monitor these signals during ARCHITECTURE_REVIEW:

**Signal 1: Facade bloat**
```
EconomyFacade has 18 methods (threshold: 15)
  → Split signal: equipment subdomain vs shop subdomain?
  → architect proposes split in ARCHITECTURE_REVIEW
  → HITL approves
  → ONBOARD creates new domain + agents + schema file
```

**Signal 2: Orphan models**
```
3 new Prisma models don't fit any existing domain:
  Referral, AffiliateLink, ReferralReward
  → architect proposes: new "referral" domain
  → or absorb into existing "social" domain
  → HITL decides
```

**Signal 3: New tech stack**
```
Task requires Python ML pipeline for recommendation engine
  → cannot fit into NestJS domain
  → architect proposes: new service (separate process)
  → requires: API contract definition, deployment config
  → HITL approval required (XL complexity)
```

**Signal 4: Performance isolation**
```
AI generators causing request timeouts for regular API calls
  → architect proposes: extract ai-engine to async worker
  → still same DB, but separate process with BullMQ
  → incremental: keep facade, change implementation to queue-based
```

### 14.2 When to Create a Cross-Service Layer

**Signal 1: Shared utility duplication**
```
3+ facades implement similar logic:
  - LearningFacade.emitNotification(...)
  - EconomyFacade.emitNotification(...)
  - SocialFacade.emitNotification(...)
  → Extract: NotificationEmitter (infrastructure layer)
```

**Signal 2: Cross-domain transaction orchestration**
```
ProgressionOrchestrator.completeTask() calls 5 facades in one $transaction
  → This IS the cross-service layer (already exists as orchestrator)
  → If it grows too large: split into domain-specific orchestrators
    e.g., QuestCompletionOrchestrator, PurchaseOrchestrator
```

**Signal 3: Shared read model**
```
3 domains need "user profile with stats + equipment + streak" composite
  → Extract: UserProfileReadService (cross-domain read model)
  → Writes still go through individual facades
  → Read service aggregates from multiple schemas
```

### 14.3 Governance Flow for New Domain/Layer

```
Detection:
  architect spots signal during ARCHITECTURE_REVIEW
  OR domain-developer reports "my facade is too big"
  OR orchestrator detects cross-domain coupling in REVIEW
    │
    ▼
ARCHITECTURE_REVIEW session:
  1. architect analyzes coupling + proposes options:
     (A) Split existing domain into 2
     (B) Create new domain from scratch
     (C) Extract cross-service layer
     (D) Do nothing (complexity doesn't justify yet)

  2. tech-lead validates:
     - Impact on existing facades
     - Migration path (zero-downtime)
     - Test coverage implications

  3. HITL: user reviews proposal
    │
    ▼
If approved → ONBOARD session:
  1. governance-architect creates:
     ├── prisma/domains/{new-domain}.prisma  (if new domain)
     ├── apps/api/src/domains/{new-domain}/
     │   ├── {new-domain}.module.ts
     │   ├── {new-domain}.facade.ts
     │   └── {new-domain}.router.ts
     ├── apps/api/src/infrastructure/{new-layer}/ (if cross-layer)
     ├── CLAUDE.md updates (root + domain)
     └── .claude/rules/{new-domain}.md

  2. orchestrator creates:
     ├── .claude/agents/{new-domain}-developer.md
     ├── .claude/agents/{new-domain}-tester.md
     └── updates .sdlc/registry.yaml

  3. tech-writer updates:
     ├── root CLAUDE.md (new domain in project structure)
     └── docs (architecture decision record)

  4. HITL: user reviews all generated files
    │
    ▼
Migration tasks dispatched via TRIAGE:
  - Move models from old domain .prisma to new domain .prisma
  - Move services from old domain directory to new
  - Update facade exports
  - Update imports across codebase
  - Re-run all tests
```

### 14.4 Thresholds (Configurable)

```yaml
# .sdlc/config.yaml
thresholds:
  facadeSplitWarning: 12        # warn when facade > 12 methods
  facadeSplitRequired: 18       # require split when > 18 methods
  orphanModelWarning: 2         # flag when 2+ models don't fit any domain
  crossDomainImportWarning: 3   # flag when 3+ domains import same utility
  schemaFileWarning: 500        # warn when .prisma file > 500 lines
  domainFileCountWarning: 50    # warn when domain directory > 50 files
```

## 15. Configuration Management (CLAUDE.md, Rules, Skills, Agents)

### 15.1 The Problem

`.claude/` directory contains the "brain" of the agent system: CLAUDE.md, rules, skills, agent definitions, registry. If any domain agent can modify these — chaos. If nobody maintains them — config drift.

### 15.2 Access Control Matrix

```
                        │ CLAUDE.md │ rules/  │ skills/ │ agents/ │ registry │ config
────────────────────────┼───────────┼─────────┼─────────┼─────────┼──────────┼────────
orchestrator            │           │         │         │         │  WRITE   │  READ
governance-architect    │  WRITE    │  WRITE  │  WRITE  │  WRITE  │  WRITE   │  READ
tech-lead               │  REVIEW   │  REVIEW │  REVIEW │  REVIEW │  READ    │  READ
tech-writer             │  WRITE    │         │         │         │          │
qa-lead                 │           │  WRITE* │         │         │          │
release-manager         │           │         │         │         │          │  READ
domain-developer        │           │         │         │         │          │
domain-tester           │           │         │         │         │          │
specialists             │           │         │         │         │          │
SMEs                    │           │         │         │         │          │
business agents         │           │         │         │         │          │

* qa-lead can modify testing.md, e2e.md rules only
```

**Hard rule:** `PreToolUse` hook blocks `.claude/` modifications by non-governance agents:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/check-config-access.js"
          }
        ]
      }
    ]
  }
}
```

```javascript
// scripts/check-config-access.js
// Reads: tool input (file path) + current agent name from env
// Blocks: if file in .claude/ and agent not in GOVERNANCE_AGENTS
// Returns: exit 2 (block) or exit 0 (allow)
```

### 15.3 What Gets Updated When

| Trigger | What changes | Who updates | Session |
|---------|-------------|-------------|---------|
| New feature merged (L/XL) | CLAUDE.md (project context) | tech-writer | DOCS_SYNC |
| New domain created | CLAUDE.md, rules, agents, registry | governance-architect + orchestrator | ONBOARD |
| New agent created | agents/*.md, registry.yaml | governance-architect + orchestrator | ONBOARD |
| RETRO proposes process change | rules, skills, agent prompts | governance-architect | ONBOARD |
| POST_MORTEM proposes fix | rules (new guard), skills (new check) | governance-architect | ONBOARD |
| Architecture change | CLAUDE.md, rules, domain CLAUDE.md | governance-architect + tech-writer | ONBOARD |
| Facade contract change | Domain CLAUDE.md, domain rules | governance-architect | ONBOARD |
| Tech stack change | Rules, agent skills, agent tools | governance-architect | ONBOARD |
| Plugin version update | skills, hooks, session definitions | orchestrator (auto) | ONBOARD |

### 15.4 ONBOARD Session Detail

```yaml
ONBOARD:
  trigger:
    auto:
      - after RETRO with approved changes
      - after POST_MORTEM with preventive measures
      - after new domain creation
      - after HITL creates new agent
    hitl:
      - "/sdlc onboard"
      - "update config", "refresh agents", "calibrate"

  participants:
    mandatory: [governance-architect]
    optional: [tech-writer (if CLAUDE.md changes), orchestrator (if registry changes)]

  process:
    1. Read proposed changes (from RETRO/POST_MORTEM/HITL)

    2. Categorize changes:
       ├── CLAUDE.md updates → tech-writer drafts
       ├── Rules changes → governance-architect drafts
       ├── Skill changes → governance-architect drafts
       ├── Agent prompt changes → governance-architect drafts
       └── Registry changes → orchestrator updates

    3. For each change:
       a. Show current vs proposed (diff)
       b. Explain rationale (from RETRO/POST_MORTEM findings)
       c. HITL: approve / modify / reject

    4. Apply approved changes:
       ├── Edit affected files
       ├── Run validation:
       │   ├── All agents still resolvable?
       │   ├── All skills loadable?
       │   ├── Rules have valid paths: frontmatter?
       │   ├── CLAUDE.md under size limits?
       │   └── Registry consistent with agent files?
       └── Commit changes

    5. Verify:
       ├── Dry-run classify a sample task → routing correct?
       ├── Dry-run compose team for sample task → team correct?
       └── Report changes summary

  output:
    - Updated .claude/ files (committed)
    - Updated .sdlc/registry.yaml
    - Change log entry in .sdlc/history/
```

### 15.5 Configuration Drift Detection

The orchestrator runs a lightweight check at session start:

```yaml
session-start-checks:
  1. Registry consistency:
     "Are all agents in registry.yaml present as .claude/agents/*.md files?"
     If mismatch → warn user, suggest /sdlc onboard

  2. CLAUDE.md freshness:
     "Does root CLAUDE.md reference all current domains?"
     If stale → flag for DOCS_SYNC

  3. Rules coverage:
     "Do all domains have path-scoped rules?"
     If missing → flag for ONBOARD

  4. Agent health:
     "Any agents with >20% failure rate in last 10 sessions?"
     If yes → flag for RETRO

  5. Schema-registry sync:
     "Do prisma domain files match registry domains?"
     If mismatch → flag for ONBOARD
```

### 15.6 Versioning Strategy

All `.claude/` changes are git-committed with conventional commit messages:

```
chore(sdlc): update api-developer agent prompt after RETRO-012
chore(sdlc): add visual-qa agent for web domain
chore(sdlc): update economy.md rules — add facade enforcement
docs(sdlc): update CLAUDE.md with new social domain
```

Tags mark stable configurations:
```
git tag sdlc-config-v1.0  # initial setup
git tag sdlc-config-v1.1  # after first RETRO
git tag sdlc-config-v1.2  # after new domain added
```

Rollback: `git checkout sdlc-config-v1.0 -- .claude/ .sdlc/registry.yaml`

## 16. HOTFIX Workflow

Emergency bypass for production incidents. Skips normal SDLC ceremony — speed over process.

### 16.1 Trigger

```yaml
HOTFIX:
  trigger:
    hitl:
      - "hotfix", "production down", "urgent fix", "emergency"
      - "/sdlc hotfix"
    auto:
      - production monitoring alert (via MCP integration)
      - critical security vulnerability detected
```

### 16.2 Flow

```
User: "Production is broken — login page crashes"
         │
         ▼
CLASSIFY: complexity auto-set to HOTFIX (special tier)
         │
         ▼
┌─ HOTFIX WORKFLOW ───────────────────────────────────────────┐
│                                                             │
│  SKIPS: BRAINSTORM, PLAN, ARCHITECTURE_REVIEW               │
│  SKIPS: full INTEGRATION_CHECK (smoke only)                 │
│                                                             │
│  Step 1: TRIAGE (fast — 2 min)                             │
│    orchestrator + architect (read-only assessment)           │
│    → identify: affected domain, root cause hypothesis       │
│    → assign: domain-developer                               │
│                                                             │
│  Step 2: FIX (worktree off production branch)              │
│    domain-developer (worktree from main, NOT release)       │
│    + security-auditor (quick scan — no new vulnerabilities) │
│    + domain-tester (regression test for fix)                │
│    Branch: hotfix/{description}                             │
│                                                             │
│  Step 3: VERIFY (fast — smoke tests only)                  │
│    mandatory: affected unit tests + smoke E2E               │
│    skip: full E2E suite, visual regression, a11y            │
│                                                             │
│  Step 4: HITL MERGE (always — even for trivial hotfix)     │
│    Show: diff, test results, security scan                  │
│    Merge to: main (production) AND release (backport)       │
│    Tag: hotfix-{date}-{description}                        │
│                                                             │
│  Step 5: AUTO-CREATE follow-ups                            │
│    → POST_MORTEM task (investigate root cause properly)     │
│    → GAP_ANALYSIS task (why didn't tests catch this?)      │
│    → Backlog item for proper fix (if hotfix was band-aid)  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 16.3 Differences from Normal Flow

| Aspect | Normal SDLC | HOTFIX |
|--------|-------------|--------|
| Branch source | release branch | **main (production)** |
| Governance depth | Full (architect, qa-lead, reviewer) | Minimal (triage + fix + verify) |
| Test coverage | Full suite | Smoke only |
| HITL merge | XL only | **Always** |
| Post-merge | GAP_ANALYSIS (optional) | **POST_MORTEM mandatory** |
| Time target | Hours to days | **Minutes to 1 hour** |
| Budget | Per-session caps | **No budget cap** (emergency) |

## 17. Environment Awareness

### 17.1 Environment Model

Agents must understand which environment they're working with and what's allowed:

```yaml
# .sdlc/config.yaml
environments:
  development:
    branches: ["release/*", "feature/*", "worktree-*"]
    deploy: automatic
    agent-permissions:
      write: true
      test: true
      deploy: true
      seed-data: true
    safety: normal

  staging:
    branches: ["staging", "rc/*"]
    deploy: manual-or-ci
    agent-permissions:
      write: true
      test: true
      deploy: false           # CI deploys, not agents
      seed-data: false        # use production-like data
    requires: [INTEGRATION_CHECK]
    safety: elevated

  production:
    branches: ["main", "master"]
    deploy: hitl-only
    agent-permissions:
      write: false            # agents NEVER write to production branch directly
      test: false             # no test execution against production
      deploy: false           # HITL + CI/CD only
      seed-data: false
      read-logs: true         # agents CAN read production logs for POST_MORTEM
    requires: [RELEASE, HITL-approval]
    safety: maximum
```

### 17.2 Agent Environment Rules

Injected into every agent's context based on detected branch:

```yaml
environment-injection:
  detection: "git branch --show-current → match against config"
  injection: |
    Current environment: {{detected_env}}
    Branch: {{current_branch}}

    Permissions for this environment:
    - Write code: {{env.write}}
    - Run tests: {{env.test}}
    - Deploy: {{env.deploy}}
    - Seed data: {{env.seed-data}}

    {{#if env == production}}
    ⚠ PRODUCTION ENVIRONMENT. Read-only access.
    You may ONLY read logs and code for analysis.
    All fixes go through HOTFIX workflow on a hotfix/ branch.
    {{/if}}
```

### 17.3 Environment-Specific Session Behavior

| Session | Development | Staging | Production |
|---------|------------|---------|------------|
| EXECUTE | Normal (worktrees) | Blocked (promote from dev) | Blocked |
| REVIEW | Normal | Stricter checks | N/A |
| MERGE | Auto for S | HITL always | HITL + RELEASE only |
| RELEASE | N/A | Candidate build | HITL + full suite |
| HOTFIX | N/A | N/A | Emergency bypass |
| POST_MORTEM | Optional | Recommended | **Mandatory** after incident |

## 18. Secrets & Credentials Enforcement

### 18.1 Never-Touch List

```yaml
# Hardcoded in plugin — user cannot override these
secrets-enforcement:
  never-read:
    patterns:
      - ".env*"
      - "**/.env.*"
      - "**/credentials*"
      - "**/secrets/**"
      - "**/*.pem"
      - "**/*.key"
      - "**/*.p12"
      - "**/*.pfx"
      - "**/service-account*.json"
      - "**/gcloud-key*.json"
      - "**/*secret*"
      - "**/id_rsa*"
      - "**/id_ed25519*"
    exceptions:
      - ".env.example"          # templates without values are OK
      - ".env.template"
      - "docs/**/*secret*"      # docs about secrets management are OK

  never-write:
    inherits: never-read
    additional:
      - "**/.npmrc"             # may contain auth tokens
      - "**/.pypirc"

  never-log:
    patterns:
      - "API_KEY=*"
      - "SECRET=*"
      - "PASSWORD=*"
      - "TOKEN=*"
      - "PRIVATE_KEY=*"
      - "Bearer *"
      - "Basic *"
```

### 18.2 Enforcement Mechanism

```javascript
// Built into PreToolUse hook — cannot be disabled by agents
// scripts/sdlc-secrets-guard.js

const NEVER_READ = [/\.env(?!\.(example|template))/, /credentials/, /\.pem$/, /\.key$/, /secrets\//];
const NEVER_WRITE = [...NEVER_READ, /\.npmrc$/, /\.pypirc$/];

function check(toolName, filePath) {
  const patterns = (toolName === 'Read' || toolName === 'Glob') ? NEVER_READ : NEVER_WRITE;

  for (const pattern of patterns) {
    if (pattern.test(filePath)) {
      return {
        decision: 'block',
        reason: `SDLC secrets guard: ${filePath} matches protected pattern`
      };
    }
  }
  return { decision: 'allow' };
}
```

### 18.3 What Agents CAN Do with Secrets

```yaml
allowed-secret-operations:
  - "Read .env.example to understand required variables"
  - "Create .env.example with placeholder values"
  - "Add SECRET_NAME= to .env.example (no actual value)"
  - "Reference env vars in code: process.env.SECRET_NAME"
  - "Document required secrets in CLAUDE.md or README"

not-allowed:
  - "Read actual .env file contents"
  - "Write actual secret values anywhere"
  - "Log, print, or include secret values in output"
  - "Hardcode credentials in source code"
  - "Commit files matching never-write patterns"
```

## 19. Concurrent Workflow Handling

### 19.1 Concurrency Model

Multiple workflows CAN run simultaneously, with conflict detection:

```yaml
concurrency:
  max-active-workflows: 3       # configurable
  isolation: "each workflow gets its own worktree set"

  conflict-detection:
    method: "file-overlap analysis before dispatch"
    granularity: "domain-level (not file-level)"

    same-domain:
      policy: queue
      reason: "two agents editing same domain files = merge conflicts"
      behavior: "second workflow waits until first domain-work merges"
      notification: "Workflow WF-014 queued: domain 'api' is locked by WF-012"

    different-domains:
      policy: parallel
      reason: "no file overlap possible — domains are isolated"
      behavior: "both workflows run simultaneously"

    shared-files:
      detect: "orchestrator checks: do both tasks affect CLAUDE.md, package.json, etc.?"
      policy: hitl
      behavior: "AskUserQuestion: 'Both tasks touch shared files. Queue or manual merge?'"
```

### 19.2 Domain Locking

```yaml
# .sdlc/state.json tracks domain locks
{
  "domainLocks": {
    "api": { "workflowId": "WF-012", "agent": "api-developer", "since": "2026-03-20T14:30:00Z" },
    "web": null,       // unlocked
    "social": null     // unlocked
  }
}

# Lock lifecycle:
# 1. EXECUTE dispatches api-developer → lock api domain
# 2. api-developer completes → lock remains until MERGE
# 3. MERGE completes → unlock api domain
# 4. Queued workflow for api domain → can proceed
```

### 19.3 Workflow Priority

When workflows compete for the same domain:

```yaml
priority-rules:
  1. HOTFIX always preempts (pauses other workflows)
  2. Higher complexity runs first (XL > L > M > S)
  3. Higher priority runs first (critical > high > medium > low)
  4. Earlier created runs first (FIFO)

  preemption:
    trigger: "HOTFIX workflow created while domain is locked"
    action: |
      1. Pause current domain agent (save worktree state)
      2. HOTFIX agent gets a fresh worktree from production
      3. HOTFIX completes → merge to main
      4. Resume paused workflow (rebase worktree on updated release branch)
      5. If rebase conflicts → HITL
```

## 20. Dependency Audit Session

```yaml
DEPENDENCY_AUDIT:
  trigger:
    auto:
      - cron: monthly-1st
      - "npm audit / pip audit / bundle audit finds critical/high"
      - after SECURITY_REVIEW flags outdated dependency
    hitl:
      - "/sdlc deps", "audit dependencies", "check vulnerabilities"

  participants:
    mandatory: [dependency-manager]
    optional: [security-auditor (if vulnerabilities found)]

  process:
    1. Run package manager audit:
       - npm: "npm audit --json"
       - pip: "pip audit --format json"
       - gem: "bundle audit"
       - go: "govulncheck"
       - cargo: "cargo audit"

    2. Classify findings:
       - Critical/High vulnerabilities → immediate fix tasks
       - Outdated major versions → assess breaking changes
       - License violations → flag for review
       - Unused dependencies → propose removal

    3. For each finding, propose action:
       (A) Update to patched version (auto if patch/minor)
       (B) Major version upgrade (needs testing — create backlog item)
       (C) Replace dependency (if abandoned/vulnerable)
       (D) Accept risk (document reason)

    4. HITL: review proposed actions

  output:
    - Dependency health report
    - Auto-applied patch/minor updates (with tests)
    - Backlog items for major upgrades
    - License compliance report

  budget: $2
  duration: 10-20 min
```

## 21. Tech Debt Register

### 21.1 Structure

```yaml
# .sdlc/tech-debt.json — persistent, committed to git
{
  "items": [
    {
      "id": "TD-001",
      "title": "ProgressionService is God Object (13 dependencies)",
      "description": "Central orchestrator imports 13 modules via forwardRef",
      "domain": "learning-core",
      "severity": "high",       # critical | high | medium | low
      "type": "coupling",       # coupling | complexity | duplication | obsolete | performance | security
      "detected": "2026-03-20",
      "detectedBy": "ARCHITECTURE_REVIEW",
      "effort": "L",
      "impact": "Every change risks circular dependency breakage",
      "proposedFix": "Decompose into facade pattern per parent spec",
      "status": "open",         # open | in-progress | resolved | accepted-risk | wont-fix
      "linkedTasks": ["TASK-042"],
      "resolvedDate": null
    }
  ],
  "metrics": {
    "total": 12,
    "open": 8,
    "resolved-this-month": 2,
    "trend": "improving"        # improving | stable | degrading
  }
}
```

### 21.2 Fed By

| Session | What it contributes |
|---------|--------------------|
| GAP_ANALYSIS | Missing tests, uncovered edge cases, docs drift |
| ARCHITECTURE_REVIEW | Coupling, complexity, module size violations |
| RETRO | Recurring pain points, agent confusion patterns |
| POST_MORTEM | Root causes, structural weaknesses |
| REVIEW | Repeated feedback patterns → systemic issue |
| DEPENDENCY_AUDIT | Outdated dependencies, license issues |

### 21.3 Consumed By

| Consumer | How |
|----------|-----|
| TRIAGE | Tech debt items appear in backlog for prioritization |
| RETRO | Trend analysis: is debt growing or shrinking? |
| /sdlc status | Shows debt summary alongside backlog |
| ARCHITECTURE_REVIEW | Input for structural decisions |

## 22. Notification Integrations (Optional MCP)

```yaml
# .sdlc/config.yaml — optional, zero integrations required
notifications:
  # Each integration is an MCP server — plugin works without any

  slack:
    enabled: false
    mcp: "@modelcontextprotocol/server-slack"
    channel: "#dev-sdlc"
    events:
      - hitl-needed: "🖐 HITL required: {workflow} — {question}"
      - workflow-complete: "✅ {task} merged to {branch}"
      - budget-warning: "💰 Monthly spend ${amount} / ${limit}"
      - hotfix-started: "🚨 HOTFIX in progress: {description}"
      - review-rejected: "❌ Review rejected: {reason}"

  github:
    enabled: false
    mcp: "@modelcontextprotocol/server-github"
    events:
      - pr-created: "create PR for worktree merge"
      - review-requested: "request review from code-reviewer"
      - issue-created: "create issue for backlog items"
      - release-published: "create GitHub release with changelog"

  email:
    enabled: false
    mcp: "custom-email-mcp"
    events:
      - release-ready: "Release {version} ready for deployment"
      - incident-detected: "Production incident: {description}"

  discord:
    enabled: false
    mcp: "custom-discord-mcp"
    events:
      - workflow-complete: "post to #releases channel"

  # Generic webhook (works with any service)
  webhook:
    enabled: false
    url: ""
    events: [all]
    format: json
```

## 23. Safety, Rollback & Liability

### 23.1 Startup Disclaimer

Shown at first run and every `/sdlc init`:

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠  CLAUDE SDLC PLUGIN — EXPERIMENTAL                      │
│                                                             │
│  This plugin orchestrates AI agents that read and modify    │
│  your codebase. While technical safeguards are in place:    │
│                                                             │
│  • All changes require your approval (HITL gates)           │
│  • Agents work in isolated git worktrees                    │
│  • PreToolUse hooks block unauthorized file access          │
│  • Secrets and credentials are never read or written        │
│  • Every change is git-committed and revertable             │
│                                                             │
│  AI agents may produce incorrect or destructive code.       │
│  YOU are responsible for reviewing all changes.             │
│                                                             │
│  Recommended: ensure git working tree is clean.             │
│  Recovery: /sdlc undo · git revert · git stash              │
│                                                             │
│  Continue? [y/n]                                            │
└─────────────────────────────────────────────────────────────┘
```

### 23.2 Six-Layer Safety Architecture

```
┌─ Layer 1: Tool Restrictions (platform-enforced) ─────┐
│ disallowedTools: [Edit, Write, Bash]                  │
│ Init/analysis agents physically cannot write files.   │
│ Enforcement: Claude Code platform. Cannot bypass.     │
│ Strength: ████████████                                │
└───────────────────────────────────────────────────────┘
┌─ Layer 2: PreToolUse Hooks (code-enforced) ──────────┐
│ sdlc-write-guard.js — blocks protected paths          │
│ sdlc-secrets-guard.js — blocks credential access      │
│ exit(2) = hard block. Agent gets error.               │
│ Strength: ███████████░                                │
└───────────────────────────────────────────────────────┘
┌─ Layer 3: Permission Modes (Claude Code native) ─────┐
│ permissionMode: plan (init) / acceptEdits (execute)   │
│ User sees and approves every file modification.       │
│ Strength: ██████████░░                                │
└───────────────────────────────────────────────────────┘
┌─ Layer 4: Environment Enforcement ───────────────────┐
│ Production = read-only. Staging = no direct deploy.   │
│ Branch detection → permission injection per env.      │
│ Strength: █████████░░░                                │
└───────────────────────────────────────────────────────┘
┌─ Layer 5: Worktree Isolation + Domain Locking ───────┐
│ Every domain agent works in isolated git worktree.    │
│ Domain locks prevent concurrent conflicting edits.    │
│ Main branch untouched until explicit MERGE session.   │
│ Strength: ████████░░░░                                │
└───────────────────────────────────────────────────────┘
┌─ Layer 6: Git Recovery ──────────────────────────────┐
│ Every change committed → revertable.                  │
│ /sdlc undo → revert last plugin-generated commit.     │
│ git stash / git reset as escape hatch.                │
│ Strength: ███████░░░░░                                │
└───────────────────────────────────────────────────────┘
```

### 23.3 MERGE Safety Gates

Every MERGE shows explicit confirmation:

```
⚠ MERGE to release/next

  Worktrees: worktree-api-WF012, worktree-web-WF012
  Files changed: 14 across 2 domains
  Tests: ✅ all green (unit: 142, integration: 38, E2E: 12)
  Review: ✅ approved by governance-reviewer
  Security: ✅ no new vulnerabilities
  Coverage: ✅ api 64% (>60%), web 45% (>40%)

  This merges code to your release branch.
  Recovery: git revert {commit-hash}

  Proceed? [y/n]
```

### 23.4 /sdlc undo

```
/sdlc undo

  Last plugin action: MERGE (WF-012) — 2 commits
    abc1234 feat(economy): add streak bonus to shop purchase
    def5678 test(economy): add streak bonus tests

  Options:
  (A) Revert both commits (git revert abc1234 def5678)
  (B) Revert only last commit
  (C) Show full diff before deciding
  (D) Cancel

  > _
```

### 23.5 Uninstall

```
/sdlc uninstall

  This will remove:
    ☑ .sdlc/ directory (state, backlog, history, costs)
    ☑ .claude/agents/ files created by plugin (orchestrator, governance-*, domain-*)
    ☑ .claude/skills/ files created by plugin (sdlc-*, sessions/)
    ☑ .claude/rules/ files created by plugin (sdlc-governance.md)
    ☑ Plugin hooks from settings

  This will NOT touch:
    ✗ Your code (no source files modified)
    ✗ Existing CLAUDE.md (plugin additions remain — remove manually if wanted)
    ✗ Existing rules not created by plugin
    ✗ Git history
    ✗ Your agents not created by plugin

  Options:
  (A) Full uninstall (remove everything above)
  (B) Keep agent definitions (remove plugin, keep .claude/agents/ for manual use)
  (C) Keep backlog (remove plugin, export backlog to markdown)
  (D) Cancel

  > _
```

Alternatively via CLI:
```bash
claude plugin remove claude-sdlc              # remove plugin only
claude plugin remove claude-sdlc --purge      # remove plugin + .sdlc/ + generated agents/skills
```

### 23.6 Legal

MIT License includes:

```
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
```

README addition:
```markdown
## Disclaimer

Claude SDLC Plugin orchestrates AI agents that modify your codebase.
Despite multiple layers of technical safeguards (tool restrictions,
hooks, permission modes, worktree isolation), AI agents may produce
incorrect, insecure, or destructive code.

**You are solely responsible for reviewing and approving all changes.**

Always maintain backups. Always use version control. Always review diffs
before merging. The authors accept no liability for code produced by
AI agents orchestrated by this plugin.
```

### 23.7 CI/Headless Safety

For automated pipelines that skip interactive HITL:

```bash
# Requires explicit opt-in flag
claude --agent orchestrator -- --i-accept-risks --headless

# Without flag → refuses to run in headless mode
# "SDLC plugin requires --i-accept-risks for headless execution.
#  This bypasses HITL safety gates. Use at your own risk."
```

Headless mode restrictions:
```yaml
headless-mode:
  allowed-sessions: [QUICK_FIX, DEPENDENCY_AUDIT, GAP_ANALYSIS]
  blocked-sessions: [MERGE, RELEASE, HOTFIX, ARCHITECTURE_REVIEW]
  reason: "destructive sessions always require human approval"
  override: "--force-headless (not recommended)"
```

## 24. Installation & Onboarding Journey

### 24.1 Full Installation Flow

```
$ claude plugin add claude-sdlc
  │
  ▼
┌─ DISCLAIMER ────────────────────────────────────────────┐
│  ⚠ EXPERIMENTAL PLUGIN — see §23.1 for full text       │
│  Continue? [y/n]                                        │
└─────────────────────────┬───────────────────────────────┘
                          ▼
Plugin installed to ~/.claude/plugins/claude-sdlc/
  │
  ▼
$ claude --agent orchestrator    (or alias: p2s)
  │
  ▼
> /sdlc init
  │
  ├─ 2a. Ecosystem scan (read-only, ~30 sec)
  │   → tech stack, ORM, CI, git conventions, existing CLAUDE.md
  │
  ├─ 2b. Domain mapping (HITL)
  │   → proposes domains from directory structure
  │   → user confirms/adjusts
  │
  ├─ 2c. Agent selection (HITL)
  │   → mandatory + recommended + optional
  │   → user toggles
  │
  ├─ 2d. Config generation (HITL review per file)
  │   → .sdlc/config.yaml, registry.yaml, backlog.json
  │   → .claude/agents/*.md from templates
  │   → path: frontmatter on existing rules
  │   → domain CLAUDE.md files (if monorepo)
  │
  ├─ 2e. Shell alias setup
  │   → "Add alias to your shell profile?"
  │   → alias p2s="claude --agent orchestrator"
  │
  ├─ 2f. Verification dry-run
  │   → classify sample task → routing OK?
  │   → compose team → agents resolve?
  │
  └─ 2g. Quick-start guide (shown once)
         ▼
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ✅ SDLC Plugin initialized!                                │
│                                                             │
│  QUICK START                                                │
│  ──────────────────────────────────────────────────────     │
│  Start:     p2s                (or: claude --agent orchestrator)│
│  New task:  just describe it   ("add daily rewards")        │
│  Dispatch:  /sdlc dispatch "fix login bug"                  │
│  Status:    /sdlc status       (backlog + active work)      │
│  Triage:    /sdlc triage       (prioritize inbox)           │
│  Retro:     /sdlc retro        (review process)             │
│  Release:   /sdlc release      (version + deploy)           │
│  Costs:     /sdlc cost         (spending report)            │
│  Team:      /sdlc team         (agent health)               │
│  Hotfix:    /sdlc hotfix       (emergency production fix)   │
│  Undo:      /sdlc undo         (revert last plugin action)  │
│  Help:      /sdlc help         (full command reference)     │
│                                                             │
│  HOW IT WORKS                                               │
│  ──────────────────────────────────────────────────────     │
│  1. You describe a task in natural language                 │
│  2. Orchestrator classifies (type, complexity, domains)     │
│  3. Team is composed from agent registry                    │
│  4. Agents work in isolated git worktrees                   │
│  5. You review and approve all changes (HITL gates)         │
│  6. Approved work merges to your branch                     │
│                                                             │
│  IMPORTANT                                                  │
│  ──────────────────────────────────────────────────────     │
│  ⚠ Always start with p2s (not plain claude)                 │
│    Plain claude skips SDLC governance — agents may work     │
│    without review gates, team composition, or tracking.     │
│                                                             │
│  ⚠ Review every merge — you are the final quality gate      │
│                                                             │
│  Docs: /sdlc help │ Undo: /sdlc undo │ Remove: /sdlc uninstall│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 24.2 Entry Point Enforcement

When user launches `claude` without `--agent orchestrator`, a SessionStart hook fires:

```json
// Installed by plugin into .claude/settings.json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "node .claude/plugins/claude-sdlc/hooks/entry-check.js"
      }
    ]
  }
}
```

```javascript
// hooks/entry-check.js
// Checks if running as orchestrator. If not — warns.

const agent = process.env.CLAUDE_AGENT_NAME;

if (!agent || agent !== 'orchestrator') {
  // Output warning that gets injected into session context
  const warning = JSON.stringify({
    result: [
      '⚠ SDLC PLUGIN DETECTED — NOT RUNNING AS ORCHESTRATOR',
      '',
      'You launched claude without --agent orchestrator.',
      'This means:',
      '  • No SDLC governance pipeline',
      '  • No team composition from registry',
      '  • No backlog tracking or cost logging',
      '  • No review gates or safety checks',
      '  • Changes go directly to working tree (no worktree isolation)',
      '',
      'To use SDLC flow:  exit and run: p2s',
      'To continue anyway: this is fine for quick exploration/research',
      '',
      'Tip: add to your shell profile:  alias p2s="claude --agent orchestrator"',
    ].join('\n'),
  });
  process.stdout.write(warning);
}

process.exit(0); // don't block — just warn
```

**User sees at session start:**

```
⚠ SDLC PLUGIN DETECTED — NOT RUNNING AS ORCHESTRATOR

You launched claude without --agent orchestrator.
This means:
  • No SDLC governance pipeline
  • No team composition from registry
  • No backlog tracking or cost logging
  • No review gates or safety checks
  • Changes go directly to working tree (no worktree isolation)

To use SDLC flow:  exit and run: p2s
To continue anyway: this is fine for quick exploration/research

Tip: add to your shell profile:  alias p2s="claude --agent orchestrator"
```

### 24.3 Entry Modes

Three valid entry modes, each with different behavior:

```yaml
entry-modes:

  # Mode 1: Full SDLC (recommended daily driver)
  full-sdlc:
    command: "p2s" or "claude --agent orchestrator"
    behavior:
      - Full governance pipeline
      - Team composition from registry
      - Backlog tracking + cost logging
      - Review gates + safety checks
      - Worktree isolation for domain work
    indicator: "🏛 SDLC" in prompt

  # Mode 2: Plain Claude (exploration/research)
  plain:
    command: "claude"
    behavior:
      - No governance pipeline
      - Direct file access (user's permission mode)
      - No backlog tracking
      - SessionStart hook shows warning (once)
    indicator: none (standard claude)
    use-when: "quick question, file exploration, research, one-off script"

  # Mode 3: Domain-focused (expert mode)
  domain-focused:
    command: "claude --agent api-developer" or "claude --cwd apps/api"
    behavior:
      - No governance pipeline
      - Domain context loaded (domain CLAUDE.md + rules)
      - No team composition (solo agent)
      - SessionStart hook shows warning (once)
    indicator: agent name in prompt
    use-when: "known small fix in specific domain, don't need full ceremony"
```

### 24.4 /sdlc help

Always accessible, shows context-aware help:

```
/sdlc help

  CLAUDE SDLC PLUGIN v0.1.0

  COMMANDS
  ─────────────────────────────────────────────
  /sdlc init           Initialize plugin for this project
  /sdlc dispatch "X"   Submit task to orchestrator
  /sdlc status         Show backlog + active workflows
  /sdlc triage         Prioritize inbox items
  /sdlc retro          Run retrospective
  /sdlc release        Cut release (version, changelog, deploy)
  /sdlc hotfix         Emergency production fix
  /sdlc cost           Cost breakdown report
  /sdlc team           Agent registry + health
  /sdlc add-agent      Create new agent (guided)
  /sdlc add-domain     Register new domain (guided)
  /sdlc add-sme "X"    Create subject matter expert
  /sdlc undo           Revert last plugin action
  /sdlc uninstall      Remove plugin + cleanup

  DAILY WORKFLOW
  ─────────────────────────────────────────────
  1. Start:    p2s (alias for claude --agent orchestrator)
  2. Work:     describe task → orchestrator handles routing
  3. Review:   approve changes at HITL gates
  4. Check:    /sdlc status for progress

  OR just chat naturally — orchestrator classifies and routes.

  SESSIONS (automatic — orchestrator picks the right one)
  ─────────────────────────────────────────────
  QUICK_FIX    S bugfix → fast fix, auto-merge
  TRIAGE       Prioritize multiple tasks
  BRAINSTORM   Design feature (L/XL)
  PLAN         Decompose into domain tasks
  EXECUTE      Domain teams implement
  REVIEW       Code review + acceptance
  MERGE        Merge to release branch
  RELEASE      Version bump + changelog + deploy
  HOTFIX       Emergency production fix
  RETRO        Review process, improve agents
  ... and 7 more (GAP_ANALYSIS, POST_MORTEM,
      ARCHITECTURE_REVIEW, SECURITY_REVIEW,
      DOCS_SYNC, DEPENDENCY_AUDIT, ONBOARD)

  RECOVERY
  ─────────────────────────────────────────────
  /sdlc undo                 Revert last action
  git revert {hash}          Manual revert
  git stash                  Stash all changes
  /sdlc uninstall            Remove plugin entirely
```

## 25. Pixel Agents Visual Dashboard (Optional)

### 25.1 When to Propose

The plugin proposes Pixel Agents at three moments:

**Moment 1: During `/sdlc init` (Step 2c — Agent Selection)**
```
  OPTIONAL FEATURES
  ──────────────────────────────────────────────────────

  ☐ Pixel Agents — Visual Team Dashboard (VS Code)

    See your AI team as pixel art characters in an isometric office.
    Each agent gets an animated avatar reflecting real-time activity:
    typing when coding, reading when researching, waiting when idle.

    ┌──────────────────────────────────────────────┐
    │  🏢  Your office would look like:            │
    │                                              │
    │  ┌─────┐  ┌──────────┐  ┌──────────┐       │
    │  │Boss │  │ Dev Pod A │  │ Dev Pod B │       │
    │  │Desk │  │ 🧑‍💻 api   │  │ 🧑‍💻 web   │       │
    │  │ 👔  │  │ 🧪 test  │  │ 🧪 test  │       │
    │  └─────┘  └──────────┘  └──────────┘       │
    │  orchestrator                                │
    │           ┌──────────┐  ┌──────────┐       │
    │           │Meeting Rm│  │ QA Lab   │       │
    │           │ 📐 arch  │  │ 🔍 e2e   │       │
    │           │ 📋 qa    │  │ 🛡 sec   │       │
    │           └──────────┘  └──────────┘       │
    └──────────────────────────────────────────────┘

    Based on your team (14 mandatory + 20 recommended agents),
    I'd set up a medium office layout.

    Requires: VS Code
    Install:  code --install-extension pixel-agents

    Enable visual dashboard? [y/n/later]
```

**Moment 2: After first successful EXECUTE (agents actually working)**
```
  ✅ EXECUTE completed — api-developer + web-developer + 2 testers

  💡 Tip: Want to see your team working in real-time?
     Pixel Agents shows animated characters for each agent.
     Install: /sdlc enable pixel-agents
     (one-time setup, can remove anytime)
```

**Moment 3: Via explicit command**
```
  /sdlc enable pixel-agents
```

### 25.2 Installation Flow

```
/sdlc enable pixel-agents

Step 1: CHECK PREREQUISITES
  ├── VS Code installed? ──→ if no: "Pixel Agents requires VS Code. Skip."
  ├── Extension installed? ─→ if no: proceed to install
  └── Already configured? ──→ if yes: "Already active. /sdlc pixel-agents reset to reconfigure."

Step 2: INSTALL EXTENSION
  $ code --install-extension pixel-agents

  Waiting for extension activation... ✅

Step 3: GENERATE OFFICE LAYOUT
  Based on your team roster (from .sdlc/registry.yaml):

  Detected agents: 34 active

  Proposed layout: MEDIUM OFFICE
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │  ┌──────────┐                    ┌──────────┐      │
  │  │ Boss Desk│                    │ Library  │      │
  │  │ orchestr.│                    │ SMEs     │      │
  │  └──────────┘                    │ (appear  │      │
  │                                  │  on call)│      │
  │  ┌──────────────────────────┐   └──────────┘      │
  │  │    Meeting Room          │                      │
  │  │ architect  product-analyst│   ┌──────────┐      │
  │  │ qa-lead    tech-lead     │   │ Marketing│      │
  │  │ code-reviewer            │   │ Suite    │      │
  │  └──────────────────────────┘   │ (appear  │      │
  │                                  │  on call)│      │
  │  ┌───────────┐ ┌───────────┐   └──────────┘      │
  │  │ Dev Pod A │ │ Dev Pod B │                      │
  │  │  API      │ │  WEB      │   ┌──────────┐      │
  │  │ 🧑‍💻 dev   │ │ 🧑‍💻 dev   │   │ QA Lab   │      │
  │  │ 🧪 test  │ │ 🧪 test  │   │ 🔍 e2e   │      │
  │  │ 🗄 db-mig│ │ 🎨 ui-des│   │ 🛡 sec   │      │
  │  └───────────┘ └───────────┘   │ ♿ a11y  │      │
  │                                 │ 🏎 perf  │      │
  │  ┌───────────┐ ┌───────────┐   └──────────┘      │
  │  │ Dev Pod C │ │ Dev Pod D │                      │
  │  │ MOBILE    │ │ NOTIF     │   ┌──────────┐      │
  │  │ 🧑‍💻 dev   │ │ 🧑‍💻 dev   │   │ DevOps   │      │
  │  │ 🧪 test  │ │ 🧪 test  │   │ Corner   │      │
  │  └───────────┘ └───────────┘   └──────────┘      │
  │                                                     │
  └─────────────────────────────────────────────────────┘

  Customize layout? [y/n/accept]

Step 4: CONFIGURE ACTIVITY MAPPING
  Writes: .sdlc/pixel-agents-config.json

  {
    "layout": "medium-office",
    "zones": {
      "boss-desk":     { "agents": ["orchestrator"], "position": "top-center" },
      "meeting-room":  { "agents": ["architect", "product-analyst", "qa-lead", "tech-lead", "code-reviewer"], "position": "center-left" },
      "dev-pod-api":   { "agents": ["api-developer", "api-tester", "db-migration"], "position": "bottom-left-1" },
      "dev-pod-web":   { "agents": ["web-developer", "web-tester", "ui-designer"], "position": "bottom-left-2" },
      "dev-pod-mobile":{ "agents": ["mobile-developer", "mobile-tester"], "position": "bottom-left-3" },
      "dev-pod-notif": { "agents": ["notification-developer", "notification-tester"], "position": "bottom-left-4" },
      "qa-lab":        { "agents": ["e2e-tester", "security-auditor", "a11y-tester", "performance-auditor"], "position": "center-right" },
      "library":       { "agents": ["*-sme"], "position": "top-right", "spawn": "on-demand" },
      "marketing":     { "agents": ["marketing-specialist", "pr-specialist", "content-strategist"], "position": "right", "spawn": "on-demand" },
      "devops-corner": { "agents": ["devops", "monitoring-specialist"], "position": "bottom-right" }
    },
    "activities": {
      "BRAINSTORM":        { "animation": "gather-meeting-room", "speech": "💡 Brainstorming..." },
      "PLAN":              { "animation": "gather-meeting-room", "speech": "📋 Planning..." },
      "EXECUTE":           { "animation": "at-desk-typing",      "speech": "⌨️ Implementing..." },
      "REVIEW":            { "animation": "walk-between-pods",    "speech": "🔍 Reviewing..." },
      "MERGE":             { "animation": "boss-stamps",          "speech": "✅ Merging!" },
      "HOTFIX":            { "animation": "red-alert-all-desks",  "speech": "🚨 HOTFIX!" },
      "RETRO":             { "animation": "gather-meeting-room",  "speech": "🔄 Retrospective" },
      "IDLE":              { "animation": "idle-at-desk",         "speech": null },
      "HITL_NEEDED":       { "animation": "raise-hand",           "speech": "🖐 Need your input!" },
      "COMPLETE":          { "animation": "celebration",          "speech": "🎉 Done!" },
      "BLOCKED":           { "animation": "head-scratch",         "speech": "🤔 Blocked..." }
    },
    "spawn-behavior": {
      "on-demand-agents":  "fade-in at assigned zone, fade-out after session",
      "sme-consultation":  "sme walks from library to requesting agent's desk",
      "sub-agent-spawn":   "new character appears linked to parent"
    }
  }

Step 5: VERIFY
  Opening VS Code with pixel-agents dashboard...
  Agents visible: 14 (mandatory, at desks)
  On-demand zones: 4 (empty, ready for spawn)
  Activity tracking: connected to Claude Code JSONL transcripts

  ✅ Pixel Agents dashboard active!
  Tip: resize VS Code panel to see full office.
```

### 25.3 Layout Presets

```yaml
# Shipped with plugin
layout-presets:

  small-office:          # 3-8 agents
    rooms: [boss-desk, dev-pod-1, qa-corner]
    fits: "single-app or small monorepo"
    grid: 16x16

  medium-office:         # 9-25 agents
    rooms: [boss-desk, meeting-room, dev-pod-1..4, qa-lab, library]
    fits: "monorepo with 2-4 domains"
    grid: 32x32

  large-office:          # 26-50 agents
    rooms: [boss-desk, meeting-room, dev-pod-1..6, qa-lab, library, marketing, devops, design-studio]
    fits: "large monorepo or multi-service"
    grid: 48x48

  campus:                # 50+ agents
    rooms: [building-governance, building-dev, building-qa, building-business, courtyard]
    fits: "enterprise with many domains"
    grid: 64x64

  custom:
    tool: "pixel-agents office editor (built into VS Code extension)"
    export: ".sdlc/pixel-agents-layout.json"
```

### 25.4 Session Lifecycle Animations

What the user SEES during a workflow:

```
WF-012: "Add daily rewards system" (L, cross-domain: api + web)

1. CLASSIFY (2 sec)
   orchestrator at boss desk, thinking animation 🤔
   speech bubble: "Classifying task..."

2. BRAINSTORM (if needed)
   architect + product-analyst + ux-designer walk to meeting room
   All sit around table, talking animation 💬
   SME walks from library if consulted

3. PLAN
   architect at meeting room whiteboard
   speech bubble: "Decomposing into 3 domain tasks..."

4. EXECUTE (parallel)
   api-developer appears at Dev Pod A, typing ⌨️
   web-developer appears at Dev Pod B, typing ⌨️
   api-tester appears at Dev Pod A, waiting ⏳ (until dev finishes)
   speech bubbles show current file being edited

5. REVIEW
   code-reviewer walks from meeting room to Dev Pod A
   reads animation 📖 at api-developer's desk
   walks to Dev Pod B
   reads animation 📖 at web-developer's desk
   speech bubble: "✅ Approved" or "❌ Needs changes"

6. HITL_NEEDED
   orchestrator raises hand 🖐
   speech bubble: "Ready to merge. Approve?"
   All agents pause, look at camera (user)

7. MERGE
   orchestrator does stamp animation 📝
   All agents do celebration 🎉
   Agents walk back to idle positions

8. Agents fade to idle animation at their desks
```

### 25.5 HITL Visual Indicators

When any agent needs user input, the visual dashboard makes it obvious:

```yaml
hitl-indicators:
  agent-animation: "raise-hand + speech bubble with question"
  office-effect: "subtle red pulse on agent's zone"
  sound: "gentle notification chime (configurable, can disable)"
  status-bar: "VS Code status bar: '🖐 SDLC: 1 agent needs input'"

  # Ensures user notices even if VS Code is minimized:
  badge: "VS Code window badge shows notification count"
```

### 25.6 Disable / Remove

```
/sdlc disable pixel-agents
  → removes activity hooks
  → keeps extension installed (user can use for other projects)
  → removes .sdlc/pixel-agents-config.json

# Or fully:
code --uninstall-extension pixel-agents
```

## 26. Updated Implementation Roadmap

| Phase | What | Time | Priority |
|-------|------|------|----------|
| **P1** | Plugin manifest + directory structure | 1 hour | Critical |
| **P2** | State schemas (backlog, state, tech-debt, session-log) | 2 hours | Critical |
| **P3** | `/sdlc init` — ecosystem scan + domain mapping + HITL | 4 hours | Critical |
| **P4** | `/sdlc dispatch` — classifier + session routing | 3 hours | Critical |
| **P5** | Core sessions (QUICK_FIX, EXECUTE, REVIEW, MERGE) | 4 hours | Critical |
| **P6** | Backlog persistence + cross-session handoff | 3 hours | Critical |
| **P7** | Safety layer (hooks, guards, secrets, env awareness) | 3 hours | Critical |
| **P8** | Agent templates (parameterized by domain) | 2 hours | High |
| **P9** | Governance sessions (BRAINSTORM, PLAN, TRIAGE) | 3 hours | High |
| **P10** | `/sdlc status` + `/sdlc team` + `/sdlc cost` | 2 hours | High |
| **P11** | Cost tracking hooks | 2 hours | High |
| **P12** | HOTFIX workflow | 2 hours | High |
| **P13** | Concurrent workflow + domain locking | 2 hours | High |
| **P14** | Quality sessions (GAP_ANALYSIS, RETRO, POST_MORTEM) | 3 hours | Medium |
| **P15** | RELEASE + DOCS_SYNC + SECURITY_REVIEW + DEPENDENCY_AUDIT | 4 hours | Medium |
| **P16** | ARCHITECTURE_REVIEW + ONBOARD sessions | 2 hours | Medium |
| **P17** | Project ecosystem integration (inherit/enhance) | 3 hours | Medium |
| **P18** | Plugin interop (superpowers, playwright, code-review) | 2 hours | Medium |
| **P19** | Tech stack templates (nestjs, nextjs, django, generic) | 3 hours | Medium |
| **P20** | Agent catalog (adapt 28 from MIT repos + write 9 custom) | 8 hours | Medium |
| **P21** | Tech debt register | 1 hour | Medium |
| **P22** | Agent health + workflow metrics | 2 hours | Low |
| **P23** | Notification integrations (MCP) | 2 hours | Low |
| **P24** | Pixel Agents integration | 1 hour | Low |
| **P25** | `/sdlc add-agent` + `/sdlc add-domain` + `/sdlc add-sme` | 2 hours | Low |
| **P26** | `/sdlc undo` + `/sdlc uninstall` | 1 hour | Low |
| **P27** | Distribution (manifest, versioning, migration) | 2 hours | Low |
| **P28** | User guide + agent authoring guide | 3 hours | Low |

**Total: ~72 hours across ~5-6 weeks**

**MVP (v0.1) — Weeks 1-2:** P1-P7 (core infra + safety = plugin works for basic flow)
**Usable (v0.2) — Weeks 2-3:** P8-P13 (governance, HOTFIX, concurrency = daily driver)
**Complete (v0.3) — Weeks 3-4:** P14-P21 (all sessions, ecosystem integration, full catalog)
**Polished (v1.0) — Weeks 5-6:** P22-P28 (metrics, notifications, guides, distribution)

## 25. Open Questions

1. Plugin name: `claude-sdlc` or something more memorable? (`foreman`? `conductor`? `workshop`?)
2. State storage: `.sdlc/` or `.claude/sdlc/`? (plugin namespace vs project namespace)
3. Should backlog.json be committed to git? (team visibility vs noise)
4. How to handle multi-user? (git conflicts on state.json if two devs use same repo)
5. License: MIT? Apache 2.0?
6. Plugin registry: submit to official Claude Code plugin marketplace?
7. Should the plugin vendor its own LLM calls for classification (cheaper) or always use Claude Code's context?
8. Agent teams (experimental) — build abstraction that works with both current Agent tool and future teams?
9. How opinionated should templates be? (e.g., enforce TDD in all templates, or configurable?)
10. JIK-A-4 Metro City sprite pack license — verify before shipping pixel-agents integration
11. Best-of-breed strategy: when 4 repos have `code-reviewer.md`, which one to base on? Merge best parts?
12. Custom prompts (9 roles): write in-house or commission from community contributors?
13. PostgreSQL schema isolation — Phase 3 worth the complexity for solo developer?
14. Config drift detection — run at every session start or only weekly?
15. Cross-domain migration safety — require `architect` sign-off or allow `db-migration` specialist alone?
16. Headless mode — which sessions should be safe for CI without HITL?
17. Concurrent workflow limit — 3 default, should it auto-scale based on API budget?
18. Tech debt severity auto-classification — heuristic-based or governance-reviewed?
