import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { ENTETE_REGION, NOM_COOKIE_REGION, baliseLangue, trouverRegion } from "@/i18n/regions";
import { RegionProvider } from "@/lib/region-context";
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

  // La région de l'adresse (/be-fr/…) prime ; sinon celle choisie
  // auparavant, tant qu'elle parle la langue affichée.
  const deCookie = trouverRegion((await cookies()).get(NOM_COOKIE_REGION)?.value);
  const region =
    trouverRegion((await headers()).get(ENTETE_REGION) ?? undefined) ??
    (deCookie?.langue === locale ? deCookie : undefined);

  return (
    <html lang={region ? baliseLangue(region) : locale}>
      <body className="bg-gray-900 text-white">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <RegionProvider code={region?.code}>
            <AuthProvider>
              <TempsReelProvider>
                <MaintenanceGate />
                <RootLayoutContent>{children}</RootLayoutContent>
              </TempsReelProvider>
            </AuthProvider>
          </RegionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}