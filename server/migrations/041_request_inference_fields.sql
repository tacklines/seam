-- Inference result fields for requests, populated by AI hooks after request.created
ALTER TABLE requests
    ADD COLUMN duplicate_of UUID REFERENCES requests(id),
    ADD COLUMN impact_analysis JSONB;
