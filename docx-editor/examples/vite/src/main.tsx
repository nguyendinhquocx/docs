/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Bootstrap the deskApp host bridge first — it must define
// `window.__deskApp__` before any other module reads it.
import './desk-bridge-bootstrap';

import './styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LocaleProvider } from '@casualoffice/docs';
import { localeBundle, readAppLocale, writeAppLocale, type AppLocale } from './locales';
import { setSpellAssetUrls, setWriterWorkerUrl } from '@casualoffice/docs';
// Vite asset imports — Hunspell dictionary files served as static
// assets with hashed URLs. The lib doesn't pre-bundle these (its tsup
// build has no loader for .aff / .dic); the demo provides them at
// runtime via `setSpellAssetUrls`. Relative path resolves through the
// workspace into `packages/react/src/assets/spellcheck/`.
import affUrl from '../../../packages/react/src/assets/spellcheck/en.aff?url';
import dicUrl from '../../../packages/react/src/assets/spellcheck/en.dic?url';

setSpellAssetUrls(affUrl, dicUrl);

// Writing-assistant worker. `?worker&url` tells Vite to bundle the
// `.ts` worker entry into a proper module-worker chunk and return its
// hashed URL — the plain `new URL(...)` form Vite-can't-see across
// files served the raw `.ts` source back with MIME `video/mp2t`,
// which the browser refused to execute as a module script.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Vite-specific import suffix; declared in the demo's vite-env.d.ts.
import writerWorkerUrl from '../../../packages/react/src/lib/writer/writer.worker.ts?worker&url';
setWriterWorkerUrl(writerWorkerUrl);

function AppRoot() {
  const isDesktop = typeof window !== 'undefined' && window.__deskApp__?.isDesktop === true;
  const [locale, setLocale] = React.useState<AppLocale>(() => (isDesktop ? 'en' : readAppLocale()));
  const [theme, setTheme] = React.useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('docs.theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  React.useEffect(() => {
    document.documentElement.lang = locale;
    if (isDesktop) {
      document.documentElement.removeAttribute('data-web-docs');
    } else {
      document.documentElement.setAttribute('data-web-docs', 'true');
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [isDesktop, locale, theme]);

  const changeLocale = React.useCallback((next: AppLocale) => {
    writeAppLocale(next);
    setLocale(next);
  }, []);
  const changeTheme = React.useCallback((next: 'light' | 'dark') => {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('docs.theme', next);
      localStorage.setItem('casual-editor:color-theme', next);
    } catch {
      /* browser storage may be unavailable */
    }
  }, []);

  return (
    <LocaleProvider i18n={localeBundle(locale)}>
      <App locale={locale} onLocaleChange={changeLocale} themeMode={theme} onThemeChange={changeTheme} />
    </LocaleProvider>
  );
}

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<AppRoot />);
}
