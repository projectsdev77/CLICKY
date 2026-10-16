import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clicky",
  description: "An AI buddy that lives inside your product and talks your users through it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
