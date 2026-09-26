/**
 * Situe les boutiques qui n'ont pas de coordonnées.
 *
 * Les boutiques créées par l'inscription commerçant ou « Devenir commerçant »
 * naissaient sans coordonnées, contrairement à celles de POST /api/stores :
 * invisibles de leurs zones de livraison et de l'attribution des courses.
 * Depuis, ces routes situent la boutique à sa création ; ce script rattrape
 * celles créées avant.
 *
 *   npx tsx scripts/situer-boutiques.ts            # montre ce qu'il ferait
 *   npx tsx scripts/situer-boutiques.ts --ecrire   # enregistre
 *
 * Une adresse introuvable est seulement signalée : la plateforme la corrige
 * depuis la fiche de la boutique, qui la situe alors d'office.
 */

import { db } from "../src/services/db";
import { AddressService } from "../src/services/address.service";

const ecrire = process.argv.includes("--ecrire");

async function main() {
  const boutiques = await db.store.findMany({
    where: { deletedAt: null, OR: [{ latitude: null }, { longitude: null }] },
    select: { id: true, slug: true, address: true, postalCode: true, city: true },
  });

  console.log(`${boutiques.length} boutique(s) sans coordonnées${ecrire ? "" : " (simulation)"}`);

  let situees = 0;
  const introuvables: string[] = [];

  for (const boutique of boutiques) {
    const texte = [boutique.address, boutique.postalCode, boutique.city].filter(Boolean).join(" ");
    const { point, disponible } = await AddressService.situer(texte);

    if (!disponible) {
      console.error("Service d'adresses indisponible : arrêt, rien d'autre n'est modifié.");
      break;
    }

    if (!point) {
      introuvables.push(`${boutique.slug} — « ${texte || "adresse vide"} »`);
      continue;
    }

    console.log(`  ${boutique.slug} → ${point.latitude}, ${point.longitude}`);
    situees += 1;

    if (ecrire) {
      await db.store.update({
        where: { id: boutique.id },
        data: { latitude: point.latitude, longitude: point.longitude },
      });
    }
  }

  console.log(`${situees} située(s)${ecrire ? "" : " — relancer avec --ecrire pour enregistrer"}`);

  if (introuvables.length > 0) {
    console.log(`${introuvables.length} adresse(s) introuvable(s), à corriger depuis la fiche :`);
    for (const ligne of introuvables) console.log(`  ${ligne}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
