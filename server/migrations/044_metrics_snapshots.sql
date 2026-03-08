CREATE TABLE metrics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    metric_type TEXT NOT NULL,  -- 'invocation_summary', 'perspective_breakdown', 'model_breakdown'
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    granularity TEXT NOT NULL,  -- 'hourly', 'daily'
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_metrics_snapshots_unique
    ON metrics_snapshots (project_id, metric_type, period_start, granularity);

CREATE INDEX idx_metrics_snapshots_lookup
    ON metrics_snapshots (project_id, metric_type, granularity, period_start);
