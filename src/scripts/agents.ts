import { base64Entry, createZip, downloadBlob, downloadText, textEntry } from '../lib/download';
import { buildAgentMarkdown, buildSkillMarkdown, renderMarkdown } from '../lib/markdown';
import { loadProject, newAgent, saveProject, touch, uid } from '../lib/state';
import type { AgentDefinition, ValidationIssue } from '../lib/types';
import { hasErrors, validateAgent, validateSkill } from '../lib/validation';

const q = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
let project = loadProject();
if (!project.agents.length) project.agents.push(newAgent());
saveProject(project);
const requested = new URLSearchParams(location.search).get('agent');
let currentId = project.agents.some((agent) => agent.id === requested) ? requested! : project.agents[0].id;
let activeTab: 'rendered' | 'source' = 'rendered';

const fields = {
  fileName: q<HTMLInputElement>('#agent-file'), name: q<HTMLInputElement>('#agent-name'), target: q<HTMLSelectElement>('#agent-target'),
  description: q<HTMLTextAreaElement>('#agent-description'), argumentHint: q<HTMLInputElement>('#agent-argument'), model: q<HTMLInputElement>('#agent-model'),
  userInvocable: q<HTMLInputElement>('#user-invocable'), disableModelInvocation: q<HTMLInputElement>('#disable-model'), mission: q<HTMLTextAreaElement>('#agent-mission'),
  responsibilities: q<HTMLTextAreaElement>('#agent-responsibilities'), workflow: q<HTMLTextAreaElement>('#agent-workflow'), constraints: q<HTMLTextAreaElement>('#agent-constraints'),
  output: q<HTMLTextAreaElement>('#agent-output'), additionalInstructions: q<HTMLTextAreaElement>('#agent-extra'),
};

