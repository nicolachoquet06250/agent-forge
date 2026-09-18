import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as markdownActual from '../src/lib/markdown';
import * as validationActual from '../src/lib/validation';
import type { ProjectState } from '../src/lib/types';
import { makeAgent, makeProject, makeSkill } from './fixtures';
import { FakeElement, installFakeBrowser, PROJECT_STORAGE_KEY } from './helpers/fake-dom';

const IDS = [
  'skill-name', 'skill-description', 'skill-license', 'skill-compatibility', 'skill-allowed-tools',
  'skill-overview', 'skill-instructions', 'skill-examples', 'skill-edge-cases', 'skill-notes',
  'toast', 'save-status', 'skill-list', 'skill-description-count', 'skill-compatibility-count',
  'editor-title', 'metadata-list', 'file-list', 'used-by', 'validation-summary', 'validation-list',
  'source-preview', 'render-preview', 'download-markdown', 'download-bundle', 'export-hint',
  'rendered-pane', 'source-pane', 'add-metadata', 'create-file', 'file-category', 'new-file-name',
  'upload-files', 'file-picker', 'new-skill', 'delete-skill', 'copy-source',
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
  await import('../src/scripts/skills');
  return downloadMocks;
}

async function mockRenderedHtml(html: string) {
  vi.doMock('../src/lib/markdown', () => ({ ...markdownActual, renderMarkdown: () => html }));
}

