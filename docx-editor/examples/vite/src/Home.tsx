/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  CATEGORIES,
  CATEGORY_LABEL_KEYS,
  TEMPLATES,
  TEMPLATE_NAME_KEYS,
  type TemplateCategory,
  type TemplateEntry,
} from './templates/manifest';
import {
  deleteRecentFile,
  formatSize,
  listRecentFiles,
  useTranslation,
  type FileEntry,
  type FileSource,
  type RecentFile,
  type TranslationKey,
} from '@casualoffice/docs';

/** Track viewport breakpoint. <720 = phone (single-col controls,
 *  2-col card grid, reduced padding, smaller hero). */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < 720
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 719px)');
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    setMobile(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return mobile;
}

interface HomeProps {
  onNewDocument: () => void;
  onSelectTemplate: (entry: TemplateEntry) => void;
  onOpenFile: (file: File) => void;
  /** SPEC-2026-11-22: owner server-side file library (PersonalFileSource).
   *  Null when there is no owner session (dev without personal mode). */
  personalFileSource?: FileSource | null;
  onOpenPersonalFile?: (id: string, name: string) => void;
  onLogout?: () => void;
  locale?: 'vi' | 'en';
  onLocaleChange?: (locale: 'vi' | 'en') => void;
  themeMode?: 'light' | 'dark';
  onThemeChange?: (theme: 'light' | 'dark') => void;
}

type CategoryFilter = 'All' | TemplateCategory;

const isCreationTemplate = (template: TemplateEntry) =>
  template.id === 'blank' || template.id === 'blank-markdown';

/** 'All' isn't a real TemplateCategory (it's Home's own filter-only value), so it
 *  isn't in CATEGORY_LABEL_KEYS — resolve it here instead. */
function categoryLabelKey(c: CategoryFilter): TranslationKey {
  return c === 'All' ? 'home.categoryAll' : CATEGORY_LABEL_KEYS[c];
}

