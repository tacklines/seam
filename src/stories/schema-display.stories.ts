import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';

import '../components/contract/schema-display.js';

// ---- Sample data ----

const FLAT_SCHEMA: Record<string, unknown> = {
  orderId: { type: 'string', required: true, description: 'Unique order identifier' },
  customerId: { type: 'string', required: true, description: 'Customer who placed the order' },
  totalAmount: { type: 'number', required: true, description: 'Total order value in cents' },
  couponCode: { type: 'string', required: false, description: 'Optional promotional code' },
  status: { type: 'string', required: false, description: 'Current order status' },
};

const NESTED_SCHEMA: Record<string, unknown> = {
  orderId: { type: 'string', required: true, description: 'Order identifier' },
  customer: {
    type: 'object',
    description: 'Customer details',
    required: true,
    properties: {
      id: { type: 'string', required: true },
      email: { type: 'string', required: true },
      name: { type: 'string', required: false },
    },
  },
  lineItems: { type: 'array', required: true, description: 'Items in the order' },
  metadata: {
    type: 'object',
    required: false,
    properties: {
      source: { type: 'string', required: false },
      channel: { type: 'string', required: false },
    },
  },
};

const MINIMAL_SCHEMA: Record<string, unknown> = {
  id: { type: 'string', required: true },
  createdAt: { type: 'string', required: true },
};

// ---- Meta ----

const meta: Meta = {
  title: 'Components/Contract/SchemaDisplay',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

export const FlatSchema: Story = {
  name: 'Flat Schema',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 600px;">
      <schema-display
        .schema=${FLAT_SCHEMA}
        label="OrderPlaced Payload"
      ></schema-display>
    </div>
  `,
};

export const NestedSchema: Story = {
  name: 'Nested Schema (expandable)',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 600px;">
      <schema-display
        .schema=${NESTED_SCHEMA}
        label="OrderPlaced v2 Payload"
      ></schema-display>
    </div>
  `,
};

export const MinimalSchema: Story = {
  name: 'Minimal Schema',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 400px;">
      <schema-display .schema=${MINIMAL_SCHEMA}></schema-display>
    </div>
  `,
};

export const Empty: Story = {
  name: 'Empty Schema',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 400px;">
      <schema-display .schema=${{}} label="Empty Payload"></schema-display>
    </div>
  `,
};
