import { describe, it, expect } from 'vitest';
import type { ErrorObject } from 'ajv';
import { friendlyValidationErrors } from './friendly-errors.js';

/** Helper to build a minimal AJV ErrorObject for testing */
function makeError(overrides: Partial<ErrorObject> & { keyword: string }): ErrorObject {
  return {
    instancePath: '',
    schemaPath: '',
    message: 'validation error',
    params: {},
    ...overrides,
  } as ErrorObject;
}

describe('Given a missing required property at root level', () => {
  it('when metadata is missing, explains the metadata section', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'required',
        instancePath: '',
        params: { missingProperty: 'metadata' },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('metadata');
    expect(errors[0]).toContain('role');
    expect(errors[0]).toContain('scope');
  });

  it('when domain_events is missing, explains the events section', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'required',
        instancePath: '',
        params: { missingProperty: 'domain_events' },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('domain_events');
    expect(errors[0]).toContain('list');
  });

  it('when boundary_assumptions is missing, suggests adding it empty', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'required',
        instancePath: '',
        params: { missingProperty: 'boundary_assumptions' },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('boundary_assumptions');
    expect(errors[0]).toContain('[]');
  });
});

describe('Given a missing required property nested under metadata', () => {
  it('when role is missing, suggests adding it with an example', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'required',
        instancePath: '/metadata',
        params: { missingProperty: 'role' },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("'role'");
    expect(errors[0]).toContain('metadata');
    expect(errors[0]).toContain('backend-engineer');
  });

  it('when scope is missing, suggests adding it', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'required',
        instancePath: '/metadata',
        params: { missingProperty: 'scope' },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("'scope'");
    expect(errors[0]).toContain('area');
  });
});

describe('Given a wrong type error', () => {
  it('when domain_events is not an array, explains it should be a list', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'type',
        instancePath: '/domain_events',
        params: { type: 'array' },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('domain_events');
    expect(errors[0]).toContain('list');
    expect(errors[0]).toContain('square brackets');
  });

  it('when a generic field has wrong type, uses a friendly label', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'type',
        instancePath: '/metadata/event_count',
        params: { type: 'integer' },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('event_count');
    expect(errors[0]).toContain('whole number');
  });
});

describe('Given an additional properties error', () => {
  it('when an unknown field is at root, names the field and suggests removal', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'additionalProperties',
        instancePath: '',
        params: { additionalProperty: 'extra_stuff' },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('extra_stuff');
    expect(errors[0]).toContain('not recognized');
  });

  it('when an unknown field is nested, names the section', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'additionalProperties',
        instancePath: '/metadata',
        params: { additionalProperty: 'author' },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('author');
    expect(errors[0]).toContain('metadata');
  });
});

describe('Given an enum mismatch error', () => {
  it('when confidence has invalid value, lists allowed values', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'enum',
        instancePath: '/domain_events/0/confidence',
        params: { allowedValues: ['CONFIRMED', 'LIKELY', 'POSSIBLE'] },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('confidence');
    expect(errors[0]).toContain('CONFIRMED');
    expect(errors[0]).toContain('LIKELY');
    expect(errors[0]).toContain('POSSIBLE');
  });

  it('when direction has invalid value, lists allowed values', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'enum',
        instancePath: '/domain_events/0/integration/direction',
        params: { allowedValues: ['inbound', 'outbound', 'internal'] },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('direction');
    expect(errors[0]).toContain('inbound');
  });
});

describe('Given a pattern mismatch error', () => {
  it('when event name fails PascalCase, explains the format', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'pattern',
        instancePath: '/domain_events/0/name',
        params: { pattern: '^[A-Z][a-zA-Z0-9]+$' },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('name');
    expect(errors[0]).toContain('PascalCase');
  });

  it('when assumption id fails BA-N pattern, explains the format', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'pattern',
        instancePath: '/boundary_assumptions/0/id',
        params: { pattern: '^BA-\\d+$' },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('BA-1');
  });
});

describe('Given an unknown/fallback error', () => {
  it('returns a cleaned version of the AJV message', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'minimum',
        instancePath: '/metadata/event_count',
        message: 'must be >= 0',
        params: { limit: 0 },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('event_count');
    expect(errors[0]).toContain('must be >= 0');
  });
});

describe('Given multiple errors at once', () => {
  it('returns a friendly message for each error', () => {
    const errors = friendlyValidationErrors([
      makeError({
        keyword: 'required',
        instancePath: '/metadata',
        params: { missingProperty: 'role' },
      }),
      makeError({
        keyword: 'required',
        instancePath: '/metadata',
        params: { missingProperty: 'scope' },
      }),
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("'role'");
    expect(errors[1]).toContain("'scope'");
  });
});
