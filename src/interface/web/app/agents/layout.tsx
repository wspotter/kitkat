import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
    title: "KIT AI - Agents",
    description:
        "Find or create agents with custom knowledge, tools and personalities to help address your specific needs.",
    icons: {
        icon: "/static/assets/icons/KIT_lantern.ico",
        apple: "/static/assets/icons/KIT_lantern_256x256.png",
    },
    openGraph: {
        siteName: "KIT AI",
        title: "KIT AI - Agents",
        description:
            "Find or create agents with custom knowledge, tools and personalities to help address your specific needs.",
        url: "https://app.KIT.dev/agents",
        type: "website",
        images: [
            {
                url: "https://assets.KIT.dev/KIT_hero.png",
                width: 940,
                height: 525,
            },
            {
                url: "https://assets.KIT.dev/KIT_lantern_256x256.png",
                width: 256,
                height: 256,
            },
        ],
    },
};

export default function ChildLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return <>{children}</>;
}
