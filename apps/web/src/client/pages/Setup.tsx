import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    register,
    isAuthenticated,
    isBootstrapLoading,
    isInitialized,
  } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isBootstrapLoading) {
    return <div className="loading-screen">{t('dashboard.loading')}</div>;
  }

  if (isInitialized) {
    return <Navigate to={isAuthenticated ? '/' : '/login'} replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t('auth.setupPasswordMismatch'));
      return;
    }

    try {
      await register({ username, password });
      navigate('/', { replace: true });
    } catch (setupError: unknown) {
      if (setupError instanceof Error && setupError.message) {
        setError(setupError.message);
      } else {
        setError(t('auth.setupError'));
      }
    }
  };

  return (
    <div className="login-container prompthub-web-auth">
      <div className="login-card setup-card rounded-[32px] border border-slate-200/80 bg-white/95 p-9 shadow-[0_32px_90px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="setup-badge">{t('auth.setupBadge')}</div>
        <h1 className="login-title text-3xl font-semibold text-slate-900">
          {t('auth.setupTitle')}
        </h1>
        <p className="setup-lead">{t('auth.setupDescription')}</p>
        <p className="setup-hint">{t('auth.setupHint')}</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label
              htmlFor="setup-username"
              className="text-sm font-semibold text-slate-700"
            >
              {t('auth.username')}
            </label>
            <input
              id="setup-username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoFocus
              className="web-auth-input"
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="setup-password"
              className="text-sm font-semibold text-slate-700"
            >
              {t('auth.password')}
            </label>
            <input
              id="setup-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="web-auth-input"
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="setup-confirm-password"
              className="text-sm font-semibold text-slate-700"
            >
              {t('auth.confirmPassword')}
            </label>
            <input
              id="setup-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              className="web-auth-input"
            />
          </div>

          <button type="submit" className="login-submit web-auth-submit">
            <span className="text-white">{t('auth.completeSetup')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
