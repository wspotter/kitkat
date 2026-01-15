import type { Metadata } from "next";

import "../globals.css";

export const metadata: Metadata = {
    title: "KIT AI - Search",
    description:
        "Find anything in documents you've shared with KIT using natural language queries.",
    icons: {
        icon: "/static/assets/icons/KIT_lantern.ico",
        apple: "/static/assets/icons/KIT_lantern_256x256.png",
    },
    openGraph: {
        siteName: "KIT AI",
        title: "KIT AI - Search",
        description: "Your Second Brain.",
        url: "https://app.KIT.dev/search",
        type: "website",
        images: [
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
