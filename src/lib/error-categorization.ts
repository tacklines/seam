/**
 * Pure error categorization logic for the global error boundary.
 *
 * Separating this from the component keeps it testable without DOM dependencies.
 */

export interface ErrorCategory {
  message: string;
  retryable: boolean;
}

const NETWORK_NAMES = new Set(['NetworkError', 'TypeError']);
const TIMEOUT_NAMES = new Set(['TimeoutError', 'AbortError']);

/**
 * Categorize an unknown error into a user-facing message and retryability flag.
 *
 * - TypeError with "Failed to fetch" or name containing "NetworkError" → network error
 * - AbortError / TimeoutError → timeout error
 * - Everything else → unexpected error
 */
export function categorizeError(error: unknown): ErrorCategory {
  if (error instanceof Error) {
    const name = error.name;
    const message = error.message;

    if (TIMEOUT_NAMES.has(name)) {
      return {
        message: 'errorBoundary.timeoutError',
        retryable: true,
      };
    }

    if (
      NETWORK_NAMES.has(name) &&
      (message.toLowerCase().includes('failed to fetch') ||
        message.toLowerCase().includes('networkerror') ||
        name === 'NetworkError')
    ) {
      return {
        message: 'errorBoundary.networkError',
        retryable: true,
      };
    }
  }

  return {
    message: 'errorBoundary.unexpectedError',
    retryable: false,
  };
}
