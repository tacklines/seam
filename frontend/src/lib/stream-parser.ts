/**
 * Parses claude -p --output-format stream-json JSONL lines into
 * displayable events for the invocation detail view.
 *
 * Filters out noise (system events, thinking blocks, rate limits)
 * and extracts meaningful content (text, tool calls, tool results).
 */

export type StreamEventKind =
  | "text"
  | "tool_call"
  | "tool_result"
  | "result"
  | "error"
  | "raw";

export interface StreamEvent {
  kind: StreamEventKind;
  /** Primary display text */
  text: string;
  /** Optional detail (tool input, result JSON, etc.) */
  detail?: string;
  /** Tool name for tool_call/tool_result events */
  toolName?: string;
  /** Whether this was an error result */
  isError?: boolean;
  /** Timestamp from the original log line */
  ts?: string;
}

interface StreamJsonMessage {
  type: string;
  subtype?: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
      content?: string | Array<{ type: string; content?: string; text?: string }>;
    }>;
  };
  tool_use_result?: {
    stdout?: string;
    stderr?: string;
  };
  result?: string;
  duration_ms?: number;
  num_turns?: number;
  is_error?: boolean;
}

/** Event types to skip entirely */
const SKIP_TYPES = new Set(["system", "rate_limit_event"]);

/** Content block types to skip */
const SKIP_CONTENT_TYPES = new Set(["thinking"]);

/**
 * Parse a single JSONL line into zero or more display events.
 * Returns empty array for lines that should be filtered out.
 */
function parseLine(raw: string): StreamEvent[] {
  let obj: StreamJsonMessage;
  try {
    obj = JSON.parse(raw);
  } catch {
    // Non-JSON line — show as raw text if non-empty
    const trimmed = raw.trim();
    if (trimmed) {
      return [{ kind: "raw", text: trimmed }];
    }
    return [];
  }

  if (SKIP_TYPES.has(obj.type)) return [];

  if (obj.type === "assistant" && obj.message?.content) {
    const events: StreamEvent[] = [];
    for (const block of obj.message.content) {
      if (SKIP_CONTENT_TYPES.has(block.type)) continue;

      if (block.type === "text" && block.text) {
        events.push({ kind: "text", text: block.text });
      } else if (block.type === "tool_use" && block.name) {
        const desc = block.input?.description as string | undefined;
        const displayText = desc
          ? `${block.name}: ${desc}`
          : block.name;
        events.push({
          kind: "tool_call",
          text: displayText,
          toolName: block.name,
          detail: formatToolInput(block.name, block.input),
        });
      }
    }
    return events;
  }

  if (obj.type === "user") {
    // Tool results — show abbreviated output
    const tur = obj.tool_use_result;
    if (tur) {
      const output = tur.stdout || tur.stderr || "";
      const truncated = truncate(output, 300);
      if (truncated) {
        return [
          {
            kind: "tool_result",
            text: truncated,
            isError: !!tur.stderr && !tur.stdout,
          },
        ];
      }
    }
    return [];
  }

  if (obj.type === "result") {
    const parts: string[] = [];
    if (obj.result) parts.push(obj.result);
    if (obj.duration_ms) {
      const secs = Math.round(obj.duration_ms / 1000);
      const mins = Math.floor(secs / 60);
      const durStr = mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;
      parts.push(`Duration: ${durStr}`);
    }
    if (obj.num_turns) parts.push(`Turns: ${obj.num_turns}`);
    return [
      {
        kind: "result",
        text: parts.join("\n"),
        isError: obj.is_error,
      },
    ];
  }

  return [];
}

function formatToolInput(
  toolName: string,
  input?: Record<string, unknown>,
): string | undefined {
  if (!input) return undefined;
  if (toolName === "Bash") {
    return input.command as string | undefined;
  }
  if (toolName === "Read") {
    return input.file_path as string | undefined;
  }
  if (toolName === "Write" || toolName === "Edit") {
    return input.file_path as string | undefined;
  }
  if (toolName === "Glob") {
    return input.pattern as string | undefined;
  }
  if (toolName === "Grep") {
    return input.pattern as string | undefined;
  }
  // For other tools, show compact JSON
  const json = JSON.stringify(input);
  return json.length > 200 ? json.slice(0, 200) + "..." : json;
}

function truncate(s: string, max: number): string {
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max) + "...";
}

/**
 * Parse an array of LogLine objects into displayable StreamEvents.
 * Deduplicates consecutive identical events (stream-json emits
 * partial messages that repeat content).
 */
export function parseStreamOutput(
  lines: Array<{ line: string; fd: string; ts: string }>,
): StreamEvent[] {
  const events: StreamEvent[] = [];
  const seen = new Set<string>();

  for (const logLine of lines) {
    // stderr lines that aren't JSON — show as errors
    if (logLine.fd === "stderr") {
      const trimmed = logLine.line.trim();
      if (trimmed) {
        events.push({ kind: "error", text: trimmed, ts: logLine.ts });
      }
      continue;
    }

    const parsed = parseLine(logLine.line);
    for (const evt of parsed) {
      // Deduplicate: stream-json sends incremental messages that
      // repeat prior content blocks. Use text as dedup key.
      const key = `${evt.kind}:${evt.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      evt.ts = logLine.ts;
      events.push(evt);
    }
  }

  return events;
}
