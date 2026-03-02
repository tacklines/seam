import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { ContractBundle } from '../schema/types.js';

import '../components/contract/contract-diff.js';

// ---- Sample data ----

const BUNDLE_V1: ContractBundle = {
  generatedAt: '2026-01-10T09:00:00Z',
  sourceJamCode: 'JAM001',
  eventContracts: [
    {
      eventName: 'OrderPlaced',
      aggregate: 'Order',
      version: '1.0.0',
      schema: {
        orderId: { type: 'string', required: true },
        customerId: { type: 'string', required: true },
        totalAmount: { type: 'number', required: true },
      },
      owner: 'Order Context',
      consumers: ['Payment Context', 'Inventory Context'],
      producedBy: 'Order Context',
    },
    {
      eventName: 'PaymentProcessed',
      aggregate: 'Payment',
      version: '1.0.0',
      schema: {
        paymentId: { type: 'string', required: true },
        amount: { type: 'number', required: true },
      },
      owner: 'Payment Context',
      consumers: ['Order Context'],
      producedBy: 'Payment Context',
    },
    {
      eventName: 'InventoryReserved',
      aggregate: 'Inventory',
      version: '1.0.0',
      schema: { sku: { type: 'string', required: true } },
      owner: 'Inventory Context',
      consumers: ['Order Context'],
      producedBy: 'Inventory Context',
    },
  ],
  boundaryContracts: [
    {
      boundaryName: 'Order Management',
      aggregates: ['Order'],
      events: ['OrderPlaced'],
      owner: 'Order Context',
      externalDependencies: ['Payment Context'],
    },
  ],
};

const BUNDLE_V2: ContractBundle = {
  generatedAt: '2026-01-15T14:00:00Z',
  sourceJamCode: 'JAM002',
  eventContracts: [
    {
      eventName: 'OrderPlaced',
      aggregate: 'Order',
      version: '1.1.0',
      schema: {
        orderId: { type: 'string', required: true },
        customerId: { type: 'string', required: true },
        totalAmount: { type: 'number', required: true },
        couponCode: { type: 'string', required: false },
      },
      owner: 'Order Context',
      consumers: ['Payment Context', 'Inventory Context', 'Analytics Context'],
      producedBy: 'Order Context',
    },
    {
      eventName: 'PaymentProcessed',
      aggregate: 'Payment',
      version: '1.0.0',
      schema: {
        paymentId: { type: 'string', required: true },
        amount: { type: 'number', required: true },
      },
      owner: 'Payment Context',
      consumers: ['Order Context'],
      producedBy: 'Payment Context',
    },
    {
      eventName: 'OrderCancelled',
      aggregate: 'Order',
      version: '1.0.0',
      schema: { orderId: { type: 'string', required: true }, reason: { type: 'string', required: false } },
      owner: 'Order Context',
      consumers: ['Inventory Context'],
      producedBy: 'Order Context',
    },
  ],
  boundaryContracts: [
    {
      boundaryName: 'Order Management',
      aggregates: ['Order'],
      events: ['OrderPlaced', 'OrderCancelled'],
      owner: 'Order Context',
      externalDependencies: ['Payment Context', 'Inventory Context'],
    },
    {
      boundaryName: 'Payment Processing',
      aggregates: ['Payment'],
      events: ['PaymentProcessed'],
      owner: 'Payment Context',
      externalDependencies: [],
    },
  ],
};

const BUNDLE_IDENTICAL = { ...BUNDLE_V1 };

// ---- Meta ----

const meta: Meta = {
  title: 'Components/Contract/ContractDiff',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

/**
 * Mixed changes: one event modified, one added, one removed, one new boundary.
 */
export const WithChanges: Story = {
  name: 'With Changes',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 800px;">
      <contract-diff
        .bundleBefore=${BUNDLE_V1 as ContractBundle}
        .bundleAfter=${BUNDLE_V2 as ContractBundle}
      ></contract-diff>
    </div>
  `,
};

/**
 * No changes between identical bundles.
 */
export const NoChanges: Story = {
  name: 'No Changes',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 800px;">
      <contract-diff
        .bundleBefore=${BUNDLE_V1 as ContractBundle}
        .bundleAfter=${BUNDLE_IDENTICAL as ContractBundle}
      ></contract-diff>
    </div>
  `,
};

/**
 * Empty state — no bundles provided yet.
 */
export const Empty: Story = {
  render: () => html`
    <div style="padding: 1.5rem; max-width: 800px;">
      <contract-diff></contract-diff>
    </div>
  `,
};
