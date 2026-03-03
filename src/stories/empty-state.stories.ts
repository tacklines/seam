import type { Args, Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';

// Register the component
import '../components/shared/empty-state.js';

const meta: Meta = {
  title: 'Shared/EmptyState',
  tags: ['autodocs'],
  render: (args: Args) => html`
    <div style="border: 1px solid #e5e7eb; border-radius: 8px; min-height: 200px; display: flex; align-items: center; justify-content: center;">
      <empty-state
        icon=${args.icon as string}
        heading=${args.heading as string}
        description=${args.description as string}
        actionLabel=${args.actionLabel as string}
        actionVariant=${args.actionVariant as string}
      ></empty-state>
    </div>
  `,
  argTypes: {
    icon: { control: 'text', description: 'Shoelace icon name' },
    heading: { control: 'text', description: 'Heading text (What am I looking at?)' },
    description: { control: 'text', description: 'Description text (What can I do here?)' },
    actionLabel: { control: 'text', description: 'CTA button label (empty to hide)' },
    actionVariant: {
      control: 'select',
      options: ['primary', 'default', 'text', 'success', 'warning', 'danger'],
      description: 'sl-button variant',
    },
  },
  args: {
    icon: 'inbox',
    heading: 'Nothing here yet',
    description: 'There is no content to display at this time.',
    actionLabel: '',
    actionVariant: 'primary',
  },
};

export default meta;
type Story = StoryObj;

/** Default empty state with no CTA button. */
export const Default: Story = {};

/** Empty state with a call-to-action button. */
export const WithAction: Story = {
  args: {
    icon: 'plus-circle',
    heading: 'No items yet',
    description: 'Get started by adding your first item.',
    actionLabel: 'Add item',
    actionVariant: 'primary',
  },
};

/** Priority phase variant — shown when no events have been ranked. */
export const Priority: Story = {
  args: {
    icon: 'sort-up',
    heading: 'No priorities yet',
    description: 'Load multiple files to start ranking events by importance',
    actionLabel: '',
  },
};

/** Breakdown / Slice phase variant — shown when no work items exist. */
export const Breakdown: Story = {
  args: {
    icon: 'diagram-3',
    heading: 'No work items yet',
    description: 'Break ranked events into concrete work items with dependencies',
    actionLabel: 'Add work item',
    actionVariant: 'primary',
  },
};

/** Agreements / Agree phase variant — shown when no conflicts need resolving. */
export const Agreements: Story = {
  args: {
    icon: 'people',
    heading: 'No conflicts to resolve',
    description: 'When multiple participants describe the same events differently, resolve them here',
    actionLabel: '',
  },
};

/** Contracts / Build phase variant — shown when no contract bundles are loaded. */
export const Contracts: Story = {
  args: {
    icon: 'file-earmark-check',
    heading: 'No contracts yet',
    description: 'Formalize agreements into versioned event contracts',
    actionLabel: '',
  },
};

/** Integration / Ship phase variant — shown when no integration checks have run. */
export const Integration: Story = {
  args: {
    icon: 'rocket-takeoff',
    heading: 'Ready to ship?',
    description: 'Run integration checks to verify all contracts are satisfied',
    actionLabel: 'Run checks',
    actionVariant: 'primary',
  },
};

/** Comparison / Explore phase variant — shown when fewer than 2 files are loaded. */
export const Comparison: Story = {
  args: {
    icon: 'files',
    heading: 'Load two or more files to compare',
    description: 'Load perspective files from multiple participants to see conflicts, shared events, and overlaps',
    actionLabel: '',
  },
};
