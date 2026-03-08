import { describe, it, expect } from "vitest";
import { parseStreamOutput, type StreamEvent } from "./stream-parser.js";

function line(content: string, fd = "stdout", ts = "2026-03-08T00:00:00Z") {
  return { line: content, fd, ts };
}

describe("parseStreamOutput", () => {
  it("filters out system events", () => {
    const result = parseStreamOutput([
      line(
        JSON.stringify({
          type: "system",
          subtype: "init",
          cwd: "/workspace",
        }),
      ),
      line(
        JSON.stringify({
          type: "system",
          subtype: "hook_started",
          hook_name: "test",
        }),
      ),
    ]);
    expect(result).toHaveLength(0);
  });

  it("filters out rate_limit_event", () => {
    const result = parseStreamOutput([
      line(JSON.stringify({ type: "rate_limit_event", rate_limit_info: {} })),
    ]);
    expect(result).toHaveLength(0);
  });

  it("filters out thinking blocks", () => {
    const result = parseStreamOutput([
      line(
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "thinking",
                thinking: "some internal reasoning",
                signature: "abc123",
              },
            ],
          },
        }),
      ),
    ]);
    expect(result).toHaveLength(0);
  });

  it("extracts text content from assistant messages", () => {
    const result = parseStreamOutput([
      line(
        JSON.stringify({
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Hello, I found the bug." }],
          },
        }),
      ),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("text");
    expect(result[0].text).toBe("Hello, I found the bug.");
  });

  it("extracts tool_use with description", () => {
    const result = parseStreamOutput([
      line(
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                name: "Bash",
                input: {
                  command: "cargo test",
                  description: "Run tests",
                },
              },
            ],
          },
        }),
      ),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("tool_call");
    expect(result[0].text).toBe("Bash: Run tests");
    expect(result[0].detail).toBe("cargo test");
  });

  it("extracts tool_use without description", () => {
    const result = parseStreamOutput([
      line(
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                name: "Read",
                input: { file_path: "/src/main.rs" },
              },
            ],
          },
        }),
      ),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("tool_call");
    expect(result[0].text).toBe("Read");
    expect(result[0].detail).toBe("/src/main.rs");
  });

  it("extracts tool results", () => {
    const result = parseStreamOutput([
      line(
        JSON.stringify({
          type: "user",
          tool_use_result: {
            stdout: "test passed\n3 tests ran",
            stderr: "",
          },
        }),
      ),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("tool_result");
    expect(result[0].text).toBe("test passed\n3 tests ran");
    expect(result[0].isError).toBeFalsy();
  });

  it("marks stderr-only tool results as errors", () => {
    const result = parseStreamOutput([
      line(
        JSON.stringify({
          type: "user",
          tool_use_result: {
            stdout: "",
            stderr: "compilation failed",
          },
        }),
      ),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].isError).toBe(true);
  });

  it("extracts final result event", () => {
    const result = parseStreamOutput([
      line(
        JSON.stringify({
          type: "result",
          subtype: "success",
          result: "All done.",
          duration_ms: 120000,
          num_turns: 10,
          is_error: false,
        }),
      ),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("result");
    expect(result[0].text).toContain("All done.");
    expect(result[0].text).toContain("2m 0s");
    expect(result[0].text).toContain("Turns: 10");
  });

  it("deduplicates repeated text events", () => {
    const msg = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Same text" }] },
    });
    const result = parseStreamOutput([line(msg), line(msg)]);
    expect(result).toHaveLength(1);
  });

  it("shows stderr lines as errors", () => {
    const result = parseStreamOutput([
      line("something went wrong", "stderr"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("error");
  });

  it("shows non-JSON stdout as raw", () => {
    const result = parseStreamOutput([line("plain text output")]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("raw");
  });

  it("skips empty lines", () => {
    const result = parseStreamOutput([line(""), line("   ")]);
    expect(result).toHaveLength(0);
  });
});
