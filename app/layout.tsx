import type { Metadata, Viewport } from "next";
import "./globals.css";
import { EnregistrerSW } from "@/components/EnregistrerSW";

export const metadata: Metadata = {
  title: "APIG-PHARMA",
  description: "Gestion des ventes APIG-PHARMA",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "APIG-PHARMA" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>
        <EnregistrerSW />
        {children}
      </body>
    </html>
  );
}
