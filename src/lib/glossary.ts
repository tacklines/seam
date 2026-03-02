/**
 * Glossary of DDD / Event Storming domain terms with plain-language definitions.
 *
 * Keys map to i18n message keys via `glossary.<key>`.
 * The `term` field is the display name; `definition` is the fallback English text
 * (the canonical copy lives in i18n.ts so it can be localised later).
 */

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  'aggregate': {
    term: 'Aggregate',
    definition: 'A cluster of related things that change together. Think of it as a "unit of work" — like an Order with its line items.',
  },
  'domain-event': {
    term: 'Domain Event',
    definition: 'Something important that happened in your system. Written in past tense, like "OrderPlaced" or "PaymentReceived".',
  },
  'bounded-context': {
    term: 'Bounded Context',
    definition: "A team's area of responsibility. Each context has its own vocabulary — \"Account\" means different things to Sales vs. Billing.",
  },
  'command': {
    term: 'Command',
    definition: 'An action someone or something requests. Like "Place Order" or "Cancel Subscription". Commands can succeed or fail.',
  },
  'policy': {
    term: 'Policy',
    definition: 'An automatic reaction to an event. "When payment fails, notify the customer." Policies connect events to commands.',
  },
  'read-model': {
    term: 'Read Model',
    definition: 'A view built from events to answer a specific question. Like a dashboard showing "Orders this month".',
  },
  'assumption': {
    term: 'Assumption',
    definition: "Something you believe is true but haven't proven. Surfacing assumptions early prevents expensive surprises later.",
  },
  'overlap': {
    term: 'Overlap',
    definition: 'When two people describe the same event differently. Overlaps are opportunities for alignment, not errors.',
  },
  'conflict': {
    term: 'Conflict',
    definition: 'A disagreement about how something should work. Conflicts are valuable — they reveal hidden complexity.',
  },
  'contract': {
    term: 'Contract',
    definition: "A formal agreement about an event's shape and meaning. Contracts prevent miscommunication between teams.",
  },
};
