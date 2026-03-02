import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';

import '../components/artifact/file-drop-zone.js';

// ---- Meta ----

const meta: Meta = {
  title: 'Components/Artifact/FileDropZone',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

/**
 * Hero mode — full-page landing with centered drop target and title.
 * This is the default mode shown when no files have been loaded yet.
 */
export const Hero: Story = {
  render: () => html`
    <div style="width: 100%; min-height: 100vh; background: #f8fafc;">
      <file-drop-zone mode="hero"></file-drop-zone>
    </div>
  `,
};

/**
 * Compact mode — an inline drop target for adding more files to an existing session.
 */
export const Compact: Story = {
  render: () => html`
    <div style="padding: 1.5rem; max-width: 500px; background: #f9fafb;">
      <file-drop-zone mode="compact"></file-drop-zone>
    </div>
  `,
};

/**
 * Compact mode inside a card — typical embedding context.
 */
export const CompactInCard: Story = {
  name: 'Compact in Card',
  render: () => html`
    <div style="padding: 1.5rem; max-width: 500px;">
      <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1.25rem;">
        <p style="margin: 0 0 0.75rem; font-size: 0.875rem; color: #374151; font-weight: 600;">
          Add more files
        </p>
        <file-drop-zone mode="compact"></file-drop-zone>
      </div>
    </div>
  `,
};
