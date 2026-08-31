import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { profile as profileApi, ApiClientError } from "@hel/api-client";
import { isValidPublicProfileId } from "@/platform/share-profile";
import { SafeImage } from "@/ui/SafeImage";
import { EmptyState } from "@/ui/mobile-kit";

export function SharedProfilePage() {
  const { publicId = "" } = useParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<{
    name?: string;
    age?: number | null;
    city?: string | null;
    country?: string | null;
    bio?: string | null;
    imageUrl?: string | null;
    verified?: boolean;
    isOwner?: boolean;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      if (!isValidPublicProfileId(publicId)) {
        setError("This profile link is invalid.");
        setLoading(false);
        return;
      }
      try {
        const data = (await profileApi.getShareableCard(publicId)) as typeof card;
        if (alive) setCard(data);
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiClientError && (e.status === 404 || e.status === 403)) {
          setError("This profile is private, expired, or unavailable.");
        } else {
          setError("Could not open this profile. Check your connection.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [publicId]);

  if (loading) {
    return (
      <div className="screen" aria-busy="true">
        <p className="muted center" style={{ marginTop: "30vh" }}>
          Opening profile…
        </p>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="screen">
        <EmptyState
          title="Profile unavailable"
          body={error ?? "This profile cannot be viewed."}
          action={
            <Link to="/discover" className="btn btn-primary">
              Back to Discover
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <Link to="/discover" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Shared profile</h1>
        <span />
      </header>
      <SafeImage
        src={card.imageUrl}
        alt={card.name ? `Photo of ${card.name}` : "Profile photo"}
        fallbackText={card.name ?? "?"}
        className="shared-photo"
        aspectRatio="3 / 4"
      />
      <h2 style={{ marginBottom: 0 }}>
        {card.name ?? "Member"}
        {card.age != null ? `, ${card.age}` : ""}
      </h2>
      <p className="muted">
        {[card.city, card.country].filter(Boolean).join(", ") || "Location private"}
      </p>
      {card.verified && <span className="score-pill">Verified</span>}
      {card.bio && <p>{card.bio}</p>}
      {card.isOwner && (
        <p className="muted small">This is your shared profile card.</p>
      )}
      <Link to="/discover" className="btn btn-primary btn-block">
        Continue in app
      </Link>
    </div>
  );
}
