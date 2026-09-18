import { base64Entry, createZip, downloadBlob, downloadText, textEntry } from '../lib/download';
import { buildSkillMarkdown, renderMarkdown } from '../lib/markdown';
import { loadProject, newSkill, saveProject, touch, uid } from '../lib/state';
import type { SkillDefinition, ValidationIssue } from '../lib/types';
import { hasErrors, validateSkill } from '../lib/validation';

const q = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
let project = loadProject();
if (!project.skills.length) project.skills.push(newSkill());
saveProject(project);
const requested = new URLSearchParams(location.search).get('skill');
let currentId = project.skills.some((skill) => skill.id === requested) ? requested! : project.skills[0].id;
let activeTab: 'rendered' | 'source' = 'rendered';

const fields = {
  name: q<HTMLInputElement>('#skill-name'), description: q<HTMLTextAreaElement>('#skill-description'), license: q<HTMLInputElement>('#skill-license'),
  compatibility: q<HTMLTextAreaElement>('#skill-compatibility'), allowedTools: q<HTMLInputElement>('#skill-allowed-tools'), overview: q<HTMLTextAreaElement>('#skill-overview'),
  instructions: q<HTMLTextAreaElement>('#skill-instructions'), examples: q<HTMLTextAreaElement>('#skill-examples'), edgeCases: q<HTMLTextAreaElement>('#skill-edge-cases'), notes: q<HTMLTextAreaElement>('#skill-notes'),
};

