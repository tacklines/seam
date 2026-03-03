import { describe, it, expect } from 'vitest';
import { parseAndValidate } from './yaml-validator-server.js';
import type { LoadResult, LoadError } from './yaml-validator-server.js';

// Minimal valid YAML content matching candidate-events.schema.json
const VALID_YAML = `
metadata:
  role: "session-orchestration"
  scope: "Test domain scope"
  goal: "Test goal"
  generated_at: "2026-02-27T12:00:00Z"
  event_count: 1
  assumption_count: 1
domain_events:
  - name: "SessionCreated"
    aggregate: "Session"
    trigger: "User creates a new session"
    payload:
      - field: "session_id"
        type: "str"
    integration:
      direction: "internal"
    confidence: "CONFIRMED"
boundary_assumptions:
  - id: "BA-1"
    type: "ownership"
    statement: "The Session aggregate owns the lifecycle"
    affects_events:
      - "SessionCreated"
    confidence: "LIKELY"
    verify_with: "team discussion"
`;

describe('Given valid YAML matching the schema', () => {
  it('when parsed, returns ok: true with LoadedFile data', () => {
    const result = parseAndValidate('test.yaml', VALID_YAML);
    expect(result.ok).toBe(true);
    const loaded = (result as LoadResult).file;
    expect(loaded.filename).toBe('test.yaml');
    expect(loaded.role).toBe('session-orchestration');
    expect(loaded.data.domain_events).toHaveLength(1);
    expect(loaded.data.domain_events[0].name).toBe('SessionCreated');
  });

  it('when parsed, extracts metadata role as LoadedFile.role', () => {
    const result = parseAndValidate('my-file.yaml', VALID_YAML) as LoadResult;
    expect(result.ok).toBe(true);
    expect(result.file.role).toBe('session-orchestration');
    expect(result.file.filename).toBe('my-file.yaml');
  });

  it('when parsed, includes boundary_assumptions in the data', () => {
    const result = parseAndValidate('test.yaml', VALID_YAML) as LoadResult;
    expect(result.ok).toBe(true);
    expect(result.file.data.boundary_assumptions).toHaveLength(1);
    expect(result.file.data.boundary_assumptions[0].id).toBe('BA-1');
  });

  it('when domain_events array is empty, still returns ok: true', () => {
    const emptyEventsYaml = `
metadata:
  role: "empty-role"
  scope: "scope"
  goal: "goal"
  generated_at: "2026-02-27T12:00:00Z"
  event_count: 0
  assumption_count: 0
domain_events: []
boundary_assumptions: []
`;
    const result = parseAndValidate('empty.yaml', emptyEventsYaml);
    expect(result.ok).toBe(true);
    const loaded = (result as LoadResult).file;
    expect(loaded.data.domain_events).toHaveLength(0);
    expect(loaded.data.boundary_assumptions).toHaveLength(0);
  });

  it('when event has optional fields (state_change, sources, notes), returns ok: true', () => {
    const withOptionalFields = `
metadata:
  role: "full-role"
  scope: "scope"
  goal: "goal"
  generated_at: "2026-02-27T12:00:00Z"
  event_count: 1
  assumption_count: 0
domain_events:
  - name: "OrderPlaced"
    aggregate: "Order"
    trigger: "Customer places order"
    payload:
      - field: "order_id"
        type: "str"
    state_change: "(new) -> PLACED"
    integration:
      direction: "outbound"
      channel: "event store"
    sources:
      - "src/orders/events.py:10-15"
    confidence: "LIKELY"
    notes: "Optional notes field present"
boundary_assumptions: []
`;
    const result = parseAndValidate('optional.yaml', withOptionalFields);
    expect(result.ok).toBe(true);
  });
});

