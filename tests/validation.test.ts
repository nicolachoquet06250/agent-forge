import { describe, expect, it } from 'vitest';
import { hasErrors, validateAgent, validateSkill } from '../src/lib/validation';
import { makeAgent, makeProject, makeSkill } from './fixtures';

describe('validateSkill', () => {
  it('accepts a complete skill without blocking errors', () => {
    const issues = validateSkill(makeSkill());
    expect(hasErrors(issues)).toBe(false);
  });

  it('rejects invalid names, oversized fields and malformed metadata/resources', () => {
    const skill = makeSkill({
      name: '-Bad--Skill-',
      description: 'too short',
      compatibility: 'x'.repeat(501),
      metadata: [
        { key: 'duplicate', value: 'one' },
        { key: 'duplicate', value: 'two' },
        { key: '', value: '' },
      ],
      instructions: '',
      examples: '',
      edgeCases: '',
      files: [
        { id: '1', path: '../secret.txt', content: '' },
        { id: '2', path: 'scripts/deep/tool.py', content: '' },
        { id: '3', path: 'scripts/deep/tool.py', content: '' },
      ],
    });
    const codes = validateSkill(skill).map((issue) => issue.code);

    expect(codes).toContain('skill.name.format');
    expect(codes).toContain('skill.description.precision');
    expect(codes).toContain('skill.description.when');
    expect(codes).toContain('skill.compatibility.max');
    expect(codes).toContain('skill.metadata.duplicate');
    expect(codes).toContain('skill.metadata.empty');
    expect(codes).toContain('skill.instructions.required');
    expect(codes).toContain('skill.file.path');
    expect(codes).toContain('skill.file.depth');
    expect(codes).toContain('skill.file.duplicate');
    expect(hasErrors(validateSkill(skill))).toBe(true);
  });

  it('warns when operational resources are not referenced by instructions', () => {
    const issues = validateSkill(makeSkill({
      instructions: 'Perform the task carefully.',
      notes: '',
      files: [{ id: '1', path: 'scripts/check.py', content: '' }],
    }));
    expect(issues.some((issue) => issue.code === 'skill.file.unreferenced')).toBe(true);
  });

  it('checks long generated skill bodies for progressive disclosure warnings', () => {
    const huge = Array.from({ length: 520 }, (_, index) => `Step ${index}: ${'x'.repeat(45)}`).join('\n');
    const codes = validateSkill(makeSkill({ instructions: huge })).map((issue) => issue.code);
    expect(codes).toContain('skill.progressive.lines');
    expect(codes).toContain('skill.progressive.tokens');
  });
});

describe('validateAgent', () => {
  it('accepts a complete agent whose referenced skill is valid', () => {
    const project = makeProject();
    const issues = validateAgent(project.agents[0], project);
    expect(hasErrors(issues)).toBe(false);
  });

  it('reports required fields, invalid filename and incomplete handoffs', () => {
    const agent = makeAgent({
      fileName: 'bad name!',
      description: '',
      mission: '',
      workflow: '',
      constraints: '',
      output: '',
      tools: [],
      skillIds: [],
      handoffs: [{ id: 'h', label: '', agent: '', prompt: '', send: false, model: '' }],
    });
    const codes = validateAgent(agent, makeProject({ agents: [agent] })).map((issue) => issue.code);

    expect(codes).toContain('agent.filename.charset');
    expect(codes).toContain('agent.description.required');
    expect(codes).toContain('agent.mission.required');
    expect(codes).toContain('agent.workflow.required');
    expect(codes).toContain('agent.constraints.recommended');
    expect(codes).toContain('agent.output.recommended');
    expect(codes).toContain('agent.tools.least-privilege');
    expect(codes).toContain('agent.handoff.required');
  });

  it('reports target-specific warnings and missing or invalid referenced skills', () => {
    const invalidSkill = makeSkill({ id: 'skill-invalid', name: 'INVALID NAME' });
    const agent = makeAgent({
      target: 'github-copilot',
      argumentHint: 'argument',
      skillIds: ['missing', 'skill-invalid'],
    });
    const project = makeProject({ agents: [agent], skills: [invalidSkill] });
    const codes = validateAgent(agent, project).map((issue) => issue.code);

    expect(codes).toContain('agent.argumentHint.target');
    expect(codes).toContain('agent.handoffs.target');
    expect(codes).toContain('agent.skill.missing');
    expect(codes).toContain('agent.skill.invalid');
  });

  it('rejects agent bodies above 30,000 characters', () => {
    const agent = makeAgent({ additionalInstructions: 'x'.repeat(31_000), skillIds: [] });
    const codes = validateAgent(agent, makeProject({ agents: [agent], skills: [] })).map((issue) => issue.code);
    expect(codes).toContain('agent.body.max');
  });
});

describe('hasErrors', () => {
  it('only returns true for blocking errors', () => {
    expect(hasErrors([{ level: 'warning', code: 'w', message: 'warning' }])).toBe(false);
    expect(hasErrors([{ level: 'error', code: 'e', message: 'error' }])).toBe(true);
  });
});
