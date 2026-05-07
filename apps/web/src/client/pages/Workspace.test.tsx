import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { authState, events, installRuntimeBridgeMock } = vi.hoisted(() => ({
  authState: {
    user: { username: 'test-user' },
    registrationAllowed: true,
    isInitialized: true,
    logout: vi.fn(),
  },
  events: [] as string[],
  installRuntimeBridgeMock: vi.fn(() => {
    events.push('install-bridge');
  }),
}));

vi.mock('../runtime-bridge/install-bridge', () => ({
  installRuntimeBridge: installRuntimeBridgeMock,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@web-runtime-toast-provider', () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@web-runtime-app', () => ({
  default: () => {
    events.push('runtime-app-render');
    return 'runtime app';
  },
}));

import { WorkspacePage } from './Workspace';

describe('WorkspacePage runtime bridge', () => {
  beforeEach(() => {
    events.length = 0;
    installRuntimeBridgeMock.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('installs the web runtime bridge before rendering the vendored app', () => {
    render(<WorkspacePage />);

    expect(screen.getByText('runtime app')).toBeTruthy();
    expect(events).toEqual(['install-bridge', 'runtime-app-render']);
  });
});
