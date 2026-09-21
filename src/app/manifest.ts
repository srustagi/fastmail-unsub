import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Unsubscribe",
    short_name: "Unsubscribe",
    description: "A private, Inbox-only Fastmail unsubscribe dashboard.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f7f1",
    theme_color: "#304dc6",
    icons: [
      {
        src: "/icons/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/android-chrome-512x512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
