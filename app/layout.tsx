import type { Metadata } from "next";
import "@fontsource/host-grotesk/400.css";
import "@fontsource/host-grotesk/500.css";
import "@fontsource/host-grotesk/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Soundcovery",
  description: "Find the artists you shouldn't miss",
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