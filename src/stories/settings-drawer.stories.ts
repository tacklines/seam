import type { Args, Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import type { SettingItem } from '../components/shared/settings-drawer.js';

// Register the component
import '../components/shared/settings-drawer.js';

const meta: Meta = {
  title: 'Shared/SettingsDrawer',
  tags: ['autodocs'],
  render: (args: Args) => html`
    <div style="height: 400px; position: relative;">
      <p style="font-family: sans-serif; color: #6b7280; font-size: 0.875rem;">
        The drawer renders using Shoelace's sl-drawer. Set <strong>open</strong> to true to see it.
      </p>
      <settings-drawer
        sectionName=${args.sectionName as string}
        .settings=${args.settings as SettingItem[]}
        ?open=${args.open as boolean}
        @setting-changed=${(e: CustomEvent) => console.log('setting-changed', e.detail)}
      ></settings-drawer>
    </div>
  `,
  argTypes: {
    open: { control: 'boolean' },
    sectionName: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj;

const comparisonSettings: SettingItem[] = [
  {
    key: 'comparison.sensitivity',
    label: 'Comparison Sensitivity',
    type: 'select',
    value: 'semantic',
    defaultValue: 'semantic',
    options: [
      { label: 'Semantic — treat camelCase and snake_case as equal', value: 'semantic' },
      { label: 'Exact — require byte-for-byte equality', value: 'exact' },
    ],
    description: 'How strictly event names and field names are compared.',
  },
  {
    key: 'comparison.autoDetectConflicts',
    label: 'Auto-detect Conflicts',
    type: 'switch',
    value: true,
    defaultValue: true,
    description: 'Detect overlaps and conflicts automatically as artifacts arrive.',
  },
  {
    key: 'comparison.suggestResolutions',
    label: 'Suggest Resolutions',
    type: 'switch',
    value: true,
    defaultValue: true,
    description: 'Generate resolution suggestions for detected conflicts.',
  },
];

const contractsSettings: SettingItem[] = [
  {
    key: 'contracts.strictness',
    label: 'Contract Strictness',
    type: 'select',
    value: 'warn',
    defaultValue: 'warn',
    options: [
      { label: 'Strict — block submission', value: 'strict' },
      { label: 'Warn — surface warnings', value: 'warn' },
      { label: 'Relaxed — log only', value: 'relaxed' },
    ],
    description: 'How non-compliant artifacts are handled.',
  },
  {
    key: 'contracts.driftNotifications',
    label: 'Drift Notifications',
    type: 'select',
    value: 'immediate',
    defaultValue: 'immediate',
    options: [
      { label: 'Immediate — toast on every drift event', value: 'immediate' },
      { label: 'Batched — digest at end of session', value: 'batched' },
      { label: 'Silent — visible in Contract tab only', value: 'silent' },
    ],
    description: 'When and how participants are notified of contract drift.',
  },
];

const modifiedSettings: SettingItem[] = [
  {
    key: 'comparison.sensitivity',
    label: 'Comparison Sensitivity',
    type: 'select',
    value: 'exact',
    defaultValue: 'semantic',
    options: [
      { label: 'Semantic — treat camelCase and snake_case as equal', value: 'semantic' },
      { label: 'Exact — require byte-for-byte equality', value: 'exact' },
    ],
    description: 'How strictly event names and field names are compared.',
  },
  {
    key: 'comparison.autoDetectConflicts',
    label: 'Auto-detect Conflicts',
    type: 'switch',
    value: false,
    defaultValue: true,
    description: 'Detect overlaps and conflicts automatically as artifacts arrive.',
  },
  {
    key: 'comparison.suggestResolutions',
    label: 'Suggest Resolutions',
    type: 'switch',
    value: true,
    defaultValue: true,
    description: 'Generate resolution suggestions for detected conflicts.',
  },
];

export const ComparisonSettings: Story = {
  args: {
    sectionName: 'Comparison Settings',
    settings: comparisonSettings,
    open: true,
  },
};

export const ContractsSettings: Story = {
  args: {
    sectionName: 'Contracts Settings',
    settings: contractsSettings,
    open: true,
  },
};

export const WithModified: Story = {
  name: 'With Modified Settings',
  args: {
    sectionName: 'Comparison Settings',
    settings: modifiedSettings,
    open: true,
  },
};
