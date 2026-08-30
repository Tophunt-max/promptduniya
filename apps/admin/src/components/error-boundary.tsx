import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button, Card } from './ui';

/**
 * Catches render-time exceptions so one broken screen cannot take the console
 * down with it.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * which in a SPA means an empty `<body>` and no clue as to why — the failure
 * mode this was written for was an API field arriving as `{}` instead of an
 * object, so a page dereferenced `undefined` and the entire admin went blank.
 *
 * Keyed by route in `App.tsx`: navigating elsewhere gives a fresh boundary, so
 * a single bad screen leaves the rest of the console usable.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The console is an internal tool, so the stack is more useful than tidy
    // output. Observability on the Worker does not see browser errors.
    console.error('[admin] render error', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Card title="This screen failed to render">
        <p className="text-sm text-[var(--text-muted)]">
          The rest of the console still works — use the sidebar to move on, or retry this screen.
        </p>

        <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-[var(--surface-sunken)] p-3 text-xs leading-relaxed text-[var(--text-body)]">
          {error.message}
          {error.stack ? `\n\n${error.stack}` : ''}
        </pre>

        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={this.reset}>
            Retry
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            Reload console
          </Button>
        </div>
      </Card>
    );
  }
}
