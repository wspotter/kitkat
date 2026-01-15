import type { Metadata } from "next";
import "../../globals.css";

export const metadata: Metadata = {
    title: "KIT AI - Ask Anything",
    description:
        "Ask anything. Research answers from across the internet and your documents, draft messages, summarize documents, generate paintings and chat with personal agents.",
    icons: {
        icon: "/static/assets/icons/KIT_lantern.ico",
        apple: "/static/assets/icons/KIT_lantern_256x256.png",
    },
    openGraph: {
        siteName: "KIT AI",
        title: "KIT AI - Ask Anything",
        description:
            "Ask anything. Research answers from across the internet and your documents, draft messages, summarize documents, generate paintings and chat with personal agents.",
        url: "https://app.KIT.dev/chat",
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
            <script
                dangerouslySetInnerHTML={{
                    __html: `window.EXCALIDRAW_ASSET_PATH = 'https://assets.KIT.dev/@excalidraw/excalidraw/dist/';`,
                }}
            />
        </>
    );
}
