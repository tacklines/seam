import { describe, it, expect } from 'vitest';
import { categorizeError, categorizeLobbyError } from './error-categorization.js';

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

// ---------------------------------------------------------------------------
// categorizeLobbyError
// ---------------------------------------------------------------------------

describe('categorizeLobbyError', () => {
  describe('network errors', () => {
    it('returns connectivity message for TypeError: Failed to fetch', () => {
      const error = new TypeError('Failed to fetch');
      const result = categorizeLobbyError(error);
      expect(result.message).toContain("Can't reach the server");
      expect(result.retryable).toBe(true);
    });

    it('returns connectivity message for NetworkError', () => {
      const error = new Error('Connection refused');
      error.name = 'NetworkError';
      const result = categorizeLobbyError(error);
      expect(result.message).toContain("Can't reach the server");
      expect(result.retryable).toBe(true);
    });

    it('includes a non-empty hint for network errors', () => {
      const error = new TypeError('Failed to fetch');
      const result = categorizeLobbyError(error);
      expect(result.hint.length).toBeGreaterThan(0);
    });
  });

  describe('timeout errors', () => {
    it('returns timeout message for AbortError', () => {
      const error = new Error('The user aborted a request.');
      error.name = 'AbortError';
      const result = categorizeLobbyError(error);
      expect(result.message).toContain('took too long');
      expect(result.retryable).toBe(true);
    });

    it('returns timeout message for TimeoutError', () => {
      const error = new Error('Request timed out after 30s.');
      error.name = 'TimeoutError';
      const result = categorizeLobbyError(error);
      expect(result.message).toContain('took too long');
      expect(result.retryable).toBe(true);
    });
  });

  describe('HTTP 404', () => {
    it('returns session-not-found message for Error with HTTP 404 in message', () => {
      const error = new Error('HTTP 404');
      const result = categorizeLobbyError(error);
      expect(result.message).toContain('Session not found');
      expect(result.retryable).toBe(false);
    });

    it('returns session-not-found message for raw "HTTP 404" string', () => {
      const result = categorizeLobbyError('HTTP 404');
      expect(result.message).toContain('Session not found');
      expect(result.retryable).toBe(false);
    });

    it('includes a hint about the session code', () => {
      const result = categorizeLobbyError(new Error('HTTP 404'));
      expect(result.hint).toContain('session code');
    });
  });

  describe('HTTP 409', () => {
    it('returns name-conflict message for Error with HTTP 409 in message', () => {
      const error = new Error('HTTP 409');
      const result = categorizeLobbyError(error);
      expect(result.message).toContain('already taken');
      expect(result.retryable).toBe(false);
    });

    it('returns name-conflict message for raw "HTTP 409" string', () => {
      const result = categorizeLobbyError('HTTP 409');
      expect(result.message).toContain('already taken');
      expect(result.retryable).toBe(false);
    });
  });

  describe('HTTP 5xx', () => {
    it('returns server-error message for Error with HTTP 500', () => {
      const error = new Error('HTTP 500');
      const result = categorizeLobbyError(error);
      expect(result.message).toContain("Something went wrong on our end");
      expect(result.retryable).toBe(true);
    });

    it('returns server-error message for HTTP 503', () => {
      const result = categorizeLobbyError(new Error('HTTP 503'));
      expect(result.message).toContain("Something went wrong on our end");
      expect(result.retryable).toBe(true);
    });
  });

  describe('schema / validation errors', () => {
    it('returns file-format message for AJV must have required property string', () => {
      const error = new Error("must have required property 'metadata'");
      const result = categorizeLobbyError(error);
      expect(result.message).toContain("file format");
      expect(result.retryable).toBe(false);
    });

    it('returns file-format message for validation keyword in message', () => {
      const result = categorizeLobbyError(new Error('schema validation failed'));
      expect(result.message).toContain("file format");
      expect(result.retryable).toBe(false);
    });

    it('returns file-format message for invalid yaml string', () => {
      const result = categorizeLobbyError(new Error('invalid yaml: unexpected character'));
      expect(result.message).toContain("file format");
      expect(result.retryable).toBe(false);
    });

    it('includes a hint about the expected YAML sections', () => {
      const result = categorizeLobbyError(new Error("must have required property 'domain_events'"));
      expect(result.hint).toContain("domain_events");
    });
  });

  describe('unknown errors', () => {
    it('returns generic message for unknown Error', () => {
      const result = categorizeLobbyError(new Error('some obscure error'));
      expect(result.message).toContain('Something went wrong');
      expect(result.retryable).toBe(true);
    });

    it('returns generic message for null', () => {
      const result = categorizeLobbyError(null);
      expect(result.message).toContain('Something went wrong');
    });

    it('returns generic message for non-HTTP, non-validation string', () => {
      const result = categorizeLobbyError('unexpected thing');
      expect(result.message).toContain('Something went wrong');
    });
  });
});
