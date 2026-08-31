"use client";

import { Component, ReactNode } from "react";
import { ErrorFallback } from "@/components/error-fallback";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <ErrorFallback onRetry={() => this.setState({ hasError: false })} />
        )
      );
    }

    return this.props.children;
  }
}
