import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { ConflictResolution } from '../schema/types.js';
import type { Overlap } from '../lib/comparison.js';

import '../components/agreement/resolution-recorder.js';

// ---- Sample data ----

const CONFLICT_OVERLAP: Overlap = {
  kind: 'same-name',
  label: 'PaymentProcessed',
  roles: ['Order Context', 'Payment Context'],
  details: 'Event "PaymentProcessed" appears in both Order Context and Payment Context with different schemas.',
};

const SHARED_AGGREGATE_OVERLAP: Overlap = {
  kind: 'same-aggregate',
  label: 'Payment',
  roles: ['Order Context', 'Payment Context'],
  details: 'Aggregate "Payment" is referenced by both contexts.',
};

const EXISTING_RESOLUTION: ConflictResolution = {
  overlapLabel: 'PaymentProcessed',
  resolution: 'Payment context owns PaymentProcessed; Order context subscribes as a consumer.',
  chosenApproach: 'pick-left',
  resolvedBy: ['Alice', 'Bob'],
  resolvedAt: '2026-01-15T11:30:00Z',
};

// ---- Meta ----

const meta: Meta = {
  title: 'Components/Agreement/ResolutionRecorder',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

/**
 * Default recorder state — approach not yet selected, ready for input.
 */
export const Default: Story = {
  render: () => html`
    <div style="padding: 1.5rem; max-width: 600px;">
      <resolution-recorder
        .overlap=${CONFLICT_OVERLAP as Overlap}
        participantName="Alice"
      ></resolution-recorder>
    </div>
  `,
};

/**
 * Shared aggregate overlap — a softer type of conflict.
 */
export const SharedAggregate: Story = {
  name: 'Shared Aggregate Overlap',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 600px;">
      <resolution-recorder
        .overlap=${SHARED_AGGREGATE_OVERLAP as Overlap}
        participantName="Bob"
      ></resolution-recorder>
    </div>
  `,
};

/**
 * Already resolved — shows the resolution banner instead of the picker.
 */
export const AlreadyResolved: Story = {
  name: 'Already Resolved',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 600px;">
      <resolution-recorder
        .overlap=${CONFLICT_OVERLAP as Overlap}
        .existingResolution=${EXISTING_RESOLUTION as ConflictResolution}
        participantName="Alice"
      ></resolution-recorder>
    </div>
  `,
};
