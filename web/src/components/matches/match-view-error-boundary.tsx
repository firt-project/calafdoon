"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  children: ReactNode;
  onClose?: () => void;
  title?: string;
};

type State = { error: Error | null };

/**
 * Keeps a match/profile view failure from taking down the whole matches page
 * (which otherwise lands on the global error screen with "Back to home").
 */
export class MatchViewErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error("Match view crashed", error, info.componentStack);
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-card border border-border rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
          <h2 className="text-lg font-semibold">
            {this.props.title ?? "Could not open this profile"}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Something went wrong while loading this profile. You can close and
            try another member.
          </p>
          <Button
            className="w-full"
            onClick={() => {
              this.setState({ error: null });
              this.props.onClose?.();
            }}
          >
            Close
          </Button>
        </div>
      </div>
    );
  }
}