// Theme-aware — these resolve through the editor's design tokens (loaded
// globally via styles.css -> editor.css -> tokens.css), which flip on
// [data-theme='dark'] the same way the editor's own dark mode does. The
// literal hex after each comma is the light-mode fallback (byte-identical
// to the pre-dark-mode palette) in case the tokens aren't present.
const COLORS = {
  ink: 'var(--color-text, #111111)',
  inkMuted: 'var(--color-text-secondary, #666666)',
  inkSubtle: 'var(--color-text-muted, #999999)',
  inkSolid: 'var(--color-surface-raised, #ffffff)',
  paper: '#ffffff',
  surfaceRaised: 'var(--color-surface-raised, #ffffff)',
  surface: 'var(--color-surface, #ffffff)',
  surface2: 'var(--color-surface-alt, #f6f6f6)',
  border: 'var(--color-divider, #e5e5e5)',
  borderHover: 'var(--color-border-strong, #cccccc)',
  brand: 'var(--color-accent, #111111)',
  brandHover: 'var(--color-hover, #f0f0f0)',
  brandSoft: 'var(--color-accent-soft, #f6f6f6)',
  ctaSolid: 'var(--color-hover, #f0f0f0)',
};

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: COLORS.surface,
    boxSizing: 'border-box',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: COLORS.ink,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 40px',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  brandLogo: { width: '32px', height: '32px' },
  brandName: {
    fontSize: '17px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: COLORS.ink,
  },
  topRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
    color: COLORS.inkMuted,
  },
  topLink: {
    color: COLORS.inkMuted,
    textDecoration: 'none',
    padding: '6px 10px',
    borderRadius: '6px',
    transition: 'background 0.15s, color 0.15s',
  },

  hero: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '32px 40px 12px',
  },
  heroEyebrow: {
    display: 'inline-block',
    fontSize: '12px',
    fontWeight: 600,
    color: COLORS.brand,
    background: COLORS.brandSoft,
    padding: '4px 10px',
    borderRadius: '999px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: '14px',
  },
  heroTitle: {
    fontSize: '24px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    lineHeight: 1.1,
    color: COLORS.ink,
    margin: 0,
  },
  heroLede: {
    marginTop: '12px',
    fontSize: '17px',
    color: COLORS.inkMuted,
    lineHeight: 1.5,
    maxWidth: '640px',
  },

  controls: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '24px 40px 8px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    minHeight: 44,
    gap: '8px',
    background: COLORS.surfaceRaised,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '10px',
    padding: '8px 12px',
    minWidth: '260px',
    flex: '1 1 320px',
    maxWidth: '480px',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  searchInput: {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: '14px',
    color: COLORS.ink,
    width: '100%',
    font: 'inherit',
  },
  openFileBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    background: COLORS.surfaceRaised,
    color: COLORS.ink,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '12px',
    minHeight: 44,
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.15s',
    font: 'inherit',
  },
  pillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginLeft: 'auto',
  },
  pill: {
    minHeight: 44,
    fontSize: '13px',
    fontWeight: 500,
    color: COLORS.inkMuted,
    background: COLORS.surfaceRaised,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '999px',
    padding: '6px 14px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    font: 'inherit',
  },
  pillActive: {
    background: 'var(--color-hover, #f0f0f0)',
    color: COLORS.ink,
    borderColor: 'transparent',
    fontWeight: 600,
  },

  section: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '24px 40px 8px',
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    margin: '16px 0 14px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: COLORS.ink,
    letterSpacing: '-0.005em',
    textTransform: 'none',
  },
  sectionHint: {
    fontSize: '12.5px',
    color: COLORS.inkSubtle,
  },

  featuredRow: {
    display: 'grid',
    // Fixed 4-up on desktop (mobile override drops to 2) so the capped-at-4
    // Featured set always fills one clean row — an auto-fit track count would
    // strand a lone card at intermediate widths.
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '18px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))',
    gap: '18px',
  },

  card: {
    background: COLORS.paper,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '12px',
    padding: 0,
    cursor: 'pointer',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition:
      'border-color 0.18s, box-shadow 0.18s, transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
    textAlign: 'left',
    font: 'inherit',
    color: 'inherit',
    position: 'relative',
  },
  cardHover: {
    borderColor: COLORS.borderHover,
    boxShadow: '0 14px 28px -16px rgba(15, 23, 42, 0.18), 0 4px 8px -2px rgba(15, 23, 42, 0.06)',
    transform: 'translateY(-3px)',
  },
  cardThumbWrap: {
    aspectRatio: '11 / 14',
    background: COLORS.surface,
    borderBottom: `1px solid ${COLORS.border}`,
    overflow: 'hidden',
    position: 'relative',
  },
  cardThumb: {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'cover',
    objectPosition: 'top center',
    transition: 'transform 0.3s ease',
  },
  cardThumbHover: {
    transform: 'scale(1.025)',
  },
  // Blank templates have no document preview, so use the local Tabler file-plus
  // icon instead of a ligature that could render as raw icon-name text.
  cardThumbEmpty: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `linear-gradient(180deg, ${COLORS.surface} 0%, ${COLORS.surface2} 100%)`,
  },
  cardThumbEmptyIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    borderRadius: 16,
    background: COLORS.paper,
    border: `1px dashed ${COLORS.borderHover}`,
    // Fixed — this tile is always a light "paper" swatch (see COLORS.paper),
    // so its icon must stay fixed-dark too, not track the page theme.
    color: '#3b4354',
  },
  cardIconBadge: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.96)',
    border: `1px solid ${COLORS.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Fixed — this badge sits on a near-white translucent chip regardless
    // of page theme, so its icon must stay fixed-dark too.
    color: '#3b4354',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
  },
  cardBody: {
    padding: '12px 14px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  cardTitle: {
    fontSize: '13.5px',
    fontWeight: 600,
    // Fixed — the card itself is always literal white "paper" (see
    // COLORS.paper), so the title must stay fixed-dark too, not track the
    // page theme (which would flip this to near-white-on-white).
    color: '#0b0e15',
    letterSpacing: '-0.005em',
  },
  cardCategory: {
    fontSize: '11.5px',
    // #94a3b8 (inkSubtle) on white is only 2.56:1 — fails WCAG AA for this
    // small label. #64748b (slate-500) is 4.86:1 and reads as the same quiet
    // grey while passing AA.
    color: '#64748b',
    fontWeight: 500,
  },

  empty: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '36px 40px',
    textAlign: 'center',
    color: COLORS.inkMuted,
    fontSize: '14px',
  },

  footer: {
    maxWidth: '1180px',
    margin: '32px auto 0',
    padding: '24px 40px 32px',
    fontSize: '12px',
    color: COLORS.inkSubtle,
    borderTop: `1px solid ${COLORS.border}`,
    display: 'flex',
    justifyContent: 'space-between',
  },

  hiddenInput: { display: 'none' },
};

/** Per-element overrides applied when `useIsMobile()` returns true.
 *  Keeps the desktop layout untouched and stacks/scales for phones. */
const mobile: Record<string, CSSProperties> = {
  topBar: { padding: '14px 16px' },
  hero: { padding: '24px 16px 8px' },
  heroTitle: { fontSize: '30px', letterSpacing: '-0.02em' },
  heroLede: { fontSize: '15px', marginTop: '10px' },
  controls: {
    padding: '20px 16px 4px',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '10px',
  },
  searchWrap: { minWidth: 0, flex: '1 1 auto', maxWidth: 'none' },
  openFileBtn: { justifyContent: 'center' },
  pillRow: { marginLeft: 0, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: '4px' },
  pill: { whiteSpace: 'nowrap', flex: '0 0 auto' },
  inner: { padding: '12px 16px 40px' },
  section: { padding: '12px 16px 4px' },
  sectionHead: { margin: '12px 0 10px' },
  featuredRow: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' },
  grid: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' },
  cardThumbWrap: { aspectRatio: '4 / 5' },
  cardBody: { padding: '10px 12px 12px' },
  cardTitle: { fontSize: '12.5px' },
  cardCategory: { fontSize: '10.5px' },
  cardIconBadge: { width: '24px', height: '24px', top: '6px', right: '6px' },
  footer: {
    padding: '20px 16px 24px',
    flexDirection: 'column',
    gap: '6px',
    textAlign: 'center',
    alignItems: 'center',
  },
};

/** Blank templates ship an SVG placeholder rather than a photographic PNG
 *  render. They paint as a dashed empty-state card, so we keep them out of
 *  the Featured strip and sort them after the rich previews in each category. */
function isBlankEntry(entry: TemplateEntry): boolean {
  return entry.thumbnail.endsWith('.svg');
}

function TemplateCard({
  entry,
  onSelect,
  isMobile,
}: {
  entry: TemplateEntry;
  onSelect: (entry: TemplateEntry) => void;
  isMobile: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  // Blank entries ship an SVG placeholder rather than a PNG render; give them
  // a clean empty-state instead of an image that crops to grey.
  const isBlank = isBlankEntry(entry);
  const nameKey = TEMPLATE_NAME_KEYS[entry.id];
  const displayName = nameKey ? t(nameKey) : entry.name;
  const categoryLabel = t(categoryLabelKey(entry.category));
  return (
    <button
      type="button"
      style={{ ...styles.card, ...(hovered ? styles.cardHover : null) }}
      onClick={() => onSelect(entry)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      data-testid={`template-card-${entry.id}`}
      aria-label={`${displayName} — ${categoryLabel}`}
    >
      <div style={{ ...styles.cardThumbWrap, ...(isMobile && mobile.cardThumbWrap) }}>
        {isBlank ? (
          <div style={styles.cardThumbEmpty}>
            <span style={styles.cardThumbEmptyIcon} aria-hidden="true">
              <img src="/icons/file-plus.svg" alt="" width={34} height={34} />
            </span>
          </div>
        ) : (
          <>
            <img
              src={entry.thumbnail}
              alt=""
              aria-hidden="true"
              draggable={false}
              loading="lazy"
              style={{ ...styles.cardThumb, ...(hovered ? styles.cardThumbHover : null) }}
            />
            <span
              style={{ ...styles.cardIconBadge, ...(isMobile && mobile.cardIconBadge) }}
              aria-hidden="true"
            >
              <img src="/icons/file-text.svg" alt="" width={16} height={16} />
            </span>
          </>
        )}
      </div>
      <div style={{ ...styles.cardBody, ...(isMobile && mobile.cardBody) }}>
        <div style={{ ...styles.cardTitle, ...(isMobile && mobile.cardTitle) }}>{displayName}</div>
        <div style={{ ...styles.cardCategory, ...(isMobile && mobile.cardCategory) }}>
          {categoryLabel}
        </div>
      </div>
    </button>
  );
}

type TFunc = ReturnType<typeof useTranslation>['t'];

// Takes `t` from the caller (a component) — this itself isn't a
// component/hook, so it can't call useTranslation() on its own.
function relativeAgo(t: TFunc, ms: number): string {
  if (ms < 60_000) return t('home.justNow');
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return t('home.minutesAgo', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('home.hoursAgo', { n: hours });
  const days = Math.round(hours / 24);
  return t('home.daysAgo', { n: days });
}

// Auto-reopen banner — Phase A from docs/internal/11-storage-modes.md.
// Shows above the landing when the most recently-opened doc is < 7
// days old, offering to reopen it in one click. Dismissal is sticky
// for the rest of the browser session so a user who actively
// dismissed it doesn't see it on every navigation back to Home.
const AUTO_REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_REOPEN_DISMISS_KEY = 'home.auto-reopen-dismissed';

function isAutoReopenDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(AUTO_REOPEN_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function markAutoReopenDismissed(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(AUTO_REOPEN_DISMISS_KEY, '1');
  } catch {
    // sessionStorage can throw in sandboxed iframes. Best-effort.
  }
}

interface AutoReopenBannerProps {
  /** Most-recently-opened doc; null hides the banner. */
  candidate: RecentFile | null;
  onOpen: (r: RecentFile) => void;
  /** Dismiss action — also persists to sessionStorage. */
  onDismiss: () => void;
}

function AutoReopenBanner({
  candidate,
  onOpen,
  onDismiss,
}: AutoReopenBannerProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!candidate) return null;
  const age = Date.now() - candidate.openedAt;
  if (age > AUTO_REOPEN_WINDOW_MS) return null;
  return (
    <section
      data-testid="auto-reopen-banner"
      style={autoReopenBannerStyle}
      role="region"
      aria-label={t('home.reopenLastDocument')}
    >
      <span style={{ fontSize: 13, color: COLORS.inkMuted }}>
        {t('home.pickUpWhereYouLeftOff')}
      </span>
      <strong
        data-testid="auto-reopen-banner-name"
        style={{ fontSize: 14, color: COLORS.ink, marginRight: 'auto' }}
      >
        {candidate.name}
      </strong>
      <button
        type="button"
        onClick={onDismiss}
        data-testid="auto-reopen-banner-dismiss"
        style={autoReopenBannerDismissStyle}
      >
        {t('common.dismiss')}
      </button>
      <button
        type="button"
        onClick={() => onOpen(candidate)}
        data-testid="auto-reopen-banner-open"
        style={autoReopenBannerOpenStyle}
      >
        {t('home.reopen')}
      </button>
    </section>
  );
}

const autoReopenBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '10px 16px',
  margin: '12px 24px 0',
  borderRadius: 10,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.surfaceRaised,
  boxShadow: '0 1px 1px rgba(15, 23, 42, 0.03)',
};

const autoReopenBannerOpenStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '6px 14px',
  borderRadius: 12,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.surfaceRaised,
  color: COLORS.ink,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const autoReopenBannerDismissStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: `1px solid ${COLORS.border}`,
  background: 'transparent',
  color: COLORS.ink,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// Compact horizontal card used in the Recent strip. The big-thumbnail
// template-card look would push the actual templates below the fold
// (the user has nothing to render as a preview — Recent files are
// not pre-painted to PNG the way bundled templates are). Microsoft
// Word's Home uses this same shape for its Recent / Pinned list.
const recentCardStyle: CSSProperties = {
  background: COLORS.surfaceRaised,
  border: `1px solid ${COLORS.border}`,
  borderRadius: '10px',
  padding: '10px 12px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  transition:
    'border-color 0.18s, box-shadow 0.18s, transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
  textAlign: 'left',
  font: 'inherit',
  color: 'inherit',
  minWidth: 0, // allow text truncation
};

const recentCardHoverStyle: CSSProperties = {
  borderColor: COLORS.borderHover,
  boxShadow: '0 8px 18px -12px rgba(15, 23, 42, 0.16), 0 2px 4px -1px rgba(15, 23, 42, 0.05)',
  transform: 'translateY(-1px)',
};

const recentIconBoxStyle: CSSProperties = {
  width: '40px',
  height: '40px',
  flexShrink: 0,
  borderRadius: '8px',
  background: COLORS.brandSoft,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: COLORS.brand,
};

const recentMetaStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
  flex: 1,
};

const recentNameStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: COLORS.ink,
  letterSpacing: '-0.005em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const recentSubStyle: CSSProperties = {
  fontSize: '11.5px',
  color: COLORS.inkSubtle,
  fontWeight: 500,
};

function RecentCard({
  entry,
  onOpen,
  onDelete,
}: {
  entry: RecentFile;
  onOpen: (r: RecentFile) => void;
  onDelete: (r: RecentFile) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <button
        type="button"
        style={{ ...recentCardStyle, ...(hovered ? recentCardHoverStyle : null), width: '100%' }}
        onClick={() => onOpen(entry)}
        data-testid={`recent-card-${entry.id}`}
        aria-label={t('home.reopenDocumentAria', { name: entry.name })}
      >
        <div style={recentIconBoxStyle} aria-hidden="true">
          <img src="/icons/file-text.svg" alt="" width={22} height={22} />
        </div>
        <div style={recentMetaStyle}>
          <div style={recentNameStyle} title={entry.name}>
            {entry.name}
          </div>
          <div style={recentSubStyle}>
            {formatSize(entry.size)} · {relativeAgo(t, Date.now() - entry.openedAt)}
          </div>
        </div>
      </button>
      {hovered && (
        <button
          type="button"
          title={t('home.removeFromRecents')}
          aria-label={t('home.removeFromRecentsAria', { name: entry.name })}
          data-testid={`recent-card-delete-${entry.id}`}
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(15,23,42,0.08)',
            color: COLORS.inkSubtle,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            lineHeight: 1,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(entry);
          }}
        >
          <img src="/icons/x.svg" alt="" aria-hidden="true" width={14} height={14} />
        </button>
      )}
    </div>
  );
}

export function Home({
  onNewDocument,
  onSelectTemplate,
  onOpenFile,
  personalFileSource,
  onOpenPersonalFile,
  onLogout,
  locale = 'vi',
  onLocaleChange,
  themeMode = 'light',
  onThemeChange,
}: HomeProps): React.JSX.Element {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const isMobile = useIsMobile();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onOpenFile(file);
    e.target.value = '';
  };

  // Recent files (sheet parity) — IDB-backed; cards re-open via a
  // synthesized File so the existing onOpenFile path doesn't need to
  // care that the buffer didn't come from `<input type="file">`.
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const [autoReopenDismissed, setAutoReopenDismissed] = useState<boolean>(() =>
    isAutoReopenDismissed()
  );
  useEffect(() => {
    let cancelled = false;
    void listRecentFiles().then((rows) => {
      if (!cancelled) setRecents(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const openRecent = (r: RecentFile) => {
    // Preserve the original extension — handleOpenFromHome routes .md/.txt/.rtf
    // via formatFromFilename(file.name). Appending .docx would break that check.
    const hasExt = /\.[a-z0-9]+$/i.test(r.name);
    const fileName = hasExt ? r.name : `${r.name}.docx`;
    const file = new File([r.buffer], fileName, { type: 'application/octet-stream' });
    onOpenFile(file);
  };
  const autoReopenCandidate = autoReopenDismissed ? null : (recents[0] ?? null);

  // SPEC-2026-11-22: owner server-side library — durable files on
  // LocalHost /data, listed straight from /files. Refresh/restart safe.
  const [personalFiles, setPersonalFiles] = useState<FileEntry[]>([]);
  const [libraryError, setLibraryError] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const refreshPersonalFiles = useCallback(async () => {
    if (!personalFileSource) return;
    setLibraryLoading(true);
    try {
      setPersonalFiles(await personalFileSource.list());
      setLibraryError(false);
    } catch {
      setLibraryError(true);
    } finally {
      setLibraryLoading(false);
    }
  }, [personalFileSource]);
  useEffect(() => {
    void refreshPersonalFiles();
  }, [refreshPersonalFiles]);

  const beginRename = (file: FileEntry) => {
    setRenamingFileId(file.id);
    setRenameDraft(file.name);
  };
  const saveRename = async (id: string) => {
    if (!personalFileSource || !renameDraft.trim()) return;
    setBusyFileId(id);
    try {
      await personalFileSource.rename(id, renameDraft.trim());
      await refreshPersonalFiles();
      setRenamingFileId(null);
    } catch {
      setLibraryError(true);
    } finally {
      setBusyFileId(null);
    }
  };
  const handleDeleteRecent = (r: RecentFile) => {
    setRecents((prev) => prev.filter((x) => x.id !== r.id));
    void deleteRecentFile(r.id ?? -1);
  };

  const handleClearAllRecents = () => {
    const ids = recents.map((r) => r.id ?? -1);
    setRecents([]);
    void Promise.all(ids.map((id) => deleteRecentFile(id)));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter((t) => {
      if (isCreationTemplate(t)) return false;
      if (category !== 'All' && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  // Featured showcases the rich photographic templates only — blank cards paint
  // as sparse dashed tiles and would strand next to the real previews. Cap at 4
  // so the auto-fit grid fills one clean row instead of a lopsided 4 + 1.
  const featured = useMemo(
    () => TEMPLATES.filter((t) => t.featured && !isBlankEntry(t)).slice(0, 4),
    []
  );
  const blankDocument = TEMPLATES.find((t) => t.id === 'blank');
  const blankMarkdown = TEMPLATES.find((t) => t.id === 'blank-markdown');

  const byCategory = useMemo(() => {
    const m = new Map<TemplateCategory, TemplateEntry[]>();
    for (const c of CATEGORIES) m.set(c, []);
    for (const t of TEMPLATES) {
      if (!isCreationTemplate(t)) m.get(t.category)?.push(t);
    }
    // Sort the blank cards to the end of each category so the rich previews
    // lead and the sparse tiles group together instead of holing the grid.
    for (const list of m.values()) {
      list.sort((a, b) => Number(isBlankEntry(a)) - Number(isBlankEntry(b)));
    }
    return m;
  }, []);

  const isFiltered = query.trim() !== '' || category !== 'All';

  return (
    <div style={styles.page} data-testid="home-page">
      <header
        style={{ ...styles.topBar, ...(isMobile && mobile.topBar) }}
        data-testid="home-header"
      >
        <a
          href="/"
          aria-label="Docs home"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
            color: COLORS.ink,
          }}
        >
          <img
            className="docs-brand-icon"
            src="/logo.svg"
            alt=""
            width={28}
            height={28}
            aria-hidden="true"
          />
          <span style={{ fontSize: 17, fontWeight: 600 }}>Docs</span>
        </a>
        <div style={{ ...styles.topRight, gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {onLocaleChange && (
            <button
              type="button"
              onClick={() => onLocaleChange(locale === 'vi' ? 'en' : 'vi')}
              aria-label={t(locale === 'vi' ? 'app.switchToEnglish' : 'app.switchToVietnamese')}
              style={{
                ...styles.topLink,
                minWidth: 44,
                minHeight: 44,
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
              }}
            >
              {locale === 'vi' ? 'EN' : 'VI'}
            </button>
          )}
          {onThemeChange && (
            <button
              type="button"
              onClick={() => onThemeChange(themeMode === 'dark' ? 'light' : 'dark')}
              aria-label={t(themeMode === 'dark' ? 'app.themeLight' : 'app.themeDark')}
              style={{
                ...styles.topLink,
                minHeight: 44,
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
              }}
            >
              {themeMode === 'dark' ? t('app.themeLight') : t('app.themeDark')}
            </button>
          )}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              aria-label={t('app.signOut')}
              style={{ ...styles.topLink, background: 'transparent', border: 0, cursor: 'pointer' }}
            >
              {t('app.signOut')}
            </button>
          )}
        </div>
      </header>

      <AutoReopenBanner
        candidate={autoReopenCandidate}
        onOpen={openRecent}
        onDismiss={() => {
          markAutoReopenDismissed();
          setAutoReopenDismissed(true);
        }}
      />

      {personalFileSource && (
        <section
          style={{ ...styles.section, ...(isMobile && mobile.section) }}
          data-testid="home-personal-files"
        >
          <div style={{ ...styles.sectionHead, ...(isMobile && mobile.sectionHead) }}>
            <h2 style={styles.sectionTitle}>{t('home.myFiles')}</h2>
          </div>
          {libraryError && (
            <div role="alert" style={{ color: COLORS.inkMuted, fontSize: 13, marginBottom: 8 }}>
              {t('home.myFilesError')}{' '}
              <button
                type="button"
                onClick={() => void refreshPersonalFiles()}
                style={{
                  border: 0,
                  background: 'transparent',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                {t('common.retry')}
              </button>
            </div>
          )}
          {libraryLoading ? (
            <p style={{ fontSize: 13, color: COLORS.inkMuted, margin: 0 }} role="status">
              {t('home.myFilesLoading')}
            </p>
          ) : personalFiles.length === 0 ? (
            <p style={{ fontSize: 13, color: COLORS.inkMuted, margin: 0 }}>
              {t('home.myFilesEmpty')}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {personalFiles.map((f) => (
                <li
                  key={f.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}
                >
                  {renamingFileId === f.id ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveRename(f.id);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        minWidth: 0,
                      }}
                    >
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        aria-label={t('home.rename')}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          minHeight: 44,
                          border: 0,
                          borderRadius: 12,
                          background: 'var(--color-surface-alt, #f6f6f6)',
                          padding: '8px 12px',
                          color: COLORS.ink,
                          font: 'inherit',
                        }}
                      />
                      <button
                        type="submit"
                        disabled={busyFileId === f.id}
                        style={{
                          minHeight: 44,
                          border: 0,
                          borderRadius: 10,
                          padding: '0 12px',
                          background: 'var(--color-hover, #f0f0f0)',
                          color: COLORS.ink,
                          cursor: 'pointer',
                        }}
                      >
                        {t('common.save')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingFileId(null)}
                        style={{
                          minHeight: 44,
                          border: 0,
                          borderRadius: 10,
                          padding: '0 12px',
                          background: 'transparent',
                          color: COLORS.inkMuted,
                          cursor: 'pointer',
                        }}
                      >
                        {t('common.cancel')}
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        data-testid={`personal-file-${f.id}`}
                        onClick={() => onOpenPersonalFile?.(f.id, f.name)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          minHeight: 48,
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 14px',
                          background: COLORS.surfaceRaised,
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 12,
                          cursor: 'pointer',
                          fontSize: 14,
                          color: COLORS.ink,
                        }}
                      >
                        <img
                          src="/icons/file-text.svg"
                          alt=""
                          aria-hidden="true"
                          width={18}
                          height={18}
                          style={{ flexShrink: 0 }}
                        />
                        <span
                          style={{
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {f.name}
                        </span>
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontSize: 12,
                            color: COLORS.inkSubtle,
                            flexShrink: 0,
                          }}
                        >
                          {formatSize(f.size)}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={t('home.rename')}
                        title={t('home.rename')}
                        onClick={() => beginRename(f)}
                        style={{
                          width: 44,
                          minHeight: 44,
                          border: 0,
                          borderRadius: 10,
                          background: 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <img
                          src="/icons/edit.svg"
                          alt=""
                          aria-hidden="true"
                          width={18}
                          height={18}
                        />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {blankDocument && blankMarkdown && (
        <section
          style={{ ...styles.section, ...(isMobile && mobile.section) }}
          aria-label={t('home.createNew')}
        >
          <div style={{ ...styles.sectionHead, ...(isMobile && mobile.sectionHead) }}>
            <h2 style={styles.sectionTitle}>{t('home.createNew')}</h2>
          </div>
          <div style={{ ...styles.featuredRow, ...(isMobile && mobile.featuredRow) }}>
            <TemplateCard entry={blankDocument} onSelect={onNewDocument} isMobile={isMobile} />
            <TemplateCard entry={blankMarkdown} onSelect={onSelectTemplate} isMobile={isMobile} />
          </div>
        </section>
      )}

      <section style={{ ...styles.controls, ...(isMobile && mobile.controls) }}>
        <label style={{ ...styles.searchWrap, ...(isMobile && mobile.searchWrap) }}>
          <img src="/icons/search.svg" alt="" aria-hidden="true" width={18} height={18} />
          <input
            type="search"
            placeholder={t('home.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={styles.searchInput}
            data-testid="home-search"
          />
        </label>
        <button
          type="button"
          style={{ ...styles.openFileBtn, ...(isMobile && mobile.openFileBtn) }}
          onClick={() => fileInputRef.current?.click()}
          onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.brandHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.surfaceRaised)}
          data-testid="home-open-from-disk"
        >
          <img src="/icons/folder-open.svg" alt="" aria-hidden="true" width={18} height={18} />
          {t('home.openFile')}
        </button>
        <div
          style={{ ...styles.pillRow, ...(isMobile && mobile.pillRow) }}
          role="group"
          aria-label={t('home.filterByCategory')}
        >
          {(['All', ...CATEGORIES] as CategoryFilter[]).map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                style={{
                  ...styles.pill,
                  ...(isMobile && mobile.pill),
                  ...(active ? styles.pillActive : null),
                }}
                onClick={() => setCategory(c)}
                data-testid={`home-category-${c.toLowerCase()}`}
                aria-pressed={active}
              >
                {t(categoryLabelKey(c))}
              </button>
            );
          })}
        </div>
      </section>

      {!isFiltered && recents.length > 0 && (
        <section
          style={{ ...styles.section, ...(isMobile && mobile.section) }}
          data-testid="home-recent"
        >
          <div style={{ ...styles.sectionHead, ...(isMobile && mobile.sectionHead) }}>
            <h2 style={styles.sectionTitle}>{t('home.recent')}</h2>
            <span style={styles.sectionHint}>{t('home.recentHint')}</span>
            <button
              type="button"
              onClick={handleClearAllRecents}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                fontSize: '12px',
                color: COLORS.inkSubtle,
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
              data-testid="home-clear-recents"
            >
              {t('home.clearAll')}
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile
                ? 'repeat(1, minmax(0, 1fr))'
                : 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '10px',
            }}
          >
            {recents.slice(0, 4).map((r) => (
              <RecentCard key={r.id} entry={r} onOpen={openRecent} onDelete={handleDeleteRecent} />
            ))}
          </div>
        </section>
      )}

      {!isFiltered && (
        <section style={{ ...styles.section, ...(isMobile && mobile.section) }}>
          <div style={{ ...styles.sectionHead, ...(isMobile && mobile.sectionHead) }}>
            <h2 style={styles.sectionTitle}>{t('home.featured')}</h2>
            <span style={styles.sectionHint}>{t('home.featuredHint')}</span>
          </div>
          <div style={{ ...styles.featuredRow, ...(isMobile && mobile.featuredRow) }}>
            {featured.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                entry={tpl}
                onSelect={onSelectTemplate}
                isMobile={isMobile}
              />
            ))}
          </div>
        </section>
      )}

      {isFiltered ? (
        <section style={{ ...styles.section, ...(isMobile && mobile.section) }}>
          <div style={{ ...styles.sectionHead, ...(isMobile && mobile.sectionHead) }}>
            <h2 style={styles.sectionTitle}>
              {query.trim()
                ? t('home.resultsFor', { query: query.trim() })
                : t(categoryLabelKey(category))}
            </h2>
            <span style={styles.sectionHint}>
              {t('home.templateCount', { count: filtered.length })}
            </span>
          </div>
          {filtered.length === 0 ? (
            <div style={styles.empty}>{t('home.noTemplatesMatch')}</div>
          ) : (
            <div style={{ ...styles.grid, ...(isMobile && mobile.grid) }}>
              {filtered.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  entry={tpl}
                  onSelect={onSelectTemplate}
                  isMobile={isMobile}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        CATEGORIES.map((cat) => {
          const items = byCategory.get(cat) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={cat} style={{ ...styles.section, ...(isMobile && mobile.section) }}>
              <div style={{ ...styles.sectionHead, ...(isMobile && mobile.sectionHead) }}>
                <h2 style={styles.sectionTitle}>{t(categoryLabelKey(cat))}</h2>
                <span style={styles.sectionHint}>
                  {t('home.templateCount', { count: items.length })}
                </span>
              </div>
              <div style={{ ...styles.grid, ...(isMobile && mobile.grid) }}>
                {items.map((tpl) => (
                  <TemplateCard
                    key={tpl.id}
                    entry={tpl}
                    onSelect={onSelectTemplate}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.odt,.md,.markdown,.txt,.yml,.yaml,.toml,.conf,.cfg,.ini,.env,.properties"
        style={styles.hiddenInput}
        onChange={handleFileChange}
        data-testid="home-file-input"
      />
    </div>
  );
}
