#!/usr/bin/env node
'use strict';

/**
 * SDLC Write Guard — PreToolUse hook
 * Blocks non-governance agents from modifying .claude/ config files
 * and non-orchestrator/governance agents from modifying .sdlc/ state files.
 */

const WRITE_TOOLS = ['Edit', 'Write'];

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

// qa-lead can only modify these files inside .claude/
const QA_LEAD_ALLOWED = ['testing.md', 'e2e.md'];

function isClaudePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
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

    const agentName = process.env.CLAUDE_AGENT_NAME || '';

    // Check .sdlc/ state file protection
    if (isSdlcPath(filePath)) {
      if (!agentName || !SDLC_STATE_AGENTS.includes(agentName)) {
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

    if (!GOVERNANCE_AGENTS.includes(agentName)) {
      const result = JSON.stringify({
        decision: 'block',
        reason: 'SDLC write guard: only governance agents can modify .claude/ files',
      });
      process.stdout.write(result);
      process.exit(2);
      return;
    }

    // Special case: qa-lead can only modify testing.md or e2e.md
    if (agentName === 'qa-lead') {
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
