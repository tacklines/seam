import type { Requirement, DomainEvent } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Requirement-to-event derivation heuristics — maps requirement text to
// candidate domain events using keyword pattern matching.
// Pure function: no side effects, no DOM dependencies.
// ---------------------------------------------------------------------------

/** A derived event suggestion with metadata about its source requirement */
export interface DerivedEventSuggestion {
  name: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  trigger: string;
  stateChange: string;
}

/** Suggestions grouped by the requirement they were derived from */
export interface RequirementDerivation {
  requirementId: string;
  events: DerivedEventSuggestion[];
}

// ---------------------------------------------------------------------------
// Keyword-to-event patterns
// ---------------------------------------------------------------------------

interface DerivationPattern {
  keywords: string[];
  events: DerivedEventSuggestion[];
}

const DERIVATION_PATTERNS: DerivationPattern[] = [
  {
    keywords: ['create', 'register', 'sign up', 'add new', 'submit'],
    events: [
      { name: 'EntityCreated', description: 'A new entity is created in the system', confidence: 'high', trigger: 'User or system initiates creation', stateChange: 'Entity transitions from non-existent to active' },
    ],
  },
  {
    keywords: ['update', 'modify', 'change', 'edit', 'revise'],
    events: [
      { name: 'EntityUpdated', description: 'An existing entity is modified', confidence: 'high', trigger: 'User or system requests a change', stateChange: 'Entity fields are updated to new values' },
    ],
  },
  {
    keywords: ['delete', 'remove', 'cancel', 'deactivate', 'archive'],
    events: [
      { name: 'EntityRemoved', description: 'An entity is removed or deactivated', confidence: 'high', trigger: 'User or system requests removal', stateChange: 'Entity transitions to removed/inactive state' },
    ],
  },
  {
    keywords: ['approve', 'accept', 'confirm', 'authorize', 'verify'],
    events: [
      { name: 'EntityApproved', description: 'An entity or action is approved', confidence: 'high', trigger: 'Authorized user grants approval', stateChange: 'Entity transitions from pending to approved' },
      { name: 'EntityRejected', description: 'An entity or action is rejected', confidence: 'medium', trigger: 'Authorized user denies approval', stateChange: 'Entity transitions from pending to rejected' },
    ],
  },
  {
    keywords: ['notify', 'alert', 'send', 'email', 'message'],
    events: [
      { name: 'NotificationSent', description: 'A notification is dispatched to a recipient', confidence: 'high', trigger: 'System or user triggers notification', stateChange: 'Notification record created with delivery status' },
      { name: 'NotificationFailed', description: 'A notification delivery fails', confidence: 'medium', trigger: 'Delivery attempt encounters an error', stateChange: 'Notification marked as failed with retry metadata' },
    ],
  },
  {
    keywords: ['pay', 'charge', 'bill', 'invoice', 'refund'],
    events: [
      { name: 'PaymentProcessed', description: 'A payment transaction is completed', confidence: 'high', trigger: 'Payment gateway processes the charge', stateChange: 'Payment record created with transaction ID' },
      { name: 'PaymentFailed', description: 'A payment transaction fails', confidence: 'medium', trigger: 'Payment gateway returns an error', stateChange: 'Payment marked as failed with error details' },
    ],
  },
  {
    keywords: ['search', 'find', 'query', 'lookup', 'filter'],
    events: [
      { name: 'SearchExecuted', description: 'A search or query is performed', confidence: 'medium', trigger: 'User or system initiates a search', stateChange: 'Search results are computed and returned' },
    ],
  },
  {
    keywords: ['import', 'upload', 'ingest', 'load', 'sync'],
    events: [
      { name: 'DataImported', description: 'External data is ingested into the system', confidence: 'high', trigger: 'User uploads or system syncs data', stateChange: 'New records created from imported data' },
      { name: 'ImportFailed', description: 'A data import operation fails', confidence: 'medium', trigger: 'Import encounters validation or connectivity errors', stateChange: 'Import job marked as failed with error details' },
    ],
  },
  {
    keywords: ['export', 'download', 'generate report', 'extract'],
    events: [
      { name: 'DataExported', description: 'Data is exported or a report is generated', confidence: 'high', trigger: 'User requests data export', stateChange: 'Export artifact created and made available' },
    ],
  },
  {
    keywords: ['assign', 'delegate', 'allocate', 'transfer'],
    events: [
      { name: 'EntityAssigned', description: 'An entity is assigned to an owner or handler', confidence: 'high', trigger: 'User or system assigns ownership', stateChange: 'Entity owner field updated to new assignee' },
    ],
  },
];

/**
 * Extract a contextual prefix from the requirement text to make event names
 * more specific. For example, "Users should be able to create orders" yields "Order".
 */
function extractContext(text: string): string | null {
  // Look for common domain nouns after keywords
  const nounPatterns = [
    /(?:create|register|add|submit|update|modify|delete|remove|cancel|approve|assign)\s+(?:a\s+|an\s+|the\s+)?(\w+)/i,
    /(\w+)\s+(?:should|must|can|will|shall)\b/i,
  ];

  for (const pattern of nounPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const noun = match[1];
      // Skip common stop words
      if (['the', 'a', 'an', 'be', 'able', 'user', 'users', 'system', 'they', 'it'].includes(noun.toLowerCase())) {
        continue;
      }
      return noun.charAt(0).toUpperCase() + noun.slice(1).toLowerCase();
    }
  }
  return null;
}

/**
 * Derive candidate domain events from a single requirement based on keyword matching.
 *
 * @param requirement - The requirement to analyze
 * @param existingEvents - Domain events already in the session (to avoid duplicates)
 * @returns Array of derived event suggestions
 */
export function deriveFromRequirement(
  requirement: Requirement,
  existingEvents: DomainEvent[]
): DerivedEventSuggestion[] {
  const text = requirement.text.toLowerCase();
  const existingNames = new Set(existingEvents.map((e) => e.name.toLowerCase()));
  const seen = new Set<string>();
  const results: DerivedEventSuggestion[] = [];
  const context = extractContext(requirement.text);

  for (const pattern of DERIVATION_PATTERNS) {
    const matched = pattern.keywords.some((kw) => text.includes(kw));
    if (!matched) continue;

    for (const event of pattern.events) {
      // Contextualize the event name if we extracted a domain noun
      const name = context
        ? event.name.replace('Entity', context)
        : event.name;

      if (seen.has(name.toLowerCase())) continue;
      if (existingNames.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());

      results.push({
        ...event,
        name,
        description: context
          ? event.description.replace(/entity/gi, context.toLowerCase())
          : event.description,
      });
    }
  }

  return results;
}

/**
 * Derive candidate domain events from multiple requirements.
 * Returns suggestions grouped by requirement ID.
 *
 * @param requirements - The requirements to analyze
 * @param existingEvents - Domain events already in the session
 * @returns Array of derivation results, one per requirement
 */
export function deriveFromRequirements(
  requirements: Requirement[],
  existingEvents: DomainEvent[]
): RequirementDerivation[] {
  return requirements.map((req) => ({
    requirementId: req.id,
    events: deriveFromRequirement(req, existingEvents),
  }));
}
