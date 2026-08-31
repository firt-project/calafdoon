import { Filter, Search, X } from "lucide-react";
import { cn } from "@/utils/cn";

export type FeedFilterId = "recommended" | "nearby" | "new";

type Props = {
  query: string;
  onQueryChange: (q: string) => void;
  activeFilter: FeedFilterId;
  onFilterChange: (id: FeedFilterId) => void;
  onOpenFilters: () => void;
  labels: {
    eyebrow: string;
    title: string;
    search: string;
    filter: string;
    recommended: string;
    nearby: string;
    newest: string;
  };
};

const FILTERS: FeedFilterId[] = ["recommended", "nearby", "new"];

export function FeedFilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn("feed-filter-chip", active && "is-active")}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function DiscoverHeader({
  query,
  onQueryChange,
  activeFilter,
  onFilterChange,
  onOpenFilters,
  labels,
}: Props) {
  const filterLabel = (id: FeedFilterId) => {
    switch (id) {
      case "recommended":
        return labels.recommended;
      case "nearby":
        return labels.nearby;
      case "new":
        return labels.newest;
    }
  };

  return (
    <header className="discover-feed-header">
      <div className="discover-feed-title-row">
        <div className="min-w-0">
          <p className="ds-eyebrow">{labels.eyebrow}</p>
          <h1 className="ds-page-title discover-feed-title">{labels.title}</h1>
        </div>
        <button
          type="button"
          className="btn btn-ghost feed-icon-btn"
          aria-label={labels.filter}
          onClick={onOpenFilters}
        >
          <Filter size={18} />
        </button>
      </div>

      <label className="ds-search discover-feed-search">
        <Search size={18} aria-hidden />
        <input
          type="search"
          value={query}
          placeholder={labels.search}
          aria-label={labels.search}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {query ? (
          <button
            type="button"
            className="ds-search-clear"
            aria-label="Clear search"
            onClick={() => onQueryChange("")}
          >
            <X size={16} />
          </button>
        ) : null}
      </label>

      <div className="feed-filter-row" role="tablist" aria-label={labels.filter}>
        {FILTERS.map((id) => (
          <FeedFilterChip
            key={id}
            label={filterLabel(id)}
            active={activeFilter === id}
            onClick={() => onFilterChange(id)}
          />
        ))}
      </div>
    </header>
  );
}