describe('src/scripts/skills.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('../src/lib/download');
    vi.doUnmock('../src/lib/markdown');
    vi.doUnmock('../src/lib/validation');
  });

  it('bootstraps a skill when storage contains none and renders empty metadata/files/usage states', async () => {
    const browser = installFakeBrowser(IDS, '/skills?skill=missing');
    await loadScript(browser, makeProject({ skills: [], agents: [] }));

    const saved = readProject(browser);
    expect(saved.skills).toHaveLength(1);
    expect(saved.skills[0].name).toBe('my-skill');
    expect(browser.get('metadata-list').innerHTML).toContain('Aucune métadonnée');
    expect(browser.get('file-list').innerHTML).toContain('Aucune ressource');
    expect(browser.get('used-by').innerHTML).toContain('aucun agent');
    expect(browser.get('download-markdown').disabled).toBe(true);
  });

  it('renders error/warning/success statuses and switches to a requested/list-selected skill', async () => {
    const valid = makeSkill({ id: 's-ok', name: 'valid-skill' });
    const warning = makeSkill({ id: 's-warn', name: 'warning-skill', examples: '' });
    const error = makeSkill({ id: 's-error', name: 'bad<&>', description: '' });
    const nameless = makeSkill({ id: 's-nameless', name: '', description: '' });
    const browser = installFakeBrowser(IDS, '/skills?skill=s-warn');
    await loadScript(browser, makeProject({ skills: [valid, warning, error, nameless], agents: [] }));

    expect(browser.get('skill-name').value).toBe('warning-skill');
    expect(browser.get('skill-list').innerHTML).toContain('status-dot ok');
    expect(browser.get('skill-list').innerHTML).toContain('status-dot warn');
    expect(browser.get('skill-list').innerHTML).toContain('status-dot error');
    expect(browser.get('skill-list').innerHTML).toContain('Sans nom');
    expect(browser.get('skill-list').innerHTML).toContain('skill/SKILL.md');

    const items = browser.get('skill-list').querySelectorAll<FakeElement>('[data-skill-id]');
    await items[0].emit('click');
    expect(browser.location.search).toBe('?skill=s-ok');
    expect(browser.get('editor-title').textContent).toBe('valid-skill');
  });

  it('persists field edits, updates counters, and covers the editor-title fallback', async () => {
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    await loadScript(browser, makeProject({ skills: [makeSkill({ files: [] })], agents: [] }));

    browser.get('skill-name').value = '';
    await browser.get('skill-name').emit('input');
    expect(browser.get('editor-title').textContent).toBe('Nouveau skill');

    browser.get('skill-name').value = 'updated-skill';
    await browser.get('skill-name').emit('input');
    browser.get('skill-description').value = 'Use when a repository requires a detailed and focused source-code review.';
    await browser.get('skill-description').emit('input');
    browser.get('skill-compatibility').value = 'Node.js 22+';
    await browser.get('skill-compatibility').emit('input');

    const saved = readProject(browser).skills[0];
    expect(saved.name).toBe('updated-skill');
    expect(browser.get('skill-description-count').textContent).toBe(String(saved.description.length));
    expect(browser.get('skill-compatibility-count').textContent).toBe(String(saved.compatibility.length));
    expect(browser.get('save-status').textContent).toContain('Sauvegardé localement');
  });

  it('adds, edits and removes metadata entries', async () => {
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    await loadScript(browser, makeProject({ skills: [makeSkill({ metadata: [], files: [] })], agents: [] }));

    await browser.get('add-metadata').emit('click');
    expect(readProject(browser).skills[0].metadata).toHaveLength(1);

    const row = browser.get('metadata-list').querySelectorAll<FakeElement>('[data-meta]')[0];
    const fields = row.querySelectorAll<FakeElement>('[data-meta-field]');
    fields[0].value = 'author';
    await fields[0].emit('input');
    fields[1].value = 'A <B> `C`';
    await fields[1].emit('input');

    expect(readProject(browser).skills[0].metadata[0]).toEqual({ key: 'author', value: 'A <B> `C`' });

    const remove = browser.get('metadata-list').querySelectorAll<FakeElement>('[data-remove-meta]')[0];
    await remove.emit('click');
    expect(readProject(browser).skills[0].metadata).toEqual([]);
  });

  it('renders text/binary files, toggles editor twice, edits text, and removes a file', async () => {
    const skill = makeSkill({
      files: [
        { id: 'text', path: 'scripts/check.py', content: 'print(1)', mime: 'text/x-python' },
        { id: 'nomime', path: 'references/notes.md', content: '# note' },
        { id: 'bin', path: 'assets/blob.bin', content: 'AAEC', binary: true, mime: 'application/octet-stream' },
      ],
      instructions: 'Run scripts/check.py and read references/notes.md.',
    });
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    await loadScript(browser, makeProject({ skills: [skill], agents: [] }));

    expect(browser.get('file-list').innerHTML).toContain('· texte');
    expect(browser.get('file-list').innerHTML).toContain('· binaire');
    expect(browser.get('file-list').innerHTML).toContain('application/octet-stream');

    const toggle = browser.get('file-list').querySelectorAll<FakeElement>('[data-toggle-file]')[0];
    const editor = browser.get('file-list').querySelectorAll<FakeElement>('[data-file-editor]')[0];
    await toggle.emit('click');
    expect(editor.classList.contains('hidden')).toBe(false);
    expect(toggle.textContent).toBe('Fermer');
    await toggle.emit('click');
    expect(editor.classList.contains('hidden')).toBe(true);
    expect(toggle.textContent).toBe('Éditer');

    const textarea = editor.querySelector<FakeElement>('textarea')!;
    textarea.value = 'print(2)';
    await textarea.emit('input');
    expect(readProject(browser).skills[0].files[0].content).toBe('print(2)');

    const remove = browser.get('file-list').querySelectorAll<FakeElement>('[data-remove-file]')[0];
    await remove.emit('click');
    expect(readProject(browser).skills[0].files.map((file) => file.id)).not.toContain('text');
  });

  it('renders used-by links with agent name and filename fallback', async () => {
    const skill = makeSkill({ id: 'skill-1', files: [] });
    const agents = [
      makeAgent({ id: 'a1', name: 'Named agent', skillIds: ['skill-1'], handoffs: [] }),
      makeAgent({ id: 'a2', name: '', fileName: 'fallback-agent', skillIds: ['skill-1'], handoffs: [] }),
    ];
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    await loadScript(browser, makeProject({ skills: [skill], agents }));

    expect(browser.get('used-by').innerHTML).toContain('/agents?agent=a1');
    expect(browser.get('used-by').innerHTML).toContain('Named agent');
    expect(browser.get('used-by').innerHTML).toContain('fallback-agent');
  });

  it('creates files, rejects all invalid names and duplicates, and handles Enter/non-Enter', async () => {
    vi.useFakeTimers();
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    await loadScript(browser, makeProject({ skills: [makeSkill({ files: [] })], agents: [] }));
    browser.get('file-category').value = 'scripts';

    for (const invalid of ['', '../escape.py', 'folder/file.py']) {
      browser.get('new-file-name').value = invalid;
      await browser.get('create-file').emit('click');
      expect(readProject(browser).skills[0].files).toHaveLength(0);
    }
    expect(browser.get('toast').textContent).toContain('sans sous-dossier');
    vi.runOnlyPendingTimers();

    browser.get('new-file-name').value = '/check.py';
    const ignored = await browser.get('new-file-name').emit('keydown', { key: 'Escape' });
    expect(ignored.defaultPrevented).toBe(false);
    const enter = await browser.get('new-file-name').emit('keydown', { key: 'Enter' });
    expect(enter.defaultPrevented).toBe(true);
    await Promise.resolve();
    expect(readProject(browser).skills[0].files[0].path).toBe('scripts/check.py');

    browser.get('new-file-name').value = 'check.py';
    await browser.get('create-file').emit('click');
    expect(readProject(browser).skills[0].files).toHaveLength(1);
    expect(browser.get('toast').textContent).toContain('existe déjà');
  });

  it('opens the native picker and safely handles an empty file selection', async () => {
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    await loadScript(browser, makeProject({ skills: [makeSkill({ files: [] })], agents: [] }));

    await browser.get('upload-files').emit('click');
    expect(browser.get('file-picker').clickCount).toBe(1);

    browser.get('file-picker').files = null;
    await browser.get('file-picker').emit('change');
    expect(readProject(browser).skills[0].files).toEqual([]);
    expect(browser.get('file-picker').value).toBe('');
  });

  it('imports MIME/extension text files and binary files, while skipping oversized and duplicate files', async () => {
    vi.useFakeTimers();
    const existing = { id: 'existing', path: 'references/duplicate.md', content: 'old', mime: 'text/markdown' };
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    await loadScript(browser, makeProject({ skills: [makeSkill({ files: [existing], instructions: 'Read references/duplicate.md.' })], agents: [] }));

    browser.get('file-category').value = 'references';
    browser.get('file-picker').files = [
      { name: 'huge.txt', size: 2 * 1024 * 1024 + 1, type: 'text/plain', text: async () => 'huge' },
      { name: 'duplicate.md', size: 10, type: 'text/markdown', text: async () => 'dup' },
      { name: 'plain.txt', size: 10, type: 'text/plain', text: async () => 'plain' },
      { name: 'data.any', size: 10, type: 'application/json', text: async () => '{"a":1}' },
      { name: 'by-extension.md', size: 10, type: 'application/octet-stream', text: async () => '# ext' },
      { name: 'no-type.txt', size: 10, type: '', text: async () => 'none' },
      { name: 'blob.bin', size: 10, type: 'application/octet-stream', base64: 'AAEC' },
      { name: 'empty.bin', size: 10, type: '', dataUrl: 'data:application/octet-stream;base64,' },
    ];

    await browser.get('file-picker').emit('change');
    const files = readProject(browser).skills[0].files;
    expect(files.map((file) => file.path)).toEqual([
      'references/duplicate.md',
      'references/plain.txt',
      'references/data.any',
      'references/by-extension.md',
      'references/no-type.txt',
      'references/blob.bin',
      'references/empty.bin',
    ]);
    expect(files.find((file) => file.path.endsWith('blob.bin'))).toEqual(expect.objectContaining({ content: 'AAEC', binary: true, mime: 'application/octet-stream' }));
    const emptyBinary = files.find((file) => file.path.endsWith('empty.bin'))!;
    expect(emptyBinary.content).toBe('');
    expect(emptyBinary.binary).toBe(true);
    expect(emptyBinary.mime).toBeUndefined();
    expect(browser.get('file-picker').value).toBe('');
    vi.runOnlyPendingTimers();
  });

  it('propagates FileReader failures when a binary upload cannot be read', async () => {
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    await loadScript(browser, makeProject({ skills: [makeSkill({ files: [] })], agents: [] }));

    browser.get('file-category').value = 'assets';
    browser.get('file-picker').files = [{
      name: 'broken.bin',
      size: 10,
      type: 'application/octet-stream',
      readerError: new Error('read failed'),
    }];

    await expect(browser.get('file-picker').emit('change')).rejects.toThrow('read failed');
  });

  it('opens an existing resource from preview, ignores missing resources, and tolerates a missing row', async () => {
    await mockRenderedHtml('<a href="scripts/check.py">ok</a><a href="scripts/missing.py">missing</a>');
    const skill = makeSkill({
      files: [{ id: 'file-1', path: 'scripts/check.py', content: 'print(1)', mime: 'text/x-python' }],
      instructions: 'Run scripts/check.py.',
    });
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    await loadScript(browser, makeProject({ skills: [skill], agents: [] }));

    const links = browser.get('render-preview').querySelectorAll<FakeElement>('a[href^="scripts/"], a[href^="references/"], a[href^="assets/"]');
    const okEvent = await links[0].emit('click');
    expect(okEvent.defaultPrevented).toBe(true);
    let row = browser.get('file-list').querySelector<FakeElement>('[data-file-id="file-1"]');
    expect(row?.scrollIntoViewCalls).toHaveLength(1);
    expect(row?.animateCalls).toHaveLength(1);

    await links[1].emit('click');
    expect(row?.scrollIntoViewCalls).toHaveLength(1);

    browser.get('file-list').register('[data-file-id]', []);
    await links[0].emit('click');
    row = browser.get('file-list').querySelector<FakeElement>('[data-file-id="file-1"]');
    expect(row).toBeNull();
  });

  it('switches preview tabs both ways and renders no-resource/success hints', async () => {
    const skill = makeSkill({ files: [] });
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    await loadScript(browser, makeProject({ skills: [skill], agents: [] }));

    expect(browser.get('validation-list').innerHTML).toContain('validation-item success');
    expect(browser.get('export-hint').textContent).toContain('SKILL.md');
    await browser.document.tabs[1].emit('click');
    expect(browser.document.tabs[1].classList.contains('active')).toBe(true);
    expect(browser.get('rendered-pane').classList.contains('hidden')).toBe(true);
    await browser.document.tabs[0].emit('click');
    expect(browser.get('rendered-pane').classList.contains('hidden')).toBe(false);
  });

  it('renders the zero-issue validation fallback as conforming', async () => {
    vi.doMock('../src/lib/validation', () => ({ ...validationActual, validateSkill: () => [], hasErrors: () => false }));
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    await loadScript(browser, makeProject({ skills: [makeSkill({ files: [] })], agents: [] }));

    expect(browser.get('validation-summary').innerHTML).toContain('<strong>1</strong><span>conforme</span>');
    expect(browser.get('download-markdown').disabled).toBe(false);
  });

  it('creates a new skill and covers protected, cancelled, unlinked and linked deletion paths', async () => {
    vi.useFakeTimers();
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    await loadScript(browser, makeProject({ skills: [makeSkill({ id: 'skill-1', files: [] })], agents: [] }));

    await browser.get('delete-skill').emit('click');
    expect(browser.get('toast').textContent).toContain('Conservez au moins un skill');
    vi.advanceTimersByTime(1800);
    expect(browser.get('toast').classList.contains('show')).toBe(false);

    await browser.get('new-skill').emit('click');
    expect(readProject(browser).skills).toHaveLength(2);

    browser.setConfirm(() => false);
    await browser.get('delete-skill').emit('click');
    expect(readProject(browser).skills).toHaveLength(2);

    browser.setConfirm(() => true);
    await browser.get('delete-skill').emit('click');
    expect(readProject(browser).skills).toHaveLength(1);

    vi.resetModules();
    vi.doUnmock('../src/lib/download');
    const linkedBrowser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    await loadScript(linkedBrowser, makeProject({
      skills: [makeSkill({ id: 'skill-1', files: [] }), makeSkill({ id: 'skill-2', name: 'other-skill', files: [] })],
      agents: [makeAgent({ skillIds: ['skill-1', 'skill-2'], handoffs: [] })],
    }));
    linkedBrowser.setConfirm(() => true);
    await linkedBrowser.get('delete-skill').emit('click');
    expect(linkedBrowser.confirmMessages[0]).toContain('référencé par 1 agent');
    expect(readProject(linkedBrowser).agents[0].skillIds).toEqual(['skill-2']);
  });

  it('copies and downloads valid SKILL.md and blocks downloads for invalid skills', async () => {
    vi.useFakeTimers();
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    const downloads = await loadScript(browser, makeProject({ skills: [makeSkill({ files: [] })], agents: [] }));

    await browser.get('copy-source').emit('click');
    expect(browser.clipboardWrites[0]).toContain('name: code-review');
    expect(browser.get('toast').textContent).toContain('SKILL.md copié');
    vi.runOnlyPendingTimers();

    await browser.get('download-markdown').emit('click');
    expect(downloads.downloadText).toHaveBeenCalledWith(expect.stringContaining('name: code-review'), 'SKILL.md');

    vi.resetModules();
    vi.doUnmock('../src/lib/download');
    const invalidBrowser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    const invalidDownloads = await loadScript(invalidBrowser, makeProject({ skills: [makeSkill({ name: '', description: '', instructions: '', files: [] })], agents: [] }));
    expect(invalidBrowser.get('export-hint').textContent).toContain('Corrigez les erreurs');
    await invalidBrowser.get('download-markdown').emit('click');
    await invalidBrowser.get('download-bundle').emit('click');
    expect(invalidDownloads.downloadText).not.toHaveBeenCalled();
    expect(invalidDownloads.createZip).not.toHaveBeenCalled();
  });

  it('builds bundles with zero files and with text/binary resources', async () => {
    vi.useFakeTimers();
    const emptyBrowser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    const emptyDownloads = await loadScript(emptyBrowser, makeProject({ skills: [makeSkill({ files: [] })], agents: [] }));
    await emptyBrowser.get('download-bundle').emit('click');
    expect((emptyDownloads.createZip.mock.calls[0][0] as Array<{ path: string }>).map((entry) => entry.path)).toEqual(['skills/code-review/SKILL.md']);
    expect(emptyDownloads.downloadBlob).toHaveBeenCalledWith(expect.anything(), 'code-review-skill.zip');
    vi.runOnlyPendingTimers();

    vi.resetModules();
    vi.doUnmock('../src/lib/download');
    const skill = makeSkill({
      files: [
        { id: 'f1', path: 'scripts/check.py', content: 'print("ok")', mime: 'text/x-python' },
        { id: 'f2', path: 'assets/data.bin', content: 'AAEC', mime: 'application/octet-stream', binary: true },
      ],
      instructions: 'Run scripts/check.py and use assets/data.bin.',
    });
    const browser = installFakeBrowser(IDS, '/skills?skill=skill-1');
    const downloads = await loadScript(browser, makeProject({ skills: [skill], agents: [] }));
    await browser.get('download-bundle').emit('click');

    const paths = (downloads.createZip.mock.calls[0][0] as Array<{ path: string }>).map((entry) => entry.path);
    expect(paths).toEqual([
      'skills/code-review/SKILL.md',
      'skills/code-review/scripts/check.py',
      'skills/code-review/assets/data.bin',
    ]);
    expect(downloads.base64Entry).toHaveBeenCalledWith('skills/code-review/assets/data.bin', 'AAEC');
  });
});
