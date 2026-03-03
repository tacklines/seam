/**
 * Pure error categorization logic for the global error boundary and lobby.
 *
 * Separating this from the component keeps it testable without DOM dependencies.
 */

export interface ErrorCategory {
  message: string;
  retryable: boolean;
}

/**
 * A lobby-specific error with a plain-language message and an optional next-step hint.
 */
export interface LobbyErrorCategory {
  /** Plain-language message suitable for display to any user. */
  message: string;
  /** Suggested next step to resolve the error. May be empty string if no specific hint. */
  hint: string;
  /** Whether the operation is worth retrying. */
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

/**
 * Categorize a lobby error (network failure, HTTP status, or schema validation)
 * into a plain-language message with an actionable next-step hint.
 *
 * Handles:
 * - Network errors (TypeError "Failed to fetch", NetworkError) → connectivity message
 * - Timeout errors (AbortError, TimeoutError) → timeout message
 * - HTTP 404 → session not found
 * - HTTP 409 → name conflict
 * - HTTP 500 (or any 5xx) → server error
 * - Schema validation strings → file format message
 * - Everything else → generic unexpected message
 */
export function categorizeLobbyError(error: unknown): LobbyErrorCategory {
  if (error instanceof Error) {
    const name = error.name;
    const message = error.message;
    const lower = message.toLowerCase();

    // Timeout / abort
    if (TIMEOUT_NAMES.has(name)) {
      return {
        message: "The request took too long. Try again.",
        hint: "Check your network connection and try once more.",
        retryable: true,
      };
    }

    // Network / fetch failure
    if (
      NETWORK_NAMES.has(name) &&
      (lower.includes('failed to fetch') ||
        lower.includes('networkerror') ||
        name === 'NetworkError')
    ) {
      return {
        message: "Can't reach the server. Check your connection and try again.",
        hint: "Make sure you're online and the session server is running.",
        retryable: true,
      };
    }

    // HTTP status patterns — the lobby throws `new Error(body || \`HTTP ${status}\`)`
    // so we inspect the message string for status codes.
    const httpMatch = lower.match(/\bhttp\s+(\d{3})\b/);
    if (httpMatch) {
      const status = parseInt(httpMatch[1], 10);
      return categorizeHttpStatus(status);
    }

    // Schema / validation error strings
    if (isValidationError(message)) {
      return {
        message: "The file format doesn't look right. Check that it matches the expected structure.",
        hint: "Make sure the YAML file contains 'metadata', 'domain_events', and 'boundary_assumptions' sections.",
        retryable: false,
      };
    }
  }

  // Raw HTTP status string passed directly (e.g. from _submitFiles: body || `HTTP ${status}`)
  if (typeof error === 'string') {
    const lower = error.toLowerCase();
    const httpMatch = lower.match(/\bhttp\s+(\d{3})\b/);
    if (httpMatch) {
      const status = parseInt(httpMatch[1], 10);
      return categorizeHttpStatus(status);
    }
    if (isValidationError(error)) {
      return {
        message: "The file format doesn't look right. Check that it matches the expected structure.",
        hint: "Make sure the YAML file contains 'metadata', 'domain_events', and 'boundary_assumptions' sections.",
        retryable: false,
      };
    }
  }

  return {
    message: "Something went wrong. Please try again.",
    hint: "",
    retryable: true,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categorizeHttpStatus(status: number): LobbyErrorCategory {
  if (status === 404) {
    return {
      message: "Session not found. Double-check the code and try again.",
      hint: "Make sure you're entering the correct session code — it should be 6 characters.",
      retryable: false,
    };
  }
  if (status === 409) {
    return {
      message: "That name is already taken in this session. Try a different name.",
      hint: "Choose a unique name that no one else in the session is using.",
      retryable: false,
    };
  }
  if (status >= 500) {
    return {
      message: "Something went wrong on our end. Try again in a moment.",
      hint: "If the problem keeps happening, check that the session server is running.",
      retryable: true,
    };
  }
  // Generic 4xx or other codes
  return {
    message: "The request couldn't be completed. Please try again.",
    hint: "",
    retryable: true,
  };
}

/**
 * Heuristic: does the message look like a schema validation error?
 * AJV messages often contain keywords like "must", "required", "allowed", or "schema".
 */
function isValidationError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('must have required property') ||
    lower.includes('must be') ||
    lower.includes('schema') ||
    lower.includes('validation') ||
    lower.includes('invalid yaml') ||
    lower.includes('parse error')
  );
}
