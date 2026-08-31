import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[HelCalaf] UI error", error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="screen">
          <h1>Something went wrong</h1>
          <p className="muted">
            The app hit an unexpected error. You can try again without losing your
            account on the server.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              this.setState({ error: null });
              window.location.hash = "/";
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
