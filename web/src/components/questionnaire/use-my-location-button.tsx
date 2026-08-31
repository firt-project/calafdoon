"use client";

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useVerifyAndSaveLocation } from "@/data/questionnaire/hooks";
import {
  GeolocationUnsupportedError,
  getBrowserPosition,
  isGeolocationPermissionDenied,
  isGeolocationTimeout,
} from "@/lib/geolocation";
import { useQuestionnaireI18n } from "@/lib/i18n/questionnaire-i18n";
import { cn } from "@/lib/utils";

interface UseMyLocationButtonProps {
  onDetected: (country: string, city: string) => void;
  disabled?: boolean;
  className?: string;
  /** Emphasize GPS as the preferred option. */
  required?: boolean;
  /** Called when GPS fails so the UI can show manual pickers. */
  onFailed?: () => void;
}

export function UseMyLocationButton({
  onDetected,
  disabled,
  className,
  required,
  onFailed,
}: UseMyLocationButtonProps) {
  const verifyAndSaveLocation = useVerifyAndSaveLocation();
  const { ui } = useQuestionnaireI18n();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const position = await getBrowserPosition();
      const result = await verifyAndSaveLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });

      onDetected(result.country, result.city);
      toast.success(ui("locationDetected"));
    } catch (error) {
      onFailed?.();
      if (error instanceof GeolocationUnsupportedError) {
        toast.error(ui("locationUnsupported"));
        return;
      }
      if (isGeolocationPermissionDenied(error)) {
        toast.error(ui("locationPermissionDenied"));
        return;
      }
      if (isGeolocationTimeout(error)) {
        toast.error(ui("locationTimeout"));
        return;
      }
      const message = error instanceof Error ? error.message : "";
      if (message.includes("COUNTRY_UNSUPPORTED")) {
        toast.error(ui("locationCountryUnsupported"));
        return;
      }
      toast.error(ui("locationFailed"));
    } finally {
      setLoading(false);
    }
  };

  const label = loading
    ? ui("detectingLocation")
    : required
      ? ui("allowLocationRequired")
      : ui("useMyLocation");

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-center gap-2.5 rounded-full px-5 py-3.5 text-base font-semibold transition-colors",
        required
          ? "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85"
          : "bg-primary/10 text-primary hover:bg-primary/15 active:bg-primary/20",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      onClick={() => void handleClick()}
      disabled={disabled || loading}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
      ) : (
        <MapPin className="h-5 w-5 shrink-0" />
      )}
      <span>{label}</span>
    </button>
  );
}