function current(): SkillDefinition { return project.skills.find((skill) => skill.id === currentId)!; }
function statusClass(issues: ValidationIssue[]) { return issues.some((i) => i.level === 'error') ? 'error' : issues.some((i) => i.level === 'warning') ? 'warn' : 'ok'; }
function toast(message: string) { const el = q('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1800); }
function persist() { touch(current()); saveProject(project); q('#save-status').textContent = `Sauvegardé localement · ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`; }

function renderList() {
  q('#skill-list').innerHTML = project.skills.map((skill) => {
    const issues = validateSkill(skill);
    return `<button class="doc-item ${skill.id === currentId ? 'active' : ''}" data-skill-id="${skill.id}"><span class="doc-icon">S</span><span class="doc-name"><strong>${escape(skill.name || 'Sans nom')}</strong><small>${escape(skill.name || 'skill')}/SKILL.md</small></span><span class="status-dot ${statusClass(issues)}"></span></button>`;
  }).join('');
  q('#skill-list').querySelectorAll<HTMLElement>('[data-skill-id]').forEach((item) => item.addEventListener('click', () => { currentId = item.dataset.skillId!; history.replaceState(null, '', `/skills?skill=${currentId}`); renderAll(); }));
}

function fillForm() {
  const skill = current();
  fields.name.value = skill.name;
  fields.description.value = skill.description;
  fields.license.value = skill.license;
  fields.compatibility.value = skill.compatibility;
  fields.allowedTools.value = skill.allowedTools;
  fields.overview.value = skill.overview;
  fields.instructions.value = skill.instructions;
  fields.examples.value = skill.examples;
  fields.edgeCases.value = skill.edgeCases;
  fields.notes.value = skill.notes;
  q('#skill-description-count').textContent = String(skill.description.length);
  q('#skill-compatibility-count').textContent = String(skill.compatibility.length);
  q('#editor-title').textContent = skill.name || 'Nouveau skill';
  renderMetadata(); renderFiles(); renderUsedBy();
}

function renderMetadata() {
  const skill = current();
  const list = q('#metadata-list');
  if (!skill.metadata.length) { list.innerHTML = '<div class="empty-state">Aucune métadonnée additionnelle.</div>'; return; }
  list.innerHTML = skill.metadata.map((item, index) => `<div class="repeater-row" data-meta="${index}"><div class="field"><label>Clé</label><input class="input" data-meta-field="key" value="${attr(item.key)}" placeholder="author" /></div><div class="field"><label>Valeur</label><input class="input" data-meta-field="value" value="${attr(item.value)}" placeholder="example-org" /></div><button class="icon-btn" data-remove-meta="${index}">×</button></div>`).join('');
  list.querySelectorAll<HTMLElement>('[data-remove-meta]').forEach((button) => button.addEventListener('click', () => { skill.metadata.splice(Number(button.dataset.removeMeta), 1); persist(); renderAll(); }));
  list.querySelectorAll<HTMLElement>('[data-meta]').forEach((row) => row.querySelectorAll<HTMLInputElement>('[data-meta-field]').forEach((input) => input.addEventListener('input', () => {
    const item = skill.metadata[Number(row.dataset.meta)];
    item[input.dataset.metaField as 'key' | 'value'] = input.value;
    persist(); renderPreview(); renderList();
  })));
}

function renderFiles() {
  const skill = current();
  const list = q('#file-list');
  if (!skill.files.length) { list.innerHTML = '<div class="empty-state">Aucune ressource. Un skill simple peut ne contenir que SKILL.md.</div>'; return; }
  list.innerHTML = skill.files.map((file, index) => `<div class="file-row" data-file-id="${file.id}">
    <div><code>${escape(file.path)}</code><small>${file.binary ? ' · binaire' : ' · texte'}${file.mime ? ` · ${escape(file.mime)}` : ''}</small></div>
    ${file.binary ? '' : `<button class="btn ghost" data-toggle-file="${file.id}">Éditer</button>`}
    <button class="icon-btn" data-remove-file="${index}" title="Supprimer">×</button>
    ${file.binary ? '' : `<div class="file-editor hidden" data-file-editor="${file.id}"><textarea class="textarea tall" spellcheck="false">${escape(file.content)}</textarea></div>`}
  </div>`).join('');
  list.querySelectorAll<HTMLElement>('[data-remove-file]').forEach((button) => button.addEventListener('click', () => { skill.files.splice(Number(button.dataset.removeFile), 1); persist(); renderAll(); }));
  list.querySelectorAll<HTMLElement>('[data-toggle-file]').forEach((button) => button.addEventListener('click', () => {
    const editor = list.querySelector<HTMLElement>(`[data-file-editor="${CSS.escape(button.dataset.toggleFile!)}"]`)!;
    editor.classList.toggle('hidden');
    button.textContent = editor.classList.contains('hidden') ? 'Éditer' : 'Fermer';
  }));
  list.querySelectorAll<HTMLElement>('[data-file-editor]').forEach((editor) => {
    const file = skill.files.find((item) => item.id === editor.dataset.fileEditor)!;
    editor.querySelector<HTMLTextAreaElement>('textarea')!.addEventListener('input', (event) => { file.content = (event.target as HTMLTextAreaElement).value; persist(); renderPreview(); });
  });
}

function renderUsedBy() {
  const agents = project.agents.filter((agent) => agent.skillIds.includes(currentId));
  q('#used-by').innerHTML = agents.length ? agents.map((agent) => `<a class="pill" href="/agents?agent=${agent.id}">A · ${escape(agent.name || agent.fileName)}</a>`).join('') : '<span class="field-help">Ce skill n’est encore référencé par aucun agent.</span>';
}

function renderValidation(issues: ValidationIssue[]) {
  const counts = { error: 0, warning: 0, success: 0 };
  issues.forEach((issue) => counts[issue.level]++);
  q('#validation-summary').innerHTML = `<div class="metric error"><strong>${counts.error}</strong><span>erreurs</span></div><div class="metric warning"><strong>${counts.warning}</strong><span>conseils</span></div><div class="metric success"><strong>${counts.success || (counts.error + counts.warning === 0 ? 1 : 0)}</strong><span>conforme</span></div>`;
  q('#validation-list').innerHTML = issues.map((issue) => `<div class="validation-item ${issue.level}"><span class="validation-icon">${issue.level === 'error' ? '×' : issue.level === 'warning' ? '!' : '✓'}</span><span>${escape(issue.message)}</span></div>`).join('');
}

function renderPreview() {
  const skill = current();
  const markdown = buildSkillMarkdown(skill);
  const issues = validateSkill(skill);
  renderValidation(issues);
  q('#source-preview').textContent = markdown;
  q('#render-preview').innerHTML = renderMarkdown(markdown);
  q('#render-preview').querySelectorAll<HTMLAnchorElement>('a[href^="scripts/"], a[href^="references/"], a[href^="assets/"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const file = skill.files.find((item) => item.path === link.getAttribute('href'));
      if (!file) return;
      const row = q('#file-list').querySelector<HTMLElement>(`[data-file-id="${CSS.escape(file.id)}"]`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row?.animate([{ backgroundColor: '#eef0ff' }, { backgroundColor: 'transparent' }], { duration: 900 });
    });
  });
  const disabled = hasErrors(issues);
  q<HTMLButtonElement>('#download-markdown').disabled = disabled;
  q<HTMLButtonElement>('#download-bundle').disabled = disabled;
  q('#export-hint').textContent = disabled ? 'Corrigez les erreurs bloquantes avant l’export.' : skill.files.length ? `${skill.files.length} ressource(s) seront incluses sous skills/${skill.name}/.` : 'Le bundle contiendra le dossier du skill et son SKILL.md.';
}

function renderTabs() {
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === activeTab));
  q('#rendered-pane').classList.toggle('hidden', activeTab !== 'rendered');
  q('#source-pane').classList.toggle('hidden', activeTab !== 'source');
}
function renderAll() { renderList(); fillForm(); renderPreview(); renderTabs(); }

