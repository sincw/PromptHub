import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SetupPage } from './Setup';
import * as AuthContext from '../contexts/AuthContext';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const registerMock = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

function renderSetup(
  overrides?: Partial<ReturnType<typeof AuthContext.useAuth>>,
) {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    login: vi.fn(),
    register: registerMock,
    isAuthenticated: false,
    user: null,
    token: null,
    isLoading: false,
    isBootstrapLoading: false,
    isInitialized: false,
    registrationAllowed: true,
    logout: vi.fn(),
    refreshBootstrap: vi.fn(),
    ...overrides,
  });

  return render(
    <MemoryRouter initialEntries={['/setup']}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
        <Route path="/login" element={<div data-testid="login">Login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('creates the first account through the setup flow', async () => {
    registerMock.mockResolvedValueOnce(undefined);
    renderSetup();

    fireEvent.change(screen.getByLabelText('auth.username'), {
      target: { value: 'owner' },
    });
    fireEvent.change(screen.getByLabelText('auth.password'), {
      target: { value: 'debugpass001' },
    });
    fireEvent.change(screen.getByLabelText('auth.confirmPassword'), {
      target: { value: 'debugpass001' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'auth.completeSetup' }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith({
        username: 'owner',
        password: 'debugpass001',
      });
    });
  });

  it('shows a validation error when the passwords do not match', async () => {
    renderSetup();

    fireEvent.change(screen.getByLabelText('auth.username'), {
      target: { value: 'owner' },
    });
    fireEvent.change(screen.getByLabelText('auth.password'), {
      target: { value: 'debugpass001' },
    });
    fireEvent.change(screen.getByLabelText('auth.confirmPassword'), {
      target: { value: 'debugpass002' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'auth.completeSetup' }));

    expect(await screen.findByText('auth.setupPasswordMismatch')).toBeTruthy();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('redirects to login when the instance is already initialized', () => {
    renderSetup({ isInitialized: true });

    expect(screen.getByTestId('login')).toBeTruthy();
  });
});
