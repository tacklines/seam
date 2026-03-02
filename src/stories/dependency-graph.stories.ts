import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { WorkItem } from '../schema/types.js';

import '../components/visualization/dependency-graph.js';

// ---- Sample data ----

const ITEMS_NO_DEPS: WorkItem[] = [
  {
    id: 'wi-001',
    title: 'Place order flow',
    description: 'Implement the end-to-end order placement flow.',
    acceptanceCriteria: [],
    complexity: 'M',
    linkedEvents: ['OrderPlaced'],
    dependencies: [],
  },
  {
    id: 'wi-002',
    title: 'Payment processing',
    description: 'Integrate with the payment gateway.',
    acceptanceCriteria: [],
    complexity: 'L',
    linkedEvents: ['PaymentProcessed'],
    dependencies: [],
  },
  {
    id: 'wi-003',
    title: 'Inventory reservation',
    description: 'Reserve inventory items on order placement.',
    acceptanceCriteria: [],
    complexity: 'S',
    linkedEvents: ['InventoryReserved'],
    dependencies: [],
  },
];

const ITEMS_WITH_DEPS: WorkItem[] = [
  {
    id: 'wi-001',
    title: 'Place order',
    description: 'Order placement end-to-end flow.',
    acceptanceCriteria: [],
    complexity: 'M',
    linkedEvents: ['OrderPlaced'],
    dependencies: [],
  },
  {
    id: 'wi-002',
    title: 'Process payment',
    description: 'Payment gateway integration.',
    acceptanceCriteria: [],
    complexity: 'L',
    linkedEvents: ['PaymentProcessed'],
    dependencies: ['wi-001'],
  },
  {
    id: 'wi-003',
    title: 'Reserve inventory',
    description: 'Inventory reservation worker.',
    acceptanceCriteria: [],
    complexity: 'S',
    linkedEvents: ['InventoryReserved'],
    dependencies: ['wi-001'],
  },
  {
    id: 'wi-004',
    title: 'Create shipment',
    description: 'Background shipment creation after payment.',
    acceptanceCriteria: [],
    complexity: 'M',
    linkedEvents: ['ShipmentCreated'],
    dependencies: ['wi-002', 'wi-003'],
  },
  {
    id: 'wi-005',
    title: 'Confirm order',
    description: 'Final order confirmation step.',
    acceptanceCriteria: [],
    complexity: 'S',
    linkedEvents: ['OrderConfirmed'],
    dependencies: ['wi-004'],
  },
];

// ---- Meta ----

const meta: Meta = {
  title: 'Visualization/DependencyGraph',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

/** Three work items with no dependency links between them. */
export const NoDependencies: Story = {
  name: 'No Dependencies',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; max-width: 700px;">
      <dependency-graph
        .workItems=${ITEMS_NO_DEPS}
        @dependency-created=${(e: CustomEvent) => console.log('dependency-created', e.detail)}
      ></dependency-graph>
    </div>
  `,
};

/** Five work items with a full dependency chain: place → pay/reserve → ship → confirm. */
export const WithDependencies: Story = {
  name: 'With Dependencies',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; max-width: 700px;">
      <dependency-graph
        .workItems=${ITEMS_WITH_DEPS}
        @dependency-created=${(e: CustomEvent) => console.log('dependency-created', e.detail)}
      ></dependency-graph>
    </div>
  `,
};
