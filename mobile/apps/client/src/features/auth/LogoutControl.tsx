import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useSession } from "@/features/auth/SessionProvider";
import { BottomSheet } from "@/ui/mobile-kit";
import { cn } from "@/utils/cn";

/**
 * Always-available "Log out" for onboarding and gate screens, so nobody is
 * ever trapped in a flow. Confirms first; progress already saved stays saved.
 */
export function LogoutControl({ className }: { className?: string }) {
  const { logout } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setOpen(false);
    // logout() signs out in the UI synchronously; go to Sign in in the same tick.
    const done = logout();
    navigate("/login", { replace: true });
    try {
      await done;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={cn("logout-link", className)}
        onClick={() => setOpen(true)}
      >
        <LogOut size={15} aria-hidden /> Log out
      </button>
      <BottomSheet open={open} title="Log out?" onClose={() => setOpen(false)}>
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            You can sign back in anytime. Your answers so far are saved.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? "Logging out…" : "Log out"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