describe('Given invalid YAML syntax', () => {
  it('when parsed, returns ok: false with a YAML parse error message', () => {
    const badYaml = ':\n  - [invalid\nyaml: {unclosed';
    const result = parseAndValidate('bad.yaml', badYaml);
    expect(result.ok).toBe(false);
    const err = result as LoadError;
    expect(err.filename).toBe('bad.yaml');
    expect(err.errors.length).toBeGreaterThan(0);
    expect(err.errors[0]).toMatch(/YAML parse error/);
  });

  it('when YAML has tab characters instead of spaces, returns ok: false', () => {
    const tabYaml = 'metadata:\n\trole: "test"';
    const result = parseAndValidate('tabs.yaml', tabYaml);
    expect(result.ok).toBe(false);
    const err = result as LoadError;
    expect(err.errors[0]).toMatch(/YAML parse error/);
  });
});

describe('Given YAML that is not an object', () => {
  it('when content is empty string, returns ok: false', () => {
    const result = parseAndValidate('empty.yaml', '');
    expect(result.ok).toBe(false);
    const err = result as LoadError;
    expect(err.filename).toBe('empty.yaml');
    expect(err.errors).toHaveLength(1);
    expect(err.errors[0]).toMatch(/does not contain a YAML object/);
  });

  it('when content is a bare string, returns ok: false', () => {
    const result = parseAndValidate('string.yaml', '"just a string"');
    expect(result.ok).toBe(false);
    expect((result as LoadError).errors[0]).toMatch(/does not contain a YAML object/);
  });

  it('when content is a YAML array at top level, returns ok: false', () => {
    // A YAML array passes the typeof check (arrays are objects in JS) but fails
    // schema validation since the schema requires type: object at root
    const result = parseAndValidate('array.yaml', '- item1\n- item2\n');
    expect(result.ok).toBe(false);
    const err = result as LoadError;
    expect(err.filename).toBe('array.yaml');
    expect(err.errors.length).toBeGreaterThan(0);
  });

  it('when content is null YAML (just whitespace), returns ok: false', () => {
    const result = parseAndValidate('whitespace.yaml', '   \n  \n');
    expect(result.ok).toBe(false);
    expect((result as LoadError).errors[0]).toMatch(/does not contain a YAML object/);
  });
});

