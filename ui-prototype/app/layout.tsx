import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrainRoom — Our team studio",
  description: "An interactive concept for a shared space where ideas come together.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
