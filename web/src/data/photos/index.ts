import { apiPhotos } from "./api";
import type { PhotosAdapter } from "./types";

export type { PhotosAdapter } from "./types";
export { PHOTOS_METHOD_NAMES } from "./types";

export function getPhotosAdapter(): PhotosAdapter {
  return apiPhotos;
}

export const photos = new Proxy({} as PhotosAdapter, {
  get(_t, prop: string) {
    const adapter = getPhotosAdapter();
    const value = adapter[prop as keyof PhotosAdapter];
    return typeof value === "function" ? value.bind(adapter) : value;
  },
});
