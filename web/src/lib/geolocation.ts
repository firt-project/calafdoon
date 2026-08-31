export class GeolocationUnsupportedError extends Error {
  constructor() {
    super("GEOLOCATION_UNSUPPORTED");
    this.name = "GeolocationUnsupportedError";
  }
}

export class GeolocationTimeoutError extends Error {
  constructor() {
    super("GEOLOCATION_TIMEOUT");
    this.name = "GeolocationTimeoutError";
  }
}

function tryGetPosition(
  options: PositionOptions
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * Prefer a quick low-accuracy fix; fall back to high accuracy.
 * Avoids common indoor timeouts from enableHighAccuracy + maximumAge: 0.
 */
export async function getBrowserPosition(): Promise<GeolocationPosition> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new GeolocationUnsupportedError();
  }

  try {
    return await tryGetPosition({
      enableHighAccuracy: false,
      timeout: 12_000,
      maximumAge: 5 * 60 * 1000,
    });
  } catch (firstError) {
    if (isGeolocationPermissionDenied(firstError)) {
      throw firstError;
    }
    try {
      return await tryGetPosition({
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 60_000,
      });
    } catch (secondError) {
      if (
        typeof secondError === "object" &&
        secondError !== null &&
        "code" in secondError &&
        Number((secondError as GeolocationPositionError).code) === 3
      ) {
        throw new GeolocationTimeoutError();
      }
      throw secondError;
    }
  }
}

export function isGeolocationPermissionDenied(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    Number((error as GeolocationPositionError).code) === 1
  );
}

export function isGeolocationTimeout(error: unknown): boolean {
  return (
    error instanceof GeolocationTimeoutError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      Number((error as GeolocationPositionError).code) === 3)
  );
}
