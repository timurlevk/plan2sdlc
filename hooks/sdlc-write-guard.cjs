#!/usr/bin/env node
'use strict';

/**
 * SDLC Write Guard — PreToolUse hook
 * Blocks non-governance agents from modifying .claude/ config files
 * and non-orchestrator/governance agents from modifying .sdlc/ state files.
 */

const WRITE_TOOLS = ['Edit', 'Write', 'Bash'];

const GOVERNANCE_AGENTS = [
  'orchestrator',
  'governance-architect',
  'governance-reviewer',
  'tech-lead',
  'tech-writer',
  'qa-lead',
];

// Agents allowed to write to .sdlc/ state files
const SDLC_STATE_AGENTS = [
  'orchestrator',
  'governance-architect',
  'governance-reviewer',
  'tech-lead',
];

/**
 * Check if agent name matches any allowed name.
 * Handles namespaced names like "claude-sdlc:orchestrator" → matches "orchestrator"
 */
function agentMatches(agentName, allowedList) {
  if (!agentName) return false;
  // Direct match
  if (allowedList.includes(agentName)) return true;
  // Namespaced match: "plugin:agent" → check "agent" part
  if (agentName.includes(':')) {
    const shortName = agentName.split(':').pop();
    if (shortName && allowedList.includes(shortName)) return true;
  }
  // Partial match: agent name contains one of the allowed names
  return allowedList.some(allowed => agentName.includes(allowed));
}

// qa-lead can only modify these files inside .claude/
const QA_LEAD_ALLOWED = ['testing.md', 'e2e.md'];

function isClaudePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  // Don't guard user memory or project settings
  if (normalized.includes('/.claude/projects/') || normalized.includes('/.claude/memory/')) return false;
  // Worktree paths are project copies, not .claude/ config
  if (normalized.includes('/.claude/worktrees/')) return false;
  return normalized.startsWith('.claude/') || normalized.includes('/.claude/');
}

function isSdlcPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.includes('/.sdlc/') || normalized.startsWith('.sdlc/');
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    let data;
    try {
      data = JSON.parse(input);
    } catch {
      process.exit(0);
      return;
    }

    const toolName = data.tool_name;
    if (!WRITE_TOOLS.includes(toolName)) {
      process.exit(0);
      return;
    }

    const toolInput = data.tool_input || {};
    const filePath = toolInput.file_path || '';

    // Agent identification: prefer stdin JSON field, fallback to env var
    const agentName = data.agent_type || process.env.CLAUDE_AGENT_NAME || process.env.AGENT_NAME || '';

    // ORCHESTRATOR SOURCE CODE GUARD:
    // Orchestrator must not write application code — only .sdlc/ and docs/
    if (agentMatches(agentName, ['orchestrator'])) {
      // Block Bash write commands entirely for orchestrator
      if (toolName === 'Bash') {
        var command = toolInput.command || '';
        // Block any Bash command that writes to filesystem
        var hasWritePattern = /(?:>|>>|tee\s|sed\s+-i|mv\s|cp\s|rm\s|mkdir\s|touch\s|chmod\s|chown\s|ln\s|install\s|cat\s*>|cat\s*<<|echo\s+.*>|printf\s+.*>|git\s+(?:add|commit|push|merge|rebase|checkout\s+-b|reset|stash)|npm\s+(?:install|uninstall|publish)|pnpm\s+(?:add|remove|install|publish))/i.test(command);
        if (hasWritePattern) {
          var result0 = JSON.stringify({
            decision: 'block',
            reason: 'SDLC write guard: orchestrator cannot use Bash for write operations — use /sdlc execute for code changes',
          });
          process.stdout.write(result0);
          process.exit(2);
          return;
        }
        process.exit(0);
        return;
      }

      // Block Edit/Write to source code paths
      if (!isSdlcPath(filePath) && !isClaudePath(filePath)) {
        var normalized0 = filePath.replace(/\\/g, '/');
        var isDocsPath = normalized0.startsWith('docs/') || normalized0.includes('/docs/');
        if (!isDocsPath) {
          var result1 = JSON.stringify({
            decision: 'block',
            reason: 'SDLC write guard: orchestrator can only write to .sdlc/ and docs/ — use /sdlc execute for code changes',
          });
          process.stdout.write(result1);
          process.exit(2);
          return;
        }
      }
    }

    // Check .sdlc/ state file protection
    if (isSdlcPath(filePath)) {
      // Allow if no agent name set (running as skill or direct Claude session)
      // This enables /sdlc init and other skills to create .sdlc/ files
      if (!agentName) {
        process.exit(0);
        return;
      }
      // Allow bootstrap: if .sdlc/config.yaml doesn't exist yet, any agent can write
      // (init is creating the directory for the first time)
      const fs = require('fs');
      const path = require('path');
      const cwd = process.env.SDLC_PROJECT_DIR || process.cwd();
      if (!fs.existsSync(path.join(cwd, '.sdlc', 'config.yaml'))) {
        process.exit(0);
        return;
      }
      // Block non-governance agents
      if (!agentMatches(agentName, SDLC_STATE_AGENTS)) {
        const result = JSON.stringify({
          decision: 'block',
          reason: 'SDLC write guard: only orchestrator and governance agents can modify .sdlc/ state files',
        });
        process.stdout.write(result);
        process.exit(2);
        return;
      }
      // Allowed SDLC state agent — let through
      process.exit(0);
      return;
    }

    if (!isClaudePath(filePath)) {
      process.exit(0);
      return;
    }

    // Allow if no agent name (running as skill or direct session — e.g., /sdlc init)
    if (!agentName) {
      process.exit(0);
      return;
    }

    if (!agentMatches(agentName, GOVERNANCE_AGENTS)) {
      const result = JSON.stringify({
        decision: 'block',
        reason: 'SDLC write guard: only governance agents can modify .claude/ files',
      });
      process.stdout.write(result);
      process.exit(2);
      return;
    }

    // Special case: qa-lead can only modify testing.md or e2e.md
    if (agentName === 'qa-lead' || agentName.includes('qa-lead')) {
      const normalized = filePath.replace(/\\/g, '/');
      const fileName = normalized.split('/').pop() || '';
      if (!QA_LEAD_ALLOWED.includes(fileName)) {
        const result = JSON.stringify({
          decision: 'block',
          reason: 'SDLC write guard: qa-lead can only modify testing.md or e2e.md in .claude/',
        });
        process.stdout.write(result);
        process.exit(2);
        return;
      }
    }

    process.exit(0);
  });
}

main();