function current(): AgentDefinition { return project.agents.find((agent) => agent.id === currentId)!; }
function statusClass(issues: ValidationIssue[]) { return issues.some((i) => i.level === 'error') ? 'error' : issues.some((i) => i.level === 'warning') ? 'warn' : 'ok'; }
function toast(message: string) { const el = q('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1800); }
function persist() { touch(current()); saveProject(project); q('#save-status').textContent = `Sauvegardé localement · ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`; }

function renderList() {
  q('#agent-list').innerHTML = project.agents.map((agent) => {
    const issues = validateAgent(agent, project);
    const title = agent.name.trim() || agent.fileName || 'Sans nom';
    return `<button class="doc-item ${agent.id === currentId ? 'active' : ''}" data-agent-id="${agent.id}"><span class="doc-icon">A</span><span class="doc-name"><strong>${escape(title)}</strong><small>${escape(agent.fileName || 'agent')}.agent.md</small></span><span class="status-dot ${statusClass(issues)}"></span></button>`;
  }).join('');
  q('#agent-list').querySelectorAll<HTMLElement>('[data-agent-id]').forEach((item) => item.addEventListener('click', () => { currentId = item.dataset.agentId!; history.replaceState(null, '', `/agents?agent=${currentId}`); renderAll(); }));
}

function fillForm() {
  const agent = current();
  fields.fileName.value = agent.fileName;
  fields.name.value = agent.name;
  fields.target.value = agent.target;
  fields.description.value = agent.description;
  fields.argumentHint.value = agent.argumentHint;
  fields.model.value = agent.model;
  fields.userInvocable.checked = agent.userInvocable;
  fields.disableModelInvocation.checked = agent.disableModelInvocation;
  fields.mission.value = agent.mission;
  fields.responsibilities.value = agent.responsibilities;
  fields.workflow.value = agent.workflow;
  fields.constraints.value = agent.constraints;
  fields.output.value = agent.output;
  fields.additionalInstructions.value = agent.additionalInstructions;
  q('#agent-description-count').textContent = String(agent.description.length);
  q('#editor-title').textContent = agent.name || `${agent.fileName || 'agent'}.agent.md`;
  renderTools(); renderSkills(); renderHandoffs();
}

function renderTools() {
  const agent = current();
  q('#tool-list').innerHTML = agent.tools.length ? agent.tools.map((tool, index) => `<span class="pill"><code>${escape(tool)}</code><button data-remove-tool="${index}" title="Retirer">×</button></span>`).join('') : '<span class="field-help">Aucun outil explicitement restreint.</span>';
  q('#tool-list').querySelectorAll<HTMLElement>('[data-remove-tool]').forEach((button) => button.addEventListener('click', () => { agent.tools.splice(Number(button.dataset.removeTool), 1); persist(); renderAll(); }));
}

function renderSkills() {
  const agent = current();
  const grid = q('#skills-grid');
  if (!project.skills.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">Aucun skill. Créez-en un dans l’éditeur de skills.</div>'; return; }
  grid.innerHTML = project.skills.map((skill) => {
    const invalid = validateSkill(skill).some((issue) => issue.level === 'error');
    return `<label class="check-card"><input type="checkbox" data-skill-id="${skill.id}" ${agent.skillIds.includes(skill.id) ? 'checked' : ''}/><span><strong>${escape(skill.name || 'Skill sans nom')}</strong><small>${escape(skill.description || 'Description manquante')}${invalid ? ' · ⚠ invalide' : ''}</small></span></label>`;
  }).join('');
  grid.querySelectorAll<HTMLInputElement>('[data-skill-id]').forEach((input) => input.addEventListener('change', () => {
    if (input.checked) agent.skillIds = [...new Set([...agent.skillIds, input.dataset.skillId!])];
    else agent.skillIds = agent.skillIds.filter((id) => id !== input.dataset.skillId);
    persist(); renderAll();
  }));
}

function renderHandoffs() {
  const agent = current();
  const list = q('#handoff-list');
  if (!agent.handoffs.length) { list.innerHTML = '<div class="empty-state">Aucun handoff. Ajoutez-en seulement si le workflow a une transition explicite vers un autre agent.</div>'; return; }
  list.innerHTML = agent.handoffs.map((h, index) => `<div class="repeater-row handoff" data-handoff="${h.id}">
    <div class="field"><label>Libellé</label><input class="input" data-handoff-field="label" value="${attr(h.label)}" placeholder="Start implementation" /></div>
    <div class="field"><label>Agent cible</label><input class="input" data-handoff-field="agent" value="${attr(h.agent)}" placeholder="implementation" /></div>
    <button class="icon-btn" data-remove-handoff="${index}" title="Supprimer">×</button>
    <div class="field wide"><label>Prompt transmis</label><textarea class="textarea" data-handoff-field="prompt" placeholder="Now implement the plan…">${escape(h.prompt)}</textarea></div>
    <div class="grid-2 wide"><div class="field"><label>Modèle du handoff</label><input class="input" data-handoff-field="model" value="${attr(h.model)}" placeholder="facultatif" /></div><div class="toggle-row"><div><strong>Envoi automatique</strong><small>Soumet le prompt directement.</small></div><label class="switch"><input type="checkbox" data-handoff-field="send" ${h.send ? 'checked' : ''}/><span></span></label></div></div>
  </div>`).join('');
  list.querySelectorAll<HTMLElement>('[data-remove-handoff]').forEach((button) => button.addEventListener('click', () => { agent.handoffs.splice(Number(button.dataset.removeHandoff), 1); persist(); renderAll(); }));
  list.querySelectorAll<HTMLElement>('[data-handoff]').forEach((row) => {
    const h = agent.handoffs.find((item) => item.id === row.dataset.handoff)!;
    row.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-handoff-field]').forEach((input) => input.addEventListener('input', () => {
      const key = input.dataset.handoffField as keyof typeof h;
      if (key === 'send' && input instanceof HTMLInputElement) h.send = input.checked;
      else if (key !== 'id' && key !== 'send') (h[key] as string) = input.value;
      persist(); renderPreview(); renderList();
    }));
  });
}

function renderValidation(issues: ValidationIssue[]) {
  const counts = { error: 0, warning: 0, success: 0 };
  issues.forEach((issue) => counts[issue.level]++);
  q('#validation-summary').innerHTML = `<div class="metric error"><strong>${counts.error}</strong><span>erreurs</span></div><div class="metric warning"><strong>${counts.warning}</strong><span>conseils</span></div><div class="metric success"><strong>${counts.success || (counts.error + counts.warning === 0 ? 1 : 0)}</strong><span>conforme</span></div>`;
  q('#validation-list').innerHTML = issues.map((issue) => `<div class="validation-item ${issue.level}"><span class="validation-icon">${issue.level === 'error' ? '×' : issue.level === 'warning' ? '!' : '✓'}</span><span>${escape(issue.message)}</span></div>`).join('');
}

