import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { OwnershipAssignment } from '../schema/types.js';

import '../components/agreement/ownership-grid.js';

// ---- Sample data ----

const AGGREGATES = ['Order', 'Payment', 'Inventory', 'Shipment', 'Notification'];
const ROLES = ['Order Context', 'Payment Context', 'Inventory Context'];

const PARTIAL_OWNERSHIP: OwnershipAssignment[] = [
  { aggregate: 'Order', ownerRole: 'Order Context', assignedBy: 'Alice', assignedAt: '2026-01-15T10:00:00Z' },
  { aggregate: 'Payment', ownerRole: 'Payment Context', assignedBy: 'Bob', assignedAt: '2026-01-15T10:01:00Z' },
];

const FULL_OWNERSHIP: OwnershipAssignment[] = [
  { aggregate: 'Order', ownerRole: 'Order Context', assignedBy: 'Alice', assignedAt: '2026-01-15T10:00:00Z' },
  { aggregate: 'Payment', ownerRole: 'Payment Context', assignedBy: 'Bob', assignedAt: '2026-01-15T10:01:00Z' },
  { aggregate: 'Inventory', ownerRole: 'Inventory Context', assignedBy: 'Carol', assignedAt: '2026-01-15T10:02:00Z' },
  { aggregate: 'Shipment', ownerRole: 'Order Context', assignedBy: 'Alice', assignedAt: '2026-01-15T10:03:00Z' },
  { aggregate: 'Notification', ownerRole: 'Order Context', assignedBy: 'Alice', assignedAt: '2026-01-15T10:04:00Z' },
];

// ---- Meta ----

const meta: Meta = {
  title: 'Components/Agreement/OwnershipGrid',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

export const Default: Story = {
  name: 'Partial Ownership',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 800px;">
      <ownership-grid
        .aggregates=${AGGREGATES}
        .roles=${ROLES}
        .ownershipMap=${PARTIAL_OWNERSHIP as OwnershipAssignment[]}
        participantName="Alice"
      ></ownership-grid>
    </div>
  `,
};

export const FullyAssigned: Story = {
  name: 'Fully Assigned',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 800px;">
      <ownership-grid
        .aggregates=${AGGREGATES}
        .roles=${ROLES}
        .ownershipMap=${FULL_OWNERSHIP as OwnershipAssignment[]}
        participantName="Alice"
      ></ownership-grid>
    </div>
  `,
};

export const Empty: Story = {
  name: 'Empty (no aggregates)',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 800px;">
      <ownership-grid
        .aggregates=${[]}
        .roles=${[]}
        .ownershipMap=${[] as OwnershipAssignment[]}
        participantName="Alice"
      ></ownership-grid>
    </div>
  `,
};
