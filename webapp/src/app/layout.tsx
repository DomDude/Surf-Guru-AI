import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://surfguru.ai"),
  title: {
    default: "Surf Guru AI",
    template: "%s | Surf Guru AI",
  },
  description:
    "AI-first surf forecasting for intermediate and advanced surfers. Multi-source forecasts, honest conditions, Europe-first coverage.",
  openGraph: {
    title: "Surf Guru AI",
    description:
      "AI-first surf forecasting for intermediate and advanced surfers.",
    siteName: "Surf Guru AI",
    images: [{ url: "/og-placeholder.png" }],
  },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
