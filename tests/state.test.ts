import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProject, loadProject, newAgent, newSkill, saveProject, touch } from '../src/lib/state';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('state factories', () => {
  it('creates deterministic default names while generating unique ids', () => {
    const firstSkill = newSkill();
    const secondSkill = newSkill(2);
    const firstAgent = newAgent();
    const secondAgent = newAgent(2);

    expect(firstSkill.name).toBe('my-skill');
    expect(secondSkill.name).toBe('my-skill-2');
    expect(firstAgent.fileName).toBe('my-agent');
    expect(secondAgent.fileName).toBe('my-agent-2');
    expect(firstSkill.id).not.toBe(secondSkill.id);
    expect(firstAgent.id).not.toBe(secondAgent.id);
  });

  it('creates an empty project with one agent and one skill', () => {
    const project = emptyProject();
    expect(project.version).toBe(1);
    expect(project.agents).toHaveLength(1);
    expect(project.skills).toHaveLength(1);
  });
});

describe('project persistence', () => {
  it('round-trips a project through localStorage', () => {
    const project = emptyProject();
    saveProject(project);
    expect(loadProject()).toEqual(project);
  });

  it('falls back to a fresh project when storage is empty, invalid JSON or an incompatible schema', () => {
    expect(loadProject().version).toBe(1);

    localStorage.setItem('agent-skill-editor-project-v1', '{broken');
    expect(loadProject().agents).toHaveLength(1);

    localStorage.setItem('agent-skill-editor-project-v1', JSON.stringify({ version: 2, agents: [], skills: [] }));
    expect(loadProject().skills).toHaveLength(1);
  });

  it('updates the modification date in place', () => {
    const value = { updatedAt: '2000-01-01T00:00:00.000Z', label: 'x' };
    const touched = touch(value);
    expect(touched).toBe(value);
    expect(new Date(touched.updatedAt).getTime()).toBeGreaterThan(new Date('2000-01-01').getTime());
  });
});
