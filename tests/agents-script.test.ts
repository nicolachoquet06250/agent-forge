import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as markdownActual from '../src/lib/markdown';
import * as validationActual from '../src/lib/validation';
import type { ProjectState } from '../src/lib/types';
import { makeAgent, makeProject, makeSkill } from './fixtures';
import { FakeElement, installFakeBrowser, PROJECT_STORAGE_KEY } from './helpers/fake-dom';

const IDS = [
  'agent-file', 'agent-name', 'agent-target', 'agent-description', 'agent-argument', 'agent-model',
  'user-invocable', 'disable-model', 'agent-mission', 'agent-responsibilities', 'agent-workflow',
  'agent-constraints', 'agent-output', 'agent-extra', 'toast', 'save-status', 'agent-list',
  'agent-description-count', 'editor-title', 'tool-list', 'skills-grid', 'handoff-list',
  'validation-summary', 'validation-list', 'source-preview', 'source-filename', 'render-preview',
  'download-markdown', 'download-bundle', 'export-hint', 'rendered-pane', 'source-pane',
  'tool-input', 'add-tool', 'add-handoff', 'new-agent', 'delete-agent', 'copy-source',
];

function createDownloadMocks() {
  return {
    downloadText: vi.fn(),
    downloadBlob: vi.fn(),
    createZip: vi.fn((entries: unknown[]) => ({ entries })),
    textEntry: vi.fn((path: string, content: string) => ({ path, content, kind: 'text' })),
    base64Entry: vi.fn((path: string, content: string) => ({ path, content, kind: 'base64' })),
  };
}

function seed(browser: ReturnType<typeof installFakeBrowser>, project: ProjectState) {
  browser.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
}

function readProject(browser: ReturnType<typeof installFakeBrowser>): ProjectState {
  return JSON.parse(browser.localStorage.getItem(PROJECT_STORAGE_KEY)!);
}

async function loadScript(browser: ReturnType<typeof installFakeBrowser>, project: ProjectState) {
  seed(browser, project);
  const downloadMocks = createDownloadMocks();
  vi.doMock('../src/lib/download', () => downloadMocks);
  await import('../src/scripts/agents');
  return downloadMocks;
}

async function mockRenderedHtml(html: string) {
  vi.doMock('../src/lib/markdown', () => ({ ...markdownActual, renderMarkdown: () => html }));
}

async function mockValidationAsValid() {
  vi.doMock('../src/lib/validation', () => ({ ...validationActual, validateAgent: () => [], hasErrors: () => false }));
}

