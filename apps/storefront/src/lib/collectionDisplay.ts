import type { Collection } from "@/types/site";

export function getCollectionCover(collection: Pick<Collection, "cover_image_url">) {
  return collection.cover_image_url || null;
}
