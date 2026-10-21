import type { Metadata, Viewport } from "next";
import "./globals.css";
import { EnregistrerSW } from "@/components/EnregistrerSW";
import { CurseurDefilement } from "@/components/CurseurDefilement";
import { BarreNavigation } from "@/components/BarreNavigation";
import { Suspense } from "react";

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
        <Suspense fallback={null}>
          <BarreNavigation />
        </Suspense>
        {children}
        <CurseurDefilement />
      </body>
    </html>
  );
}
