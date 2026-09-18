export type Listener = (event: any) => unknown;

class FakeClassList {
  private values = new Set<string>();

  add(...names: string[]) { names.forEach((name) => this.values.add(name)); }
  remove(...names: string[]) { names.forEach((name) => this.values.delete(name)); }
  contains(name: string) { return this.values.has(name); }
  toggle(name: string, force?: boolean) {
    if (force === true) { this.values.add(name); return true; }
    if (force === false) { this.values.delete(name); return false; }
    if (this.values.has(name)) { this.values.delete(name); return false; }
    this.values.add(name); return true;
  }
}

export class FakeElement {
  value = '';
  checked = false;
  disabled = false;
  type = '';
  textContent = '';
  title = '';
  files: any[] | null = null;
  dataset: Record<string, string> = {};
  classList = new FakeClassList();
  scrollIntoViewCalls: any[] = [];
  animateCalls: any[] = [];
  clickCount = 0;

  private html = '';
  private hrefValue = '';
  private attrs = new Map<string, string>();
  private listeners = new Map<string, Listener[]>();
  private generated = new Map<string, FakeElement[]>();

  constructor(public readonly id = '') {}

  get innerHTML() { return this.html; }
  set innerHTML(value: string) {
    this.html = value;
    this.generated.clear();
    this.parseGeneratedChildren(value);
  }

  get href() { return this.hrefValue; }
  set href(value: string) { this.hrefValue = value; this.attrs.set('href', value); }

  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }

  addEventListener(type: string, listener: Listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  async emit(type: string, extra: Record<string, unknown> = {}) {
    const event: any = {
      type,
      target: this,
      currentTarget: this,
      key: undefined,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...extra,
    };
    for (const listener of this.listeners.get(type) ?? []) await listener(event);
    return event;
  }

  click() {
    this.clickCount++;
    return this.emit('click');
  }

  scrollIntoView(options?: unknown) { this.scrollIntoViewCalls.push(options); }
  animate(frames?: unknown, options?: unknown) { this.animateCalls.push([frames, options]); return {} as Animation; }

  querySelectorAll<T = FakeElement>(selector: string): T[] {
    if (this.generated.has(selector)) return this.generated.get(selector)! as T[];

    const exact = /^\[data-([a-z0-9-]+)="([^"]+)"\]$/i.exec(selector);
    if (exact) {
      const key = kebabToCamel(exact[1]);
      const value = exact[2];
      const all = [...this.generated.values()].flat();
      return [...new Set(all)].filter((item) => item.dataset[key] === value) as T[];
    }

    return [];
  }

  querySelector<T = FakeElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }

  register(selector: string, elements: FakeElement[]) {
    this.generated.set(selector, elements);
  }

  private parseGeneratedChildren(html: string) {
    this.registerDataElements(html, 'agent-id', '[data-agent-id]');
    this.registerDataElements(html, 'skill-id', '[data-skill-id]', true);
    this.registerDataElements(html, 'remove-tool', '[data-remove-tool]');
    this.registerDataElements(html, 'remove-handoff', '[data-remove-handoff]');
    this.registerHandoffRows(html);
    this.registerDataElements(html, 'remove-meta', '[data-remove-meta]');
    this.registerMetadataRows(html);
    this.registerDataElements(html, 'remove-file', '[data-remove-file]');
    this.registerDataElements(html, 'toggle-file', '[data-toggle-file]');
    this.registerFileRows(html);
    this.registerFileEditors(html);
    this.registerAnchors(html);
  }

  private registerDataElements(html: string, attr: string, selector: string, detectCheckbox = false) {
    const regex = new RegExp(`<[^>]+data-${attr}="([^"]+)"[^>]*>`, 'g');
    const key = kebabToCamel(attr);
    const elements: FakeElement[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html))) {
      const el = new FakeElement();
      el.dataset[key] = decodeEntities(match[1]);
      if (detectCheckbox && /^<input\b/i.test(match[0])) {
        el.type = 'checkbox';
        el.checked = /\schecked(?:\s|\/|>)/i.test(match[0]);
      }
      elements.push(el);
    }
    if (elements.length) this.generated.set(selector, elements);
  }

  private registerHandoffRows(html: string) {
    const regex = /data-handoff="([^"]+)"/g;
    const rows: FakeElement[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html))) {
      const row = new FakeElement();
      row.dataset.handoff = match[1];
      const fields = ['label', 'agent', 'prompt', 'model', 'send'].map((field) => {
        const input = new FakeElement();
        input.dataset.handoffField = field;
        if (field === 'send') input.type = 'checkbox';
        return input;
      });
      row.register('[data-handoff-field]', fields);
      rows.push(row);
    }
    if (rows.length) this.generated.set('[data-handoff]', rows);
  }

  private registerMetadataRows(html: string) {
    const regex = /data-meta="([^"]+)"/g;
    const rows: FakeElement[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html))) {
      const row = new FakeElement();
      row.dataset.meta = match[1];
      const key = new FakeElement(); key.dataset.metaField = 'key';
      const value = new FakeElement(); value.dataset.metaField = 'value';
      row.register('[data-meta-field]', [key, value]);
      rows.push(row);
    }
    if (rows.length) this.generated.set('[data-meta]', rows);
  }

  private registerFileRows(html: string) {
    const regex = /data-file-id="([^"]+)"/g;
    const rows: FakeElement[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html))) {
      const row = new FakeElement();
      row.dataset.fileId = match[1];
      rows.push(row);
    }
    if (rows.length) this.generated.set('[data-file-id]', rows);
  }

  private registerFileEditors(html: string) {
    const regex = /data-file-editor="([^"]+)"/g;
    const editors: FakeElement[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html))) {
      const editor = new FakeElement();
      editor.dataset.fileEditor = match[1];
      editor.classList.add('hidden');
      const textarea = new FakeElement();
      editor.register('textarea', [textarea]);
      editors.push(editor);
    }
    if (editors.length) this.generated.set('[data-file-editor]', editors);
  }

  private registerAnchors(html: string) {
    const regex = /<a\s+[^>]*href="([^"]+)"[^>]*>/g;
    const skillLinks: FakeElement[] = [];
    const resourceLinks: FakeElement[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html))) {
      const link = new FakeElement();
      link.href = decodeEntities(match[1]);
      if (link.href.startsWith('../skills/')) skillLinks.push(link);
      if (/^(scripts|references|assets)\//.test(link.href)) resourceLinks.push(link);
    }
    if (skillLinks.length) this.generated.set('a[href^="../skills/"]', skillLinks);
    if (resourceLinks.length) this.generated.set('a[href^="scripts/"], a[href^="references/"], a[href^="assets/"]', resourceLinks);
  }
}

