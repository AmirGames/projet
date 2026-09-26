import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { ENTETE_REGION, NOM_COOKIE_REGION, baliseLangue, trouverRegion } from "@/i18n/regions";
import { RegionProvider } from "@/lib/region-context";
import { alternatesRegionales, baseDuSite } from "@/lib/seo-regional";
import { AuthProvider } from "@/lib/auth-context";
import { TempsReelProvider } from "@/lib/temps-reel";
import RootLayoutContent from "@/components/RootLayoutContent";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import "./globals.css";

/**
 * Les balises canonical et hreflang valent pour toutes les pages publiques
 * (voir lib/seo-regional) : une page qui définit ses propres métadonnées en
 * hérite, sauf la vitrine qui restreint les siennes au pays du commerce.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: await baseDuSite(),
    title: "Zupone — Commandez chez vos commerces de proximité",
    description: "La plateforme qui relie commerçants, clients et livreurs de proximité.",
    alternates: await alternatesRegionales(),
  };
}

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
      {/* Des extensions (ColorZilla, gestionnaires de mots de passe…) ajoutent
          des attributs à <body> avant l'hydratation : React ne signale plus
          cet écart-là, et seulement sur cette balise. */}
      <body className="bg-gray-900 text-white" suppressHydrationWarning>
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