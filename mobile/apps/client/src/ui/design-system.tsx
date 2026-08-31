import type { ReactNode, CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Search, X } from "lucide-react";
import { cn } from "@/utils/cn";

/** Shared main-tab screen shell: safe areas + tab-bar clearance. */
export function ScreenContainer({
  children,
  className,
  "aria-label": ariaLabel,
  onTouchStart,
  onTouchEnd,
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  onTouchStart?: React.TouchEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      className={cn("screen pad-tab", className)}
      aria-label={ariaLabel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="screen-inner">{children}</div>
    </div>
  );
}

/** Compact compatibility badge — never competes with the name. */
export function CompatBadge({
  score,
  className,
}: {
  score?: number | string | null;
  className?: string;
}) {
  if (score == null || score === "") return null;
  const n = Math.round(Number(score));
  if (Number.isNaN(n)) return null;
  return (
    <span className={cn("compat-badge", className)} aria-label={`${n}% match`}>
      {n}%
    </span>
  );
}

export function Avatar({
  src,
  name,
  size = "md",
  online,
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  online?: boolean;
  className?: string;
}) {
  const initial = (name ?? "?").trim().slice(0, 1) || "?";
  return (
    <div className={cn("ds-avatar", `ds-avatar-${size}`, className)}>
      {src ? <img src={src} alt="" loading="lazy" /> : <span aria-hidden>{initial}</span>}
      {online ? <span className="ds-online-dot" aria-label="Online" /> : null}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ds-section-head", className)}>
      <div className="ds-section-copy">
        <h2 className="ds-section-title">{title}</h2>
        {subtitle ? <p className="ds-section-sub">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function SurfaceCard({
  children,
  className,
  as: Tag = "section",
  style,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
  style?: CSSProperties;
  "aria-label"?: string;
}) {
  return (
    <Tag className={cn("ds-card", className)} style={style} aria-label={ariaLabel}>
      {children}
    </Tag>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = "Search",
  "aria-label": ariaLabel = "Search",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  "aria-label"?: string;
}) {
  return (
    <label className="ds-search">
      <Search size={18} aria-hidden />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="ds-search-clear"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <X size={16} />
        </button>
      ) : null}
    </label>
  );
}

export function FilterChip({
  active,
  children,
  onClick,
  count,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      className={cn("ds-filter-chip", active && "is-active")}
      aria-pressed={Boolean(active)}
      onClick={onClick}
    >
      {children}
      {count != null ? <span className="ds-filter-count">{count}</span> : null}
    </button>
  );
}

export function StatTile({
  to,
  icon,
  value,
  label,
}: {
  to: string;
  icon: ReactNode;
  value: string | number;
  label: string;
}) {
  return (
    <Link to={to} className="ds-stat-tile">
      <span className="ds-stat-icon" aria-hidden>
        {icon}
      </span>
      <strong className="ds-stat-value">{value}</strong>
      <span className="ds-stat-label">{label}</span>
    </Link>
  );
}

export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="ds-page-header">
      {eyebrow ? <p className="ds-eyebrow">{eyebrow}</p> : null}
      <h1 className="ds-page-title">{title}</h1>
      {children}
    </header>
  );
}