function renderPreview() {
  const agent = current();
  const markdown = buildAgentMarkdown(agent, project);
  const issues = validateAgent(agent, project);
  renderValidation(issues);
  q('#source-preview').textContent = markdown;
  q('#source-filename').textContent = `${agent.fileName || 'agent'}.agent.md`;
  q('#render-preview').innerHTML = renderMarkdown(markdown);
  q('#render-preview').querySelectorAll<HTMLAnchorElement>('a[href^="../skills/"]').forEach((link) => {
    const match = /\.\.\/skills\/([^/]+)\/SKILL\.md/.exec(link.getAttribute('href') || '');
    const skill = match && project.skills.find((item) => item.name === decodeURIComponent(match[1]));
    if (skill) { link.href = `/skills?skill=${skill.id}`; link.title = 'Ouvrir ce skill dans l’éditeur'; }
  });
  const disabled = hasErrors(issues);
  (q<HTMLButtonElement>('#download-markdown')).disabled = disabled;
  (q<HTMLButtonElement>('#download-bundle')).disabled = disabled;
  const refs = agent.skillIds.length;
  q('#export-hint').textContent = disabled ? 'Corrigez les erreurs bloquantes avant l’export.' : refs ? `${refs} skill(s) référencé(s) seront inclus avec leurs scripts, références et assets.` : 'Aucun skill référencé : le bundle contiendra uniquement le fichier agent.';
}

function renderTabs() {
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === activeTab));
  q('#rendered-pane').classList.toggle('hidden', activeTab !== 'rendered');
  q('#source-pane').classList.toggle('hidden', activeTab !== 'source');
}
function renderAll() { renderList(); fillForm(); renderPreview(); renderTabs(); }

Object.entries(fields).forEach(([key, input]) => {
  const event = input instanceof HTMLInputElement && input.type === 'checkbox' ? 'change' : 'input';
  input.addEventListener(event, () => {
    const agent = current();
    if (key === 'userInvocable' || key === 'disableModelInvocation') (agent[key] as boolean) = (input as HTMLInputElement).checked;
    else (agent[key as keyof AgentDefinition] as string) = input.value;
    persist();
    q('#agent-description-count').textContent = String(agent.description.length);
    q('#editor-title').textContent = agent.name || `${agent.fileName || 'agent'}.agent.md`;
    renderPreview(); renderList();
  });
});

q('#add-tool').addEventListener('click', () => {
  const input = q<HTMLInputElement>('#tool-input');
  const tools = input.value.split(',').map((item) => item.trim()).filter(Boolean);
  if (tools.length) { current().tools = [...new Set([...current().tools, ...tools])]; input.value = ''; persist(); renderAll(); }
});
q<HTMLInputElement>('#tool-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); q<HTMLButtonElement>('#add-tool').click(); } });
q('#add-handoff').addEventListener('click', () => { current().handoffs.push({ id: uid(), label: '', agent: '', prompt: '', send: false, model: '' }); persist(); renderAll(); });
q('#new-agent').addEventListener('click', () => { const agent = newAgent(project.agents.length + 1); project.agents.push(agent); currentId = agent.id; saveProject(project); history.replaceState(null, '', `/agents?agent=${currentId}`); renderAll(); });
q('#delete-agent').addEventListener('click', () => {
  if (project.agents.length === 1) return toast('Conservez au moins un agent dans le workspace.');
  const label = current().name || current().fileName;
  if (!confirm(`Supprimer l’agent « ${label} » ?`)) return;
  project.agents = project.agents.filter((agent) => agent.id !== currentId);
  currentId = project.agents[0].id; saveProject(project); history.replaceState(null, '', `/agents?agent=${currentId}`); renderAll();
});

document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => button.addEventListener('click', () => { activeTab = button.dataset.tab as typeof activeTab; renderTabs(); }));
q('#copy-source').addEventListener('click', async () => { await navigator.clipboard.writeText(buildAgentMarkdown(current(), project)); toast('Markdown copié.'); });
q('#download-markdown').addEventListener('click', () => { const agent = current(); if (!hasErrors(validateAgent(agent, project))) downloadText(buildAgentMarkdown(agent, project), `${agent.fileName}.agent.md`); });
q('#download-bundle').addEventListener('click', () => {
  const agent = current();
  if (hasErrors(validateAgent(agent, project))) return;
  const entries = [textEntry(`agents/${agent.fileName}.agent.md`, buildAgentMarkdown(agent, project))];
  for (const skillId of agent.skillIds) {
    const skill = project.skills.find((item) => item.id === skillId);
    if (!skill) continue;
    entries.push(textEntry(`skills/${skill.name}/SKILL.md`, buildSkillMarkdown(skill)));
    for (const file of skill.files) entries.push(file.binary ? base64Entry(`skills/${skill.name}/${file.path}`, file.content) : textEntry(`skills/${skill.name}/${file.path}`, file.content));
  }
  downloadBlob(createZip(entries), `${agent.fileName}-bundle.zip`);
  toast('Bundle généré.');
});

function escape(value: string) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }
function attr(value: string) { return escape(value).replace(/`/g, '&#96;'); }

renderAll();
