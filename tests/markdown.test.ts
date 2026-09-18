import { describe, expect, it } from 'vitest';
import { buildAgentMarkdown, buildSkillMarkdown, renderMarkdown } from '../src/lib/markdown';
import { makeAgent, makeProject, makeSkill } from './fixtures';

describe('buildAgentMarkdown', () => {
  it('generates the agent frontmatter, selected skills and internal skill links', () => {
    const project = makeProject();
    const markdown = buildAgentMarkdown(project.agents[0], project);

    expect(markdown).toContain('name: "Reviewer"');
    expect(markdown).toContain('description: "Reviews implementation changes');
    expect(markdown).toContain('tools:\n  - "read"\n  - "grep"');
    expect(markdown).toContain('skills:\n  - "code-review"');
    expect(markdown).toContain('handoffs:');
    expect(markdown).toContain('send: true');
    expect(markdown).toContain('[code-review](../skills/code-review/SKILL.md)');
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('omits optional fields and unknown skill references', () => {
    const agent = makeAgent({
      name: '',
      argumentHint: '',
      target: '',
      model: '',
      tools: [],
      skillIds: ['missing'],
      handoffs: [],
      responsibilities: '',
      constraints: '',
      output: '',
      additionalInstructions: 'Always cite repository evidence.',
    });
    const markdown = buildAgentMarkdown(agent, makeProject({ agents: [agent] }));

    expect(markdown).not.toContain('\nname:');
    expect(markdown).not.toContain('argument-hint:');
    expect(markdown).not.toContain('tools:');
    expect(markdown).not.toContain('skills:');
    expect(markdown).toContain('Always cite repository evidence.');
  });
});

describe('buildSkillMarkdown', () => {
  it('generates frontmatter and grouped resource links', () => {
    const markdown = buildSkillMarkdown(makeSkill());

    expect(markdown).toContain('name: code-review');
    expect(markdown).toContain('license: "MIT"');
    expect(markdown).toContain('metadata:\n  "author": "Agent Forge"');
    expect(markdown).toContain('allowed-tools: "Read Grep Glob"');
    expect(markdown).toContain('### scripts/');
    expect(markdown).toContain('[scripts/check.py](scripts/check.py)');
    expect(markdown).toContain('### references/');
  });

  it('does not emit optional sections when they are empty', () => {
    const markdown = buildSkillMarkdown(makeSkill({
      license: '',
      compatibility: '',
      allowedTools: '',
      metadata: [],
      overview: '',
      examples: '',
      edgeCases: '',
      files: [],
      notes: 'Additional operational note.',
    }));

    expect(markdown).not.toContain('license:');
    expect(markdown).not.toContain('metadata:');
    expect(markdown).not.toContain('## Ressources');
    expect(markdown).toContain('Additional operational note.');
  });
});

describe('renderMarkdown', () => {
  it('strips frontmatter and renders common markdown primitives', () => {
    const html = renderMarkdown(`---\nname: test\n---\n# Title\n\n- one\n- **two**\n\n1. first\n\n> quote\n\n\`inline\` and *em*\n\n\`\`\`ts\nconst a = '<x>';\n\`\`\``);

    expect(html).not.toContain('name: test');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<strong>two</strong>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<blockquote>quote</blockquote>');
    expect(html).toContain('<code>inline</code>');
    expect(html).toContain('&lt;x&gt;');
  });

  it('allows safe links and blocks custom URI schemes', () => {
    const html = renderMarkdown('[web](https://example.com)\n[mail](mailto:test@example.com)\n[local](../skills/demo/SKILL.md)\n[unsafe](javascript:alert(1))');

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="mailto:test@example.com"');
    expect(html).toContain('href="../skills/demo/SKILL.md"');
    expect(html).toContain('href="#"');
  });

  it('closes an unterminated code fence safely', () => {
    expect(renderMarkdown('```\n<script>')).toContain('&lt;script&gt;');
  });
});
