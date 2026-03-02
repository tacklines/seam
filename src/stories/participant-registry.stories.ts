import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';

import '../components/session/participant-registry.js';

// participant-registry subscribes to the global store for live session state.
// In Storybook, the store starts empty so the component renders its no-session state.
// To see the populated state, a store mock or decorator would be needed.
// Requires store subscription — use decorator or manual setup for in-session stories.

// ---- Meta ----

const meta: Meta = {
  title: 'Components/Session/ParticipantRegistry',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

/**
 * No session — default state when no session is connected to the store.
 * Shows the "no active session" placeholder.
 */
export const NoSession: Story = {
  name: 'No Session',
  render: () => html`
    <div style="padding: 1rem; max-width: 280px;">
      <participant-registry></participant-registry>
    </div>
  `,
};

/**
 * Sidebar context — how the registry looks inside a typical sidebar layout.
 */
export const InSidebar: Story = {
  name: 'In Sidebar Layout',
  render: () => html`
    <div style="display: flex; gap: 0; height: 500px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <aside style="width: 240px; border-right: 1px solid #e5e7eb; padding: 0.75rem; background: #f9fafb;">
        <participant-registry></participant-registry>
      </aside>
      <main style="flex: 1; padding: 1.5rem; background: #fff; color: #6b7280; display: flex; align-items: center; justify-content: center;">
        Main content area
      </main>
    </div>
  `,
};
