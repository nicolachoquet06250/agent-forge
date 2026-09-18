export type ValidationLevel = 'error' | 'warning' | 'success';

export interface ValidationIssue {
  level: ValidationLevel;
  code: string;
  message: string;
  field?: string;
}

export interface SkillFile {
  id: string;
  path: string;
  content: string;
  binary?: boolean;
  mime?: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  license: string;
  compatibility: string;
  allowedTools: string;
  metadata: Array<{ key: string; value: string }>;
  overview: string;
  instructions: string;
  examples: string;
  edgeCases: string;
  notes: string;
  files: SkillFile[];
  updatedAt: string;
}

export interface HandoffDefinition {
  id: string;
  label: string;
  agent: string;
  prompt: string;
  send: boolean;
  model: string;
}

export interface AgentDefinition {
  id: string;
  fileName: string;
  name: string;
  description: string;
  argumentHint: string;
  target: '' | 'vscode' | 'github-copilot';
  model: string;
  tools: string[];
  userInvocable: boolean;
  disableModelInvocation: boolean;
  mission: string;
  responsibilities: string;
  workflow: string;
  constraints: string;
  output: string;
  additionalInstructions: string;
  skillIds: string[];
  handoffs: HandoffDefinition[];
  updatedAt: string;
}

export interface ProjectState {
  version: 1;
  agents: AgentDefinition[];
  skills: SkillDefinition[];
}
