-- Track model used, token counts, and estimated cost per invocation.
-- All columns are nullable — populated on completion by extracting from claude --output-format json.
-- cost_usd uses DOUBLE PRECISION for direct sqlx f64 mapping without extra dependencies.
ALTER TABLE invocations
  ADD COLUMN model_used TEXT,
  ADD COLUMN input_tokens INTEGER,
  ADD COLUMN output_tokens INTEGER,
  ADD COLUMN cost_usd DOUBLE PRECISION;