Object.entries(fields).forEach(([key, input]) => input.addEventListener('input', () => {
  (current()[key as keyof SkillDefinition] as string) = input.value;
  persist();
  q('#skill-description-count').textContent = String(current().description.length);
  q('#skill-compatibility-count').textContent = String(current().compatibility.length);
  q('#editor-title').textContent = current().name || 'Nouveau skill';
  renderPreview(); renderList(); renderUsedBy();
}));

q('#add-metadata').addEventListener('click', () => { current().metadata.push({ key: '', value: '' }); persist(); renderAll(); });
q('#create-file').addEventListener('click', () => {
  const category = q<HTMLSelectElement>('#file-category').value;
  const nameInput = q<HTMLInputElement>('#new-file-name');
  const name = nameInput.value.trim().replace(/^\/+/, '');
  if (!name || name.includes('..') || name.includes('/')) return toast('Indiquez un nom de fichier simple, sans sous-dossier ni « .. ».');
  const path = `${category}/${name}`;
  if (current().files.some((file) => file.path === path)) return toast('Ce chemin existe déjà.');
  current().files.push({ id: uid(), path, content: '', binary: false, mime: 'text/plain' });
  nameInput.value = ''; persist(); renderAll();
});
q<HTMLInputElement>('#new-file-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); q<HTMLButtonElement>('#create-file').click(); } });
q('#upload-files').addEventListener('click', () => q<HTMLInputElement>('#file-picker').click());
q<HTMLInputElement>('#file-picker').addEventListener('change', async (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const category = q<HTMLSelectElement>('#file-category').value;
  const files = Array.from(input.files || []);
  for (const source of files) {
    if (source.size > 2 * 1024 * 1024) { toast(`${source.name} dépasse 2 Mo et n’a pas été importé.`); continue; }
    const path = `${category}/${source.name}`;
    if (current().files.some((file) => file.path === path)) { toast(`${path} existe déjà.`); continue; }
    const textLike = isTextFile(source);
    const content = textLike ? await source.text() : await fileToBase64(source);
    current().files.push({ id: uid(), path, content, binary: !textLike, mime: source.type || undefined });
  }
  input.value = ''; persist(); renderAll();
});

q('#new-skill').addEventListener('click', () => { const skill = newSkill(project.skills.length + 1); project.skills.push(skill); currentId = skill.id; saveProject(project); history.replaceState(null, '', `/skills?skill=${currentId}`); renderAll(); });
q('#delete-skill').addEventListener('click', () => {
  if (project.skills.length === 1) return toast('Conservez au moins un skill dans le workspace.');
  const linked = project.agents.filter((agent) => agent.skillIds.includes(currentId));
  const suffix = linked.length ? ` Il est référencé par ${linked.length} agent(s) ; leurs références seront retirées.` : '';
  if (!confirm(`Supprimer le skill « ${current().name} » ?${suffix}`)) return;
  project.agents.forEach((agent) => { agent.skillIds = agent.skillIds.filter((id) => id !== currentId); });
  project.skills = project.skills.filter((skill) => skill.id !== currentId);
  currentId = project.skills[0].id; saveProject(project); history.replaceState(null, '', `/skills?skill=${currentId}`); renderAll();
});

document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => button.addEventListener('click', () => { activeTab = button.dataset.tab as typeof activeTab; renderTabs(); }));
q('#copy-source').addEventListener('click', async () => { await navigator.clipboard.writeText(buildSkillMarkdown(current())); toast('SKILL.md copié.'); });
q('#download-markdown').addEventListener('click', () => { const skill = current(); if (!hasErrors(validateSkill(skill))) downloadText(buildSkillMarkdown(skill), 'SKILL.md'); });
q('#download-bundle').addEventListener('click', () => {
  const skill = current();
  if (hasErrors(validateSkill(skill))) return;
  const entries = [textEntry(`skills/${skill.name}/SKILL.md`, buildSkillMarkdown(skill))];
  for (const file of skill.files) entries.push(file.binary ? base64Entry(`skills/${skill.name}/${file.path}`, file.content) : textEntry(`skills/${skill.name}/${file.path}`, file.content));
  downloadBlob(createZip(entries), `${skill.name}-skill.zip`);
  toast('Bundle du skill généré.');
});

function isTextFile(file: File) {
  if (file.type.startsWith('text/') || /json|javascript|xml|yaml|toml|csv|svg/.test(file.type)) return true;
  return /\.(md|txt|py|js|mjs|cjs|ts|tsx|jsx|sh|bash|ps1|json|ya?ml|toml|csv|xml|html?|css|scss|sql|go|rs|java|kt|php|rb)$/i.test(file.name);
}
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
}
function escape(value: string) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }
function attr(value: string) { return escape(value).replace(/`/g, '&#96;'); }

renderAll();
