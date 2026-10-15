import { BadgeCheck } from "lucide-react";

/** Small blue tick shown next to a member's name once staff verified their selfie. */
export function VerifiedBadge({ show, size = 16 }: { show?: boolean; size?: number }) {
  if (!show) return null;
  return (
    <BadgeCheck
      size={size}
      aria-label="Photo verified"
      style={{ color: "#1d9bf0", marginLeft: 4, verticalAlign: "-2px", flex: "none" }}
    />
  );
}
