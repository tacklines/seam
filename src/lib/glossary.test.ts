import { describe, it, expect } from 'vitest';
import { GLOSSARY } from './glossary.js';

describe('GLOSSARY', () => {
  it('has entries for all expected DDD terms', () => {
    const expectedTerms = [
      'aggregate',
      'domain-event',
      'bounded-context',
      'command',
      'policy',
      'read-model',
      'assumption',
      'overlap',
      'conflict',
      'contract',
    ];
    for (const term of expectedTerms) {
      expect(GLOSSARY).toHaveProperty(term);
    }
  });

  it('every entry has a non-empty term string', () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.term.trim().length, `term for key "${key}" must be non-empty`).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty definition string', () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.definition.trim().length, `definition for key "${key}" must be non-empty`).toBeGreaterThan(0);
    }
  });

  it('has no duplicate keys', () => {
    const keys = Object.keys(GLOSSARY);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it('aggregate entry has the expected term label', () => {
    expect(GLOSSARY['aggregate'].term).toBe('Aggregate');
  });

  it('domain-event entry has the expected term label', () => {
    expect(GLOSSARY['domain-event'].term).toBe('Domain Event');
  });

  it('conflict entry has the expected term label', () => {
    expect(GLOSSARY['conflict'].term).toBe('Conflict');
  });
});
