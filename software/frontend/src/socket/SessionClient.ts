import { getBackendHttpBase } from '../config/backend';

const BASE_URL = () => getBackendHttpBase();

export interface FinalizeResult {
  session_id: string;
  collision_free: boolean;
  violations: string[];
  n_smoothed_waypoints: number;
}

export interface InstructionsResult {
  session_id: string;
  status: string;
  joints: number[][];
}

/** Raised for any non-2xx response, carrying the backend's error detail
 * (e.g. "Need at least 2 waypoints to finalize") so callers can surface a
 * real message instead of the UI silently hanging. */
export class SessionApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'SessionApiError';
  }
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // response had no JSON body; fall back to statusText
    }
    throw new SessionApiError(detail, res.status);
  }
  return res.json();
}

/** REST client for the session-based demonstration recording / review /
 * approval flow (distinct from the live per-frame `/ws/stream` shared
 * control channel). Mirrors the proposal's Ch.5 API reference. */
export class SessionClient {
  public async create(description: string): Promise<string> {
    const res = await fetch(`${BASE_URL()}/session/create?description=${encodeURIComponent(description)}`, {
      method: 'POST',
    });
    const data = await parseOrThrow<{ session_id: string }>(res);
    return data.session_id;
  }

  public async pushFrame(sessionId: string, joints: number[]): Promise<void> {
    const res = await fetch(`${BASE_URL()}/session/${sessionId}/frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(joints),
    });
    await parseOrThrow(res);
  }

  public async finalize(sessionId: string): Promise<FinalizeResult> {
    const res = await fetch(`${BASE_URL()}/session/${sessionId}/finalize`, { method: 'POST' });
    return parseOrThrow<FinalizeResult>(res);
  }

  public async getInstructions(sessionId: string): Promise<InstructionsResult> {
    const res = await fetch(`${BASE_URL()}/session/${sessionId}/instructions`);
    return parseOrThrow<InstructionsResult>(res);
  }

  public async approve(sessionId: string): Promise<void> {
    const res = await fetch(`${BASE_URL()}/session/${sessionId}/approve`, { method: 'POST' });
    await parseOrThrow(res);
  }

  public async reject(sessionId: string): Promise<void> {
    const res = await fetch(`${BASE_URL()}/session/${sessionId}/reject`, { method: 'POST' });
    await parseOrThrow(res);
  }

  public async skillLibrary(): Promise<any[]> {
    const res = await fetch(`${BASE_URL()}/skills/library`);
    const data = await parseOrThrow<{ skills: any[] }>(res);
    return data.skills || [];
  }
}
