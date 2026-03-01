import type { Args, Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { DomainEvent } from '../schema/types.js';

// Register the component
import '../components/shared/event-card.js';

const meta: Meta = {
  title: 'Shared/EventCard',
  tags: ['autodocs'],
  render: (args: Args) => html`
    <div style="max-width: 400px; padding: 1rem;">
      <event-card
        .event=${args.event as DomainEvent}
        .aggregateColor=${args.aggregateColor as string}
        ?highlight=${args.highlight as boolean}
      ></event-card>
    </div>
  `,
  argTypes: {
    aggregateColor: { control: 'color' },
    highlight: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj;

const baseEvent: DomainEvent = {
  name: 'OrderPlaced',
  aggregate: 'Order',
  trigger: 'Customer completes checkout',
  payload: [
    { field: 'orderId', type: 'string' },
    { field: 'customerId', type: 'string' },
    { field: 'totalAmount', type: 'number' },
  ],
  state_change: 'Order transitions to PENDING',
  integration: {
    direction: 'outbound',
    channel: 'order-events',
  },
  confidence: 'CONFIRMED',
  notes: 'Triggers inventory reservation and payment processing.',
};

export const Confirmed: Story = {
  args: {
    event: baseEvent,
    aggregateColor: '#4338ca',
    highlight: false,
  },
};

export const Likely: Story = {
  args: {
    event: {
      ...baseEvent,
      name: 'PaymentProcessed',
      confidence: 'LIKELY',
      integration: { direction: 'inbound', channel: 'payments' },
      notes: undefined,
    } satisfies DomainEvent,
    aggregateColor: '#0891b2',
    highlight: false,
  },
};

export const Possible: Story = {
  args: {
    event: {
      ...baseEvent,
      name: 'InventoryReserved',
      confidence: 'POSSIBLE',
      integration: { direction: 'internal' },
      payload: [],
      state_change: undefined,
      notes: undefined,
    } satisfies DomainEvent,
    aggregateColor: '#059669',
    highlight: false,
  },
};

export const Highlighted: Story = {
  args: {
    event: baseEvent,
    aggregateColor: '#4338ca',
    highlight: true,
  },
};

export const NoPayload: Story = {
  name: 'No Payload',
  args: {
    event: {
      ...baseEvent,
      payload: [],
      state_change: undefined,
      notes: undefined,
    } satisfies DomainEvent,
    aggregateColor: '#d97706',
    highlight: false,
  },
};
