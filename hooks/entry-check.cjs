#!/usr/bin/env node
'use strict';

/**
 * SDLC Entry Check — SessionStart hook
 * 1. Detects if SDLC is not initialized → suggests /sdlc init
 * 2. Warns when not running as orchestrator
 * 3. Injects SDLC state when orchestrator starts with SDLC initialized
 */

const fs = require('fs');
const path = require('path');

/**
 * Simple line-by-line YAML parser for flat and one-level-nested key-value pairs.
 * No external dependencies. Returns a plain object.
 */
function parseSimpleYaml(text) {
  var result = {};
  if (!text) return result;

  var lines = text.split('\n');
  var currentSection = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#')) continue;

    var indent = line.length - trimmed.length;

    var colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      if (trimmed.startsWith('- ') && currentSection) {
        if (!Array.isArray(result[currentSection])) {
          result[currentSection] = [];
        }
        result[currentSection].push(trimmed.slice(2).trim());
      }
      continue;
    }

    var key = trimmed.slice(0, colonIdx).trim();
    var valueRaw = trimmed.slice(colonIdx + 1).trim();

    if (indent === 0) {
      if (valueRaw === '' || valueRaw === '|' || valueRaw === '>') {
        currentSection = key;
        if (!result[currentSection]) {
          result[currentSection] = {};
        }
      } else {
        result[key] = stripYamlQuotes(valueRaw);
        currentSection = null;
      }
    } else if (currentSection && indent > 0) {
      var sectionObj = result[currentSection];
      if (typeof sectionObj === 'object' && !Array.isArray(sectionObj)) {
        if (valueRaw === '' || valueRaw === '|' || valueRaw === '>') {
          sectionObj[key] = {};
        } else {
          sectionObj[key] = stripYamlQuotes(valueRaw);
        }
      }
    }
  }

  return result;
}

function stripYamlQuotes(val) {
  if ((val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  return val;
}

/**
 * Parse the domains: section from config.yaml.
 * Returns { domainName: { path, ...otherKeys } }
 */
function parseDomains(text) {
  var domains = {};
  if (!text) return domains;

  var lines = text.split('\n');
  var inDomains = false;
  var currentDomain = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#')) continue;

    var indent = line.length - trimmed.length;

    if (indent === 0 && trimmed.startsWith('domains:')) {
      inDomains = true;
      continue;
    }

    if (indent === 0 && inDomains) {
      inDomains = false;
      currentDomain = null;
      continue;
    }

    if (!inDomains) continue;

    var colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    var key = trimmed.slice(0, colonIdx).trim();
    var valueRaw = trimmed.slice(colonIdx + 1).trim();

    if (indent === 2 && (valueRaw === '' || valueRaw === '|' || valueRaw === '>')) {
      currentDomain = key;
      domains[currentDomain] = {};
      continue;
    }

    if (currentDomain && indent >= 4) {
      domains[currentDomain][key] = stripYamlQuotes(valueRaw);
    }
  }

  return domains;
}

/**
 * Parse registry.yaml and count agents per domain.
 * Returns { domainName: count }
 */
function countAgentsPerDomain(text) {
  var counts = {};
  if (!text) return counts;

  var lines = text.split('\n');
  var inAgents = false;
  var expectingDomainProps = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#')) continue;

    var indent = line.length - trimmed.length;

    if (trimmed.startsWith('agents:') && indent === 0) {
      inAgents = true;
      continue;
    }

    if (indent === 0 && inAgents && !trimmed.startsWith('-')) {
      inAgents = false;
      continue;
    }

    if (!inAgents) continue;

    if (trimmed === 'domain:') {
      expectingDomainProps = true;
      continue;
    }

    if (expectingDomainProps && trimmed.startsWith('name:')) {
      var domainName = trimmed.slice(5).trim();
      if (domainName) {
        var cleaned = stripYamlQuotes(domainName);
        counts[cleaned] = (counts[cleaned] || 0) + 1;
      }
      expectingDomainProps = false;
      continue;
    }

    if (trimmed.startsWith('- ')) {
      expectingDomainProps = false;
    }
  }

  return counts;
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (_e) {
    return null;
  }
}

