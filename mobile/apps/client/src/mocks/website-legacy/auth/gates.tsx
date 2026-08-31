import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "@/hooks/use-app";
import { authService } from "@/services/auth-service";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, ready } = useApp();
  const location = useLocation();
  if (!ready) return <p className="container muted">Loading…</p>;
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export function RequireAccess({ children }: { children: React.ReactNode }) {
  const { session, profile, ready } = useApp();
  if (!ready) return null;
  if (!session) return <Navigate to="/login" replace />;
  const route = authService.getHomeRoute(session.userId);
  if (!profile?.accessUnlocked && route !== "/payment") {
    return <Navigate to={route} replace />;
  }
  if (!profile?.accessUnlocked) {
    return <Navigate to="/payment" replace />;
  }
  return children;
}

export function GuestOnly({ children }: { children: React.ReactNode }) {
  const { session, ready } = useApp();
  if (!ready) return null;
  if (session) {
    return <Navigate to={authService.getHomeRoute(session.userId)} replace />;
  }
  return children;
}
