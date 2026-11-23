/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Share dialog — SPEC-2026-11-22 capability flow.
//
//   1. Draft without a file: serialize the live editor state and
//      POST /files first (persist BEFORE sharing — no more
//      "No document loaded yet" dead end).
//   2. Mint a guest capability (POST /files/:id/shares/link) — the raw
//      token comes back exactly once and is embedded in a FRAGMENT
//      link (`<guest>/#share=…`), never a query string.
//   3. The owner joins the same durable room via a short-lived room
//      token (POST /files/:id/collab-token) — kept in memory only.
//   4. Existing links list with revoke (linkId-addressed; the server
//      closes that link's active sockets before replying).
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from '@casualoffice/docs';
import {
  fetchCollabToken,
  mintShareLink,
  rememberCollabToken,
  serializeError,
  type MintShareResult,
} from './collab-session';

export interface ShareDialogProps {
  open: boolean;
  /** Persisted file id, or null while the doc is still an unsaved draft. */
  fileId: string | null;
  /** ETag captured from file open / previous server ACK. */
  fileEtag: string | null;
  fileName: string;
  collabHttp: string;
  /** Serialize the CURRENT editor state to DOCX bytes (used to persist
   *  a draft before its first share). */
  serializeDoc: () => Promise<ArrayBuffer>;
  /** Called as soon as a draft gets a durable fileId + ETag. */
  onPersisted: (fileId: string, etag: string) => void;
  /** Called after the owner joined the room (navigates into collab). */
  onJoinedRoom: (fileId: string, roomId: string) => void;
  onClose: () => void;
}

interface LinkRow {
  linkId: string;
  roomId: string;
  role: string;
  expiresAt: number | null;
  hasPassword: boolean;
  createdAt: number;
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.4)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  card: {
    background: 'var(--color-surface-raised, #fff)',
    borderRadius: 12,
    padding: '24px 28px',
    maxWidth: 520,
    width: '90%',
    maxHeight: '86vh',
    overflowY: 'auto',
    boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  title: {
    fontSize: 17,
    fontWeight: 600,
    margin: 0,
    color: 'var(--color-text, #111)',
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--color-text-secondary, #666)',
    margin: '6px 0 20px 0',
    lineHeight: 1.5,
  },
  urlRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'stretch',
    marginBottom: 12,
  },
  urlInput: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid var(--color-divider, #e5e5e5)',
    borderRadius: 12,
    fontSize: 12,
    fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
    color: 'var(--color-text, #111)',
    background: 'var(--color-surface-alt, #f6f6f6)',
    outline: 'none',
    minWidth: 0,
  },
  copyBtn: {
    minHeight: 44,
    padding: '10px 16px',
    background: 'var(--color-surface-raised, #fff)',
    color: 'var(--color-text, #111)',
    border: '1px solid var(--color-divider, #e5e5e5)',
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  copyBtnOk: {
    background: 'var(--color-hover, #f0f0f0)',
  },
  footerRow: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  secondaryBtn: {
    minHeight: 44,
    padding: '8px 14px',
    background: 'transparent',
    border: '1px solid var(--color-divider, #e5e5e5)',
    borderRadius: 12,
    fontSize: 13,
    color: 'var(--color-text-secondary, #666)',
    cursor: 'pointer',
  },
  primaryBtn: {
    minHeight: 44,
    padding: '8px 14px',
    background: 'var(--color-surface-alt, #f6f6f6)',
    color: 'var(--color-text, #111)',
    border: '1px solid var(--color-divider, #e5e5e5)',
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  errorBanner: {
    background: 'var(--color-surface-alt, #f6f6f6)',
    color: 'var(--color-text, #111)',
    border: '1px solid var(--color-divider, #e5e5e5)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    marginBottom: 16,
  },
  spinner: {
    border: '2px solid var(--color-divider, #e5e5e5)',
    borderTopColor: 'var(--color-accent, #111)',
    borderRadius: '50%',
    width: 18,
    height: 18,
    animation: 'spin 0.8s linear infinite',
    display: 'inline-block',
  },
  linkList: {
    marginTop: 8,
    borderTop: '1px solid var(--color-divider, #e5e5e5)',
    paddingTop: 8,
  },
  linkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    fontSize: 12,
    color: 'var(--color-text-secondary, #666)',
  },
  linkMeta: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  revokeBtn: {
    padding: '4px 10px',
    fontSize: 12,
    background: 'transparent',
    border: '1px solid var(--color-divider, #e5e5e5)',
    color: 'var(--color-text-secondary, #666)',
    borderRadius: 6,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    margin: '14px 0 4px 0',
  },
};

type Phase = 'preparing' | 'ready' | 'error';

