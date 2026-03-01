import { describe, it, expect } from 'vitest';
import { t, messages } from './i18n';

describe('t()', () => {
  it('returns the message for a known key', () => {
    expect(t('shell.title')).toBe('Storm-Prep');
    expect(t('shell.addFiles')).toBe('Add files');
  });

  it('returns the key itself for an unknown key (graceful fallback)', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
    expect(t('missing')).toBe('missing');
  });

  it('returns the template unchanged when no params provided', () => {
    expect(t('cardView.empty')).toBe('Load a storm-prep YAML file to view events');
  });

  it('interpolates a single parameter', () => {
    expect(t('cardView.nEvents', { total: 5 })).toBe('5 events');
    expect(t('flowSearch.matchCount', { current: 2, total: 7 })).toBe('2 of 7 matches');
  });

  it('interpolates multiple parameters', () => {
    expect(t('aggregateNav.filterAriaLabel', { name: 'Order', count: 12 })).toBe(
      'Filter by aggregate: Order, 12 events'
    );
  });

  it('interpolates string parameters', () => {
    expect(t('detailPanel.closeAriaLabel', { name: 'OrderPlaced' })).toBe(
      'Close detail panel for OrderPlaced'
    );
  });

  it('leaves un-supplied {{placeholders}} intact', () => {
    expect(t('cardView.nEvents', {})).toBe('{{total}} events');
  });

  it('handles numeric zero as a valid param', () => {
    expect(t('flowSearch.matchCount', { current: 0, total: 0 })).toBe('0 of 0 matches');
  });

  it('all message values are non-empty strings', () => {
    for (const [key, value] of Object.entries(messages)) {
      expect(typeof value, `key "${key}" should be a string`).toBe('string');
      expect(value.length, `key "${key}" should not be empty`).toBeGreaterThan(0);
    }
  });
});
