import { describe, it, expect } from 'vitest';
import { matchAssumptions } from './assumption-matching.js';
import type { LoadedFile } from '../schema/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFile(role: string): LoadedFile {
  return {
    filename: `${role}.yaml`,
    role,
    data: {
      metadata: {
        role,
        scope: 'test',
        goal: 'test',
        generated_at: '2026-01-01',
        event_count: 0,
        assumption_count: 0,
      },
      domain_events: [],
      boundary_assumptions: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('matchAssumptions', () => {
  describe('given a single file', () => {
    it('returns all assumptions as unmatched (no cross-role matching possible)', () => {
      const files: LoadedFile[] = [
        {
          ...makeFile('payments'),
          data: {
            ...makeFile('payments').data,
            domain_events: [
              {
                name: 'PaymentProcessed',
                aggregate: 'Payment',
                trigger: 'user pays',
                payload: [{ field: 'amount', type: 'number' }],
                integration: { direction: 'outbound' },
                confidence: 'CONFIRMED',
              },
            ],
            boundary_assumptions: [
              {
                id: 'a1',
                type: 'contract',
                statement: 'PaymentProcessed triggers order fulfillment',
                affects_events: ['PaymentProcessed'],
                confidence: 'LIKELY',
                verify_with: 'orders team',
              },
            ],
          },
        },
      ];

      const result = matchAssumptions(files);
      expect(result).toHaveLength(1);
      expect(result[0].matched).toBe(false);
      expect(result[0].matchedEvents).toHaveLength(0);
    });
  });

  describe('given two files', () => {
    it('matches via direct event name in affects_events defined by another role', () => {
      const files: LoadedFile[] = [
        {
          ...makeFile('orders'),
          data: {
            ...makeFile('orders').data,
            domain_events: [],
            boundary_assumptions: [
              {
                id: 'a1',
                type: 'contract',
                statement: 'I assume the cancel endpoint returns a case ID',
                affects_events: ['PaymentRefunded'],
                confidence: 'POSSIBLE',
                verify_with: 'payments team',
              },
            ],
          },
        },
        {
          ...makeFile('payments'),
          data: {
            ...makeFile('payments').data,
            domain_events: [
              {
                name: 'PaymentRefunded',
                aggregate: 'Payment',
                trigger: 'refund requested',
                payload: [{ field: 'salesforceCaseId', type: 'string' }],
                integration: { direction: 'outbound' },
                confidence: 'CONFIRMED',
              },
            ],
            boundary_assumptions: [],
          },
        },
      ];

      const result = matchAssumptions(files);
      const ordersAssumptions = result.filter((r) => r.assumptionRole === 'orders');
      expect(ordersAssumptions).toHaveLength(1);

      const match = ordersAssumptions[0];
      expect(match.matched).toBe(true);
      expect(match.matchedEvents).toHaveLength(1);
      expect(match.matchedEvents[0].eventName).toBe('PaymentRefunded');
      expect(match.matchedEvents[0].role).toBe('payments');
      expect(match.matchedEvents[0].matchReason).toContain('affects_events');
    });

    it('matches via keyword in assumption statement against payload field names', () => {
      const files: LoadedFile[] = [
        {
          ...makeFile('orders'),
          data: {
            ...makeFile('orders').data,
            domain_events: [],
            boundary_assumptions: [
              {
                id: 'b1',
                type: 'contract',
                statement: 'I assume the cancel endpoint returns salesforceCaseId',
                affects_events: ['OrderCancelled'],
                confidence: 'POSSIBLE',
                verify_with: 'crm team',
              },
            ],
          },
        },
        {
          ...makeFile('crm'),
          data: {
            ...makeFile('crm').data,
            domain_events: [
              {
                name: 'CaseCreated',
                aggregate: 'Case',
                trigger: 'case opened',
                payload: [{ field: 'salesforceCaseId', type: 'string' }],
                integration: { direction: 'internal' },
                confidence: 'CONFIRMED',
              },
            ],
            boundary_assumptions: [],
          },
        },
      ];

      const result = matchAssumptions(files);
      const ordersAssumptions = result.filter((r) => r.assumptionRole === 'orders');
      expect(ordersAssumptions).toHaveLength(1);

      const match = ordersAssumptions[0];
      expect(match.matched).toBe(true);
      // Should have found CaseCreated because 'salesforcecaseid' tokenizes to overlap with payload
      expect(match.matchedEvents.some((m) => m.eventName === 'CaseCreated')).toBe(true);
    });

    it('returns unmatched when assumption has no cross-role fulfillment', () => {
      const files: LoadedFile[] = [
        {
          ...makeFile('frontend'),
          data: {
            ...makeFile('frontend').data,
            domain_events: [],
            boundary_assumptions: [
              {
                id: 'c1',
                type: 'existence',
                statement: 'UserPreferencesLoaded event will be published on page load',
                affects_events: ['UserPreferencesLoaded'],
                confidence: 'POSSIBLE',
                verify_with: 'backend team',
              },
            ],
          },
        },
        {
          ...makeFile('backend'),
          data: {
            ...makeFile('backend').data,
            domain_events: [
              {
                name: 'OrderShipped',
                aggregate: 'Order',
                trigger: 'shipment confirmed',
                payload: [{ field: 'trackingNumber', type: 'string' }],
                integration: { direction: 'outbound' },
                confidence: 'CONFIRMED',
              },
            ],
            boundary_assumptions: [],
          },
        },
      ];

      const result = matchAssumptions(files);
      const frontendAssumptions = result.filter((r) => r.assumptionRole === 'frontend');
      expect(frontendAssumptions).toHaveLength(1);
      expect(frontendAssumptions[0].matched).toBe(false);
      expect(frontendAssumptions[0].matchedEvents).toHaveLength(0);
    });

    it('does not produce duplicate matched events when both rules fire for the same event', () => {
      // affects_events references an event that also has keyword overlap in the statement
      const files: LoadedFile[] = [
        {
          ...makeFile('orders'),
          data: {
            ...makeFile('orders').data,
            domain_events: [],
            boundary_assumptions: [
              {
                id: 'd1',
                type: 'contract',
                statement: 'PaymentRefunded should carry the refundAmount',
                affects_events: ['PaymentRefunded'],
                confidence: 'LIKELY',
                verify_with: 'payments team',
              },
            ],
          },
        },
        {
          ...makeFile('payments'),
          data: {
            ...makeFile('payments').data,
            domain_events: [
              {
                name: 'PaymentRefunded',
                aggregate: 'Payment',
                trigger: 'refund requested',
                payload: [{ field: 'refundAmount', type: 'number' }],
                integration: { direction: 'outbound' },
                confidence: 'CONFIRMED',
              },
            ],
            boundary_assumptions: [],
          },
        },
      ];

      const result = matchAssumptions(files);
      const ordersAssumptions = result.filter((r) => r.assumptionRole === 'orders');
      const paymentRefundedMatches = ordersAssumptions[0].matchedEvents.filter(
        (m) => m.eventName === 'PaymentRefunded' && m.role === 'payments'
      );
      // Should not be duplicated
      expect(paymentRefundedMatches).toHaveLength(1);
    });
  });

  describe('given an empty files array', () => {
    it('returns an empty array', () => {
      expect(matchAssumptions([])).toEqual([]);
    });
  });
});
