import type {
  LoadedFile,
  Participant,
  ParticipantType,
  EventPriority,
  Vote,
  WorkItem,
  WorkItemDependency,
  OwnershipAssignment,
  ConflictResolution,
  Requirement,
} from '../schema/types.js';
import type { Confidence, Direction } from '../schema/types.js';

/** A single suggested event within a derivation group. */
export interface DerivationSuggestedEvent {
  name: string;
  description: string;
  confidence: string;
  trigger: string;
  stateChange: string;
}

/** A group of suggested events derived from a single requirement. */
export interface DerivationSuggestionGroup {
  requirementId: string;
  requirementText: string;
  events: DerivationSuggestedEvent[];
}
import { saveSessionIdentity, clearSessionIdentity } from '../lib/session-identity-persistence.js';

export type ViewMode = 'cards' | 'flow' | 'comparison' | 'priority' | 'breakdown' | 'agreements' | 'contracts' | 'integration';

// Re-export canonical participant types for consumers that import from app-state
export type { ParticipantType };
export type SessionParticipant = Participant;

export interface SessionSubmission {
  participantId: string;
  fileName: string;
  submittedAt: string;
}

export interface ActiveSession {
  code: string;
  createdAt: string;
  participants: SessionParticipant[];
  submissions: SessionSubmission[];
  priorities: EventPriority[];
  votes: Vote[];
  workItems: WorkItem[];
  workItemDependencies: WorkItemDependency[];
  ownershipMap: OwnershipAssignment[];
  resolutions: ConflictResolution[];
  requirements: Requirement[];
}

export interface SessionState {
  code: string;
  participantId: string;
  session: ActiveSession;
}

export interface AppState {
  files: LoadedFile[];
  activeView: ViewMode;
  filters: {
    confidence: Set<Confidence>;
    direction: Set<Direction>;
  };
  errors: { filename: string; errors: string[] }[];
  selectedAggregate: string | null;
  sidebarCollapsed: boolean;
  fileManagerOpen: boolean;
  sessionState: SessionState | null;
  derivationSuggestions: DerivationSuggestionGroup[];
}

export type AppStateEvent =
  | { type: 'file-loaded'; role: string }
  | { type: 'file-removed'; role: string }
  | { type: 'view-mode-changed'; view: ViewMode }
  | { type: 'filter-changed'; filterType: 'confidence' | 'direction' }
  | { type: 'aggregate-selected'; aggregate: string | null }
  | { type: 'errors-changed' }
  | { type: 'sidebar-toggled' }
  | { type: 'file-manager-toggled' }
  | { type: 'session-connected'; code: string; participantId: string }
  | { type: 'session-updated' }
  | { type: 'session-disconnected' }
  | { type: 'derivation-suggestions-changed' };

type Listener = (event: AppStateEvent) => void;

const ALL_CONFIDENCE = new Set<Confidence>(['CONFIRMED', 'LIKELY', 'POSSIBLE']);
const ALL_DIRECTION = new Set<Direction>(['inbound', 'outbound', 'internal']);

class Store {
  private state: AppState = {
    files: [],
    activeView: 'cards',
    filters: {
      confidence: new Set(ALL_CONFIDENCE),
      direction: new Set(ALL_DIRECTION),
    },
    errors: [],
    selectedAggregate: null,
    sidebarCollapsed: false,
    fileManagerOpen: false,
    sessionState: null,
    derivationSuggestions: [],
  };

  private listeners = new Set<Listener>();

  get(): AppState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(event: AppStateEvent) {
    for (const fn of this.listeners) fn(event);
  }

  addFile(file: LoadedFile) {
    // Replace if same role already loaded
    this.state = {
      ...this.state,
      files: [
        ...this.state.files.filter((f) => f.role !== file.role),
        file,
      ],
    };
    // Auto-switch to comparison if 2+ files
    if (this.state.files.length >= 2) {
      this.state.activeView = 'comparison';
    }
    this.notify({ type: 'file-loaded', role: file.role });
  }

  removeFile(role: string) {
    this.state = {
      ...this.state,
      files: this.state.files.filter((f) => f.role !== role),
    };
    const multiFileViews: ViewMode[] = ['comparison', 'priority', 'breakdown', 'agreements', 'contracts', 'integration'];
    if (this.state.files.length < 2 && multiFileViews.includes(this.state.activeView)) {
      this.state.activeView = 'cards';
    }
    this.notify({ type: 'file-removed', role });
  }

  setView(view: ViewMode) {
    this.state = { ...this.state, activeView: view };
    this.notify({ type: 'view-mode-changed', view });
  }

  toggleConfidence(c: Confidence) {
    const next = new Set(this.state.filters.confidence);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    this.state = {
      ...this.state,
      filters: { ...this.state.filters, confidence: next },
    };
    this.notify({ type: 'filter-changed', filterType: 'confidence' });
  }

  toggleDirection(d: Direction) {
    const next = new Set(this.state.filters.direction);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    this.state = {
      ...this.state,
      filters: { ...this.state.filters, direction: next },
    };
    this.notify({ type: 'filter-changed', filterType: 'direction' });
  }

  addError(filename: string, errors: string[]) {
    this.state = {
      ...this.state,
      errors: [...this.state.errors, { filename, errors }],
    };
    this.notify({ type: 'errors-changed' });
  }

  clearErrors() {
    this.state = { ...this.state, errors: [] };
    this.notify({ type: 'errors-changed' });
  }

  setSelectedAggregate(aggregate: string | null) {
    this.state = { ...this.state, selectedAggregate: aggregate };
    this.notify({ type: 'aggregate-selected', aggregate });
  }

  toggleSidebar() {
    this.state = { ...this.state, sidebarCollapsed: !this.state.sidebarCollapsed };
    this.notify({ type: 'sidebar-toggled' });
  }

  setFileManagerOpen(open: boolean) {
    this.state = { ...this.state, fileManagerOpen: open };
    this.notify({ type: 'file-manager-toggled' });
  }

  setSession(code: string, participantId: string, session: ActiveSession) {
    this.state = { ...this.state, sessionState: { code, participantId, session } };
    saveSessionIdentity(code, participantId);
    this.notify({ type: 'session-connected', code, participantId });
  }

  updateSession(session: ActiveSession) {
    if (!this.state.sessionState) return;
    this.state = {
      ...this.state,
      sessionState: { ...this.state.sessionState, session },
    };
    this.notify({ type: 'session-updated' });
  }

  clearSession() {
    this.state = { ...this.state, sessionState: null };
    clearSessionIdentity();
    this.notify({ type: 'session-disconnected' });
  }

  setDerivationSuggestions(suggestions: DerivationSuggestionGroup[]) {
    this.state = { ...this.state, derivationSuggestions: suggestions };
    this.notify({ type: 'derivation-suggestions-changed' });
  }

  clearDerivationSuggestions() {
    this.state = { ...this.state, derivationSuggestions: [] };
    this.notify({ type: 'derivation-suggestions-changed' });
  }
}

export const store = new Store();
