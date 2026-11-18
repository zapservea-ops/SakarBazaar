import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SakarBazaar ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="wrap sb-page">
          <div className="card" style={{ padding: '24px', maxWidth: '64ch' }}>
            <span className="pill sb-pill-amber">Application notice</span>
            <h1 style={{ font: '700 28px var(--serif)', margin: '10px 0 8px' }}>
              Something went wrong
            </h1>
            <p style={{ color: 'var(--muted)', margin: '0 0 16px' }}>
              {this.state.message}
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => this.setState({ hasError: false, message: '' })}
            >
              Try again
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
