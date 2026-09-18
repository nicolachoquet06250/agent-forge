import { afterEach, describe, expect, it, vi } from 'vitest';
import { base64Entry, createZip, downloadBlob, downloadText, textEntry } from '../src/lib/download';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ZIP generation', () => {
  it('creates text and base64 entries', () => {
    expect(Array.from(textEntry('hello.txt', 'Hi').data)).toEqual([72, 105]);
    expect(Array.from(base64Entry('hello.bin', 'SGk=').data)).toEqual([72, 105]);
  });

  it('creates a valid-looking store-only ZIP with normalized entry names', async () => {
    const zip = createZip([
      textEntry('agents\\reviewer.agent.md', '# Agent'),
      textEntry('skills/code-review/SKILL.md', '# Skill'),
    ]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const latin1 = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

    expect(zip.type).toBe('application/zip');
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(latin1).toContain('agents/reviewer.agent.md');
    expect(latin1).toContain('skills/code-review/SKILL.md');
    expect(Array.from(bytes.slice(-22, -18))).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });
});

describe('browser downloads', () => {
  it('creates, clicks and removes a temporary download anchor', () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const anchor = { href: '', download: '', click, remove };
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();

    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild },
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    downloadBlob(new Blob(['hello']), 'hello.txt');

    expect(anchor.href).toBe('blob:test');
    expect(anchor.download).toBe('hello.txt');
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('wraps text in a markdown blob before downloading it', () => {
    vi.useFakeTimers();
    const click = vi.fn();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ href: '', download: '', click, remove: vi.fn() })),
      body: { appendChild: vi.fn() },
    });
    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob.type).toBe('text/markdown;charset=utf-8');
      return 'blob:text';
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });

    downloadText('# Hello', 'README.md');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });
});
