import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { WorkItem } from '../schema/types.js';
import type { WorkItemSuggestion } from '../components/visualization/breakdown-editor.js';

import '../components/visualization/breakdown-editor.js';

// ---- Sample data ----

const SAMPLE_EVENTS = [
  'OrderPlaced',
  'PaymentProcessed',
  'InventoryReserved',
  'ShipmentCreated',
  'OrderConfirmed',
];

const SAMPLE_WORK_ITEMS: WorkItem[] = [
  {
    id: 'wi-001',
    title: 'Place order flow',
    description: 'Implement the end-to-end flow for a customer placing an order, including cart validation and order creation.',
    acceptanceCriteria: [
      'Customer can submit a valid order',
      'Order is persisted with a unique ID',
      'OrderPlaced event is emitted',
    ],
    complexity: 'M',
    linkedEvents: ['OrderPlaced'],
    dependencies: [],
  },
  {
    id: 'wi-002',
    title: 'Payment processing',
    description: 'Integrate with the payment gateway to process payment for placed orders.',
    acceptanceCriteria: [
      'Payment is charged on successful authorization',
      'PaymentProcessed event is emitted',
      'Failed payments surface an error to the customer',
    ],
    complexity: 'L',
    linkedEvents: ['PaymentProcessed'],
    dependencies: ['wi-001'],
  },
  {
    id: 'wi-003',
    title: 'Inventory reservation',
    description: 'Reserve inventory items when an order is placed, preventing overselling.',
    acceptanceCriteria: [
      'Inventory quantity is decremented atomically',
      'InventoryReserved event is emitted',
      'Out-of-stock items return a clear error',
    ],
    complexity: 'S',
    linkedEvents: ['InventoryReserved'],
    dependencies: ['wi-001'],
  },
];

const SAMPLE_SUGGESTIONS: WorkItemSuggestion[] = [
  {
    id: 'sug-001',
    title: 'Shipment creation worker',
    description: 'Background worker that creates a shipment record after payment is confirmed.',
    complexity: 'M',
    linkedEvents: ['ShipmentCreated', 'OrderConfirmed'],
  },
  {
    id: 'sug-002',
    title: 'Order confirmation email',
    description: 'Send a confirmation email when the order is fully confirmed.',
    complexity: 'S',
    linkedEvents: ['OrderConfirmed'],
  },
];

// ---- Meta ----

const meta: Meta = {
  title: 'Visualization/BreakdownEditor',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

/** Empty state — no work items yet. Shows the empty call-to-action. */
export const Empty: Story = {
  name: 'Empty',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; max-width: 680px;">
      <breakdown-editor
        .workItems=${[]}
        .events=${SAMPLE_EVENTS}
        .suggestions=${[]}
        @work-item-created=${(e: CustomEvent) => console.log('work-item-created', e.detail)}
      ></breakdown-editor>
    </div>
  `,
};

/** Three work items with titles, descriptions, and acceptance criteria. */
export const WithWorkItems: Story = {
  name: 'With Work Items',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; max-width: 680px;">
      <breakdown-editor
        .workItems=${SAMPLE_WORK_ITEMS}
        .events=${SAMPLE_EVENTS}
        .suggestions=${[]}
        @work-item-created=${(e: CustomEvent) => console.log('work-item-created', e.detail)}
        @work-item-updated=${(e: CustomEvent) => console.log('work-item-updated', e.detail)}
        @work-item-deleted=${(e: CustomEvent) => console.log('work-item-deleted', e.detail)}
      ></breakdown-editor>
    </div>
  `,
};

/** Agent-suggested ghost cards shown below existing work items. */
export const WithSuggestions: Story = {
  name: 'With Agent Suggestions',
  render: () => html`
    <div style="padding: 1.5rem; background: #f9fafb; max-width: 680px;">
      <breakdown-editor
        .workItems=${SAMPLE_WORK_ITEMS.slice(0, 1)}
        .events=${SAMPLE_EVENTS}
        .suggestions=${SAMPLE_SUGGESTIONS}
        @work-item-created=${(e: CustomEvent) => console.log('work-item-created', e.detail)}
        @suggestion-accepted=${(e: CustomEvent) => console.log('suggestion-accepted', e.detail)}
        @suggestion-dismissed=${(e: CustomEvent) => console.log('suggestion-dismissed', e.detail)}
      ></breakdown-editor>
    </div>
  `,
};

/** Full set of work items covering all sample events. */
export const FullCoverage: Story = {
  name: 'Full Coverage',
  render: () => {
    const fullItems: WorkItem[] = [
      ...SAMPLE_WORK_ITEMS,
      {
        id: 'wi-004',
        title: 'Shipment worker',
        description: 'Creates a shipment record after payment confirmation.',
        acceptanceCriteria: ['ShipmentCreated event is emitted', 'Shipment record is persisted'],
        complexity: 'M',
        linkedEvents: ['ShipmentCreated', 'OrderConfirmed'],
        dependencies: ['wi-002'],
      },
    ];
    return html`
      <div style="padding: 1.5rem; background: #f9fafb; max-width: 680px;">
        <breakdown-editor
          .workItems=${fullItems}
          .events=${SAMPLE_EVENTS}
          .suggestions=${[]}
          @work-item-created=${(e: CustomEvent) => console.log('work-item-created', e.detail)}
          @work-item-updated=${(e: CustomEvent) => console.log('work-item-updated', e.detail)}
          @work-item-deleted=${(e: CustomEvent) => console.log('work-item-deleted', e.detail)}
        ></breakdown-editor>
      </div>
    `;
  },
};
