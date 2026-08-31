import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { matchCountry, normalizeCity } from "./location-match";

const NOMINATIM_USER_AGENT =
  "HelCalafkaaga/1.0 (https://helcalafkaaga.com; support@helcalafkaaga.com)";

export interface ReverseGeocodeResult {
  country: string;
  city: string;
  displayName: string;
}

function assertValidCoords(latitude: number, longitude: number): void {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new BadRequestException("Invalid coordinates");
  }
}

async function reverseGeocodeCoords(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> {
  const params = new URLSearchParams({
    format: "json",
    lat: String(latitude),
    lon: String(longitude),
    zoom: "10",
    addressdetails: "1",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${params}`,
    {
      headers: {
        "User-Agent": NOMINATIM_USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!response.ok) {
    throw new ServiceUnavailableException("Location lookup failed");
  }

  const data = (await response.json()) as {
    display_name?: string;
    address?: Record<string, string | undefined>;
  };

  const address = data.address ?? {};
  const country = address.country?.trim() ?? "";
  const cityCandidate =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.city_district ??
    address.suburb ??
    address.county ??
    address.state_district ??
    address.state ??
    "";

  let city = String(cityCandidate).trim();
  // Last resort: first segment of display name (e.g. "Mogadishu, ...")
  if (!city && data.display_name) {
    city = data.display_name.split(",")[0]?.trim() ?? "";
  }

  return {
    country,
    city,
    displayName: data.display_name ?? "",
  };
}

@Injectable()
export class GeolocationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reverse-geocode GPS coordinates on the server and persist the verified
   * country/city + coords on the caller's profile. Location fields are never
   * writable directly by the client (see stripClientLocationWrites), so this
   * is the only path that sets them.
   */
  async verifyAndSaveLocation(
    userId: string,
    args: { latitude: number; longitude: number; accuracy?: number }
  ): Promise<ReverseGeocodeResult> {
    assertValidCoords(args.latitude, args.longitude);

    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { id: true, banned: true },
    });
    if (!profile) {
      throw new NotFoundException("Profile not found");
    }
    if (profile.banned) {
      throw new ForbiddenException("Account is banned");
    }

    const raw = await reverseGeocodeCoords(args.latitude, args.longitude);
    const country = matchCountry(raw.country);
    if (!country) {
      throw new BadRequestException("COUNTRY_UNSUPPORTED");
    }

    const city = normalizeCity(raw.city);
    if (!city) {
      throw new BadRequestException("CITY_MISSING");
    }

    const accuracy =
      typeof args.accuracy === "number" && Number.isFinite(args.accuracy)
        ? Math.max(0, Math.min(args.accuracy, 50_000))
        : null;

    await this.prisma.profile.update({
      where: { id: profile.id },
      data: {
        country,
        city,
        locationLat: args.latitude,
        locationLng: args.longitude,
        locationAccuracyM: accuracy,
        locationVerifiedAt: new Date(),
        lastSavedAt: new Date(),
      },
    });

    return {
      country,
      city,
      displayName: raw.displayName,
    };
  }
}
