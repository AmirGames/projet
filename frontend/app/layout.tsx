import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AuthProvider } from "@/lib/auth-context";
import { TempsReelProvider } from "@/lib/temps-reel";
import RootLayoutContent from "@/components/RootLayoutContent";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zupone — Commandez chez vos commerces de proximité",
  description: "La plateforme qui relie commerçants, clients et livreurs de proximité.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="bg-gray-900 text-white">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            <TempsReelProvider>
              <MaintenanceGate />
              <RootLayoutContent>{children}</RootLayoutContent>
            </TempsReelProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}