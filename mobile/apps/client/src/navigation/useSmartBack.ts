import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Back to wherever the user really came from (Messages, Reports, Members…).
 * Falls back to a fixed screen only when the page was opened directly.
 */
export function useSmartBack(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    if (location.key !== "default") navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, location.key, fallback]);
}