describe('src/scripts/agents.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('../src/lib/download');
    vi.doUnmock('../src/lib/markdown');
    vi.doUnmock('../src/lib/validation');
  });

  it('bootstraps an agent when storage contains none and renders all empty states', async () => {
    const browser = installFakeBrowser(IDS, '/agents?agent=does-not-exist');
    await loadScript(browser, makeProject({ agents: [], skills: [] }));

    const saved = readProject(browser);
    expect(saved.agents).toHaveLength(1);
    expect(saved.agents[0].fileName).toBe('my-agent');
    expect(browser.get('tool-list').innerHTML).toContain('Aucun outil');
    expect(browser.get('skills-grid').innerHTML).toContain('Aucun skill');
    expect(browser.get('handoff-list').innerHTML).toContain('Aucun handoff');
    expect(browser.get('download-markdown').disabled).toBe(true);
    expect(browser.get('export-hint').textContent).toContain('Corrigez les erreurs');
  });

  it('renders error, warning and success statuses, fallback labels, and switches agents', async () => {
    const valid = makeAgent({ id: 'a-ok', name: 'A <&> "ok"', skillIds: [], handoffs: [] });
    const warning = makeAgent({ id: 'a-warn', name: '', fileName: 'fallback-file', tools: [], skillIds: [], handoffs: [] });
    const error = makeAgent({ id: 'a-error', name: '', fileName: '', description: '', skillIds: [], handoffs: [] });
    const browser = installFakeBrowser(IDS, '/agents?agent=a-ok');
    await loadScript(browser, makeProject({ agents: [valid, warning, error], skills: [] }));

    expect(browser.get('agent-list').innerHTML).toContain('status-dot ok');
    expect(browser.get('agent-list').innerHTML).toContain('status-dot warn');
    expect(browser.get('agent-list').innerHTML).toContain('status-dot error');
    expect(browser.get('agent-list').innerHTML).toContain('fallback-file');
    expect(browser.get('agent-list').innerHTML).toContain('Sans nom');
    expect(browser.get('agent-list').innerHTML).toContain('&lt;&amp;&gt;');

    const items = browser.get('agent-list').querySelectorAll<FakeElement>('[data-agent-id]');
    await items[1].emit('click');
    expect(browser.location.search).toBe('?agent=a-warn');
    expect(browser.get('agent-file').value).toBe('fallback-file');

    await items[2].emit('click');
    expect(browser.location.search).toBe('?agent=a-error');
    expect(browser.get('editor-title').textContent).toBe('agent.agent.md');
  });

  it('persists text and checkbox field edits and exercises editor-title fallbacks', async () => {
    const browser = installFakeBrowser(IDS, '/agents?agent=agent-1');
    await loadScript(browser, makeProject({ agents: [makeAgent({ skillIds: [], handoffs: [] })], skills: [] }));

    browser.get('agent-name').value = '';
    await browser.get('agent-name').emit('input');
    expect(browser.get('editor-title').textContent).toBe('reviewer.agent.md');

    browser.get('agent-file').value = '';
    await browser.get('agent-file').emit('input');
    expect(browser.get('editor-title').textContent).toBe('agent.agent.md');

    browser.get('agent-description').value = 'A sufficiently precise updated description for this agent.';
    await browser.get('agent-description').emit('input');

    browser.get('user-invocable').checked = false;
    await browser.get('user-invocable').emit('change');
    browser.get('disable-model').checked = true;
    await browser.get('disable-model').emit('change');

    const saved = readProject(browser).agents[0];
    expect(saved.userInvocable).toBe(false);
    expect(saved.disableModelInvocation).toBe(true);
    expect(browser.get('agent-description-count').textContent).toBe(String(saved.description.length));
    expect(browser.get('save-status').textContent).toContain('Sauvegardé localement');
  });

  it('adds tools by click and Enter, ignores empty input, deduplicates and removes tools', async () => {
    const browser = installFakeBrowser(IDS, '/agents?agent=agent-1');
    await loadScript(browser, makeProject({ agents: [makeAgent({ tools: [], skillIds: [], handoffs: [] })], skills: [] }));

    browser.get('tool-input').value = ' , ';
    await browser.get('add-tool').emit('click');
    expect(readProject(browser).agents[0].tools).toEqual([]);

    browser.get('tool-input').value = 'read';
    const ignored = await browser.get('tool-input').emit('keydown', { key: 'Escape' });
    expect(ignored.defaultPrevented).toBe(false);

    browser.get('tool-input').value = 'read, grep, read';
    const enter = await browser.get('tool-input').emit('keydown', { key: 'Enter' });
    expect(enter.defaultPrevented).toBe(true);
    await Promise.resolve();
    expect(readProject(browser).agents[0].tools).toEqual(['read', 'grep']);

    const remove = browser.get('tool-list').querySelectorAll<FakeElement>('[data-remove-tool]')[0];
    await remove.emit('click');
    expect(readProject(browser).agents[0].tools).toEqual(['grep']);
  });

  it('renders valid and invalid skills, checks/unchecks them, and rewrites preview links', async () => {
    const valid = makeSkill({ id: 'skill-ok', name: 'code-review' });
    const invalid = makeSkill({ id: 'skill-bad', name: '', description: '' });
    const browser = installFakeBrowser(IDS, '/agents?agent=agent-1');
    await loadScript(browser, makeProject({ agents: [makeAgent({ skillIds: [], handoffs: [] })], skills: [valid, invalid] }));

    expect(browser.get('skills-grid').innerHTML).toContain('Skill sans nom');
    expect(browser.get('skills-grid').innerHTML).toContain('Description manquante');
    expect(browser.get('skills-grid').innerHTML).toContain('⚠ invalide');

    let boxes = browser.get('skills-grid').querySelectorAll<FakeElement>('[data-skill-id]');
    boxes[0].checked = true;
    await boxes[0].emit('change');
    expect(readProject(browser).agents[0].skillIds).toEqual(['skill-ok']);
    expect(browser.get('source-preview').textContent).toContain('skills:\n  - "code-review"');

    const previewLink = browser.get('render-preview').querySelectorAll<FakeElement>('a[href^="../skills/"]')[0];
    expect(previewLink.href).toBe('/skills?skill=skill-ok');
    expect(previewLink.title).toContain('Ouvrir ce skill');

    boxes = browser.get('skills-grid').querySelectorAll<FakeElement>('[data-skill-id]');
    boxes[0].checked = false;
    await boxes[0].emit('change');
    expect(readProject(browser).agents[0].skillIds).toEqual([]);
  });

  it('edits every handoff branch, then removes and adds a handoff', async () => {
    const agent = makeAgent({
      skillIds: [],
      handoffs: [{ id: 'h1', label: 'Go `next`', agent: 'worker', prompt: 'Do it', send: true, model: 'gpt' }],
    });
    const browser = installFakeBrowser(IDS, '/agents?agent=agent-1');
    await loadScript(browser, makeProject({ agents: [agent], skills: [] }));

    const row = browser.get('handoff-list').querySelectorAll<FakeElement>('[data-handoff]')[0];
    const fields = row.querySelectorAll<FakeElement>('[data-handoff-field]');
    const label = fields.find((f) => f.dataset.handoffField === 'label')!;
    label.value = 'Updated';
    await label.emit('input');

    const send = fields.find((f) => f.dataset.handoffField === 'send')!;
    send.checked = false;
    await send.emit('input');

    const model = fields.find((f) => f.dataset.handoffField === 'model')!;
    model.dataset.handoffField = 'id';
    model.value = 'must-not-replace-id';
    await model.emit('input');

    let saved = readProject(browser).agents[0];
    expect(saved.handoffs[0].label).toBe('Updated');
    expect(saved.handoffs[0].send).toBe(false);
    expect(saved.handoffs[0].id).toBe('h1');

    const remove = browser.get('handoff-list').querySelectorAll<FakeElement>('[data-remove-handoff]')[0];
    await remove.emit('click');
    expect(readProject(browser).agents[0].handoffs).toEqual([]);

    await browser.get('add-handoff').emit('click');
    saved = readProject(browser).agents[0];
    expect(saved.handoffs).toHaveLength(1);
    expect(saved.handoffs[0]).toEqual(expect.objectContaining({ label: '', agent: '', send: false }));
  });

  it('renders success/error validation states, no-skill hint, and switches tabs both ways', async () => {
    const browser = installFakeBrowser(IDS, '/agents?agent=agent-1');
    await loadScript(browser, makeProject({ agents: [makeAgent({ skillIds: [], handoffs: [] })], skills: [] }));

    expect(browser.get('validation-list').innerHTML).toContain('validation-item success');
    expect(browser.get('export-hint').textContent).toContain('Aucun skill référencé');
    expect(browser.get('rendered-pane').classList.contains('hidden')).toBe(false);

    await browser.document.tabs[1].emit('click');
    expect(browser.document.tabs[1].classList.contains('active')).toBe(true);
    expect(browser.get('rendered-pane').classList.contains('hidden')).toBe(true);
    expect(browser.get('source-pane').classList.contains('hidden')).toBe(false);

    await browser.document.tabs[0].emit('click');
    expect(browser.document.tabs[0].classList.contains('active')).toBe(true);
  });

  it('leaves malformed and unknown skill preview links untouched', async () => {
    await mockRenderedHtml('<a href="../skills/code-review/SKILL.md">ok</a><a href="../skills/ghost/SKILL.md">ghost</a><a href="../skills/not-a-skill-file">bad</a>');
    const browser = installFakeBrowser(IDS, '/agents?agent=agent-1');
    await loadScript(browser, makeProject({
      agents: [makeAgent({ skillIds: ['skill-1'], handoffs: [] })],
      skills: [makeSkill({ id: 'skill-1', name: 'code-review' })],
    }));

    const links = browser.get('render-preview').querySelectorAll<FakeElement>('a[href^="../skills/"]');
    expect(links[0].href).toBe('/skills?skill=skill-1');
    expect(links[1].href).toBe('../skills/ghost/SKILL.md');
    expect(links[2].href).toBe('../skills/not-a-skill-file');
  });

  it('creates a new agent and covers protected, cancelled and confirmed deletion paths', async () => {
    vi.useFakeTimers();
    const browser = installFakeBrowser(IDS, '/agents?agent=agent-1');
    await loadScript(browser, makeProject({ agents: [makeAgent({ skillIds: [], handoffs: [] })], skills: [] }));

    await browser.get('delete-agent').emit('click');
    expect(browser.get('toast').textContent).toContain('Conservez au moins un agent');
    expect(browser.get('toast').classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(1800);
    expect(browser.get('toast').classList.contains('show')).toBe(false);

    await browser.get('new-agent').emit('click');
    expect(readProject(browser).agents).toHaveLength(2);
    expect(browser.location.search).toMatch(/^\?agent=/);

    const firstItem = browser.get('agent-list').querySelectorAll<FakeElement>('[data-agent-id]')[0];
    await firstItem.emit('click');
    browser.setConfirm(() => false);
    await browser.get('delete-agent').emit('click');
    expect(readProject(browser).agents).toHaveLength(2);
    expect(browser.confirmMessages[0]).toContain('Reviewer');

    const newItem = browser.get('agent-list').querySelectorAll<FakeElement>('[data-agent-id]')[1];
    await newItem.emit('click');
    browser.setConfirm(() => true);
    await browser.get('delete-agent').emit('click');
    expect(readProject(browser).agents).toHaveLength(1);
    expect(browser.confirmMessages[1]).toContain('my-agent-2');
    expect(browser.confirmMessages).toHaveLength(2);
  });

  it('copies and downloads valid markdown and runs toast cleanup', async () => {
    vi.useFakeTimers();
    const browser = installFakeBrowser(IDS, '/agents?agent=agent-1');
    const downloads = await loadScript(browser, makeProject({ agents: [makeAgent({ skillIds: [], handoffs: [] })], skills: [] }));

    await browser.get('copy-source').emit('click');
    expect(browser.clipboardWrites).toHaveLength(1);
    expect(browser.clipboardWrites[0]).toContain('description:');
    expect(browser.get('toast').textContent).toContain('Markdown copié');
    vi.advanceTimersByTime(1800);

    await browser.get('download-markdown').emit('click');
    expect(downloads.downloadText).toHaveBeenCalledWith(expect.stringContaining('description:'), 'reviewer.agent.md');
  });

  it('blocks markdown and bundle downloads for an invalid agent', async () => {
    const browser = installFakeBrowser(IDS, '/agents?agent=agent-1');
    const downloads = await loadScript(browser, makeProject({
      agents: [makeAgent({ description: '', mission: '', workflow: '', skillIds: [], handoffs: [] })],
      skills: [],
    }));

    expect(browser.get('download-markdown').disabled).toBe(true);
    await browser.get('download-markdown').emit('click');
    await browser.get('download-bundle').emit('click');
    expect(downloads.downloadText).not.toHaveBeenCalled();
    expect(downloads.createZip).not.toHaveBeenCalled();
  });

  it('builds a bundle with text/binary resources and skips missing skills when validation permits it', async () => {
    await mockValidationAsValid();
    const skill = makeSkill({
      id: 'skill-1',
      name: 'code-review',
      files: [
        { id: 'f1', path: 'scripts/check.py', content: 'print("ok")', mime: 'text/x-python' },
        { id: 'f2', path: 'assets/logo.bin', content: 'AAEC', mime: 'application/octet-stream', binary: true },
      ],
    });
    const agent = makeAgent({ skillIds: ['missing', 'skill-1'], handoffs: [] });
    const browser = installFakeBrowser(IDS, '/agents?agent=agent-1');
    const downloads = await loadScript(browser, makeProject({ agents: [agent], skills: [skill] }));

    await browser.get('download-bundle').emit('click');
    const entries = downloads.createZip.mock.calls[0][0] as Array<{ path: string }>;
    expect(entries.map((entry) => entry.path)).toEqual([
      'agents/reviewer.agent.md',
      'skills/code-review/SKILL.md',
      'skills/code-review/scripts/check.py',
      'skills/code-review/assets/logo.bin',
    ]);
    expect(downloads.textEntry).toHaveBeenCalled();
    expect(downloads.base64Entry).toHaveBeenCalledWith('skills/code-review/assets/logo.bin', 'AAEC');
    expect(downloads.downloadBlob).toHaveBeenCalledWith(expect.anything(), 'reviewer-bundle.zip');
  });
});
