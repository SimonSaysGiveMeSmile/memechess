import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest and linked from every page by Next. Makes the
// app installable and opens it full screen from a phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MemeChess",
    short_name: "MemeChess",
    description: "Meme-skinned online chess. Bring your own AI. Model always disclosed.",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    background_color: "#14110e",
    theme_color: "#14110e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
