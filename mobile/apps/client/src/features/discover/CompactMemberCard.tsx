import { Heart, MessageCircle, MoreHorizontal, MapPin, UserRound } from "lucide-react";
import { CompatBadge } from "@/ui/design-system";
import { cn } from "@/utils/cn";
import {
  memberChips,
  memberId,
  memberPhoto,
  memberPlace,
  memberScore,
  type DiscoverMember,
} from "@/features/discover/types";

type Props = {
  member: DiscoverMember;
  liked?: boolean;
  busy?: boolean;
  /** Dense LinkedIn/WhatsApp-style list row (~90px). Default keeps Discover feed cards. */
  variant?: "feed" | "row";
  online?: boolean;
  /** Show like / more controls. Defaults on for feed, off for row. */
  showSecondaryActions?: boolean;
  labels: {
    viewProfile: string;
    message: string;
    like: string;
    more: string;
    verified: string;
    locationPrivate: string;
  };
  onOpen: (member: DiscoverMember) => void;
  onMessage: (member: DiscoverMember) => void;
  onLike?: (member: DiscoverMember) => void;
  onMore?: (member: DiscoverMember) => void;
};

export function InterestChip({ label }: { label: string }) {
  return <span className="feed-chip">{label}</span>;
}

export function MemberAvatar({
  photo,
  name,
  onClick,
  ariaLabel,
  online,
  size = "md",
}: {
  photo: string | null;
  name: string;
  onClick: () => void;
  ariaLabel: string;
  online?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      className={cn("feed-avatar-btn", size === "sm" && "feed-avatar-btn-sm")}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <span className={cn("feed-avatar", size === "sm" && "feed-avatar-sm")}>
        {photo ? (
          <img src={photo} alt="" loading="lazy" />
        ) : (
          <span aria-hidden>{name.slice(0, 1)}</span>
        )}
      </span>
      {online ? <span className="feed-online-dot" aria-label="Online" /> : null}
    </button>
  );
}

export function CompatibilityBadge({ score }: { score: number }) {
  return <CompatBadge score={score} />;
}

export function CompactMemberCard({
  member,
  liked,
  busy,
  variant = "feed",
  online,
  showSecondaryActions,
  labels,
  onOpen,
  onMessage,
  onLike,
  onMore,
}: Props) {
  const id = memberId(member);
  const photo = memberPhoto(member);
  const place = memberPlace(member);
  const score = memberScore(member);
  const chips = memberChips(member, 3);
  const name = member.name ?? "Member";
  const age = member.age != null ? `, ${member.age}` : "";
  const cityOnly = member.city?.trim() || "";
  const isOnline = online ?? Boolean(member.online);
  const secondary =
    showSecondaryActions ?? variant === "feed";
  const bio =
    member.bio && member.bio.trim()
      ? member.bio.trim().length > 110
        ? `${member.bio.trim().slice(0, 107)}…`
        : member.bio.trim()
      : null;

  if (variant === "row") {
    return (
      <article
        className="feed-card feed-card-row"
        data-member-id={id || undefined}
      >
        <MemberAvatar
          photo={photo}
          name={name}
          size="sm"
          online={isOnline}
          onClick={() => onOpen(member)}
          ariaLabel={`${name}${age} photo`}
        />

        <button
          type="button"
          className="feed-row-identity"
          onClick={() => onOpen(member)}
        >
          <div className="feed-row-name-line">
            <h2 className="feed-row-name">
              {name}
              {age}
            </h2>
            {score != null ? <CompatBadge score={score} /> : null}
          </div>
          <p className="feed-row-meta">
            {cityOnly || place || labels.locationPrivate}
          </p>
        </button>

        <div className="feed-row-actions">
          <button
            type="button"
            className="btn btn-ghost feed-row-view"
            disabled={busy}
            onClick={() => onOpen(member)}
          >
            {labels.viewProfile}
          </button>
          <button
            type="button"
            className="btn btn-primary feed-row-msg"
            disabled={busy || !id}
            onClick={() => onMessage(member)}
            aria-label={labels.message}
          >
            <MessageCircle size={14} aria-hidden />
            <span>{labels.message}</span>
          </button>
          {secondary && onLike ? (
            <button
              type="button"
              className={cn("btn btn-ghost feed-row-icon", liked && "is-liked")}
              aria-label={labels.like}
              aria-pressed={Boolean(liked)}
              disabled={busy || !id}
              onClick={() => onLike(member)}
            >
              <Heart size={16} fill={liked ? "currentColor" : "none"} />
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article className="feed-card" data-member-id={id || undefined}>
      <div className="feed-card-top">
        <MemberAvatar
          photo={photo}
          name={name}
          online={isOnline}
          onClick={() => onOpen(member)}
          ariaLabel={`${name}${age} photo`}
        />

        <button
          type="button"
          className="feed-card-identity"
          onClick={() => onOpen(member)}
        >
          <div className="feed-name-row">
            <h2 className="feed-name">
              {name}
              {age}
            </h2>
            {score != null ? <CompatibilityBadge score={score} /> : null}
          </div>
          <p className="feed-meta">
            <MapPin size={13} aria-hidden />
            {place || labels.locationPrivate}
          </p>
          {member.occupation ? (
            <p className="feed-meta feed-occupation">{member.occupation}</p>
          ) : null}
          {member.verified ? (
            <p className="feed-verified">{labels.verified}</p>
          ) : null}
        </button>

        {onMore ? (
          <button
            type="button"
            className="feed-more-btn"
            aria-label={labels.more}
            disabled={busy || !id}
            onClick={() => onMore(member)}
          >
            <MoreHorizontal size={18} />
          </button>
        ) : null}
      </div>

      {bio ? <p className="feed-bio">{bio}</p> : null}

      {chips.length > 0 ? (
        <div className="feed-chips" aria-label="Interests">
          {chips.map((c) => (
            <InterestChip key={c} label={c} />
          ))}
        </div>
      ) : null}

      <div className="feed-actions" role="group" aria-label={labels.message}>
        <button
          type="button"
          className="btn btn-secondary feed-btn feed-btn-view"
          disabled={busy}
          onClick={() => onOpen(member)}
          aria-label={labels.viewProfile}
        >
          <UserRound size={16} aria-hidden />
          <span>{labels.viewProfile}</span>
        </button>
        <button
          type="button"
          className="btn btn-primary feed-btn"
          disabled={busy || !id}
          onClick={() => onMessage(member)}
        >
          <MessageCircle size={16} aria-hidden />
          <span>{labels.message}</span>
        </button>
        {onLike ? (
          <button
            type="button"
            className={cn("btn btn-ghost feed-icon-btn", liked && "is-liked")}
            aria-label={labels.like}
            aria-pressed={Boolean(liked)}
            disabled={busy || !id}
            onClick={() => onLike(member)}
          >
            <Heart size={18} fill={liked ? "currentColor" : "none"} />
          </button>
        ) : null}
      </div>
    </article>
  );
}
