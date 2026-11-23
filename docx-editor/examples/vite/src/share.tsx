/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Guest-only application entry for `docx.quoc.app`.
 *
 * The only entry credential is `#share=<capability>`; URL fragments are
 * not sent to the server. After resolving metadata, the capability stays
 * in this tab's memory, travels in `Authorization` headers and the
 * Hocuspocus authentication frame, and is never put in a request URL.
 * This surface has no Home, file list, owner auth, or create menu.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createEmptyDocument,
  DocxEditor,
  LocaleProvider,
  PresenceCluster,
  useTranslation,
  type DocxEditorRef,
} from '@casualoffice/docs';
import { parseDocx } from '@casualoffice/docs';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import { toProseDoc } from '@eigenpal/docx-core/prosemirror/conversion';
import { useCollab } from './collab/useCollab';
import { DisconnectedBanner } from './collab/DisconnectedBanner';
import { ErrorPanel } from './collab/ErrorPanel';
import { LoadingPanel } from './collab/LoadingPanel';
import {
  commitSave,
  fetchShareMetaOrThrow,
  fetchSeedBytes,
  markSeedDone,
  requestSaveLease,
  requestSeedLease,
  serializeError,
  type ShareMeta,
} from './collab/collab-session';
import './styles.css';
import { localeBundle, readAppLocale, writeAppLocale, type AppLocale } from './locales';

const container = document.getElementById('app');
if (container) createRoot(container).render(<GuestRoot />);

function GuestRoot() {
  const [locale, setLocale] = useState<AppLocale>(readAppLocale);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('docs.theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const changeLocale = useCallback((next: AppLocale) => {
    writeAppLocale(next);
    setLocale(next);
  }, []);
  const changeTheme = useCallback((next: 'light' | 'dark') => {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('docs.theme', next);
    } catch {
      /* best effort */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.setAttribute('data-web-docs', 'true');
    document.documentElement.setAttribute('data-theme', theme);
  }, [locale, theme]);
  return (
    <LocaleProvider i18n={localeBundle(locale)}>
      <GuestShareApp
        locale={locale}
        onLocaleChange={changeLocale}
        theme={theme}
        onThemeChange={changeTheme}
      />
    </LocaleProvider>
  );
}

