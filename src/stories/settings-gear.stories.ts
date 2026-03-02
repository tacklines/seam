import type { Args, Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';

// Register the component
import '../components/shared/settings-gear.js';

const meta: Meta = {
  title: 'Shared/SettingsGear',
  tags: ['autodocs'],
  render: (args: Args) => html`
    <div style="display: flex; align-items: center; gap: 1rem; padding: 2rem; font-family: sans-serif;">
      <span style="font-size: 1rem; font-weight: 600; color: #111827;">Comparison</span>
      <settings-gear
        sectionName=${args.sectionName as string}
        ?hasModified=${args.hasModified as boolean}
        @open-settings=${(e: CustomEvent) => console.log('open-settings', e.detail)}
      ></settings-gear>
    </div>
  `,
  argTypes: {
    hasModified: { control: 'boolean' },
    sectionName: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  args: {
    sectionName: 'Comparison Settings',
    hasModified: false,
  },
};

export const HasModified: Story = {
  name: 'Has Modified Settings',
  args: {
    sectionName: 'Comparison Settings',
    hasModified: true,
  },
};
