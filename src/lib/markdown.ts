import type { AgentDefinition, ProjectState, SkillDefinition } from './types';

const yamlScalar = (value: string) => JSON.stringify(value);
const block = (title: string, value: string) => value.trim() ? `## ${title}\n\n${value.trim()}\n` : '';

export function buildAgentMarkdown(agent: AgentDefinition, project: ProjectState): string {
  const skills = agent.skillIds
    .map((id) => project.skills.find((skill) => skill.id === id))
    .filter(Boolean) as SkillDefinition[];

  const yaml: string[] = ['---'];
  if (agent.name.trim()) yaml.push(`name: ${yamlScalar(agent.name.trim())}`);
  yaml.push(`description: ${yamlScalar(agent.description.trim())}`);
  if (agent.argumentHint.trim()) yaml.push(`argument-hint: ${yamlScalar(agent.argumentHint.trim())}`);
  if (agent.target) yaml.push(`target: ${agent.target}`);
  if (agent.model.trim()) yaml.push(`model: ${yamlScalar(agent.model.trim())}`);
  if (agent.tools.length) {
    yaml.push('tools:');
    agent.tools.forEach((tool) => yaml.push(`  - ${yamlScalar(tool)}`));
  }
  if (skills.length) {
    yaml.push('skills:');
    skills.forEach((skill) => yaml.push(`  - ${yamlScalar(skill.name)}`));
  }
  yaml.push(`user-invocable: ${agent.userInvocable ? 'true' : 'false'}`);
  yaml.push(`disable-model-invocation: ${agent.disableModelInvocation ? 'true' : 'false'}`);
  if (agent.handoffs.length) {
    yaml.push('handoffs:');
    for (const handoff of agent.handoffs) {
      yaml.push(`  - label: ${yamlScalar(handoff.label.trim())}`);
      yaml.push(`    agent: ${yamlScalar(handoff.agent.trim())}`);
      if (handoff.prompt.trim()) yaml.push(`    prompt: ${yamlScalar(handoff.prompt.trim())}`);
      if (handoff.send) yaml.push('    send: true');
      if (handoff.model.trim()) yaml.push(`    model: ${yamlScalar(handoff.model.trim())}`);
    }
  }
  yaml.push('---', '');

  let body = '';
  body += block('Mission', agent.mission);
  body += block('Responsabilités', agent.responsibilities);
  body += block('Workflow', agent.workflow);
  body += block('Contraintes et garde-fous', agent.constraints);
  body += block('Contrat de sortie', agent.output);

  if (skills.length) {
    body += '## Skills\n\n';
    for (const skill of skills) {
      body += `- Utilise [${skill.name}](../skills/${skill.name}/SKILL.md) — ${skill.description.trim()}\n`;
    }
    body += '\n';
  }

  if (agent.additionalInstructions.trim()) body += `${agent.additionalInstructions.trim()}\n`;
  return `${yaml.join('\n')}${body}`.trimEnd() + '\n';
}

export function buildSkillMarkdown(skill: SkillDefinition): string {
  const yaml: string[] = ['---', `name: ${skill.name.trim()}`, `description: ${yamlScalar(skill.description.trim())}`];
  if (skill.license.trim()) yaml.push(`license: ${yamlScalar(skill.license.trim())}`);
  if (skill.compatibility.trim()) yaml.push(`compatibility: ${yamlScalar(skill.compatibility.trim())}`);
  if (skill.metadata.length) {
    yaml.push('metadata:');
    for (const item of skill.metadata.filter((item) => item.key.trim() && item.value.trim())) {
      yaml.push(`  ${yamlScalar(item.key.trim())}: ${yamlScalar(item.value.trim())}`);
    }
  }
  if (skill.allowedTools.trim()) yaml.push(`allowed-tools: ${yamlScalar(skill.allowedTools.trim())}`);
  yaml.push('---', '');

  let body = '';
  body += block('Objectif', skill.overview);
  body += block('Instructions', skill.instructions);
  body += block('Exemples', skill.examples);
  body += block('Cas limites et gestion des erreurs', skill.edgeCases);

  if (skill.files.length) {
    body += '## Ressources\n\n';
    const groups = new Map<string, typeof skill.files>();
    for (const file of skill.files) {
      const group = file.path.split('/')[0];
      groups.set(group, [...(groups.get(group) || []), file]);
    }
    for (const [group, files] of groups) {
      body += `### ${group}/\n\n`;
      for (const file of files) body += `- [${file.path}](${file.path})\n`;
      body += '\n';
    }
  }

  if (skill.notes.trim()) body += `${skill.notes.trim()}\n`;
  return `${yaml.join('\n')}${body}`.trimEnd() + '\n';
}

function escapeHtml(input: string) {
  return input.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function inlineMarkdown(input: string) {
  let escaped = escapeHtml(input);
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => `<a href="${safeHref(href)}">${label}</a>`);
  return escaped;
}

function safeHref(rawHref: string) {
  const href = rawHref.trim();
  if (/^(https?:|mailto:)/i.test(href)) return escapeHtml(href);
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return '#';
  return escapeHtml(href || '#');
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/^---\n[\s\S]*?\n---\n?/, '').split('\n');
  const out: string[] = [];
  let inCode = false;
  let code: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (listType) out.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      closeList();
      if (!inCode) {
        inCode = true;
        code = [];
      } else {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const ul = /^\s*[-*]\s+(.+)$/.exec(line);
    if (ul) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inlineMarkdown(ul[1])}</li>`);
      continue;
    }
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ol) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inlineMarkdown(ol[1])}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) continue;
    if (line.startsWith('> ')) out.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`);
    else out.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeList();
  if (inCode) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  return out.join('\n');
}
