import { store, type SessionParticipant } from './app-state.js';
import { authStore } from './auth-state.js';
import { fetchQuestions } from './task-api.js';

const WS_BASE = (import.meta as any).env?.VITE_WS_URL ?? 'ws://localhost:5173/ws';

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_FACTOR = 2;

let activeSocket: WebSocket | null = null;
let activeSessionCode: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoffMs = INITIAL_BACKOFF_MS;
let intentionalDisconnect = false;

export function connectSession(code: string): void {
  intentionalDisconnect = false;
  activeSessionCode = code;
  backoffMs = INITIAL_BACKOFF_MS;
  disconnectSession();
  openSocket(code);
}

export function disconnectSession(): void {
  intentionalDisconnect = true;
  activeSessionCode = null;

  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (activeSocket) {
    activeSocket.close();
    activeSocket = null;
  }
}

function openSocket(code: string): void {
  const ws = new WebSocket(WS_BASE);
  activeSocket = ws;

  ws.addEventListener('open', () => {
    backoffMs = INITIAL_BACKOFF_MS;
    const token = authStore.getAccessToken();
    const participantId = store.get().sessionState?.participantId;
    ws.send(JSON.stringify({
      type: 'join',
      sessionCode: code,
      ...(token && { token }),
      ...(participantId && { participantId }),
    }));
  });

  ws.addEventListener('message', (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data as string) as {
        type: string;
        sessionCode?: string;
        participant?: SessionParticipant;
        participantId?: string;
        message?: string;
      };

      if (msg.type === 'participant_joined' && msg.participant) {
        const current = store.get().sessionState;
        if (!current) return;
        const already = current.session.participants.find((p) => p.id === msg.participant!.id);
        if (!already) {
          store.updateSession({
            ...current.session,
            participants: [...current.session.participants, msg.participant],
          });
        }
      }

      if (msg.type === 'participant_connected' && msg.participantId) {
        const current = store.get().sessionState;
        if (!current) return;
        store.updateSession({
          ...current.session,
          participants: current.session.participants.map((p) =>
            p.id === msg.participantId ? { ...p, is_online: true } : p
          ),
        });
      }

      if (msg.type === 'participant_disconnected' && msg.participantId) {
        const current = store.get().sessionState;
        if (!current) return;
        store.updateSession({
          ...current.session,
          participants: current.session.participants.map((p) =>
            p.id === msg.participantId ? { ...p, is_online: false } : p
          ),
        });
      }

      // Task events — notify task board to refresh
      if (msg.type === 'task_created' || msg.type === 'task_updated' || msg.type === 'task_deleted' || msg.type === 'comment_added' || msg.type === 'dependency_changed') {
        store.notifyTasksChanged();
      }

      // Question events — notify question UI to refresh
      if (msg.type === 'question_asked' || msg.type === 'question_answered') {
        store.notifyQuestionsChanged();
        store.notifyActivityChanged();
      }

      // Desktop notification for new questions
      if (msg.type === 'question_asked' && document.hidden && Notification.permission === 'granted') {
        const session = store.get().sessionState;
        if (session) {
          showQuestionNotification(session.code);
        }
      }

      // Note events
      if (msg.type === 'note_updated') {
        store.notifyNotesChanged();
      }

      // Activity events — notify activity feed to refresh
      if (msg.type === 'activity') {
        store.notifyActivityChanged();
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.addEventListener('close', () => {
    if (activeSocket === ws) {
      activeSocket = null;
    }
    if (!intentionalDisconnect && activeSessionCode) {
      scheduleReconnect(activeSessionCode);
    }
  });

  ws.addEventListener('error', () => {
    // error is always followed by close
  });
}

async function showQuestionNotification(sessionCode: string) {
  try {
    const questions = await fetchQuestions(sessionCode, 'pending');
    const latest = questions[0];
    if (!latest) return;
    const n = new Notification(`${latest.asked_by_name} asked a question`, {
      body: latest.question_text.length > 120
        ? latest.question_text.slice(0, 120) + '…'
        : latest.question_text,
      tag: `seam-question-${latest.id}`,
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {
    // Non-critical — silently ignore
  }
}

function scheduleReconnect(code: string): void {
  if (reconnectTimer !== null) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!intentionalDisconnect && activeSessionCode === code) {
      backoffMs = Math.min(backoffMs * BACKOFF_FACTOR, MAX_BACKOFF_MS);
      openSocket(code);
    }
  }, backoffMs);
}
