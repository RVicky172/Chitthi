import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logError, recentErrors } from '../lib/errors';

/*
 * The last line of defence: a render error anywhere in the app shows this screen instead of a blank page. The design
 * autosaves, so reloading brings the card back. The report holds only the error log and the app version, and is copied
 * by the user; nothing is sent anywhere.
 */

interface State {
  failed: boolean;
  copied: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, copied: false };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError('render', error);
    if (info.componentStack) console.error(info.componentStack);
  }

  private copy = async () => {
    const report = {
      app: 'Chitthi',
      version: window.chitthiDesktop?.info.version ?? 'web',
      when: new Date().toISOString(),
      userAgent: navigator.userAgent,
      errors: recentErrors(),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 1));
      this.setState({ copied: true });
    } catch {
      /* clipboard blocked: the button just doesn't confirm */
    }
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p>Chitthi hit an unexpected error. Your card is saved automatically, so reloading should bring it back.</p>
        <div className="crash-acts">
          <button type="button" className="sbtn accent" onClick={() => location.reload()}>
            Reload Chitthi
          </button>
          <button type="button" className="sbtn" onClick={() => void this.copy()}>
            {this.state.copied ? 'Copied' : 'Copy error report'}
          </button>
        </div>
        <p className="crash-note">If it keeps happening, paste the error report into a GitHub issue.</p>
      </div>
    );
  }
}
