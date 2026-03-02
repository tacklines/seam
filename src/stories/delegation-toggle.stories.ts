import type { Args, Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { DelegationLevel } from '../schema/types.js';
import type { LevelChangedDetail } from '../components/shared/delegation-toggle.js';

// Register the component
import '../components/shared/delegation-toggle.js';

const meta: Meta = {
  title: 'Shared/DelegationToggle',
  tags: ['autodocs'],
  render: (args: Args) => html`
    <div style="padding: 2rem; max-width: 320px;">
      <delegation-toggle
        level=${args.level as DelegationLevel}
        @level-changed=${(e: CustomEvent<LevelChangedDetail>) =>
          console.log('level-changed', e.detail)}
      ></delegation-toggle>
    </div>
  `,
  argTypes: {
    level: {
      control: 'select',
      options: ['assisted', 'semi_autonomous', 'autonomous'],
    },
  },
};

export default meta;
type Story = StoryObj;

/** Default: agents suggest, humans must approve every action. */
export const Assisted: Story = {
  name: 'Assisted (default)',
  args: {
    level: 'assisted' satisfies DelegationLevel,
  },
};

/** Semi-autonomous: agents handle routine tasks, humans can undo. */
export const SemiAutonomous: Story = {
  name: 'Semi-Autonomous',
  args: {
    level: 'semi_autonomous' satisfies DelegationLevel,
  },
};

/** Autonomous: agents act as full session participants without approval. */
export const Autonomous: Story = {
  name: 'Autonomous',
  args: {
    level: 'autonomous' satisfies DelegationLevel,
  },
};
