import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { SessionConfig } from '../schema/types.js';
import { DEFAULT_SESSION_CONFIG } from '../schema/types.js';

// Register the components
import '../components/shared/settings-drawer.js';

const meta: Meta = {
  title: 'Shared/SettingsDrawer',
  tags: ['autodocs'],
  argTypes: {
    section: {
      control: 'select',
      options: ['comparison', 'contracts', 'ranking', 'delegation', 'notifications'],
    },
    open: { control: 'boolean' },
  },
  render: (args) => html`
    <div style="min-height: 400px; position: relative;">
      <settings-drawer
        section=${args.section as string}
        .config=${args.config as SessionConfig}
        ?open=${args.open as boolean}
        @settings-changed=${(e: CustomEvent) => console.log('settings-changed', e.detail)}
        @drawer-closed=${() => console.log('drawer-closed')}
      ></settings-drawer>
    </div>
  `,
};

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Section: Comparison
// ---------------------------------------------------------------------------

/** Comparison settings — all at defaults. No blue dots visible. */
export const ComparisonDefaults: Story = {
  name: 'Comparison — Defaults',
  args: {
    section: 'comparison',
    open: true,
    config: DEFAULT_SESSION_CONFIG,
  },
};

/** Comparison settings — sensitivity changed to exact. Blue dot shows on that field. */
export const ComparisonModified: Story = {
  name: 'Comparison — Modified (blue dot visible)',
  args: {
    section: 'comparison',
    open: true,
    config: {
      ...DEFAULT_SESSION_CONFIG,
      comparison: {
        ...DEFAULT_SESSION_CONFIG.comparison,
        sensitivity: 'exact',
        suggestResolutions: false,
      },
    } satisfies SessionConfig,
  },
};

// ---------------------------------------------------------------------------
// Section: Contracts
// ---------------------------------------------------------------------------

/** Contract settings — all at defaults. */
export const ContractsDefaults: Story = {
  name: 'Contracts — Defaults',
  args: {
    section: 'contracts',
    open: true,
    config: DEFAULT_SESSION_CONFIG,
  },
};

/** Contract settings — strictness changed to strict, notifications to silent. */
export const ContractsModified: Story = {
  name: 'Contracts — Modified (blue dots visible)',
  args: {
    section: 'contracts',
    open: true,
    config: {
      ...DEFAULT_SESSION_CONFIG,
      contracts: {
        strictness: 'strict',
        driftNotifications: 'silent',
      },
    } satisfies SessionConfig,
  },
};

// ---------------------------------------------------------------------------
// Section: Ranking (Priority)
// ---------------------------------------------------------------------------

/** Priority/ranking settings — all at defaults. */
export const RankingDefaults: Story = {
  name: 'Ranking — Defaults',
  args: {
    section: 'ranking',
    open: true,
    config: DEFAULT_SESSION_CONFIG,
  },
};

/** Priority/ranking settings — weights adjusted. Blue dots on all modified weights. */
export const RankingModified: Story = {
  name: 'Ranking — Modified weights (blue dots visible)',
  args: {
    section: 'ranking',
    open: true,
    config: {
      ...DEFAULT_SESSION_CONFIG,
      ranking: {
        defaultTier: 'Must Have',
        weights: {
          confidence: 2,
          complexity: 0.5,
          references: 1,
        },
      },
    } satisfies SessionConfig,
  },
};

// ---------------------------------------------------------------------------
// Section: Delegation
// ---------------------------------------------------------------------------

/** Delegation settings — all at defaults. */
export const DelegationDefaults: Story = {
  name: 'Delegation — Defaults',
  args: {
    section: 'delegation',
    open: true,
    config: DEFAULT_SESSION_CONFIG,
  },
};

/** Delegation settings — level raised to autonomous. Blue dot shows on level field. */
export const DelegationModified: Story = {
  name: 'Delegation — Modified (blue dot visible)',
  args: {
    section: 'delegation',
    open: true,
    config: {
      ...DEFAULT_SESSION_CONFIG,
      delegation: {
        level: 'autonomous',
        approvalExpiry: 3600,
      },
    } satisfies SessionConfig,
  },
};

// ---------------------------------------------------------------------------
// Section: Notifications
// ---------------------------------------------------------------------------

/** Notification settings — all at defaults. */
export const NotificationsDefaults: Story = {
  name: 'Notifications — Defaults',
  args: {
    section: 'notifications',
    open: true,
    config: DEFAULT_SESSION_CONFIG,
  },
};

/** Notification settings — toast duration shortened, some events silenced. */
export const NotificationsModified: Story = {
  name: 'Notifications — Modified (blue dots visible)',
  args: {
    section: 'notifications',
    open: true,
    config: {
      ...DEFAULT_SESSION_CONFIG,
      notifications: {
        toastDuration: 3000,
        silentEvents: ['ParticipantJoined', 'ArtifactLoaded'],
      },
    } satisfies SessionConfig,
  },
};

// ---------------------------------------------------------------------------
// Closed state
// ---------------------------------------------------------------------------

/** Drawer closed — nothing visible in the page. */
export const DrawerClosed: Story = {
  name: 'Drawer — Closed state',
  args: {
    section: 'comparison',
    open: false,
    config: DEFAULT_SESSION_CONFIG,
  },
};

// ---------------------------------------------------------------------------
// Gear Button
// ---------------------------------------------------------------------------

/** Gear icon button that triggers the drawer — shown with all five section labels. */
export const GearButtons: Story = {
  name: 'Gear Icon Buttons (all sections)',
  render: () => html`
    <div style="display: flex; gap: 1rem; align-items: center; padding: 1rem; background: #f9fafb; border-radius: 4px;">
      ${(['comparison', 'contracts', 'ranking', 'delegation', 'notifications'] as const).map(
        (section) => html`
          <div style="display: flex; flex-direction: column; align-items: center; gap: 0.25rem;">
            <settings-gear-button section=${section}></settings-gear-button>
            <span style="font-size: 0.75rem; color: #6b7280;">${section}</span>
          </div>
        `
      )}
    </div>
  `,
};
