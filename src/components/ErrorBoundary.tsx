import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass, RotateCcw, TriangleAlert } from 'lucide-react';
import i18n from '@/i18n';
import { BrandMark } from './Brand';

/**
 * App-wide error boundary. A crash in one page shows a friendly card with
 * "Try again" (re-mount) instead of a white screen; your data is untouched.
 * `resetKey` (e.g. the route path) clears the error on navigation.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Moneta crashed:', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const t = i18n.t.bind(i18n);
    return (
      <div className="mx-auto max-w-md px-4 py-16 animate-rise">
        <div className="m-card p-6 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-amber-500/15 text-amber-500"><TriangleAlert size={30} /></div>
          <h1 className="text-lg font-bold">{t('error.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('error.text')}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button className="m-btn m-btn-primary h-11 px-5" onClick={() => this.setState({ error: null })}><RotateCcw size={16} />{t('error.retry')}</button>
            <button className="m-btn m-btn-ghost h-11 px-4" onClick={() => location.assign('/')}>{t('error.home')}</button>
          </div>
          <details className="mt-5 text-start text-xs text-muted">
            <summary className="cursor-pointer">{t('error.details')}</summary>
            <pre className="m-tile mt-2 max-h-40 overflow-auto whitespace-pre-wrap p-2">{String(error.stack ?? error.message)}</pre>
          </details>
        </div>
      </div>
    );
  }
}

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center animate-rise">
      <div className="relative mx-auto mb-6 w-fit">
        <BrandMark size={110} float />
        <span className="absolute -bottom-1 -end-1 grid h-10 w-10 place-items-center rounded-full bg-card text-brand shadow-lg"><Compass size={20} className="animate-[spin_6s_linear_infinite]" /></span>
      </div>
      <div className="m-label">404</div>
      <h1 className="mt-1 text-2xl font-bold">{t('error.notFound')}</h1>
      <p className="mt-2 text-sm text-muted">{t('error.notFoundText')}</p>
      <Link to="/" className="m-btn m-btn-primary mt-6 h-12 px-6">{t('error.home')}</Link>
    </div>
  );
}
