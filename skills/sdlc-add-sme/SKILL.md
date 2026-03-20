---
name: sdlc-add-sme
description: Create subject matter expert agent
user-invocable: true
---

# /sdlc add-sme

Create a subject matter expert (SME) consultant agent.

## Process
1. Ask expertise area (e.g., "PostgreSQL", "React 19", "fintech")
2. Generate SME agent from template:
   ```
   ---
   name: {topic}-sme
   description: Subject matter expert for {topic}
   model: opus
   tools: Read, Glob, Grep
   permissionMode: plan
   maxTurns: 20
   ---
   You are a subject matter expert on {topic}.
   Provide advice when consulted by other agents.
   You do NOT write code directly — you advise.
   ```
3. Register in `.sdlc/registry.yaml` as consultant tier
