import type { Args, Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { SessionConfig } from '../schema/types.js';
import { DEFAULT_SESSION_CONFIG } from '../schema/types.js';

// Register the component
import '../components/shared/global-settings.js';

const meta: Meta = {
  title: 'Shared/GlobalSettings',
  tags: ['autodocs'],
  render: (args: Args) => html`
    <div style="height: 600px; position: relative;">
      <p style="font-family: sans-serif; color: #6b7280; font-size: 0.875rem;">
        The dialog renders using Shoelace's sl-dialog. Set <strong>open</strong> to true to see it.
      </p>
      <global-settings
        .config=${args.config as SessionConfig}
        ?open=${args.open as boolean}
        @config-changed=${(e: CustomEvent) => console.log('config-changed', e.detail)}
      ></global-settings>
    </div>
  `,
  argTypes: {
    open: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj;

export const DefaultConfig: Story = {
  name: 'Default Config',
  args: {
    config: DEFAULT_SESSION_CONFIG,
    open: true,
  },
};

export const ModifiedConfig: Story = {
  name: 'Modified Config',
  args: {
    config: {
      ...DEFAULT_SESSION_CONFIG,
      comparison: {
        ...DEFAULT_SESSION_CONFIG.comparison,
        sensitivity: 'exact',
        autoDetectConflicts: false,
      },
      contracts: {
        ...DEFAULT_SESSION_CONFIG.contracts,
        strictness: 'strict',
        driftNotifications: 'silent',
      },
      delegation: {
        ...DEFAULT_SESSION_CONFIG.delegation,
        level: 'autonomous',
        approvalExpiry: 3600,
      },
    } satisfies SessionConfig,
    open: true,
  },
};
