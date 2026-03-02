import type { DomainEvent } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Event suggestion heuristics — maps domain keywords to standard event
// patterns. Pure function: no side effects, no DOM dependencies.
//
// Extracted from src/server/mcp.ts so both server and client can share it.
// ---------------------------------------------------------------------------

interface DomainPattern {
  keywords: string[];
  events: Array<Omit<DomainEvent, 'name'> & { name: string }>;
}

export const DOMAIN_PATTERNS: DomainPattern[] = [
  {
    keywords: ['order', 'orders', 'ordering', 'purchase'],
    events: [
      { name: 'OrderCreated', aggregate: 'Order', trigger: 'Customer places order', payload: [{ field: 'orderId', type: 'string' }, { field: 'customerId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'OrderUpdated', aggregate: 'Order', trigger: 'Customer modifies order', payload: [{ field: 'orderId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'OrderCancelled', aggregate: 'Order', trigger: 'Customer or system cancels order', payload: [{ field: 'orderId', type: 'string' }, { field: 'reason', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'OrderCompleted', aggregate: 'Order', trigger: 'Order fulfillment complete', payload: [{ field: 'orderId', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'OrderFailed', aggregate: 'Order', trigger: 'Order processing fails', payload: [{ field: 'orderId', type: 'string' }, { field: 'error', type: 'string' }], integration: { direction: 'internal' }, confidence: 'POSSIBLE' },
    ],
  },
  {
    keywords: ['payment', 'payments', 'billing', 'invoice', 'charge'],
    events: [
      { name: 'PaymentInitiated', aggregate: 'Payment', trigger: 'Payment process starts', payload: [{ field: 'paymentId', type: 'string' }, { field: 'amount', type: 'number' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'PaymentCompleted', aggregate: 'Payment', trigger: 'Payment successfully processed', payload: [{ field: 'paymentId', type: 'string' }, { field: 'transactionId', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'PaymentFailed', aggregate: 'Payment', trigger: 'Payment processing fails', payload: [{ field: 'paymentId', type: 'string' }, { field: 'reason', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'PaymentRefunded', aggregate: 'Payment', trigger: 'Refund issued to customer', payload: [{ field: 'paymentId', type: 'string' }, { field: 'amount', type: 'number' }], integration: { direction: 'outbound' }, confidence: 'POSSIBLE' },
    ],
  },
  {
    keywords: ['ship', 'shipping', 'delivery', 'fulfillment', 'dispatch'],
    events: [
      { name: 'ShipmentCreated', aggregate: 'Shipment', trigger: 'Shipment record created', payload: [{ field: 'shipmentId', type: 'string' }, { field: 'orderId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'ShipmentDispatched', aggregate: 'Shipment', trigger: 'Package handed to carrier', payload: [{ field: 'shipmentId', type: 'string' }, { field: 'trackingNumber', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'ShipmentDelivered', aggregate: 'Shipment', trigger: 'Package delivered to recipient', payload: [{ field: 'shipmentId', type: 'string' }, { field: 'deliveredAt', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'LIKELY' },
      { name: 'ShipmentFailed', aggregate: 'Shipment', trigger: 'Delivery attempt fails', payload: [{ field: 'shipmentId', type: 'string' }, { field: 'reason', type: 'string' }], integration: { direction: 'outbound' }, confidence: 'POSSIBLE' },
    ],
  },
  {
    keywords: ['user', 'users', 'account', 'registration', 'signup', 'profile'],
    events: [
      { name: 'UserRegistered', aggregate: 'User', trigger: 'New user creates account', payload: [{ field: 'userId', type: 'string' }, { field: 'email', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'UserUpdated', aggregate: 'User', trigger: 'User updates profile', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'UserDeactivated', aggregate: 'User', trigger: 'Account deactivated', payload: [{ field: 'userId', type: 'string' }, { field: 'reason', type: 'string' }], integration: { direction: 'internal' }, confidence: 'POSSIBLE' },
      { name: 'UserDeleted', aggregate: 'User', trigger: 'Account permanently deleted', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'POSSIBLE' },
    ],
  },
  {
    keywords: ['auth', 'authentication', 'login', 'logout', 'session', 'token'],
    events: [
      { name: 'UserLoggedIn', aggregate: 'AuthSession', trigger: 'User authenticates successfully', payload: [{ field: 'userId', type: 'string' }, { field: 'sessionToken', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'UserLoggedOut', aggregate: 'AuthSession', trigger: 'User ends session', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'LoginFailed', aggregate: 'AuthSession', trigger: 'Authentication attempt fails', payload: [{ field: 'email', type: 'string' }, { field: 'reason', type: 'string' }], integration: { direction: 'internal' }, confidence: 'LIKELY' },
      { name: 'TokenRefreshed', aggregate: 'AuthSession', trigger: 'Access token refreshed', payload: [{ field: 'userId', type: 'string' }], integration: { direction: 'internal' }, confidence: 'POSSIBLE' },
    ],
  },
];

/**
 * Generate candidate domain events from a natural-language description.
 * Matches known domain keywords and filters out events already in existingEvents.
 *
 * @param description - Natural-language description of the system
 * @param existingEvents - Event names already on the canvas (filtered out of results)
 * @returns Array of DomainEvent candidates matching the description
 */
export function suggestEventsHeuristic(description: string, existingEvents: string[]): DomainEvent[] {
  if (!description.trim()) return [];

  const lower = description.toLowerCase();
  const existingSet = new Set(existingEvents.map((e) => e.toLowerCase()));
  const seen = new Set<string>();
  const results: DomainEvent[] = [];

  for (const pattern of DOMAIN_PATTERNS) {
    const matched = pattern.keywords.some((kw) => lower.includes(kw));
    if (!matched) continue;
    for (const event of pattern.events) {
      if (seen.has(event.name)) continue;
      if (existingSet.has(event.name.toLowerCase())) continue;
      seen.add(event.name);
      results.push(event);
    }
  }

  return results;
}
