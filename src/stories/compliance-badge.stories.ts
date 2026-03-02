import type { Args, Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { ComplianceDetail } from '../components/artifact/compliance-badge.js';

// Register the component
import '../components/artifact/compliance-badge.js';

const meta: Meta = {
  title: 'Artifact/ComplianceBadge',
  tags: ['autodocs'],
  render: (args: Args) => html`
    <div style="padding: 1rem; display: flex; align-items: center; gap: 1rem; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px;">
      <span style="font-size: 0.875rem; color: #6b7280;">Header area:</span>
      <compliance-badge
        status=${args.status as string}
        .details=${args.details as ComplianceDetail[]}
        @compliance-detail-requested=${() => console.log('compliance-detail-requested')}
      ></compliance-badge>
    </div>
  `,
};

export default meta;
type Story = StoryObj;

/** All 5 contracts passing — green checkmark badge. */
export const AllPassing: Story = {
  name: 'All Passing',
  args: {
    status: 'pass',
    details: [],
  },
};

/** 2 drift warnings — amber triangle badge. */
export const DriftWarnings: Story = {
  name: 'Drift Warnings',
  args: {
    status: 'warn',
    details: [
      {
        eventName: 'OrderPlaced',
        owner: 'Alice',
        issue: 'Payload field "totalAmount" changed from number to string',
        severity: 'warning',
      },
      {
        eventName: 'PaymentProcessed',
        owner: 'Bob',
        issue: 'New optional field "currency" added to payload',
        severity: 'warning',
      },
    ] satisfies ComplianceDetail[],
  },
};

/** Non-compliant — 1 error + 1 warning — red X badge. */
export const NonCompliant: Story = {
  name: 'Non-Compliant',
  args: {
    status: 'fail',
    details: [
      {
        eventName: 'InventoryReserved',
        owner: 'Carol',
        issue: 'Required field "warehouseId" removed from payload — breaks downstream consumers',
        severity: 'error',
      },
      {
        eventName: 'OrderPlaced',
        owner: 'Alice',
        issue: 'Payload field "totalAmount" type changed from number to string',
        severity: 'warning',
      },
    ] satisfies ComplianceDetail[],
  },
};
