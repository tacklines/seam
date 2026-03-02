import { describe, it, expect } from 'vitest';
import { suggestEventsHeuristic } from './event-suggestions.js';

// ---------------------------------------------------------------------------
// Tests for suggestEventsHeuristic pure function
// ---------------------------------------------------------------------------

describe('suggestEventsHeuristic', () => {
  describe('Given an empty description', () => {
    it('returns empty array for empty string', () => {
      expect(suggestEventsHeuristic('', [])).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(suggestEventsHeuristic('   ', [])).toEqual([]);
    });
  });

  describe('Given descriptions with known domain keywords', () => {
    it('returns order events when description contains "order"', () => {
      const results = suggestEventsHeuristic('An e-commerce platform with orders', []);
      const names = results.map((e) => e.name);
      expect(names).toContain('OrderCreated');
      expect(names).toContain('OrderCancelled');
      expect(names).toContain('OrderCompleted');
    });

    it('returns payment events when description contains "payment"', () => {
      const results = suggestEventsHeuristic('A system with payment processing', []);
      const names = results.map((e) => e.name);
      expect(names).toContain('PaymentInitiated');
      expect(names).toContain('PaymentCompleted');
      expect(names).toContain('PaymentFailed');
    });

    it('returns shipment events when description contains "shipping"', () => {
      const results = suggestEventsHeuristic('A platform with shipping and delivery', []);
      const names = results.map((e) => e.name);
      expect(names).toContain('ShipmentCreated');
      expect(names).toContain('ShipmentDispatched');
      expect(names).toContain('ShipmentDelivered');
    });

    it('returns user events when description contains "user"', () => {
      const results = suggestEventsHeuristic('A user registration system', []);
      const names = results.map((e) => e.name);
      expect(names).toContain('UserRegistered');
      expect(names).toContain('UserUpdated');
    });

    it('returns auth events when description contains "login"', () => {
      const results = suggestEventsHeuristic('Authentication with login and logout', []);
      const names = results.map((e) => e.name);
      expect(names).toContain('UserLoggedIn');
      expect(names).toContain('UserLoggedOut');
      expect(names).toContain('LoginFailed');
    });

    it('returns events from multiple matched keyword groups', () => {
      const results = suggestEventsHeuristic('An e-commerce platform with orders, payments, and shipping', []);
      const names = results.map((e) => e.name);
      // All three groups should match
      expect(names).toContain('OrderCreated');
      expect(names).toContain('PaymentInitiated');
      expect(names).toContain('ShipmentCreated');
    });
  });

  describe('Given existing events to filter out', () => {
    it('filters out events that already exist (exact case match)', () => {
      const results = suggestEventsHeuristic('A system with orders', ['OrderCreated', 'OrderUpdated']);
      const names = results.map((e) => e.name);
      expect(names).not.toContain('OrderCreated');
      expect(names).not.toContain('OrderUpdated');
      // Other order events should still appear
      expect(names).toContain('OrderCancelled');
    });

    it('filters out existing events case-insensitively', () => {
      const results = suggestEventsHeuristic('A system with orders', ['ordercreated']);
      const names = results.map((e) => e.name);
      expect(names).not.toContain('OrderCreated');
    });

    it('returns empty array when all matching events already exist', () => {
      const existingEvents = ['OrderCreated', 'OrderUpdated', 'OrderCancelled', 'OrderCompleted', 'OrderFailed'];
      const results = suggestEventsHeuristic('A system with orders', existingEvents);
      expect(results).toEqual([]);
    });
  });

  describe('Given case sensitivity', () => {
    it('matches keywords case-insensitively in the description', () => {
      const lower = suggestEventsHeuristic('a system with ORDER management', []);
      const upper = suggestEventsHeuristic('a system with order management', []);
      expect(lower.map((e) => e.name)).toEqual(upper.map((e) => e.name));
    });

    it('matches ORDERS in uppercase description', () => {
      const results = suggestEventsHeuristic('ORDERS AND PAYMENTS', []);
      const names = results.map((e) => e.name);
      expect(names).toContain('OrderCreated');
      expect(names).toContain('PaymentInitiated');
    });
  });

  describe('Given result shape', () => {
    it('returns DomainEvent objects with required fields', () => {
      const results = suggestEventsHeuristic('An order system', []);
      expect(results.length).toBeGreaterThan(0);
      for (const event of results) {
        expect(event).toHaveProperty('name');
        expect(event).toHaveProperty('aggregate');
        expect(event).toHaveProperty('trigger');
        expect(event).toHaveProperty('payload');
        expect(event).toHaveProperty('integration');
        expect(event).toHaveProperty('confidence');
      }
    });

    it('does not return duplicate events across multiple keyword matches', () => {
      // "purchase" and "order" both match the order group
      const results = suggestEventsHeuristic('order and purchase system', []);
      const names = results.map((e) => e.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });
  });

  describe('Given unrecognized description', () => {
    it('returns empty array for unrecognized domain', () => {
      const results = suggestEventsHeuristic('A rocket science system with orbital mechanics', []);
      expect(results).toEqual([]);
    });
  });
});
