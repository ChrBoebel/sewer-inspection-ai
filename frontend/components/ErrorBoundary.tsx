"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <main className="page">
          <div className="panel" style={{ marginTop: 40, maxWidth: 520 }}>
            <h2>Ein Fehler ist aufgetreten</h2>
            <p className="muted" style={{ marginBottom: 16 }}>
              {error.message || "Unbekannter Fehler"}
            </p>
            <button className="primary" type="button" onClick={this.reset}>
              Erneut versuchen
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
