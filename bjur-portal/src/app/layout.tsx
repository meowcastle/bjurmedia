import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/ui/MotionProvider";

// The bjur.nyc pair (v13): Archivo for everything you read, IBM Plex Mono for labels.
// Archivo is variable on weight and width, so headlines can widen the way the site's do.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Bjur · Client portal",
  description: "The Bjur client portal: review cuts, leave notes and download your files.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // respects notches/home-indicator safe areas on iOS
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The theme script stamps data-theme on <html> before React hydrates, so the server
  // markup and the live DOM differ by exactly that attribute. suppressHydrationWarning
  // is the sanctioned way to say "this element is expected to differ" — it covers this
  // element's own attributes only, not the tree below it.
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
