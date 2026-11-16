import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./safe-area.css";

export const metadata: Metadata = {
  title: "MemeChess — bring your own AI",
  description:
    "Online chess with swappable meme skins and bring-your-own-AI opponents. The model each side plays is always disclosed. Built for web & mobile web.",
  openGraph: {
    title: "MemeChess",
    description: "Meme-skinned online chess. Bring your own AI. Model always disclosed.",
    type: "website",
  },
  // Open full screen when added to a phone's home screen.
  appleWebApp: {
    capable: true,
    title: "MemeChess",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  // Next only emits "mobile-web-app-capable"; iOS still reads the apple- name.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#14110e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Bungee&family=Cinzel:wght@500;700&family=Comic+Neue:wght@700&family=Fredoka:wght@500;600;700&family=JetBrains+Mono:wght@400;600;700&family=Monoton&family=Rajdhani:wght@500;600;700&family=Syne:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
