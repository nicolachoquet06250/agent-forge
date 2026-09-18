import type { AgentDefinition, ProjectState, SkillDefinition } from '../src/lib/types';

export function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: 'skill-1',
    name: 'code-review',
    description: 'Use when reviewing source code for defects, security issues and maintainability problems.',
    license: 'MIT',
    compatibility: 'Node.js 22 or later',
    allowedTools: 'Read Grep Glob',
    metadata: [{ key: 'author', value: 'Agent Forge' }],
    overview: 'Review code changes and identify concrete issues.',
    instructions: '1. Read the changed files.\n2. Run scripts/check.py when static verification is required.\n3. Consult references/rules.md for project-specific rules.',
    examples: '- Input: a pull request diff\n- Output: actionable findings',
    edgeCases: 'Stop when the requested files are unavailable.',
    notes: '',
    files: [
      { id: 'file-1', path: 'scripts/check.py', content: 'print("ok")', mime: 'text/x-python' },
      { id: 'file-2', path: 'references/rules.md', content: '# Rules', mime: 'text/markdown' },
    ],
    updatedAt: '2026-09-18T10:00:00.000Z',
    ...overrides,
  };
}

export function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: 'agent-1',
    fileName: 'reviewer',
    name: 'Reviewer',
    description: 'Reviews implementation changes and reports concrete, actionable defects.',
    argumentHint: 'Files or pull request to review',
    target: 'vscode',
    model: 'gpt-5.6',
    tools: ['read', 'grep'],
    userInvocable: true,
    disableModelInvocation: false,
    mission: 'Review the requested implementation and identify defects that matter.',
    responsibilities: '- Inspect relevant code\n- Explain each finding',
    workflow: '1. Inspect the requested files.\n2. Apply the referenced skills.\n3. Return findings.',
    constraints: '- Do not invent missing code.\n- Prefer evidence from the repository.',
    output: 'Return concise findings with file references.',
    additionalInstructions: '',
    skillIds: ['skill-1'],
    handoffs: [
      { id: 'handoff-1', label: 'Implement fixes', agent: 'implementation', prompt: 'Implement accepted fixes.', send: true, model: 'gpt-5.6' },
    ],
    updatedAt: '2026-09-18T10:00:00.000Z',
    ...overrides,
  };
}

export function makeProject(overrides: Partial<ProjectState> = {}): ProjectState {
  const skill = makeSkill();
  const agent = makeAgent();
  return {
    version: 1,
    agents: [agent],
    skills: [skill],
    ...overrides,
  };
}
