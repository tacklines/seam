import { describe, it, expect } from 'vitest';
import { categorizeError } from './error-categorization.js';

describe('categorizeError', () => {
  describe('network errors', () => {
    it('categorizes TypeError: Failed to fetch as network error', () => {
      const error = new TypeError('Failed to fetch');
      const result = categorizeError(error);
      expect(result.message).toBe('errorBoundary.networkError');
      expect(result.retryable).toBe(true);
    });

    it('categorizes TypeError: NetworkError as network error', () => {
      const error = new TypeError('NetworkError when attempting to fetch resource.');
      const result = categorizeError(error);
      expect(result.message).toBe('errorBoundary.networkError');
      expect(result.retryable).toBe(true);
    });

    it('categorizes error with name NetworkError as network error', () => {
      const error = new Error('Connection refused');
      error.name = 'NetworkError';
      const result = categorizeError(error);
      expect(result.message).toBe('errorBoundary.networkError');
      expect(result.retryable).toBe(true);
    });
  });

  describe('timeout errors', () => {
    it('categorizes AbortError as timeout error', () => {
      const error = new Error('The user aborted a request.');
      error.name = 'AbortError';
      const result = categorizeError(error);
      expect(result.message).toBe('errorBoundary.timeoutError');
      expect(result.retryable).toBe(true);
    });

    it('categorizes TimeoutError as timeout error', () => {
      const error = new Error('Request timed out after 30s.');
      error.name = 'TimeoutError';
      const result = categorizeError(error);
      expect(result.message).toBe('errorBoundary.timeoutError');
      expect(result.retryable).toBe(true);
    });
  });

  describe('unexpected errors', () => {
    it('categorizes generic Error as unexpected error', () => {
      const error = new Error('foo');
      const result = categorizeError(error);
      expect(result.message).toBe('errorBoundary.unexpectedError');
      expect(result.retryable).toBe(false);
    });

    it('categorizes a string as unexpected error', () => {
      const result = categorizeError('something went wrong');
      expect(result.message).toBe('errorBoundary.unexpectedError');
      expect(result.retryable).toBe(false);
    });

    it('categorizes null as unexpected error', () => {
      const result = categorizeError(null);
      expect(result.message).toBe('errorBoundary.unexpectedError');
      expect(result.retryable).toBe(false);
    });
  });
});
