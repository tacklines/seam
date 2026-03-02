import type { Args, Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import { GLOSSARY } from '../lib/glossary.js';

// Register the component
import '../components/shared/domain-tooltip.js';

const meta: Meta = {
  title: 'Shared/DomainTooltip',
  tags: ['autodocs'],
  render: (args: Args) => html`
    <div style="padding: 2rem; font-size: 0.9375rem; color: #374151;">
      <domain-tooltip term=${args.term as string}>
        ${args.label as string}
      </domain-tooltip>
    </div>
  `,
  argTypes: {
    term: {
      control: 'select',
      options: Object.keys(GLOSSARY),
      description: 'Glossary key — determines which definition is shown',
    },
    label: {
      control: 'text',
      description: 'The visible text content inside the tooltip wrapper',
    },
  },
  args: {
    term: 'aggregate',
    label: 'Aggregate',
  },
};

export default meta;
type Story = StoryObj;

/** Single term with its tooltip. Hover the text to see the definition. */
export const SingleTerm: Story = {};

/** All glossary terms displayed together — hover each to see its definition. */
export const AllTerms: Story = {
  render: () => html`
    <div style="padding: 2rem; display: flex; flex-direction: column; gap: 1rem; font-size: 0.9375rem; color: #374151;">
      <p style="color: #6b7280; font-size: 0.8125rem; margin: 0 0 0.5rem;">
        Hover any term below to see its plain-language definition.
      </p>
      ${Object.entries(GLOSSARY).map(
        ([key, entry]) => html`
          <div>
            <domain-tooltip term=${key}>${entry.term}</domain-tooltip>
          </div>
        `
      )}
    </div>
  `,
};

/** Aggregate — a cluster of related things that change together. */
export const Aggregate: Story = {
  args: { term: 'aggregate', label: 'Aggregate' },
};

/** Domain Event — something important that happened in the system. */
export const DomainEvent: Story = {
  name: 'Domain Event',
  args: { term: 'domain-event', label: 'Domain Event' },
};

/** Bounded Context — a team's area of responsibility. */
export const BoundedContext: Story = {
  name: 'Bounded Context',
  args: { term: 'bounded-context', label: 'Bounded Context' },
};

/** Conflict — a disagreement about how something should work. */
export const Conflict: Story = {
  args: { term: 'conflict', label: 'Conflict' },
};

/** Overlap — when two people describe the same event differently. */
export const Overlap: Story = {
  args: { term: 'overlap', label: 'Overlap' },
};

/** Contract — a formal agreement about an event's shape and meaning. */
export const Contract: Story = {
  args: { term: 'contract', label: 'Contract' },
};

/** Unknown term — gracefully renders with no tooltip. */
export const UnknownTerm: Story = {
  name: 'Unknown Term (graceful fallback)',
  args: { term: 'not-a-real-term', label: 'Some Unknown Term' },
};

/** Inline usage inside a paragraph of text. */
export const InlineInText: Story = {
  render: () => html`
    <div style="padding: 2rem; max-width: 480px; font-size: 0.9375rem; color: #374151; line-height: 1.7;">
      <p>
        In Event Storming, a
        <domain-tooltip term="domain-event">Domain Event</domain-tooltip>
        belongs to an
        <domain-tooltip term="aggregate">Aggregate</domain-tooltip>
        within a
        <domain-tooltip term="bounded-context">Bounded Context</domain-tooltip>.
      </p>
      <p>
        When two roles describe the same event, it becomes an
        <domain-tooltip term="overlap">Overlap</domain-tooltip>.
        If their definitions differ significantly, it turns into a
        <domain-tooltip term="conflict">Conflict</domain-tooltip>
        that the team must resolve.
      </p>
    </div>
  `,
};
