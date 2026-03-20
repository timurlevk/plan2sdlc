import fs from 'fs/promises';
import path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface AgentFrontmatter {
  name: string;
  description: string;
  model?: string;
  tools?: string;
  isolation?: string;
  permissionMode?: string;
  maxTurns?: number;
}

export interface RegistryEntry {
  name: string;
  description: string;
  category: string;
  tier: string;
  model: string;
  tools: string[];
  domains: string[];
  status: string;
  source: string;
}

/**
 * Parse YAML frontmatter from a markdown file.
 */
export function parseFrontmatter(content: string): AgentFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  return parseYaml(match[1]!) as AgentFrontmatter;
}

/**
 * Infer category from the file path relative to the agent directory.
 * E.g., "catalog/governance/orchestrator.md" -> "governance"
 */
function inferCategory(relativePath: string): string {
  const parts = relativePath.split(/[/\\]/);
  if (parts.length >= 2) {
    return parts[parts.length - 2]!;
  }
  return 'general';
}

/**
 * Infer tier from agent name and model.
 */
function inferTier(name: string, model?: string): string {
  if (name === 'orchestrator') return 'orchestrator';
  if (name.endsWith('-sme')) return 'consultant';
  if (model === 'opus') return 'lead';
  return 'worker';
}

/**
 * Infer domains from agent name.
 */
function inferDomains(name: string): string[] {
  const parts = name.split('-');
  if (parts.length >= 2) {
    const role = parts[parts.length - 1];
    const knownRoles = [
      'developer',
      'tester',
      'reviewer',
      'sme',
      'lead',
      'auditor',
      'analyst',
    ];
    if (knownRoles.includes(role!)) {
      const domain = parts.slice(0, -1).join('-');
      if (domain && domain !== 'code' && domain !== 'tech') {
        return [domain];
      }
    }
  }
  return ['global'];
}

/**
 * Recursively find all .md files in a directory.
 */
async function findMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findMarkdownFiles(fullPath);
      results.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Scan agent files and build registry.
 */
export async function buildRegistry(
  agentDir: string,
  outputPath: string,
): Promise<RegistryEntry[]> {
  const files = await findMarkdownFiles(agentDir);
  const entries: RegistryEntry[] = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter || !frontmatter.name) continue;

    const relativePath = path.relative(agentDir, file);
    const category = inferCategory(relativePath);
    const tier = inferTier(frontmatter.name, frontmatter.model);
    const tools = frontmatter.tools
      ? frontmatter.tools.split(',').map((t) => t.trim())
      : [];
    const domains = inferDomains(frontmatter.name);

    entries.push({
      name: frontmatter.name,
      description: frontmatter.description,
      category,
      tier,
      model: frontmatter.model || 'sonnet',
      tools,
      domains,
      status: 'active',
      source: relativePath.replace(/\\/g, '/'),
    });
  }

  // Sort by name for deterministic output
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const registry = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    agents: entries,
  };

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(outputPath, stringifyYaml(registry), 'utf-8');
  return entries;
}

// CLI entry point
if (process.argv[1]?.endsWith('registry-builder.ts')) {
  const agentDir = process.argv[2] || '.claude/agents';
  const output = process.argv[3] || '.sdlc/registry.yaml';
  buildRegistry(agentDir, output).then(() =>
    console.log(`Registry written to ${output}`),
  );
}
