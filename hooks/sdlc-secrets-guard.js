#!/usr/bin/env node
'use strict';

/**
 * SDLC Secrets Guard — PreToolUse hook
 * Blocks read/write access to sensitive files (credentials, keys, secrets).
 */

const TOOLS_WITH_FILE_PATH = ['Read', 'Edit', 'Write'];
const TOOLS_WITH_PATTERN = ['Glob'];
const TOOLS_WITH_COMMAND = ['Bash'];
const CHECKED_TOOLS = [...TOOLS_WITH_FILE_PATH, ...TOOLS_WITH_PATTERN, ...TOOLS_WITH_COMMAND];

// Write-only blocked patterns (in addition to never-read)
const WRITE_ONLY_PATTERNS = [
  /(?:^|[\\/]).npmrc$/i,
  /(?:^|[\\/]).pypirc$/i,
];

// Never-read patterns (also blocked on write)
const NEVER_READ_PATTERNS = [
  // .env files (but not .env.example or .env.template)
  /(?:^|[\\/])\.env(?:\..+)?$/i,
  // credentials
  /(?:^|[\\/])credentials/i,
  // secrets directory
  /[\\/]secrets[\\/]/i,
  // key/cert files
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  // service account / gcloud keys
  /(?:^|[\\/])service-account[^\\\/]*\.json$/i,
  /(?:^|[\\/])gcloud-key[^\\\/]*\.json$/i,
  // files with "secret" in name
  /secret/i,
  // SSH keys
  /(?:^|[\\/])id_rsa/i,
  /(?:^|[\\/])id_ed25519/i,
];

// Exception patterns (always allowed)
function isException(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  // .env.example and .env.template are always OK
  if (/(?:^|[\\/])\.env\.example$/i.test(filePath)) return true;
  if (/(?:^|[\\/])\.env\.template$/i.test(filePath)) return true;
  // docs about secrets are OK
  if (/^docs[\\/\/]/i.test(normalized) || /[\\/\/]docs[\\/\/]/i.test(normalized)) {
    return true;
  }
  return false;
}

// Bash command patterns that could expose secrets.
// NOTE: This is best-effort. Bash-based exfiltration cannot be fully prevented
// since commands can be obfuscated, aliased, or piped in countless ways.
const BASH_SECRET_FILE_PATTERNS = [
  /\.env(?!\.\w*example)(?!\.\w*template)(?:\s|$|['"])/i,
  /\.pem(?:\s|$|['"])/i,
  /\.key(?:\s|$|['"])/i,
  /credentials/i,
  /secrets\//i,
  /id_rsa/i,
  /id_ed25519/i,
  /service-account/i,
  /gcloud-key/i,
];

const BASH_ENV_EXPOSURE_PATTERNS = [
  /\bprintenv\b/,
  /\benv\s*\|/,
  /\bset\s*\|/,
  /\becho\s+\$/,
  /\becho\s+"\$/,
  /\bsource\s+\.env\b/,
];

function isBashCommandBlocked(command) {
  if (!command) return false;

  // Check for exception patterns first — .env.example / .env.template are OK
  if (/\.env\.example/i.test(command) && !BASH_SECRET_FILE_PATTERNS.some((p) => {
    // Only match if there's a secret file pattern that isn't the exception
    const withoutExceptions = command.replace(/\.env\.example/gi, '').replace(/\.env\.template/gi, '');
    return p.test(withoutExceptions);
  })) {
    return false;
  }
  if (/\.env\.template/i.test(command) && !BASH_SECRET_FILE_PATTERNS.some((p) => {
    const withoutExceptions = command.replace(/\.env\.example/gi, '').replace(/\.env\.template/gi, '');
    return p.test(withoutExceptions);
  })) {
    return false;
  }

  // Check for secret file access patterns
  for (const pattern of BASH_SECRET_FILE_PATTERNS) {
    if (pattern.test(command)) return true;
  }

  // Check for environment variable exposure
  for (const pattern of BASH_ENV_EXPOSURE_PATTERNS) {
    if (pattern.test(command)) return true;
  }

  return false;
}

function isBlocked(filePath, toolName) {
  if (isException(filePath)) return false;

  // Check never-read patterns (apply to all checked tools)
  for (const pattern of NEVER_READ_PATTERNS) {
    if (pattern.test(filePath)) return true;
  }

  // Check write-only patterns (apply to Edit, Write)
  if (toolName === 'Edit' || toolName === 'Write') {
    for (const pattern of WRITE_ONLY_PATTERNS) {
      if (pattern.test(filePath)) return true;
    }
  }

  return false;
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
      // Can't parse input, allow by default
      process.exit(0);
      return;
    }

    const toolName = data.tool_name;
    if (!CHECKED_TOOLS.includes(toolName)) {
      process.exit(0);
      return;
    }

    const toolInput = data.tool_input || {};

    // Handle Bash tool separately — inspect the command string
    if (TOOLS_WITH_COMMAND.includes(toolName)) {
      const command = toolInput.command || '';
      if (isBashCommandBlocked(command)) {
        const result = JSON.stringify({
          decision: 'block',
          reason: `SDLC secrets guard: Bash command may access secrets — ${command}`,
        });
        process.stdout.write(result);
        process.exit(2);
      } else {
        process.exit(0);
      }
      return;
    }

    let filePath;

    if (TOOLS_WITH_FILE_PATH.includes(toolName)) {
      filePath = toolInput.file_path || '';
    } else if (toolName === 'Glob') {
      filePath = toolInput.pattern || '';
    }

    if (!filePath) {
      process.exit(0);
      return;
    }

    if (isBlocked(filePath, toolName)) {
      const result = JSON.stringify({
        decision: 'block',
        reason: `SDLC secrets guard: ${filePath} matches protected pattern`,
      });
      process.stdout.write(result);
      process.exit(2);
    } else {
      process.exit(0);
    }
  });
}

main();
