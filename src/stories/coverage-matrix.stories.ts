import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { WorkItem } from '../schema/types.js';

import '../components/visualization/coverage-matrix.js';

// ---- Sample data ----

const SAMPLE_EVENTS = [
  'OrderPlaced',
  'PaymentProcessed',
  'InventoryReserved',
  'ShipmentCreated',
  'OrderConfirmed',
];

const PARTIAL_WORK_ITEMS: WorkItem[] = [
  {
    id: 'wi-001',
    title: 'Place order flow',
    description: 'Implement the end-to-end flow for a customer placing an order.',
    acceptanceCriteria: ['Customer can submit a valid order', 'OrderPlaced event is emitted'],
    complexity: 'M',
    linkedEvents: ['OrderPlaced'],
    dependencies: [],
  },
  {
    id: 'wi-002',
    title: 'Payment processing',
    description: 'Integrate with payment gateway.',
    acceptanceCriteria: ['PaymentProcessed event is emitted'],
    complexity: 'L',
    linkedEvents: ['PaymentProcessed', 'InventoryReserved'],
    dependencies: ['wi-001'],
  },
];

const FULL_WORK_ITEMS: WorkItem[] = [
  ...PARTIAL_WORK_ITEMS,
  {
    id: 'wi-003',
    title: 'Shipment creation',
    description: 'Background worker that creates a shipment record.',
    acceptanceCriteria: ['ShipmentCreated event is emitted'],
    complexity: 'M',
    linkedEvents: ['ShipmentCreated'],
    dependencies: ['wi-002'],
  },
  {
    id: 'wi-004',
    title: 'Order confirmation',
    description: 'Send confirmation when order is fully confirmed.',
    acceptanceCriteria: ['OrderConfirmed event is emitted'],
    complexity: 'S',
    linkedEvents: ['OrderConfirmed'],
    dependencies: ['wi-003'],
  },
];

// ---- Meta ----

const meta: Meta = {
  title: 'Visualization/CoverageMatrix',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

/**
 * Partial coverage — some events are uncovered (highlighted in amber).
 * ShipmentCreated and OrderConfirmed have no work items yet.
 */
export const PartialCoverage: Story = {
  name: 'Partial Coverage',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; max-width: 700px;">
      <coverage-matrix
        .events=${SAMPLE_EVENTS}
        .workItems=${PARTIAL_WORK_ITEMS}
      ></coverage-matrix>
    </div>
  `,
};

/** Full coverage — all events are addressed by at least one work item. */
export const FullCoverage: Story = {
  name: 'Full Coverage',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; max-width: 700px;">
      <coverage-matrix
        .events=${SAMPLE_EVENTS}
        .workItems=${FULL_WORK_ITEMS}
      ></coverage-matrix>
    </div>
  `,
};
