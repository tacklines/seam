import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';

import '../components/session/session-lobby.js';

// session-lobby subscribes to the global store for session state.
// The landing state is the default when no session is connected.
// Stories show static snapshots; interactive flows require a running server.

// ---- Meta ----

const meta: Meta = {
  title: 'Components/Session/SessionLobby',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ---- Stories ----

/**
 * Landing state — the entry point before a session is created or joined.
 * Shows two option cards (Start Session, Join Session) and a solo mode link.
 */
export const Landing: Story = {
  render: () => html`
    <div style="width: 100%; min-height: 100vh;">
      <session-lobby></session-lobby>
    </div>
  `,
};

/**
 * Compact container — shows landing inside a constrained viewport to verify
 * the responsive layout adapts on narrower screens.
 */
export const MobileViewport: Story = {
  name: 'Mobile Viewport',
  render: () => html`
    <div style="width: 375px; min-height: 667px; border: 1px solid #e5e7eb; overflow: hidden; margin: 0 auto;">
      <session-lobby></session-lobby>
    </div>
  `,
};
