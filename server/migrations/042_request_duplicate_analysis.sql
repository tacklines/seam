-- Separate column for duplicate detection results (was incorrectly sharing impact_analysis)
ALTER TABLE requests
    ADD COLUMN duplicate_analysis JSONB;
