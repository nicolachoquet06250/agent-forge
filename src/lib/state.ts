import type { AgentDefinition, ProjectState, SkillDefinition } from './types';

const STORAGE_KEY = 'agent-skill-editor-project-v1';

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export function newSkill(seed = 1): SkillDefinition {
  return {
    id: uid(),
    name: seed === 1 ? 'my-skill' : `my-skill-${seed}`,
    description: '',
    license: '',
    compatibility: '',
    allowedTools: '',
    metadata: [],
    overview: '',
    instructions: '',
    examples: '',
    edgeCases: '',
    notes: '',
    files: [],
    updatedAt: now(),
  };
}

export function newAgent(seed = 1): AgentDefinition {
  return {
    id: uid(),
    fileName: seed === 1 ? 'my-agent' : `my-agent-${seed}`,
    name: '',
    description: '',
    argumentHint: '',
    target: '',
    model: '',
    tools: [],
    userInvocable: true,
    disableModelInvocation: false,
    mission: '',
    responsibilities: '',
    workflow: '',
    constraints: '',
    output: '',
    additionalInstructions: '',
    skillIds: [],
    handoffs: [],
    updatedAt: now(),
  };
}

export function emptyProject(): ProjectState {
  return { version: 1, agents: [newAgent()], skills: [newSkill()] };
}

export function loadProject(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProject();
    const parsed = JSON.parse(raw) as ProjectState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.agents) || !Array.isArray(parsed.skills)) {
      return emptyProject();
    }
    return parsed;
  } catch {
    return emptyProject();
  }
}

export function saveProject(project: ProjectState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function touch<T extends { updatedAt: string }>(value: T): T {
  value.updatedAt = now();
  return value;
}
