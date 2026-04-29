import { describe, it, expect } from 'vitest';
import { applyCommandOps, parseCommands } from './commands.js';
import { expandSnippets } from './snippets.js';
import { fallbackCleanup, buildCleanupPrompt } from './tones.js';

describe('parseCommands + applyCommandOps', () => {
  it('handles formatting and edit commands', () => {
    const ops = parseCommands('hello world period new line how are you question mark');
    const { text } = applyCommandOps(ops);
    expect(text).toBe('hello world.\nhow are you?');
  });

  it('caps on/off bracket text', () => {
    const ops = parseCommands('say caps on hello caps off world');
    const { text } = applyCommandOps(ops);
    expect(text).toBe('say HELLO world');
  });

  it('deleteWord drops trailing word', () => {
    const ops = parseCommands('hello bad delete word');
    const { text } = applyCommandOps(ops);
    expect(text).toBe('hello');
  });

  it('send emits side effect', () => {
    const { text, sideEffects } = applyCommandOps(parseCommands('hi there send it'));
    expect(text).toBe('hi there');
    expect(sideEffects).toContain('send');
  });
});

describe('expandSnippets', () => {
  it('expands triggers with non-word boundary', () => {
    const out = expandSnippets('say ;gm to all', { ';gm': 'good morning' });
    expect(out).toBe('say good morning to all');
  });

  it('does not match inside a word', () => {
    const out = expandSnippets('email gmail support', { gm: 'good morning' });
    expect(out).toBe('email gmail support');
  });

  it('prefers longer triggers on collision', () => {
    const out = expandSnippets(';gm', { ';g': 'gigabyte', ';gm': 'good morning' });
    expect(out).toBe('good morning');
  });
});

describe('fallbackCleanup', () => {
  it('strips fillers', () => {
    expect(fallbackCleanup('um hello uh world')).toBe('hello world');
  });
});

describe('buildCleanupPrompt', () => {
  it('contains the input and an OUTPUT marker', () => {
    const p = buildCleanupPrompt('hi', 'email');
    expect(p).toMatch(/INPUT:/);
    expect(p).toMatch(/OUTPUT:/);
    expect(p).toContain('hi');
  });
});
