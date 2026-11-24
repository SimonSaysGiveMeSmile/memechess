import GameApp from "@/components/GameApp";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: "MemeChess", url: "https://www.ichess.lol/" },
    {
      "@type": ["VideoGame", "WebApplication"],
      name: "MemeChess",
      url: "https://www.ichess.lol/",
      description:
        "Online chess with swappable meme skins and bring-your-own-AI opponents. The model each side plays is always disclosed.",
      image: "https://www.ichess.lol/og.png",
      genre: "Chess",
      gamePlatform: "Web browser",
      applicationCategory: "GameApplication",
      operatingSystem: "Any",
      author: { "@type": "Person", name: "Simon Tian", url: "https://www.hisimon.pro" },
    },
  ],
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <GameApp />
    </>
  );
}