function GuestShareApp({
  locale,
  onLocaleChange,
  theme,
  onThemeChange,
}: {
  locale: AppLocale;
  onLocaleChange: (locale: AppLocale) => void;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
}) {
  const { t } = useTranslation();
  const token = useMemo(() => {
    const fragment = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    return new URLSearchParams(fragment).get('share');
  }, []);
  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [error, setError] = useState<'invalid' | 'load' | null>(token ? null : 'invalid');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetchShareMetaOrThrow('', token)
      .then((data) => {
        if (cancelled) return;
        setMeta(data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (meta?.fileName) {
      document.title = t('shareview.documentTitle', { name: meta.fileName });
    } else {
      document.title = 'Docs';
    }
    document.documentElement.lang = locale;
  }, [meta?.fileName, locale, t]);

  if (error === 'invalid' || !token) {
    return (
      <GuestError title={t('shareview.invalidLinkTitle')} body={t('shareview.invalidLinkBody')} />
    );
  }
  if (error === 'load') {
    return <GuestError title={t('app.statusErrorLoadingFile')} body={t('common.retry')} />;
  }
  if (!meta) return <LoadingPanel />;
  return (
    <GuestRoom
      token={token}
      meta={meta}
      locale={locale}
      onLocaleChange={onLocaleChange}
      theme={theme}
      onThemeChange={onThemeChange}
    />
  );
}

function GuestError({ title, body }: { title: string; body: string }) {
  return (
    <main
      role="alert"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'var(--color-surface, #fff)',
        color: 'var(--color-text, #111)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <section
        style={{
          maxWidth: 480,
          background: 'var(--color-surface-raised, #fff)',
          border: '1px solid var(--color-divider, #e5e5e5)',
          borderRadius: 16,
          padding: 28,
          color: 'var(--color-text, #111)',
        }}
      >
        <div aria-hidden="true" style={{ fontSize: 24, marginBottom: 12 }}>
          !
        </div>
        <h1 style={{ fontSize: 20, margin: '0 0 8px', color: 'var(--color-text, #111)' }}>
          {title}
        </h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary, #666)', lineHeight: 1.6 }}>
          {body}
        </p>
      </section>
    </main>
  );
}

function GuestRoom({
  token,
  meta,
  locale,
  onLocaleChange,
  theme,
  onThemeChange,
}: {
  token: string;
  meta: ShareMeta;
  locale: AppLocale;
  onLocaleChange: (locale: AppLocale) => void;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
}) {
  const { t } = useTranslation();
  const editorRef = useRef<DocxEditorRef>(null);
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const backend = `${wsProtocol}//${window.location.host}/yjs`;
  const user = useMemo(() => ({ name: 'Guest', color: '#2563eb' }), []);
  const { plugins, status, peers, metaMap, synced } = useCollab({
    room: meta.roomId,
    backend,
    user,
    token,
  });

  const [seed, setSeed] = useState<'loading' | 'await-sync' | 'winner' | 'error'>('loading');
  const [seedBuffer, setSeedBuffer] = useState<ArrayBuffer | null>(null);
  const [seedError, setSeedError] = useState('');
  const [mountReady, setMountReady] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 620);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 620);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const dirtyRef = useRef(false);
  const revisionRef = useRef(meta.revision);
  const fileName =
    typeof metaMap.get('fileName') === 'string'
      ? (metaMap.get('fileName') as string)
      : meta.fileName;
  const readOnly = meta.readOnly;

  // Resolve and acquire the one seed lease before attempting DOCX parse.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (meta.seeded) {
          setSeed('await-sync');
          return;
        }
        const lease = await requestSeedLease('', token);
        if (cancelled) return;
        if (!lease.granted) {
          setSeed('await-sync');
          return;
        }
        const bytes = await fetchSeedBytes('', token);
        if (cancelled) return;
        setSeedBuffer(bytes);
        setSeed('winner');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && /invalid-capability/.test(err.message)) setRevoked(true);
        setSeedError(serializeError(err));
        setSeed('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meta.roomId, meta.seeded, token]);

  // Lease winner: import into Y.XmlFragment BEFORE mounting DocxEditor.
  // Only after the provider has sent the update and the server confirms
  // the live document was durably flushed may the lease become `done`.
  useEffect(() => {
    if (seed !== 'winner' || !synced || !seedBuffer) return;
    const fragment = metaMap.doc?.getXmlFragment('prosemirror');
    if (!fragment) return;
    if (fragment.length > 0) {
      let cancelled = false;
      void markSeedDone('', token)
        .then(() => {
          if (!cancelled) setMountReady(true);
        })
        .catch((err) => {
          if (!cancelled) {
            setSeedError(serializeError(err));
            setSeed('error');
          }
        });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    void (async () => {
      try {
        const doc = await parseDocx(seedBuffer);
        if (cancelled) return;
        if (fragment.length === 0) {
          prosemirrorToYXmlFragment(toProseDoc(doc, { styles: doc.package.styles }), fragment);
        }
        // The server waits a bounded interval for this WS update to arrive,
        // verifies the live fragment and flushes it before accepting the lease.
        // A real failure stays recoverable through the guest retry panel.
        await markSeedDone('', token);
        if (!cancelled) setMountReady(true);
      } catch (err) {
        if (!cancelled) {
          setSeedError(serializeError(err));
          setSeed('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seed, synced, seedBuffer, metaMap, token]);

  // Other peers wait for sync, then mount only after the shared fragment
  // has content. Blank DOCX fallback avoids an infinite spinner.
  useEffect(() => {
    if (seed !== 'await-sync' || !synced) return;
    const fragment = metaMap.doc?.getXmlFragment('prosemirror');
    if (!fragment) return;
    if (fragment.length > 0) {
      setMountReady(true);
      return;
    }
    const timeout = setTimeout(() => setMountReady(true), 2500);
    const onUpdate = () => {
      if (fragment.length > 0) setMountReady(true);
    };
    fragment.observeDeep(onUpdate);
    return () => {
      clearTimeout(timeout);
      fragment.unobserveDeep(onUpdate);
    };
  }, [seed, synced, metaMap]);

  // Revoke/expiry is immediate at the server; this bounded poll replaces
  // the editor with an explicit revoked state when the capability stops
  // resolving (the WS is also closed server-side before revoke ACK).
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        await fetchShareMetaOrThrow('', token);
      } catch {
        if (!cancelled) setRevoked(true);
      }
    };
    const timer = setInterval(() => void check(), 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  const save = useCallback(async () => {
    if (readOnly || revoked || !dirtyRef.current || !synced) return;
    const editor = editorRef.current;
    const agent = editor?.getAgent();
    if (!agent) return;
    dirtyRef.current = false;
    setSaveState('saving');
    try {
      const lease = await requestSaveLease('', token);
      if (!lease.granted) {
        setSaveState('idle');
        return;
      }
      const bytes = await agent.toBuffer();
      const committed = await commitSave('', token, bytes, lease.etag);
      revisionRef.current = committed.revision;
      setSaveState('saved');
    } catch (err) {
      dirtyRef.current = true;
      if (err instanceof Error && /invalid-capability/.test(err.message)) setRevoked(true);
      setSaveState('error');
    }
  }, [readOnly, revoked, synced, token]);

  useEffect(() => {
    const timer = setInterval(() => void save(), 6000);
    return () => clearInterval(timer);
  }, [save]);

  const handleRename = useCallback(
    (name: string) => {
      if (!readOnly && name.trim()) metaMap.set('fileName', name.trim());
    },
    [metaMap, readOnly]
  );

  if (revoked) {
    return <GuestError title={t('shareview.revokedTitle')} body={t('shareview.revokedBody')} />;
  }
  if (seed === 'error') {
    return (
      <GuestError
        title={t('shareview.invalidLinkTitle')}
        body={seedError || t('shareview.invalidLinkBody')}
      />
    );
  }
  if (seed === 'loading' || !mountReady) return <LoadingPanel />;

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--color-surface, #fff)',
      }}
    >
      <header
        style={{
          minHeight: 48,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: isNarrow ? 4 : 12,
          padding: isNarrow ? '4px 8px' : '4px 16px',
          background: 'var(--color-surface-raised, #fff)',
          borderBottom: '1px solid var(--color-divider, #e5e5e5)',
        }}
      >
        <img
          className="docs-brand-icon"
          src="/logo.svg"
          alt=""
          aria-hidden="true"
          width={24}
          height={24}
        />
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-text, #111)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fileName}
        </span>
        <span
          aria-live="polite"
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: 'var(--color-text-secondary, #666)',
            display: isNarrow ? 'none' : undefined,
          }}
        >
          {saveState === 'saving'
            ? t('collab.savingToServer')
            : saveState === 'error'
              ? t('collab.saveError')
              : ''}
        </span>
        <button
          type="button"
          onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
          aria-label={t(theme === 'dark' ? 'app.themeLight' : 'app.themeDark')}
          style={{
            marginLeft: isNarrow ? 'auto' : undefined,
            minWidth: 44,
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 0,
            borderRadius: 8,
            background: 'transparent',
            color: 'var(--color-text, #111)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {isNarrow ? (
            <img
              src={theme === 'dark' ? '/icons/sun.svg' : '/icons/moon.svg'}
              alt=""
              aria-hidden="true"
              width={20}
              height={20}
            />
          ) : theme === 'dark' ? (
            t('app.themeLight')
          ) : (
            t('app.themeDark')
          )}
        </button>
        <button
          type="button"
          onClick={() => onLocaleChange(locale === 'vi' ? 'en' : 'vi')}
          aria-label={t(locale === 'vi' ? 'app.switchToEnglish' : 'app.switchToVietnamese')}
          style={{
            minWidth: 44,
            minHeight: 44,
            border: 0,
            borderRadius: 8,
            background: 'transparent',
            color: 'var(--color-text, #111)',
            cursor: 'pointer',
          }}
        >
          {locale === 'vi' ? 'EN' : 'VI'}
        </button>
        <PresenceCluster
          peers={peers.map((p) => ({ name: p.name, color: p.color, active: true }))}
          monochrome
        />
      </header>
      {readOnly && (
        <div
          role="status"
          style={{
            padding: '8px 16px',
            background: 'var(--color-surface-alt, #f6f6f6)',
            color: 'var(--color-text-secondary, #666)',
            fontSize: 13,
          }}
        >
          {t('shareview.readOnlyNotice')}
        </div>
      )}
      <DisconnectedBanner status={status} />
      <main style={{ flex: 1, minHeight: 0 }}>
        <DocxEditor
          ref={editorRef}
          document={createEmptyDocument()}
          externalPlugins={plugins}
          externalContent
          features={{ titleBar: false, menuBar: false }}
          i18n={localeBundle(locale)}
          themeModeOptions={['light', 'dark']}
          hideLocalSaveStatus
          disableBrowserAutosave
          hideAutosaveRestoreBanner
          disableBeforeUnloadWarning
          author={user.name}
          readOnly={readOnly}
          showToolbar={!readOnly}
          showRuler={false}
          documentName={fileName}
          documentNameEditable={false}
          onDocumentNameChange={handleRename}
          onChange={() => {
            if (!readOnly) dirtyRef.current = true;
          }}
          renderTitleBarRight={() => null}
        />
      </main>
    </div>
  );
}
