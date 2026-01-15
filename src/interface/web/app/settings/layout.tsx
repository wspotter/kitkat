import type { Metadata } from "next";
import "../globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ChatwootWidget } from "../components/chatWoot/ChatwootWidget";

export const metadata: Metadata = {
    title: "KIT AI - Settings",
    description: "Configure KIT to get personalized, deeper assistance.",
    icons: {
        icon: "/static/assets/icons/KIT_lantern.ico",
        apple: "/static/assets/icons/KIT_lantern_256x256.png",
    },
    openGraph: {
        siteName: "KIT AI",
        title: "KIT AI - Settings",
        description: "Setup, configure, and personalize KIT, your AI research assistant.",
        url: "https://app.KIT.dev/settings",
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
    return (
        <>
            {children}
            <Toaster />
            <ChatwootWidget />
        </>
    );
}
