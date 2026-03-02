import type {
  EventPriority,
  Vote,
  CompositeScore,
  PriorityTier,
} from '../../schema/types.js';
import type { Session } from '../../lib/session-store.js';
import { generateId } from '../../lib/session-store.js';
import { EventStore } from '../session/event-store.js';
import type { PrioritySet, VoteCast } from '../session/domain-events.js';

// ---------------------------------------------------------------------------
// PrioritizationService — priority/voting operations for the Prioritization
// bounded context (Phase III — Rank)
// ---------------------------------------------------------------------------

/** Tier weights used for composite score computation */
const TIER_WEIGHTS: Record<PriorityTier, number> = {
  must_have: 3,
  should_have: 2,
  could_have: 1,
};

export class PrioritizationService {
  private readonly getSession: (code: string) => Session | null;
  private readonly eventStore: EventStore | null;

  constructor(
    getSession: (code: string) => Session | null,
    eventStore?: EventStore
  ) {
    this.getSession = getSession;
    this.eventStore = eventStore ?? null;
  }

  /**
   * Set a priority tier for a domain event.
   * Idempotent: if the same participantId+eventName already has a priority,
   * the tier is updated and the existing record is replaced.
   */
  setPriority(
    code: string,
    priority: Omit<EventPriority, 'setAt'>
  ): EventPriority | null {
    const session = this.getSession(code);
    if (!session) return null;

    const setAt = new Date().toISOString();
    const full: EventPriority = { ...priority, setAt };

    const idx = session.priorities.findIndex(
      (p) =>
        p.eventName === priority.eventName &&
        p.participantId === priority.participantId
    );

    if (idx >= 0) {
      session.priorities[idx] = full;
    } else {
      session.priorities.push(full);
    }

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'PrioritySet',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: setAt,
        eventName: priority.eventName,
        participantId: priority.participantId,
        tier: priority.tier,
      } satisfies PrioritySet);
    }

    return full;
  }

  /**
   * Cast a vote on a domain event.
   * Idempotent: if the same participantId+eventName already has a vote,
   * the direction is updated and the existing record is replaced.
   */
  castVote(
    code: string,
    vote: Omit<Vote, 'castAt'>
  ): Vote | null {
    const session = this.getSession(code);
    if (!session) return null;

    const castAt = new Date().toISOString();
    const full: Vote = { ...vote, castAt };

    const idx = session.votes.findIndex(
      (v) =>
        v.eventName === vote.eventName &&
        v.participantId === vote.participantId
    );

    if (idx >= 0) {
      session.votes[idx] = full;
    } else {
      session.votes.push(full);
    }

    if (this.eventStore) {
      this.eventStore.append(session.code, {
        type: 'VoteCast',
        eventId: generateId(),
        sessionCode: session.code,
        timestamp: castAt,
        eventName: vote.eventName,
        participantId: vote.participantId,
        direction: vote.direction,
      } satisfies VoteCast);
    }

    return full;
  }

  /**
   * Return all raw per-participant priorities for the session.
   */
  getPriorities(code: string): EventPriority[] | null {
    const session = this.getSession(code);
    if (!session) return null;
    return [...session.priorities];
  }

  /**
   * Compute composite scores for all domain events that have at least one
   * priority set. Returns a sorted list (highest score first).
   *
   * Scoring algorithm:
   * 1. Average the tier weights across all participants who set a priority
   * 2. Adjust by net vote balance (upvotes - downvotes)
   * 3. Final score = avgTierWeight + netVotes
   */
  computeCompositeScores(code: string): CompositeScore[] | null {
    const session = this.getSession(code);
    if (!session) return null;

    // Collect all unique event names that have priorities
    const eventNames = new Set(session.priorities.map((p) => p.eventName));

    const scores: CompositeScore[] = [];

    for (const eventName of eventNames) {
      const eventPriorities = session.priorities.filter(
        (p) => p.eventName === eventName
      );
      const eventVotes = session.votes.filter(
        (v) => v.eventName === eventName
      );

      const totalTierWeight = eventPriorities.reduce(
        (sum, p) => sum + TIER_WEIGHTS[p.tier],
        0
      );
      const avgTierWeight =
        eventPriorities.length > 0
          ? totalTierWeight / eventPriorities.length
          : 0;

      const upvotes = eventVotes.filter((v) => v.direction === 'up').length;
      const downvotes = eventVotes.filter((v) => v.direction === 'down').length;
      const netVotes = upvotes - downvotes;

      const compositeScore = avgTierWeight + netVotes;

      scores.push({
        eventName,
        compositeScore,
        priorities: eventPriorities,
        votes: eventVotes,
      });
    }

    // Sort highest score first, then alphabetically as tiebreaker
    scores.sort((a, b) => {
      if (b.compositeScore !== a.compositeScore) {
        return b.compositeScore - a.compositeScore;
      }
      return a.eventName.localeCompare(b.eventName);
    });

    return scores;
  }
}
