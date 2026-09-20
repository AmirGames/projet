import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AuthProvider } from "@/lib/auth-context";
import RootLayoutContent from "@/components/RootLayoutContent";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS Local - Digitalisation Commerces Locaux",
  description: "Plateforme SaaS pour digitaliser votre commerce local",
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
            <MaintenanceGate />
            <RootLayoutContent>{children}</RootLayoutContent>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}