describe('Given YAML that fails schema validation', () => {
  it('when required top-level fields are missing, returns ok: false with errors', () => {
    const missingFields = `
metadata:
  role: "test"
domain_events: []
`;
    const result = parseAndValidate('partial.yaml', missingFields);
    expect(result.ok).toBe(false);
    const err = result as LoadError;
    expect(err.errors.length).toBeGreaterThan(0);
  });

  it('when metadata is missing required sub-fields, returns ok: false', () => {
    // metadata requires: role, scope, goal, generated_at, event_count, assumption_count
    const missingMetadataFields = `
metadata:
  role: "test"
domain_events: []
boundary_assumptions: []
`;
    const result = parseAndValidate('partial-meta.yaml', missingMetadataFields);
    expect(result.ok).toBe(false);
    const err = result as LoadError;
    expect(err.errors.length).toBeGreaterThan(0);
    expect(err.filename).toBe('partial-meta.yaml');
  });

  it('when domain_event name violates PascalCase pattern, returns ok: false', () => {
    // Per schema: domain_event.name must match ^[A-Z][a-zA-Z0-9]+$
    const badEventName = `
metadata:
  role: "test"
  scope: "s"
  goal: "g"
  generated_at: "2026-02-27T12:00:00Z"
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
    expect(err.errors.length).toBeGreaterThan(0);
  });

  it('when confidence has an invalid enum value, returns ok: false', () => {
    // Per schema: confidence must be CONFIRMED, LIKELY, or POSSIBLE
    const badConfidence = `
metadata:
  role: "test"
  scope: "s"
  goal: "g"
  generated_at: "2026-02-27T12:00:00Z"
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
    const err = result as LoadError;
    expect(err.errors.length).toBeGreaterThan(0);
  });

  it('when integration direction has invalid enum value, returns ok: false', () => {
    // Per schema: integration.direction must be inbound, outbound, or internal
    const badDirection = `
metadata:
  role: "test"
  scope: "s"
  goal: "g"
  generated_at: "2026-02-27T12:00:00Z"
  event_count: 1
  assumption_count: 0
domain_events:
  - name: "TestEvent"
    aggregate: "Agg"
    trigger: "trigger"
    payload: []
    integration:
      direction: "sideways"
    confidence: "CONFIRMED"
boundary_assumptions: []
`;
    const result = parseAndValidate('bad-dir.yaml', badDirection);
    expect(result.ok).toBe(false);
  });

  it('when boundary assumption id does not match BA-N pattern, returns ok: false', () => {
    // Per schema: boundary_assumption.id must match ^BA-\d+$
    const badAssumptionId = `
metadata:
  role: "test"
  scope: "s"
  goal: "g"
  generated_at: "2026-02-27T12:00:00Z"
  event_count: 0
  assumption_count: 1
domain_events: []
boundary_assumptions:
  - id: "ASSUMPTION-1"
    type: "ownership"
    statement: "something"
    affects_events: []
    confidence: "LIKELY"
    verify_with: "team"
`;
    const result = parseAndValidate('bad-assumption.yaml', badAssumptionId);
    expect(result.ok).toBe(false);
  });

  it('when boundary assumption type has invalid enum value, returns ok: false', () => {
    // Per schema: boundary_assumption.type must be ownership, contract, ordering, or existence
    const badAssumptionType = `
metadata:
  role: "test"
  scope: "s"
  goal: "g"
  generated_at: "2026-02-27T12:00:00Z"
  event_count: 0
  assumption_count: 1
domain_events: []
boundary_assumptions:
  - id: "BA-1"
    type: "unknown-type"
    statement: "something"
    affects_events: []
    confidence: "LIKELY"
    verify_with: "team"
`;
    const result = parseAndValidate('bad-assumption-type.yaml', badAssumptionType);
    expect(result.ok).toBe(false);
  });

  it('when event has extra unknown fields (additionalProperties: false), returns ok: false', () => {
    // Per schema: domain_event has additionalProperties: false
    const extraFields = `
metadata:
  role: "test"
  scope: "s"
  goal: "g"
  generated_at: "2026-02-27T12:00:00Z"
  event_count: 1
  assumption_count: 0
domain_events:
  - name: "TestEvent"
    aggregate: "Agg"
    trigger: "trigger"
    payload: []
    integration:
      direction: "internal"
    confidence: "CONFIRMED"
    unknown_extra_field: "this should fail"
boundary_assumptions: []
`;
    const result = parseAndValidate('extra-fields.yaml', extraFields);
    expect(result.ok).toBe(false);
  });

  it('when generated_at is not a valid date-time format, returns ok: false', () => {
    // Per schema: metadata.generated_at has format: date-time
    const badDatetime = `
metadata:
  role: "test"
  scope: "s"
  goal: "g"
  generated_at: "not-a-date"
  event_count: 0
  assumption_count: 0
domain_events: []
boundary_assumptions: []
`;
    const result = parseAndValidate('bad-datetime.yaml', badDatetime);
    expect(result.ok).toBe(false);
  });
});

describe('Given the LoadError return shape', () => {
  it('includes filename in error response when YAML is invalid', () => {
    const result = parseAndValidate('my-specific-file.yaml', '') as LoadError;
    expect(result.ok).toBe(false);
    expect(result.filename).toBe('my-specific-file.yaml');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('includes filename in error response when schema validation fails', () => {
    const result = parseAndValidate('schema-fail.yaml', 'metadata:\n  role: "x"\ndomain_events: []\nboundary_assumptions: []\n') as LoadError;
    expect(result.ok).toBe(false);
    expect(result.filename).toBe('schema-fail.yaml');
  });
});
