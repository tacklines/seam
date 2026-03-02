import { describe, it, expect } from 'vitest';
import { parseAndValidate } from './yaml-loader.js';
import type { LoadResult, LoadError } from './yaml-loader.js';

// Minimal valid YAML content matching candidate-events.schema.json
const VALID_YAML = `
metadata:
  role: "test-role"
  scope: "Test scope"
  goal: "Test goal"
  generated_at: "2026-02-27T10:00:00Z"
  event_count: 1
  assumption_count: 0
domain_events:
  - name: "TestEvent"
    aggregate: "TestAgg"
    trigger: "User does something"
    payload:
      - field: "test_id"
        type: "str"
    integration:
      direction: "internal"
    confidence: "CONFIRMED"
boundary_assumptions: []
`;

describe('Given valid YAML matching the schema', () => {
  it('when parsed, returns ok: true with LoadedFile data', () => {
    // Per schema: valid file has metadata, domain_events, boundary_assumptions
    const result = parseAndValidate('test.yaml', VALID_YAML);
    expect(result.ok).toBe(true);
    const loaded = (result as LoadResult).file;
    expect(loaded.filename).toBe('test.yaml');
    expect(loaded.role).toBe('test-role');
    expect(loaded.data.domain_events).toHaveLength(1);
    expect(loaded.data.domain_events[0].name).toBe('TestEvent');
  });

  it('when parsed, extracts metadata role as LoadedFile.role', () => {
    // Per schema: metadata.role is a required string
    const result = parseAndValidate('my-file.yaml', VALID_YAML) as LoadResult;
    expect(result.ok).toBe(true);
    expect(result.file.role).toBe('test-role');
  });
});

describe('Given invalid YAML syntax', () => {
  it('when parsed, returns ok: false with YAML parse error', () => {
    // Per yaml-loader.ts:31 — catches yaml.load exceptions
    const badYaml = ':\n  - [invalid\nyaml';
    const result = parseAndValidate('bad.yaml', badYaml);
    expect(result.ok).toBe(false);
    const err = result as LoadError;
    expect(err.filename).toBe('bad.yaml');
    expect(err.errors.length).toBeGreaterThan(0);
    expect(err.errors[0]).toMatch(/could not be read as valid YAML/);
  });
});

describe('Given YAML that is not an object', () => {
  it('when content is a bare string, returns ok: false', () => {
    // Per yaml-loader.ts:39 — checks parsed is object
    const result = parseAndValidate('string.yaml', '"just a string"');
    expect(result.ok).toBe(false);
    expect((result as LoadError).errors[0]).toMatch(/does not contain the expected structure/);
  });

  it('when content is null, returns ok: false', () => {
    // Per yaml-loader.ts:39 — !parsed check
    const result = parseAndValidate('empty.yaml', '');
    expect(result.ok).toBe(false);
  });
});

describe('Given YAML that fails schema validation', () => {
  it('when required metadata fields are missing, returns validation errors', () => {
    // Per schema: metadata requires role, scope, goal, generated_at, event_count, assumption_count
    const missingMetadata = `
metadata:
  role: "test"
domain_events: []
boundary_assumptions: []
`;
    const result = parseAndValidate('partial.yaml', missingMetadata);
    expect(result.ok).toBe(false);
    const err = result as LoadError;
    expect(err.errors.length).toBeGreaterThan(0);
    // Should mention missing required properties
    expect(err.errors.some((e) => e.includes('metadata'))).toBe(true);
  });

  it('when event name violates PascalCase pattern, returns validation error', () => {
    // Per schema: domain_event.name pattern is ^[A-Z][a-zA-Z0-9]+$
    const badEventName = `
metadata:
  role: "test"
  scope: "s"
  goal: "g"
  generated_at: "2026-02-27T10:00:00Z"
  event_count: 1
  assumption_count: 0
domain_events:
  - name: "bad_event_name"
    aggregate: "Agg"
    trigger: "trigger"
    payload: []
    integration:
      direction: "internal"
    confidence: "CONFIRMED"
boundary_assumptions: []
`;
    const result = parseAndValidate('bad-name.yaml', badEventName);
    expect(result.ok).toBe(false);
    const err = result as LoadError;
    expect(err.errors.some((e) => e.includes('PascalCase'))).toBe(true);
  });

  it('when confidence has invalid value, returns validation error', () => {
    // Per schema: confidence enum is CONFIRMED, LIKELY, POSSIBLE
    const badConfidence = `
metadata:
  role: "test"
  scope: "s"
  goal: "g"
  generated_at: "2026-02-27T10:00:00Z"
  event_count: 1
  assumption_count: 0
domain_events:
  - name: "TestEvent"
    aggregate: "Agg"
    trigger: "trigger"
    payload: []
    integration:
      direction: "internal"
    confidence: "MAYBE"
boundary_assumptions: []
`;
    const result = parseAndValidate('bad-conf.yaml', badConfidence);
    expect(result.ok).toBe(false);
  });
});
