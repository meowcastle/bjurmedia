import type { Metadata, Viewport } from "next";
import { Fragment_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Fragment Mono ships a single weight, so bold UI text is synthesised by the browser
// rather than a real bold cut — which is the trade the v2 type spec makes deliberately.
const fragmentMono = Fragment_Mono({
  variable: "--font-fragment-mono",
  subsets: ["latin"],
  weight: ["400"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Bjur Media — Delivery Portal",
  description: "Client media-delivery portal for Bjur Media.",
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
      className={`${fragmentMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text">{children}</body>
    </html>
  );
}