export function ShareDialog({
  open,
  fileId,
  fileEtag,
  fileName,
  collabHttp,
  serializeDoc,
  onPersisted,
  onJoinedRoom,
  onClose,
}: ShareDialogProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('preparing');
  const [persistedFileId, setPersistedFileId] = useState<string | null>(fileId);
  const [persistedFileEtag, setPersistedFileEtag] = useState<string | null>(fileEtag);
  const [share, setShare] = useState<MintShareResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const refreshLinks = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${collabHttp}/files/${encodeURIComponent(id)}/shares`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const body = (await res.json()) as { links?: LinkRow[] };
        setLinks(body.links ?? []);
      } catch {
        /* list is best-effort */
      }
    },
    [collabHttp],
  );

  // Kick off mint as soon as the dialog opens. Persisting a draft and
  // minting are idempotent enough for V1: every open creates a NEW
  // link (revocable individually), drafts get persisted once.
  useEffect(() => {
    if (!open) {
      setPhase('preparing');
      setShare(null);
      setErrorMsg('');
      setCopied(false);
      setLinks([]);
      setPersistedFileId(fileId);
      setPersistedFileEtag(fileEtag);
      setRetryCount(0);
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        // Always serialize the live editor state before minting. A saved
        // file may have unsaved edits since the last autosave; share must
        // start from the exact state visible in this editor.
        const bytes = await serializeDoc();
        let id = fileId;
        let etag = fileEtag;
        if (!id) {
          const form = new FormData();
          const blob = new Blob([bytes], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          });
          form.append('file', blob, fileName || 'Untitled.docx');
          const createRes = await fetch(`${collabHttp}/files`, {
            method: 'POST',
            credentials: 'include',
            body: form,
          });
          if (!createRes.ok) throw new Error(`HTTP ${createRes.status}`);
          const body = (await createRes.json()) as { file?: { id?: string; etag?: string } };
          id = body.file?.id ?? null;
          etag = body.file?.etag ?? null;
          if (!id || !etag) throw new Error('missing file identity');
          setPersistedFileEtag(etag);
        } else {
          if (!etag) throw new Error('missing file ETag; reload the file before sharing');
          const saveRes = await fetch(`${collabHttp}/files/${encodeURIComponent(id)}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/octet-stream',
              'If-Match': etag,
            },
            body: bytes,
          });
          if (!saveRes.ok) {
            const body = (await saveRes.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? `HTTP ${saveRes.status}`);
          }
          const body = (await saveRes.json()) as { file?: { etag?: string } };
          etag = body.file?.etag ?? null;
          if (!etag) throw new Error('missing ETag after server save');
          setPersistedFileEtag(etag);
        }
        if (cancelled) return;
        setPersistedFileId(id);

        const minted = await mintShareLink(collabHttp, id, { role: 'edit' });
        if (cancelled) return;
        setShare(minted);
        setPhase('ready');
        void refreshLinks(id);
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(serializeError(err));
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, retryCount]);

  const copy = useCallback(async () => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [share]);

  const joinRoom = useCallback(async () => {
    if (!share || !persistedFileId) return;
    if (persistedFileEtag) onPersisted(persistedFileId, persistedFileEtag);
    const token = await fetchCollabToken(collabHttp, persistedFileId);
    // Owner room token stays in memory for this tab only — it rides
    // the WS auth frame, never a URL (SPEC transport rule).
    rememberCollabToken(persistedFileId, token);
    onJoinedRoom(persistedFileId, token.roomId);
  }, [share, persistedFileId, persistedFileEtag, onPersisted, collabHttp, onJoinedRoom]);

  const dismiss = useCallback(() => {
    // A link creates a durable file/room. Closing the ready dialog enters
    // that room rather than leaving the owner editing a divergent solo copy.
    if (share && persistedFileId && phase === 'ready') {
      void joinRoom();
    } else {
      onClose();
    }
  }, [share, persistedFileId, phase, joinRoom, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, dismiss]);

  const revoke = useCallback(
    async (linkId: string) => {
      if (!persistedFileId) return;
      setBusyLinkId(linkId);
      try {
        await fetch(
          `${collabHttp}/files/${encodeURIComponent(persistedFileId)}/shares/link/${encodeURIComponent(linkId)}`,
          { method: 'DELETE', credentials: 'include' },
        );
        await refreshLinks(persistedFileId);
      } finally {
        setBusyLinkId(null);
      }
    },
    [persistedFileId, collabHttp, refreshLinks],
  );

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={dismiss} role="dialog" aria-modal="true">
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>{t('collab.shareTitle')}</h3>
        <p style={styles.subtitle}>{t('collab.shareDescriptionV2')}</p>

        {phase === 'error' && <div style={styles.errorBanner}>{errorMsg}</div>}

        {phase === 'preparing' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#64748b',
              fontSize: 13,
            }}
            role="status"
          >
            <span style={styles.spinner} />
            {t('collab.preparingShareLink')}
          </div>
        )}

        {phase === 'ready' && share && (
          <>
            <div style={styles.urlRow}>
              <input
                style={styles.urlInput}
                value={share.url}
                readOnly
                aria-label={t('collab.shareLinkAria')}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                style={{ ...styles.copyBtn, ...(copied ? styles.copyBtnOk : {}) }}
                onClick={copy}
              >
                {copied ? t('share.copied') : t('hyperlinkPopup.copyLink')}
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 12px 0' }}>
              {t('collab.shareFragmentNote')}
            </p>
            {links.length > 0 && (
              <div style={styles.linkList}>
                <div style={styles.sectionTitle}>{t('collab.existingLinks')}</div>
                {links.map((l) => (
                  <div key={l.linkId} style={styles.linkRow}>
                    <span style={styles.linkMeta}>
                      {new Date(l.createdAt).toLocaleString()} · {l.role}
                      {l.expiresAt
                        ? ` · ${t('collab.expiresOn', { date: new Date(l.expiresAt).toLocaleDateString() })}`
                        : ''}
                    </span>
                    <button
                      style={styles.revokeBtn}
                      disabled={busyLinkId === l.linkId}
                      onClick={() => void revoke(l.linkId)}
                    >
                      {t('collab.revokeLink')}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={styles.footerRow}>
              <button style={styles.primaryBtn} onClick={() => void joinRoom()}>
                {t('collab.joinTheSession')}
              </button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <div style={styles.footerRow}>
            <button style={styles.secondaryBtn} onClick={onClose}>
              {t('common.close')}
            </button>
            <button style={styles.primaryBtn} onClick={() => setRetryCount((n) => n + 1)}>
              {t('common.retry')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
