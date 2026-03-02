import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { LoadedFile } from '../schema/types.js';

import '../components/visualization/flow-diagram.js';

// ---- Sample data ----
// flow-diagram subscribes to the global store for layout settings.
// Stories render the component with .files populated; store settings use defaults.

const FILE_ORDER: LoadedFile = {
  filename: 'order-context.yaml',
  role: 'Order Context',
  data: {
    metadata: {
      role: 'Order Context',
      scope: 'order-management',
      goal: 'Handle order lifecycle',
      generated_at: '2026-01-15T10:00:00Z',
      event_count: 4,
      assumption_count: 0,
    },
    domain_events: [
      {
        name: 'OrderPlaced',
        aggregate: 'Order',
        trigger: 'Customer completes checkout',
        payload: [{ field: 'orderId', type: 'string' }],
        integration: { direction: 'outbound', channel: 'order-events' },
        confidence: 'CONFIRMED',
      },
      {
        name: 'OrderApproved',
        aggregate: 'Order',
        trigger: 'Manager approves order',
        payload: [{ field: 'orderId', type: 'string' }],
        integration: { direction: 'internal' },
        confidence: 'CONFIRMED',
      },
      {
        name: 'PaymentProcessed',
        aggregate: 'Payment',
        trigger: 'Payment gateway responds',
        payload: [{ field: 'paymentId', type: 'string' }],
        integration: { direction: 'inbound', channel: 'payments' },
        confidence: 'CONFIRMED',
      },
      {
        name: 'OrderShipped',
        aggregate: 'Order',
        trigger: 'Warehouse dispatches parcel',
        payload: [{ field: 'trackingNumber', type: 'string' }],
        integration: { direction: 'inbound' },
        confidence: 'LIKELY',
      },
    ],
    boundary_assumptions: [],
  },
};

const FILE_PAYMENT: LoadedFile = {
  filename: 'payment-context.yaml',
  role: 'Payment Context',
  data: {
    metadata: {
      role: 'Payment Context',
      scope: 'payments',
      goal: 'Handle payment processing',
      generated_at: '2026-01-15T10:05:00Z',
      event_count: 2,
      assumption_count: 0,
    },
    domain_events: [
      {
        name: 'PaymentProcessed',
        aggregate: 'Payment',
        trigger: 'Charge succeeds',
        payload: [{ field: 'paymentId', type: 'string' }],
        integration: { direction: 'outbound', channel: 'payments' },
        confidence: 'CONFIRMED',
      },
      {
        name: 'PaymentFailed',
        aggregate: 'Payment',
        trigger: 'Charge is declined',
        payload: [{ field: 'reason', type: 'string' }],
        integration: { direction: 'outbound', channel: 'payments' },
        confidence: 'CONFIRMED',
      },
    ],
    boundary_assumptions: [],
  },
};

// ---- Meta ----

const meta: Meta = {
  title: 'Components/Visualization/FlowDiagram',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

/**
 * Single file — renders one bounded context with its aggregates and events.
 */
export const SingleFile: Story = {
  name: 'Single File',
  render: () => html`
    <div style="width: 100%; height: 600px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <flow-diagram .files=${[FILE_ORDER] as LoadedFile[]}></flow-diagram>
    </div>
  `,
};

/**
 * Two files — shows both contexts with shared aggregates highlighted.
 */
export const TwoFiles: Story = {
  name: 'Two Files',
  render: () => html`
    <div style="width: 100%; height: 600px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <flow-diagram .files=${[FILE_ORDER, FILE_PAYMENT] as LoadedFile[]}></flow-diagram>
    </div>
  `,
};

/**
 * Empty state — no files loaded yet.
 */
export const Empty: Story = {
  name: 'Empty',
  render: () => html`
    <div style="width: 100%; height: 600px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <flow-diagram .files=${[] as LoadedFile[]}></flow-diagram>
    </div>
  `,
};
