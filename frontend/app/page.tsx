'use client';

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";

export default function Home() {
  const { user, isLoading } = useAuth();
  const [roles, setRoles] = useState<any>(null);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    if (user && !isLoading) {
      fetchRoles();
    } else if (!user) {
      setRolesLoading(false);
    }
  }, [user, isLoading]);

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/me/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setRoles(data.roles);
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error);
    } finally {
      setRolesLoading(false);
    }
  };

  const isMerchant = roles?.merchant?.active ?? false;
  const isDriver = roles?.driver?.active ?? false;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* HEADER */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 md:px-10">
        <Link href="/" className="text-2xl font-black text-primary md:text-3xl">
          Zupone
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/restaurants" className="font-semibold text-slate-900 transition hover:text-primary">
            Commerces
          </Link>

          {!user || (!isMerchant && !rolesLoading) ? (
            <Link href="/merchant/register" className="font-semibold text-slate-900 transition hover:text-primary">
              Devenir commerçant
            </Link>
          ) : null}

          {!user || (!isDriver && !rolesLoading) ? (
            <Link href="/driver/signup" className="font-semibold text-slate-900 transition hover:text-primary">
              Devenir livreur
            </Link>
          ) : null}

          {!user ? (
            <Link href="/login" className="font-semibold text-slate-900 transition hover:text-primary">
              Connexion
            </Link>
          ) : null}
        </nav>

        {!user ? (
          <Link
            href="/signup"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent-hover md:px-6 md:py-3 md:text-base"
          >
            Créer ma boutique
          </Link>
        ) : (
          <Link
            href={isMerchant ? "/merchant" : (isDriver ? "/driver/deliveries" : "/dashboard")}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent-hover md:px-6 md:py-3 md:text-base"
          >
            Mon espace
          </Link>
        )}
      </header>

      {/* HERO */}
      <section className="bg-gradient-to-b from-white to-slate-100 px-6 py-20 text-center md:py-32">
        <span className="mb-6 inline-block rounded-full bg-blue-100 px-4 py-2.5 font-bold text-primary">
          Fait pour les commerces de proximité
        </span>

        <h1 className="mx-auto mb-5 max-w-4xl text-4xl font-black leading-tight md:text-6xl">
          Votre commerce, en ligne, sans intermédiaire encombrant
        </h1>

        <p className="mx-auto max-w-2xl text-lg text-slate-500 md:text-xl">
          Catalogue, commandes et livraison réunis dans un seul outil. Vos clients
          commandent sans créer de compte, vos livreurs suivent la course en direct.
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-full bg-accent px-8 py-4 font-bold text-white transition hover:bg-accent-hover"
          >
            Créer ma boutique gratuitement
          </Link>
          <Link
            href="/restaurants"
            className="rounded-full border border-slate-200 bg-white px-8 py-4 font-bold text-slate-900 transition hover:border-slate-300"
          >
            Voir les commerces
          </Link>
        </div>
      </section>

      {/* SERVICES */}
      <section className="grid grid-cols-1 gap-8 bg-white px-6 py-16 md:grid-cols-3 md:px-10 md:py-24">
        <div className="rounded-3xl border border-slate-200 p-8 transition hover:-translate-y-1 hover:shadow-[0_15px_35px_rgba(37,99,235,0.08)]">
          <div className="mb-4 text-4xl">🛍️</div>
          <h2 className="mb-2 text-xl font-bold">Pour les clients</h2>
          <p className="mb-4 text-slate-500">
            Une vitrine claire par commerce, un panier par boutique, et une commande
            possible sans créer de compte.
          </p>
          <Link href="/restaurants" className="font-bold text-primary">
            Parcourir les commerces →
          </Link>
        </div>

        <div className="rounded-3xl border border-slate-200 p-8 transition hover:-translate-y-1 hover:shadow-[0_15px_35px_rgba(37,99,235,0.08)]">
          <div className="mb-4 text-4xl">🏪</div>
          <h2 className="mb-2 text-xl font-bold">Pour les commerçants</h2>
          <p className="mb-4 text-slate-500">
            Catalogue, horaires par service, zones de livraison réglées sur une
            carte, et le suivi de chaque commande.
          </p>
          <Link href="/merchant/register" className="font-bold text-primary">
            Ouvrir ma boutique →
          </Link>
        </div>

        <div className="rounded-3xl border border-slate-200 p-8 transition hover:-translate-y-1 hover:shadow-[0_15px_35px_rgba(37,99,235,0.08)]">
          <div className="mb-4 text-4xl">🛵</div>
          <h2 className="mb-2 text-xl font-bold">Pour les livreurs</h2>
          <p className="mb-4 text-slate-500">
            Un dossier examiné une fois, puis des courses proposées au plus proche
            disponible, avec une rémunération calculée.
          </p>
          <Link href="/driver/signup" className="font-bold text-primary">
            Devenir livreur →
          </Link>
        </div>
      </section>

      {/* STATS */}
      <section className="flex flex-col justify-center gap-10 bg-slate-50 px-6 py-16 md:flex-row md:gap-24 md:py-20">
        <div className="text-center">
          <h3 className="text-4xl font-extrabold text-primary md:text-5xl">3</h3>
          <p className="text-slate-500">espaces dédiés : client, commerçant, livreur</p>
        </div>
        <div className="text-center">
          <h3 className="text-4xl font-extrabold text-primary md:text-5xl">83</h3>
          <p className="text-slate-500">pages déjà construites côté site</p>
        </div>
        <div className="text-center">
          <h3 className="text-4xl font-extrabold text-primary md:text-5xl">1978</h3>
          <p className="text-slate-500">contrôles automatisés, API et navigateur</p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="px-6 py-20 md:px-10 md:py-24">
        <h2 className="mb-12 text-center text-3xl font-black md:text-4xl">
          Comment ça marche
        </h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 p-8">
            <span className="text-2xl font-extrabold text-primary">01</span>
            <h3 className="my-3 text-lg font-bold">Le client choisit</h3>
            <p className="text-slate-500">
              Il parcourt les commerces, consulte le menu et commande, avec ou sans
              compte.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 p-8">
            <span className="text-2xl font-extrabold text-primary">02</span>
            <h3 className="my-3 text-lg font-bold">Le commerçant prépare</h3>
            <p className="text-slate-500">
              La commande arrive en direct, il suit son état jusqu'à la remise au
              livreur.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 p-8">
            <span className="text-2xl font-extrabold text-primary">03</span>
            <h3 className="my-3 text-lg font-bold">Le livreur livre</h3>
            <p className="text-slate-500">
              La course lui est proposée automatiquement, et un code à quatre
              chiffres prouve la remise.
            </p>
          </div>
        </div>
      </section>

      {/* BUSINESS CTA */}
      <section className="bg-blue-50 px-6 py-24 text-center md:py-32">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-5 text-3xl font-black md:text-5xl">
            Vous tenez un commerce local ?
          </h2>
          <p className="mb-8 text-slate-500">
            Restaurant, boulangerie, épicerie, fleuriste — créez votre boutique en
            quelques minutes et gardez la main sur votre catalogue et vos prix.
          </p>
          <Link
            href="/merchant/register"
            className="inline-block rounded-full bg-accent px-8 py-4 font-bold text-white transition hover:bg-accent-hover"
          >
            Créer ma boutique
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 px-6 py-16 text-white md:px-10">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 md:grid-cols-3">
          <div>
            <h4 className="mb-3 text-lg font-bold">Zupone</h4>
            <p className="text-slate-300">
              La plateforme qui relie commerçants, clients et livreurs de proximité.
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-lg font-bold">Plateforme</h4>
            <Link href="/restaurants" className="mb-2 block text-slate-300 hover:text-white">
              Commerces
            </Link>
            {!user || (!isMerchant && !rolesLoading) ? (
              <Link href="/merchant/register" className="mb-2 block text-slate-300 hover:text-white">
                Devenir commerçant
              </Link>
            ) : null}
            {!user || (!isDriver && !rolesLoading) ? (
              <Link href="/driver/signup" className="mb-2 block text-slate-300 hover:text-white">
                Devenir livreur
              </Link>
            ) : null}
          </div>
          <div>
            <h4 className="mb-3 text-lg font-bold">Compte</h4>
            {!user ? (
              <>
                <Link href="/login" className="mb-2 block text-slate-300 hover:text-white">
                  Connexion
                </Link>
                <Link href="/signup" className="mb-2 block text-slate-300 hover:text-white">
                  Inscription
                </Link>
              </>
            ) : (
              <Link href={isMerchant ? "/merchant" : (isDriver ? "/driver/deliveries" : "/dashboard")} className="mb-2 block text-slate-300 hover:text-white">
                Mon espace
              </Link>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
