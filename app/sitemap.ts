import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://www.ichess.lol/", changeFrequency: "weekly", priority: 1 }];
}
