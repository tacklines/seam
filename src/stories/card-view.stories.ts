import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { LoadedFile, Confidence, Direction } from '../schema/types.js';

import '../components/artifact/card-view.js';

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
        payload: [{ field: 'orderId', type: 'string' }, { field: 'total', type: 'number' }],
        state_change: 'Order transitions to PENDING',
        integration: { direction: 'outbound', channel: 'order-events' },
        confidence: 'CONFIRMED',
        notes: 'Triggers inventory reservation and payment processing.',
      },
      {
        name: 'OrderShipped',
        aggregate: 'Order',
        trigger: 'Warehouse dispatches parcel',
        payload: [{ field: 'trackingNumber', type: 'string' }],
        integration: { direction: 'inbound' },
        confidence: 'LIKELY',
      },
      {
        name: 'OrderCancelled',
        aggregate: 'Order',
        trigger: 'Customer cancels before shipment',
        payload: [{ field: 'reason', type: 'string' }],
        integration: { direction: 'internal' },
        confidence: 'POSSIBLE',
      },
    ],
    boundary_assumptions: [
      {
        id: 'a1',
        type: 'ownership',
        statement: 'Order context owns the Order aggregate exclusively',
        affects_events: ['OrderPlaced', 'OrderShipped'],
        confidence: 'CONFIRMED',
        verify_with: 'Payments team',
      },
    ],
  },
};

const FILE_INVENTORY: LoadedFile = {
  filename: 'inventory-context.yaml',
  role: 'Inventory Context',
  data: {
    metadata: {
      role: 'Inventory Context',
      scope: 'inventory-management',
      goal: 'Track stock levels',
      generated_at: '2026-01-15T10:10:00Z',
      event_count: 2,
      assumption_count: 0,
    },
    domain_events: [
      {
        name: 'StockReserved',
        aggregate: 'Inventory',
        trigger: 'Order received from order context',
        payload: [{ field: 'sku', type: 'string' }, { field: 'quantity', type: 'number' }],
        integration: { direction: 'inbound', channel: 'order-events' },
        confidence: 'CONFIRMED',
      },
      {
        name: 'StockDepleted',
        aggregate: 'Inventory',
        trigger: 'Stock falls below threshold',
        payload: [{ field: 'sku', type: 'string' }],
        integration: { direction: 'internal' },
        confidence: 'LIKELY',
      },
    ],
    boundary_assumptions: [],
  },
};

// ---- Meta ----

const meta: Meta = {
  title: 'Components/Artifact/CardView',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

export const Default: Story = {
  render: () => html`
    <div style="padding: 1.5rem; max-width: 1000px;">
      <card-view .files=${[FILE_ORDER] as LoadedFile[]}></card-view>
    </div>
  `,
};

export const MultipleFiles: Story = {
  name: 'Multiple Files',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 1000px;">
      <card-view .files=${[FILE_ORDER, FILE_INVENTORY] as LoadedFile[]}></card-view>
    </div>
  `,
};

export const FilteredByConfidence: Story = {
  name: 'Filtered (Confirmed only)',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 1000px;">
      <card-view
        .files=${[FILE_ORDER] as LoadedFile[]}
        .confidenceFilter=${new Set<Confidence>(['CONFIRMED'])}
      ></card-view>
    </div>
  `,
};

export const Empty: Story = {
  render: () => html`
    <div style="padding: 1.5rem; max-width: 1000px;">
      <card-view .files=${[] as LoadedFile[]}></card-view>
    </div>
  `,
};
