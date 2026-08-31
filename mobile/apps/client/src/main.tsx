import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import App from "@/App";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { LanguageProvider } from "@/lib/i18n/context";
import { ThemeProvider } from "@/platform/theme";
import { ErrorBoundary } from "@/features/app/ErrorBoundary";
import { configureNativeChrome } from "@/platform/native-chrome";
import "@/styles/global.css";
import "@/styles/mobile.css";

void configureNativeChrome();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

/** Native: MemoryRouter avoids any WebView URL navigation (white-screen class of bugs). */
const Router = Capacitor.isNativePlatform() ? MemoryRouter : HashRouter;

try {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <Router>
            <ThemeProvider>
              <LanguageProvider>
                <SessionProvider>
                  <App />
                </SessionProvider>
              </LanguageProvider>
            </ThemeProvider>
          </Router>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>
  );
} catch (err) {
  const fail = document.getElementById("boot-fail");
  const detail = document.getElementById("boot-fail-detail");
  if (fail) fail.style.display = "block";
  if (detail) {
    detail.textContent = err instanceof Error ? err.message : String(err);
  }
  console.error("[HelCalaf] boot failed", err);
}
