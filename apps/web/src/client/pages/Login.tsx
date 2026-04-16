import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const {
    login,
    isAuthenticated,
    isBootstrapLoading,
    isInitialized,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as { from?: { pathname?: string } } | null;
  const from = state?.from?.pathname || '/';

  if (isBootstrapLoading) {
    return <div className="loading-screen">{t('dashboard.loading')}</div>;
  }

  if (!isInitialized) {
    return <Navigate to="/setup" replace />;
  }

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login({ username, password });
      navigate(from, { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || t('auth.loginError'));
      } else {
        setError(t('auth.loginError'));
      }
    }
  };

  return (
    <div className="login-container prompthub-web-auth">
      <div className="login-card rounded-[28px] border border-slate-200/80 bg-white/95 p-8 shadow-[0_32px_90px_rgba(15,23,42,0.10)] backdrop-blur">
        <h2 className="login-title text-3xl font-semibold text-slate-900">
          {t('auth.loginTitle')}
        </h2>
        <p className="setup-hint">
          {t('auth.setupDescription')}
        </p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username" className="text-sm font-semibold text-slate-700">
              {t('auth.username')}
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="web-auth-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="text-sm font-semibold text-slate-700">
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="web-auth-input"
            />
          </div>

          <button type="submit" className="login-submit web-auth-submit">
            <span className="text-white">{t('auth.signIn')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
