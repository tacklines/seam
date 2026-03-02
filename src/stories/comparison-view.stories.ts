import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { LoadedFile } from '../schema/types.js';

import '../components/comparison/comparison-view.js';

// ---- Sample data ----

const FILE_ORDER: LoadedFile = {
  filename: 'order-context.yaml',
  role: 'Order Context',
  data: {
    metadata: {
      role: 'Order Context',
      scope: 'order-management',
      goal: 'Handle order lifecycle',
      generated_at: '2026-01-15T10:00:00Z',
      event_count: 3,
      assumption_count: 1,
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
    boundary_assumptions: [
      {
        id: 'a1',
        type: 'ownership',
        statement: 'Order context owns the Order aggregate',
        affects_events: ['OrderPlaced', 'OrderShipped'],
        confidence: 'CONFIRMED',
        verify_with: 'Payments team',
      },
    ],
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
      event_count: 3,
      assumption_count: 1,
    },
    domain_events: [
      {
        name: 'PaymentProcessed',
        aggregate: 'Payment',
        trigger: 'Charge succeeds',
        payload: [{ field: 'paymentId', type: 'string' }, { field: 'amount', type: 'number' }],
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
      {
        name: 'RefundIssued',
        aggregate: 'Payment',
        trigger: 'Customer requests refund',
        payload: [{ field: 'refundId', type: 'string' }],
        integration: { direction: 'internal' },
        confidence: 'POSSIBLE',
      },
    ],
    boundary_assumptions: [
      {
        id: 'b1',
        type: 'contract',
        statement: 'Payment context publishes PaymentProcessed to order-events channel',
        affects_events: ['PaymentProcessed'],
        confidence: 'LIKELY',
        verify_with: 'Order team',
      },
    ],
  },
};

// ---- Meta ----

const meta: Meta = {
  title: 'Components/Comparison/ComparisonView',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

export const WithConflictsAndSharedEvents: Story = {
  name: 'With Conflicts and Shared Events',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 900px;">
      <comparison-view .files=${[FILE_ORDER, FILE_PAYMENT] as LoadedFile[]}></comparison-view>
    </div>
  `,
};

export const Empty: Story = {
  name: 'Empty (fewer than 2 files)',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 900px;">
      <comparison-view .files=${[FILE_ORDER] as LoadedFile[]}></comparison-view>
    </div>
  `,
};

export const NoFiles: Story = {
  name: 'No Files',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 900px;">
      <comparison-view .files=${[] as LoadedFile[]}></comparison-view>
    </div>
  `,
};
