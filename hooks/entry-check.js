#!/usr/bin/env node
'use strict';

/**
 * SDLC Entry Check — SessionStart hook
 * Warns when not running as orchestrator agent.
 */

function main() {
  const agentName = process.env.CLAUDE_AGENT_NAME || '';

  if (agentName !== 'orchestrator') {
    const warning = [
      '\u26a0 SDLC PLUGIN DETECTED \u2014 NOT RUNNING AS ORCHESTRATOR',
      '',
      'You launched claude without --agent orchestrator.',
      'This means:',
      '  \u2022 No SDLC governance pipeline',
      '  \u2022 No team composition from registry',
      '  \u2022 No backlog tracking or cost logging',
      '  \u2022 No review gates or safety checks',
      '  \u2022 Changes go directly to working tree (no worktree isolation)',
      '',
      'To use SDLC flow:  exit and run: p2s',
      'To continue anyway: this is fine for quick exploration/research',
    ].join('\n');

    const result = JSON.stringify({ result: warning });
    process.stdout.write(result);
  }

  process.exit(0);
}

main();