class FakeDocument {
  readonly elements = new Map<string, FakeElement>();
  readonly tabs = [new FakeElement('tab-rendered'), new FakeElement('tab-source')];

  constructor(ids: string[]) {
    for (const id of ids) {
      const element = new FakeElement(id);
      if (id === 'user-invocable' || id === 'disable-model') element.type = 'checkbox';
      if (id === 'file-picker') element.type = 'file';
      this.elements.set(id, element);
    }
    this.tabs[0].dataset.tab = 'rendered';
    this.tabs[1].dataset.tab = 'source';
  }

  querySelector<T = FakeElement>(selector: string): T | null {
    if (selector.startsWith('#')) return (this.elements.get(selector.slice(1)) ?? null) as T | null;
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }

  querySelectorAll<T = FakeElement>(selector: string): T[] {
    if (selector === '[data-tab]') return this.tabs as T[];
    return [];
  }
}

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

class FakeFileReader {
  result: string | ArrayBuffer | null = null;
  error: Error | null = null;
  onload: ((event?: unknown) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;

  readAsDataURL(file: any) {
    if (file.readerError) {
      this.error = file.readerError instanceof Error ? file.readerError : new Error(String(file.readerError));
      this.onerror?.({ target: this });
      return;
    }
    const base64 = file.base64 ?? 'RkFLRQ==';
    this.result = file.dataUrl ?? `data:${file.type || 'application/octet-stream'};base64,${base64}`;
    this.onload?.({ target: this });
  }
}

function kebabToCamel(value: string) {
  return value.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

function decodeEntities(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

export function installFakeBrowser(ids: string[], initialUrl: string) {
  const document = new FakeDocument(ids);
  const parsedInitial = new URL(initialUrl, 'http://localhost');
  const location = { search: parsedInitial.search, pathname: parsedInitial.pathname };
  const localStorage = new MemoryStorage();
  const clipboardWrites: string[] = [];
  const confirmMessages: string[] = [];

  const history = {
    replaceState(_state: unknown, _title: string, url: string) {
      const parsed = new URL(url, 'http://localhost');
      location.pathname = parsed.pathname;
      location.search = parsed.search;
    },
  };

  let confirmHandler = (_message: string) => true;

  Object.assign(globalThis as any, {
    document,
    location,
    history,
    localStorage,
    HTMLElement: FakeElement,
    HTMLInputElement: FakeElement,
    HTMLTextAreaElement: FakeElement,
    HTMLSelectElement: FakeElement,
    HTMLButtonElement: FakeElement,
    HTMLAnchorElement: FakeElement,
    FileReader: FakeFileReader,
    CSS: { escape: (value: string) => value },
    confirm: (message: string) => {
      confirmMessages.push(message);
      return confirmHandler(message);
    },
  });

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async (value: string) => { clipboardWrites.push(value); } } },
  });

  return {
    document,
    localStorage,
    clipboardWrites,
    confirmMessages,
    get: (id: string) => document.elements.get(id)!,
    setConfirm: (fn: (message: string) => boolean) => { confirmHandler = fn; },
    location,
  };
}

export const PROJECT_STORAGE_KEY = 'agent-skill-editor-project-v1';
