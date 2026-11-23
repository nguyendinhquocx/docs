/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * collab-session — SPEC-2026-11-22 client transport for the capability
 * share flow. All capability tokens (guest share tokens, owner room
 * tokens) travel in memory or the Authorization header — NEVER in a
 * URL path, query, or log line.
 *
 *   Guest link shape:  <guestOrigin>/#share=<token>   (fragment → never sent to server)
 *   HTTP transport:    Authorization: Bearer <token>
 *   WS transport:      HocuspocusProvider `token` → authentication frame after upgrade
 *   Owner room token:  short-lived JWT kept in memory for the session
 */

export interface ShareMeta {
  roomId: string;
  fileId: string;
  fileName: string;
  etag: string;
  revision: number;
  seeded: boolean;
  role: string;
  readOnly: boolean;
  hasPassword: boolean;
}

export interface MintShareResult {
  linkId: string;
  roomId: string;
  role: string;
  expiresAt: number;
  token: string;
  url: string;
}

export interface CollabTokenResult {
  token: string;
  roomId: string;
  expiresAt: number;
}

export type SeedLeaseResult =
  | { granted: true; etag: string }
  | { granted: false; reason: 'already-seeded' | 'busy'; etag: string };

export interface SaveLeaseResult {
  granted: boolean;
  etag: string;
  revision: number;
}

export interface CommitResult {
  saved: true;
  etag: string;
  revision: number;
}

// A per-tab CSPRNG identifier scopes SQLite seed/save leases. It is
// not an authorization token; every request still validates the Bearer
// capability. A fresh page/tab gets a fresh holder id.
const COLLAB_CLIENT_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function capabilityHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Collab-Client-Id': COLLAB_CLIENT_ID,
    'Cache-Control': 'no-store',
  };
}

export class ShareApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly current?: string;
  constructor(status: number, code: string, current?: string) {
    super(`share api error ${status}: ${code}`);
    this.name = 'ShareApiError';
    this.status = status;
    this.code = code;
    this.current = current;
  }
}

async function unwrap(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ShareApiError(
      res.status,
      typeof body.error === 'string' ? body.error : `http-${res.status}`,
      typeof body.current === 'string' ? body.current : undefined,
    );
  }
  return body;
}

/** Mint a guest capability for a file (owner session cookie rides along). */
export async function mintShareLink(
  collabHttp: string,
  fileId: string,
  opts: { role?: string; expiresInDays?: number } = {},
): Promise<MintShareResult> {
  const res = await fetch(`${collabHttp}/files/${encodeURIComponent(fileId)}/shares/link`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ role: opts.role ?? 'edit', expiresInDays: opts.expiresInDays }),
  });
  return (await unwrap(res)) as unknown as MintShareResult;
}

/** Short-lived owner room token (owner session; token stays in memory). */
export async function fetchCollabToken(
  collabHttp: string,
  fileId: string,
): Promise<CollabTokenResult> {
  const res = await fetch(`${collabHttp}/files/${encodeURIComponent(fileId)}/collab-token`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Cache-Control': 'no-store' },
  });
  return (await unwrap(res)) as unknown as CollabTokenResult;
}

/** Resolve a guest capability to room/file state (no-store always). */
export async function fetchShareMeta(
  collabHttp: string,
  token: string,
): Promise<ShareMeta | null> {
  const res = await fetch(`${collabHttp}/api/share/meta`, {
    headers: capabilityHeaders(token),
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) return null;
  return (await unwrap(res)) as unknown as ShareMeta;
}

export async function fetchShareMetaOrThrow(
  collabHttp: string,
  token: string,
): Promise<ShareMeta> {
  const res = await fetch(`${collabHttp}/api/share/meta`, {
    headers: capabilityHeaders(token),
  });
  return (await unwrap(res)) as unknown as ShareMeta;
}

/** Request the atomic DOCX→Y.Doc seed lease (one holder per room+revision). */
export async function requestSeedLease(
  collabHttp: string,
  token: string,
): Promise<SeedLeaseResult> {
  const res = await fetch(`${collabHttp}/api/share/seed-lease`, {
    method: 'POST',
    headers: capabilityHeaders(token),
  });
  return (await unwrap(res)) as unknown as SeedLeaseResult;
}

/** Fetch the committed DOCX bytes (lease holder only, pre-seed). */
export async function fetchSeedBytes(collabHttp: string, token: string): Promise<ArrayBuffer> {
  const res = await fetch(`${collabHttp}/api/share/seed`, {
    headers: capabilityHeaders(token),
  });
  if (!res.ok) throw new ShareApiError(res.status, `http-${res.status}`);
  return res.arrayBuffer();
}

/** Mark the Y.Doc import committed for this room+revision. */
export async function markSeedDone(collabHttp: string, token: string): Promise<void> {
  const res = await fetch(`${collabHttp}/api/share/seed-done`, {
    method: 'POST',
    headers: capabilityHeaders(token),
  });
  await unwrap(res);
}

/** Acquire the room's single-writer commit lease. Losers skip the tick. */
export async function requestSaveLease(
  collabHttp: string,
  token: string,
): Promise<SaveLeaseResult> {
  const res = await fetch(`${collabHttp}/api/share/save-lease`, {
    method: 'POST',
    headers: capabilityHeaders(token),
  });
  return (await unwrap(res)) as unknown as SaveLeaseResult;
}

/** CAS commit: serialize bytes + mandatory If-Match etag. */
export async function commitSave(
  collabHttp: string,
  token: string,
  bytes: ArrayBuffer,
  expectedEtag: string,
): Promise<CommitResult> {
  const res = await fetch(`${collabHttp}/api/share/commit`, {
    method: 'POST',
    headers: {
      ...capabilityHeaders(token),
      'Content-Type': 'application/octet-stream',
      'If-Match': expectedEtag,
    },
    body: bytes,
  });
  return (await unwrap(res)) as unknown as CommitResult;
}

export function serializeError(err: unknown): string {
  if (err instanceof ShareApiError) return err.code;
  return err instanceof Error ? err.message : String(err);
}

/**
 * In-memory collab session state for the OWNER app. Keys are scoped by
 * fileId so one tab can move between documents without leaking a room
 * token into another document's WS join. Nothing here is persisted —
 * reload re-mints via POST /files/:id/collab-token (15-min TTL server
 * side, so a stale token can't be replayed).
 */
const collabTokens = new Map<string, CollabTokenResult>();

export function rememberCollabToken(fileId: string, result: CollabTokenResult): void {
  collabTokens.set(fileId, result);
}

export function getCollabToken(fileId: string): CollabTokenResult | null {
  return collabTokens.get(fileId) ?? null;
}

export function dropCollabToken(fileId: string): void {
  collabTokens.delete(fileId);
}
