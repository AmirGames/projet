import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import RootLayoutContent from "@/components/RootLayoutContent";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS Local - Digitalisation Commerces Locaux",
  description: "Plateforme SaaS pour digitaliser votre commerce local",
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="bg-gray-900 text-white">
        <AuthProvider>
          <MaintenanceGate />
          <RootLayoutContent>{children}</RootLayoutContent>
        </AuthProvider>
      </body>
    </html>
  );
}