function readJsonSafe(filePath, defaultVal) {
  try {
    var content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (_e) {
    return defaultVal;
  }
}

/**
 * Build a compact SDLC state injection payload for the orchestrator.
 * Reads config.yaml, state.json, backlog.json, and registry.yaml from .sdlc/
 */
function buildStateInjection(sdlcDir) {
  // 1. Read config.yaml
  var configText = readFileSafe(path.join(sdlcDir, 'config.yaml'));
  var config = parseSimpleYaml(configText || '');
  var domains = parseDomains(configText || '');

  var projectSection = config.project || {};
  var projectName = projectSection.name || path.basename(path.dirname(sdlcDir));

  // 2. Read state.json
  var state = readJsonSafe(path.join(sdlcDir, 'state.json'), {
    activeWorkflows: [],
  });

  // 3. Read backlog.json
  var backlog = readJsonSafe(path.join(sdlcDir, 'backlog.json'), { items: [] });

  // 4. Read registry.yaml
  var registryText = readFileSafe(path.join(sdlcDir, 'registry.yaml'));
  var agentCounts = countAgentsPerDomain(registryText || '');

  // --- Format payload ---

  // Active workflows
  var workflowLines;
  var workflows = state.activeWorkflows || [];
  if (workflows.length === 0) {
    workflowLines = 'None';
  } else {
    workflowLines = workflows.map(function(wf) {
      var id = wf.id || '?';
      var session = wf.currentSession || '?';
      var item = wf.backlogItemId || '';
      var wave = wf.context && wf.context.currentWave != null
        ? ' wave ' + wf.context.currentWave
        : '';
      return '- ' + id + ': ' + session + (item ? ' (' + item + ')' : '') + wave;
    }).join('\n');
  }

  // Backlog summary
  var items = backlog.items || [];
  var statusCounts = { inbox: 0, executing: 0, reviewing: 0, blocked: 0 };
  for (var i = 0; i < items.length; i++) {
    var s = (items[i].status || '').toLowerCase();
    if (s === 'inbox' || s === 'new' || s === 'pending') statusCounts.inbox++;
    else if (s === 'executing' || s === 'in-progress' || s === 'in_progress') statusCounts.executing++;
    else if (s === 'reviewing' || s === 'review' || s === 'in-review' || s === 'in_review') statusCounts.reviewing++;
    else if (s === 'blocked') statusCounts.blocked++;
  }

  // Domain map
  var domainLines;
  var domainNames = Object.keys(domains);
  if (domainNames.length === 0) {
    var registryDomains = Object.keys(agentCounts);
    if (registryDomains.length === 0) {
      domainLines = 'No domains configured';
    } else {
      domainLines = registryDomains.map(function(d) {
        return d + ': (' + (agentCounts[d] || 0) + ' agents)';
      }).join('\n');
    }
  } else {
    domainLines = domainNames.map(function(d) {
      var domainPath = domains[d].path || '?';
      var count = agentCounts[d] || 0;
      return d + ': ' + domainPath + ' (' + count + ' agents)';
    }).join('\n');
  }

  var payload = [
    '=== SDLC STATE (EXTREMELY_IMPORTANT) ===',
    'Project: ' + projectName,
    'Mode: initialized',
    'Version: claude-sdlc v2.0.0',
    '',
    '## Active Workflows',
    workflowLines,
    '',
    '## Backlog Summary',
    '- Inbox: ' + statusCounts.inbox + ' | Executing: ' + statusCounts.executing + ' | Reviewing: ' + statusCounts.reviewing + ' | Blocked: ' + statusCounts.blocked,
    '',
    '## Domain Map',
    domainLines,
    '',
    '## Rules',
    '- Orchestrator MUST NOT edit files directly',
    '- All changes go through domain agents',
    '- Domain agents are constrained to their domain path',
    '- Review gate is mandatory before merge',
    '- HITL required for: blocked tasks, cross-domain conflicts',
    '=== END SDLC STATE ===',
  ].join('\n');

  return payload;
}

/**
 * Ensure MCP registry dependencies are installed (runs once).
 * Checks for node_modules in mcp/registry/ and installs if missing.
 */
function ensureMcpDeps() {
  var pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
  if (!pluginRoot) return;

  var mcpDir = path.join(pluginRoot, 'mcp', 'registry');
  var pkgJson = path.join(mcpDir, 'package.json');
  var nodeModules = path.join(mcpDir, 'node_modules');

  if (!fs.existsSync(pkgJson)) return;
  if (fs.existsSync(nodeModules)) return;

  // Install dependencies silently
  try {
    var execSync = require('child_process').execSync;
    execSync('npm install --production --silent', {
      cwd: mcpDir,
      stdio: 'ignore',
      timeout: 60000,
    });
  } catch (_e) {
    // Silently ignore — MCP server will self-gate if deps missing
  }
}

/**
 * Check if user's generated agents are outdated vs plugin version.
 * If mismatch found, warn the user.
 */
function checkAgentVersions() {
  var pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
  if (!pluginRoot) return null;

  var cwd = process.env.SDLC_PROJECT_DIR || process.cwd();
  var agentsDir = path.join(cwd, '.claude', 'agents');
  if (!fs.existsSync(agentsDir)) return null;

  // Read plugin version
  var pluginPkgPath = path.join(pluginRoot, 'package.json');
  var pluginVersion = '0.0.0';
  try {
    var pkg = JSON.parse(fs.readFileSync(pluginPkgPath, 'utf-8'));
    pluginVersion = pkg.version || '0.0.0';
  } catch (_e) { return null; }

  // Check each agent file for generated-by comment
  var outdated = [];
  var obsoleteOrchestrator = false;
  try {
    var files = fs.readdirSync(agentsDir);
    for (var i = 0; i < files.length; i++) {
      if (!files[i].endsWith('.md')) continue;
      var content = fs.readFileSync(path.join(agentsDir, files[i]), 'utf-8');

      // Check if this is a locally generated orchestrator (should not exist)
      if (files[i] === 'orchestrator.md' || content.includes('name: claude-sdlc:orchestrator') || content.includes('name: orchestrator')) {
        obsoleteOrchestrator = true;
      }

      // Check generated-by version
      var match = content.match(/# generated-by: claude-sdlc@([^\s]+)/);
      if (match) {
        var agentVersion = match[1];
        if (agentVersion !== pluginVersion) {
          outdated.push(files[i] + ' (v' + agentVersion + ')');
        }
      }
    }
  } catch (_e) { return null; }

  var warnings = [];
  if (obsoleteOrchestrator) {
    warnings.push('LOCAL ORCHESTRATOR DETECTED: .claude/agents/orchestrator.md overrides the plugin orchestrator. Delete it to use the latest plugin version.');
  }
  if (outdated.length > 0) {
    warnings.push('OUTDATED AGENTS (plugin is v' + pluginVersion + '): ' + outdated.join(', ') + '. Run /sdlc init to regenerate.');
  }

  return warnings.length > 0 ? warnings.join('\n') : null;
}

function main() {
  // Ensure MCP registry deps on every session start
  ensureMcpDeps();

  var agentName = process.env.CLAUDE_AGENT_NAME || '';
  var cwd = process.env.SDLC_PROJECT_DIR || process.cwd();
  var sdlcDir = path.join(cwd, '.sdlc');
  var sdlcExists = fs.existsSync(sdlcDir) && fs.existsSync(path.join(sdlcDir, 'config.yaml'));

  // Case 1: SDLC not initialized — suggest init
  if (!sdlcExists) {
    var welcome = [
      '\u2728 CLAUDE SDLC PLUGIN INSTALLED',
      '',
      'SDLC is not initialized for this project yet.',
      '',
      'To get started:',
      '  1. Run: claude --agent claude-sdlc:orchestrator',
      '  2. Type: /sdlc init',
      '',
      'This will scan your project, detect tech stack and domains,',
      'and set up the SDLC governance pipeline.',
      '',
      'Quick start:  /sdlc init',
      'Full docs:    /sdlc help',
      '',
      'claude-sdlc by Plan2Skill \u2014 https://plan2skill.com',
    ].join('\n');

    var result = JSON.stringify({ result: welcome });
    process.stdout.write(result);
    process.exit(0);
    return;
  }

  // Case 2: SDLC initialized but not running as orchestrator
  if (agentName !== 'orchestrator') {
    var warning = [
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
      'To use SDLC flow:  exit and run: claude --agent claude-sdlc:orchestrator',
      'To continue anyway: this is fine for quick exploration/research',
      '',
      'claude-sdlc by Plan2Skill \u2014 https://plan2skill.com',
    ].join('\n');

    var result2 = JSON.stringify({ result: warning });
    process.stdout.write(result2);
    process.exit(0);
    return;
  }

  // Case 3: Running as orchestrator with SDLC initialized — inject state
  var payload = buildStateInjection(sdlcDir);

  // Check for outdated agents
  var versionWarning = checkAgentVersions();
  if (versionWarning) {
    payload = payload + '\n\n## AGENT VERSION WARNING\n' + versionWarning;
  }

  var result3 = JSON.stringify({ result: payload });
  process.stdout.write(result3);
  process.exit(0);
}

main();
