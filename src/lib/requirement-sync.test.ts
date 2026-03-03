import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncRequirementToServer, removeRequirementFromServer } from './requirement-sync.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('syncRequirementToServer', () => {
  it('posts the requirement and returns the server response', async () => {
    const serverReq = {
      id: 'server-123',
      requirement: {
        id: 'server-123',
        statement: 'Users can register',
        authorId: 'p1',
        status: 'draft' as const,
        priority: 0,
        tags: [],
        derivedEvents: [],
        derivedAssumptions: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(serverReq),
    });

    const result = await syncRequirementToServer('ABC123', 'p1', 'Users can register');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3002/api/sessions/ABC123/requirements',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: 'p1', statement: 'Users can register' }),
      },
    );
    expect(result).toEqual(serverReq);
  });

  it('returns null on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await syncRequirementToServer('ABC123', 'p1', 'test');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    const result = await syncRequirementToServer('ABC123', 'p1', 'test');
    expect(result).toBeNull();
  });
});

describe('removeRequirementFromServer', () => {
  it('sends a DELETE request to the server', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await removeRequirementFromServer('ABC123', 'req-1');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3002/api/sessions/ABC123/requirements/req-1',
      { method: 'DELETE' },
    );
  });

  it('swallows network errors silently', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    // Should not throw
    await expect(removeRequirementFromServer('ABC123', 'req-1')).resolves.toBeUndefined();
  });
});
