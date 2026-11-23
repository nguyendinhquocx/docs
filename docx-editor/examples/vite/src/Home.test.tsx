/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import React from 'react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import type { FileSource } from '@casualoffice/docs';

GlobalRegistrator.register();
let testLocale: 'en' | 'vi' = 'en';
const translations = {
  en: {
    'home.createNew': 'Create new',
    'home.categoryPersonal': 'Personal',
    'home.templateBlankDocument': 'Blank document',
    'home.templateBlankMarkdown': 'Blank Markdown',
    'home.myFiles': 'My files',
    'home.workspaceTitle': 'Your workspace',
    'home.myFilesHint': 'Stored on your server — survives refresh and restarts',
  },
  vi: {
    'home.createNew': 'Tạo mới',
    'home.categoryPersonal': 'Cá nhân',
    'home.templateBlankDocument': 'Tài liệu trống',
    'home.templateBlankMarkdown': 'Markdown trống',
    'home.myFiles': 'Tài liệu của bạn',
    'home.workspaceTitle': 'Không gian làm việc của mày',
    'home.myFilesHint': 'Lưu trên máy chủ riêng — vẫn còn sau khi tải lại hoặc khởi động lại',
  },
};
const translateForTest = (key: string) =>
  translations[testLocale][key as keyof (typeof translations)['en']] ?? key;

mock.module('@casualoffice/docs', () => ({
  useTranslation: () => ({ t: translateForTest }),
  AutosaveStatus: () => null,
  DocxEditor: () => null,
  PersonalAuthGate: ({ children }: { children: React.ReactNode }) => children,
  PresenceCluster: () => null,
  UserMenu: () => null,
  convertToDocx: async () => new ArrayBuffer(0),
  createEmptyDocument: () => ({ type: 'document', children: [] }),
  deleteRecentFile: async () => undefined,
  formatFromFilename: () => 'docx',
  formatSize: (size: number) => `${size} B`,
  isForeignFormat: () => false,
  listRecentFiles: async () => [],
  recordRecentFile: async () => undefined,
  useFileSourceAutoSave: () => ({ status: 'idle' }),
}));

const { act, cleanup, fireEvent, render, within } = await import('@testing-library/react');
const { Home } = await import('./Home');

afterEach(() => {
  cleanup();
  testLocale = 'en';
});
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  GlobalRegistrator.unregister();
});

test('new cards use the DOCX and Markdown creation seams', async () => {
  const onNewDocument = mock(() => {});
  const onSelectTemplate = mock(() => {});
  const view = render(
    <Home onNewDocument={onNewDocument} onSelectTemplate={onSelectTemplate} onOpenFile={() => {}} />
  );
  await act(async () => {
    await Promise.resolve();
  });
  const createNew = view.getByRole('region', { name: 'Create new' });

  expect(view.getAllByRole('button', { name: 'Blank document — Personal' })).toHaveLength(1);
  expect(view.getAllByRole('button', { name: 'Blank Markdown — Personal' })).toHaveLength(1);

  fireEvent.click(within(createNew).getByRole('button', { name: 'Blank document — Personal' }));
  fireEvent.click(within(createNew).getByRole('button', { name: 'Blank Markdown — Personal' }));

  expect(onNewDocument).toHaveBeenCalledTimes(1);
  expect(onSelectTemplate).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'blank-markdown',
      source: { kind: 'text', textKind: 'markdown' },
    })
  );
});

test('Vietnamese Home omits redundant intro/helper copy and keeps the requested files label', async () => {
  testLocale = 'vi';
  const fileSource = {
    kind: 'personal',
    label: 'fixture',
    list: async () => [],
  } as unknown as FileSource;
  const view = render(
    <Home
      onNewDocument={() => {}}
      onSelectTemplate={() => {}}
      onOpenFile={() => {}}
      personalFileSource={fileSource}
      locale="vi"
    />
  );
  await act(async () => {
    await Promise.resolve();
  });

  expect(view.getByRole('heading', { name: 'Tài liệu của bạn' })).toBeTruthy();
  expect(view.queryByText('Không gian làm việc của mày')).toBeNull();
  expect(
    view.queryByText('Lưu trên máy chủ riêng — vẫn còn sau khi tải lại hoặc khởi động lại')
  ).toBeNull();
});
