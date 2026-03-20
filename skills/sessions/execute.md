---
name: execute
description: Domain teams implement code with TDD discipline and iterative retry
---

# EXECUTE Session

Domain teams implement the planned changes with TDD discipline and prompt-driven iterative retry.

## Entry Criteria
- Plan approved (from PLAN session) OR direct dispatch (M tasks)
- Domains identified
- Spec/plan available in handoff artifacts

## Process

### 1. Context Loading
- Read plan from handoff artifacts (planPath)
- Read domain map from `.sdlc/registry.yaml`
- Identify agents needed from plan (domain + agent name)
- Read `.sdlc/config.yaml` for `execution.maxIterations` (default: 5) and `execution.maxRetries` (default: 3)

### 2. Per-Wave Dispatch

For each wave in the plan:

#### a. Dispatch Domain Agents (parallel within wave)

For each task in the wave, dispatch a domain agent using the Agent tool with this prompt structure:

    You are {agent_name} working on {domain_name}.

    ## Task
    {task_description}

    ## Domain Scope
    - Domain: {domain_name}
    - Path: {domain_path}
    - Test command: {test_command}
    - Allowed write paths: {domain_path}/**
    - Read-only cross-domain: {facade_paths}

    ## TDD Discipline

    For each task, follow RED -> GREEN -> REFACTOR strictly:

    RED: Write a failing test. Run {test_command}. Verify it FAILS.
    GREEN: Write minimum code to pass. Run {test_command}. Verify it PASSES.
    REFACTOR: Clean up. Run {test_command}. Verify still green.

    Do NOT skip steps. Do NOT batch features before testing.

    ## Iterative Retry Protocol

    After completing your implementation:
    1. Run the full domain test suite: {test_command}
    2. If ALL tests pass: report DONE
    3. If tests FAIL:
       - Read the failure output carefully
       - Identify root cause (not symptom)
       - Fix the issue
       - Run {test_command} again
       - Repeat up to {max_iterations} total attempts
    4. If after {max_iterations} attempts tests still fail: report BLOCKED with details

    You MUST keep count of your attempts. Do NOT exceed {max_iterations} iterations.
    Current attempt: 1 of {max_iterations}.

    ## Rules
    - You MUST NOT edit files outside {domain_path}/
    - You MUST run {test_command} before reporting DONE
    - You MUST self-review your changes before reporting
    - disallowedTools in your agent frontmatter enforces domain boundaries

    ## Status Protocol
    Report EXACTLY one of:
    - DONE — task complete, tests pass, self-review clean
    - DONE_WITH_CONCERNS — complete but have concerns (list them)
    - NEEDS_CONTEXT — need information not available (specify what)
    - BLOCKED — cannot complete after {max_iterations} attempts (explain why, include last test output)
    - DOMAIN_VIOLATION — need to modify files outside your domain (list which files and why)

#### b. Collect Status Reports

Wait for all agents in wave to complete. For each agent, read status:
- **DONE** -> mark task complete in plan
- **DONE_WITH_CONCERNS** -> mark complete, log concerns for REVIEW session
- **NEEDS_CONTEXT** -> provide context and re-dispatch (counts as a retry, max {maxRetries})
- **BLOCKED** -> escalate to HITL (user decides: fix manually, skip, or abort)
- **DOMAIN_VIOLATION** -> orchestrator handles cross-domain coordination:
  1. Dispatch the other domain's agent to add the needed facade/API
  2. Wait for completion
  3. Re-dispatch the original agent with updated context

#### c. Wave Gate

All tasks in wave must be DONE or DONE_WITH_CONCERNS before starting the next wave. If any task is BLOCKED after HITL, the orchestrator decides: continue with remaining tasks or pause the pipeline.

### 3. Post-Execution

After all waves complete:
- Write SessionHandoff with:
  - Branches used (one per domain if worktrees)
  - Test results (per domain)
  - Files changed (per domain)
  - Concerns list (from DONE_WITH_CONCERNS agents)
- Chain to REVIEW

## Participants
- {domain}-developer (per affected domain, from registry)
- Orchestrator manages dispatch and collection

## HITL
Only when agent reports BLOCKED or DOMAIN_VIOLATION requires user input. Otherwise fully autonomous within iteration limits.

## Test Requirements
- During: TDD per feature (unit tests mandatory)
- After: full domain test suite must pass
- Iterative retry: up to maxIterations attempts per agent

## Output
- Code in branches (not merged yet)
- Test results per domain
- SessionHandoff -> chains to REVIEW
