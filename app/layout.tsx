import type { Metadata } from "next";
import "@fontsource/host-grotesk/400.css";
import "@fontsource/host-grotesk/500.css";
import "@fontsource/host-grotesk/700.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://soundcovery.com"),

  title: "Soundcovery",
  description: "Find the artists you shouldn't miss",

  openGraph: {
    title: "Soundcovery",
    description: "Find the artists you shouldn't miss",
    url: "https://soundcovery.com",
    siteName: "Soundcovery",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Soundcovery",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Soundcovery",
    description: "Find the artists you shouldn't miss",
    images: ["/og-image.png"],
  },

  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased dark"
    >
      <body className="min-h-full flex flex-col bg-black text-white font-sans">
        {children}
      </body>
    </html>
  );
}