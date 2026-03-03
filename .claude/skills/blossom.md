# /blossom -- Spike-Driven Exploration

Explore an unfamiliar area of the codebase through structured spikes.

## Usage

`/blossom <goal>`

## Process

1. **Orient**: Read relevant source files, identify unknowns
2. **Spike**: Create a small, throwaway experiment to test assumptions
3. **Assess**: Did the spike confirm or refute the hypothesis?
4. **Branch or Converge**: If new questions emerged, spike again. If confident, synthesize findings.

## Spike Areas for This Project

- **Schema evolution**: How candidate-events.schema.json changes propagate to types and validation
- **Component composition**: How Lit elements compose via slots and properties
- **Comparison logic**: How cross-role overlaps are detected in src/lib/comparison.ts
- **State flow**: How the pub/sub store connects to component re-renders
- **Shoelace integration**: Per-component imports and CDN base path setup

## Output

Write findings to `memory/scratch/blossom-<topic>.md`. If the exploration yields actionable work, create tasks with `tk create`.
