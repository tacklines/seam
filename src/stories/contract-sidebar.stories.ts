import type { Args, Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { ContractEntry } from '../components/artifact/contract-sidebar.js';

// Register the component
import '../components/artifact/contract-sidebar.js';

const meta: Meta = {
  title: 'Artifact/ContractSidebar',
  tags: ['autodocs'],
  render: (args: Args) => html`
    <div style="width: 260px; border: 1px solid #e5e7eb; border-radius: 4px; background: #fff; overflow: hidden;">
      <contract-sidebar
        .contracts=${args.contracts as ContractEntry[]}
        @contract-selected=${(e: CustomEvent) => console.log('contract-selected', e.detail)}
      ></contract-sidebar>
    </div>
  `,
};

export default meta;
type Story = StoryObj;

/** No contracts loaded — shows empty state with guidance. */
export const Empty: Story = {
  name: 'Empty',
  args: {
    contracts: [],
  },
};

/** Contracts loaded — all passing, grouped by owner. */
export const WithContracts: Story = {
  name: 'With Contracts',
  args: {
    contracts: [
      {
        eventName: 'OrderPlaced',
        owner: 'Alice',
        consumers: ['Bob', 'Carol'],
        status: 'pass',
      },
      {
        eventName: 'OrderCancelled',
        owner: 'Alice',
        consumers: ['Carol'],
        status: 'pass',
      },
      {
        eventName: 'PaymentProcessed',
        owner: 'Bob',
        consumers: ['Alice'],
        status: 'pass',
      },
      {
        eventName: 'InventoryReserved',
        owner: 'Carol',
        consumers: [],
        status: 'pass',
      },
    ] satisfies ContractEntry[],
  },
};

/** Mixed compliance status — pass, warn, and fail all present. */
export const MixedStatus: Story = {
  name: 'Mixed Status',
  args: {
    contracts: [
      {
        eventName: 'OrderPlaced',
        owner: 'Alice',
        consumers: ['Bob', 'Carol'],
        status: 'pass',
      },
      {
        eventName: 'OrderCancelled',
        owner: 'Alice',
        consumers: ['Carol'],
        status: 'warn',
      },
      {
        eventName: 'PaymentProcessed',
        owner: 'Bob',
        consumers: ['Alice'],
        status: 'fail',
      },
      {
        eventName: 'RefundIssued',
        owner: 'Bob',
        consumers: [],
        status: 'pass',
      },
      {
        eventName: 'InventoryReserved',
        owner: 'Carol',
        consumers: ['Alice', 'Bob'],
        status: 'warn',
      },
    ] satisfies ContractEntry[],
  },
};
