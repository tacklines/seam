import type { Args, Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { DriftEvent } from '../components/artifact/drift-notification.js';

// Register the component
import '../components/artifact/drift-notification.js';

const meta: Meta = {
  title: 'Artifact/DriftNotification',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  render: (args: Args) => html`
    <div style="min-height: 300px; position: relative; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px;">
      <p style="padding: 1rem; color: #6b7280; font-size: 0.875rem;">
        Notifications appear in the bottom-right corner. They auto-dismiss after 6 seconds.
      </p>
      <drift-notification
        .drifts=${args.drifts as DriftEvent[]}
        @drift-detail-requested=${(e: CustomEvent) => console.log('drift-detail-requested', e.detail)}
      ></drift-notification>
    </div>
  `,
};

export default meta;
type Story = StoryObj;

/** Single drift notification — Alice changed OrderPlaced. */
export const SingleDrift: Story = {
  name: 'Single Drift',
  args: {
    drifts: [
      {
        id: 'drift-1',
        participantName: 'Alice',
        eventName: 'OrderPlaced',
        description: 'The "totalAmount" field type changed from number to string.',
      },
    ] satisfies DriftEvent[],
  },
};

/** Multiple drifts — 4 queued (3 visible max, 1 in queue). */
export const MultipleStacked: Story = {
  name: 'Multiple Stacked (queue)',
  args: {
    drifts: [
      {
        id: 'drift-1',
        participantName: 'Alice',
        eventName: 'OrderPlaced',
        description: 'The "totalAmount" field type changed from number to string.',
      },
      {
        id: 'drift-2',
        participantName: 'Bob',
        eventName: 'PaymentProcessed',
        description: 'New optional field "currency" added, breaking strict schema consumers.',
      },
      {
        id: 'drift-3',
        participantName: 'Carol',
        eventName: 'InventoryReserved',
        description: 'Required field "warehouseId" was removed from the payload.',
      },
      {
        id: 'drift-4',
        participantName: 'Dave',
        eventName: 'ShipmentDispatched',
        description: 'The "carrier" field was renamed to "shippingCarrier".',
      },
    ] satisfies DriftEvent[],
  },
};
