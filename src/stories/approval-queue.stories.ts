import type { Args, Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { PendingApproval } from '../schema/types.js';
import type { ApprovalDecidedDetail } from '../components/shared/approval-queue.js';

// Register the component
import '../components/shared/approval-queue.js';

const meta: Meta = {
  title: 'Shared/ApprovalQueue',
  tags: ['autodocs'],
  render: (args: Args) => html`
    <div style="padding: 1rem; display: flex; align-items: flex-start;">
      <approval-queue
        .pendingItems=${args.pendingItems as PendingApproval[]}
        @approval-decided=${(e: CustomEvent<ApprovalDecidedDetail>) =>
          console.log('approval-decided', e.detail)}
      ></approval-queue>
    </div>
  `,
};

export default meta;
type Story = StoryObj;

const now = new Date();
const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
const in30Minutes = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

/** No pending items — all caught up. */
export const Empty: Story = {
  name: 'Empty (all caught up)',
  args: {
    pendingItems: [],
  },
};

/** Three pending items with varying urgency and optional reasoning. */
export const WithPending: Story = {
  name: 'With Pending (3 items)',
  args: {
    pendingItems: [
      {
        id: 'ap-001',
        agentId: 'agent-alice',
        action: 'Submit artifact: OrderCreated schema v2.0',
        reasoning:
          'The OrderCreated event schema needs to be updated to include a shippingAddress field required by the fulfilment team. This aligns with the contract agreed in the jam session.',
        expiresAt: in24Hours,
      },
      {
        id: 'ap-002',
        agentId: 'agent-bob',
        action: 'Assign aggregate ownership: Payment → Payments team',
        expiresAt: in2Hours,
      },
      {
        id: 'ap-003',
        agentId: 'agent-carol',
        action: 'Flag unresolved: Ambiguous trigger for InventoryReserved',
        reasoning:
          'There is disagreement between the warehouse and order roles on what triggers the InventoryReserved event. Flagging for follow-up rather than blocking the session.',
        expiresAt: in30Minutes,
      },
    ] satisfies PendingApproval[],
  },
};

/** A single pending item with reasoning. */
export const SingleItem: Story = {
  name: 'Single Item',
  args: {
    pendingItems: [
      {
        id: 'ap-001',
        agentId: 'agent-orchestrator',
        action: 'Publish draft: Payment processing flow v3',
        reasoning:
          'Draft has been reviewed and all required fields are present. Publishing will make it visible to all session participants.',
        expiresAt: in24Hours,
      },
    ] satisfies PendingApproval[],
  },
};
