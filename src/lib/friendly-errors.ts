import type { ErrorObject } from 'ajv';

/**
 * Maps AJV JSON Schema validation errors into plain-language messages
 * that non-technical users can understand and act on.
 */
export function friendlyValidationErrors(errors: ErrorObject[]): string[] {
  return errors.map(friendlySingle);
}

function friendlySingle(err: ErrorObject): string {
  switch (err.keyword) {
    case 'required':
      return handleRequired(err);
    case 'type':
      return handleType(err);
    case 'additionalProperties':
      return handleAdditionalProperties(err);
    case 'enum':
      return handleEnum(err);
    case 'pattern':
      return handlePattern(err);
    default:
      return fallback(err);
  }
}

// ---------------------------------------------------------------------------
// Required property missing
// ---------------------------------------------------------------------------

const REQUIRED_HINTS: Record<string, string> = {
  '/metadata': `Your file is missing the 'metadata' section at the top. Every file needs metadata with at least a 'role' and 'scope' — e.g., metadata: { role: 'your-role', scope: 'your-area' }`,
  '/domain_events': `Your file is missing the 'domain_events' section. Add a list of domain events — e.g., domain_events: [{ name: 'MyEvent', ... }]`,
  '/boundary_assumptions': `Your file is missing the 'boundary_assumptions' section. Add it even if empty — e.g., boundary_assumptions: []`,
  '/metadata/role': `Missing required field 'role' under metadata. Add it to identify who wrote this file — e.g., metadata: { role: 'backend-engineer', scope: 'payments' }`,
  '/metadata/scope': `Missing required field 'scope' under metadata. Add it to describe what area this file covers — e.g., scope: 'payments'`,
  '/metadata/goal': `Missing required field 'goal' under metadata. Add a short description of the project goal driving this event discovery`,
  '/metadata/generated_at': `Missing required field 'generated_at' under metadata. Add a timestamp — e.g., generated_at: '2026-01-01T00:00:00Z'`,
  '/metadata/event_count': `Missing required field 'event_count' under metadata. Add the number of domain events in this file — e.g., event_count: 5`,
  '/metadata/assumption_count': `Missing required field 'assumption_count' under metadata. Add the number of boundary assumptions — e.g., assumption_count: 0`,
};

function handleRequired(err: ErrorObject): string {
  const missing = (err.params as { missingProperty: string }).missingProperty;
  const path = err.instancePath || '';
  const fullPath = path ? `${path}/${missing}` : `/${missing}`;

  const hint = REQUIRED_HINTS[fullPath];
  if (hint) return hint;

  const location = path ? `under '${path.slice(1).replace(/\//g, '.')}'` : 'at the top level';
  return `Missing required field '${missing}' ${location}. Check that your file includes this field.`;
}

// ---------------------------------------------------------------------------
// Wrong type
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  array: 'a list',
  object: 'a section with named fields',
  string: 'text',
  number: 'a number',
  integer: 'a whole number',
  boolean: 'true or false',
};

function handleType(err: ErrorObject): string {
  const expected = (err.params as { type: string }).type;
  const path = err.instancePath || '/';
  const fieldName = lastSegment(path);
  const friendly = TYPE_LABELS[expected] ?? expected;

  if (fieldName === 'domain_events' && expected === 'array') {
    return `The 'domain_events' field should be a list of domain events, but got a single value. Wrap your events in square brackets: domain_events: [...]`;
  }
  if (fieldName === 'boundary_assumptions' && expected === 'array') {
    return `The 'boundary_assumptions' field should be a list, but got a single value. Wrap it in square brackets: boundary_assumptions: [...]`;
  }

  return `The '${fieldName}' field should be ${friendly}, but got something else. Check the value and try again.`;
}

// ---------------------------------------------------------------------------
// Additional properties
// ---------------------------------------------------------------------------

function handleAdditionalProperties(err: ErrorObject): string {
  const extra = (err.params as { additionalProperty: string }).additionalProperty;
  const path = err.instancePath || '/';
  const section = path === '/' ? 'the top level' : `'${path.slice(1).replace(/\//g, '.')}'`;

  return `Unexpected field '${extra}' in ${section}. This field is not recognized — check for typos or remove it.`;
}

// ---------------------------------------------------------------------------
// Enum mismatch
// ---------------------------------------------------------------------------

function handleEnum(err: ErrorObject): string {
  const allowed = (err.params as { allowedValues: string[] }).allowedValues;
  const path = err.instancePath || '/';
  const fieldName = lastSegment(path);

  return `Invalid value for '${fieldName}'. Allowed values are: ${allowed.join(', ')}. Check spelling and capitalization.`;
}

// ---------------------------------------------------------------------------
// Pattern mismatch
// ---------------------------------------------------------------------------

const PATTERN_HINTS: Record<string, string> = {
  '^[A-Z][a-zA-Z0-9]+$': 'Use PascalCase (start with a capital letter, letters and numbers only) — e.g., OrderPlaced, UserCreated',
  '^BA-\\d+$': "Use the format BA-1, BA-2, etc. for assumption IDs",
};

function handlePattern(err: ErrorObject): string {
  const pattern = (err.params as { pattern: string }).pattern;
  const path = err.instancePath || '/';
  const fieldName = lastSegment(path);
  const hint = PATTERN_HINTS[pattern];

  if (hint) {
    return `The value of '${fieldName}' does not match the expected format. ${hint}.`;
  }

  return `The value of '${fieldName}' does not match the expected format. Check the required pattern and try again.`;
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

function fallback(err: ErrorObject): string {
  const path = err.instancePath || '/';
  const message = err.message ?? 'validation failed';
  const fieldName = path === '/' ? 'your file' : `'${lastSegment(path)}'`;
  return `Problem with ${fieldName}: ${message}. Check the value and try again.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lastSegment(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? 'root';
}
