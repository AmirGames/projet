import type { Metadata } from 'next';
import { EDITEUR } from '@/lib/editeur';

export const metadata: Metadata = { title: 'Mentions légales — Zupone' };

export default function MentionsLegales() {
  const e = EDITEUR;
  return (
    <>
      <h1>Mentions légales</h1>
      <p>
        Conformément à l’article 6-III de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans
        l’économie numérique (LCEN), voici l’identité des intervenants du site {e.site} et de ses
        déclinaisons (zupeat.com, zupdrive.com).
      </p>

      <h2>Éditeur</h2>
      <ul>
        <li>{e.raisonSociale}, {e.formeJuridique} au capital de {e.capital}</li>
        <li>Siège social : {e.siege}</li>
        <li>RCS : {e.rcs}</li>
        <li>TVA intracommunautaire : {e.tva}</li>
        <li>Courriel : <a href={`mailto:${e.email}`}>{e.email}</a> — Téléphone : {e.telephone}</li>
        <li>Directeur de la publication : {e.directeurPublication}</li>
      </ul>

      <h2>Hébergement</h2>
      <p>{e.hebergeur.nom}, {e.hebergeur.adresse}, {e.hebergeur.telephone}.</p>

      <h2>Rôle de Zupone</h2>
      <p>
        Zupone est une plateforme d’intermédiation. Les produits sont vendus par les commerçants
        partenaires, qui en sont seuls vendeurs et responsables ; chaque vitrine indique l’identité
        du commerçant concerné. Zupone met en relation clients, commerçants et livreurs et encaisse
        les paiements pour le compte des commerçants.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        La marque Zupone, le site, son code et ses contenus propres sont protégés. Toute reproduction
        sans autorisation écrite est interdite. Les photos et descriptions de produits appartiennent
        aux commerçants qui les publient. Les fonds de carte proviennent d’OpenStreetMap
        (© contributeurs OpenStreetMap, licence ODbL).
      </p>

      <h2>Signaler un contenu</h2>
      <p>
        Tout contenu manifestement illicite peut être signalé à{' '}
        <a href={`mailto:${e.email}`}>{e.email}</a> en précisant l’adresse de la page, la nature du
        contenu et le motif du signalement.
      </p>

      <h2>Médiation de la consommation</h2>
      <p>
        En cas de litige non résolu avec notre service client, le consommateur peut recourir
        gratuitement au médiateur : {e.mediateur.nom} ({e.mediateur.site}), ou à la plateforme
        européenne de règlement en ligne des litiges.
      </p>
    </>
  );
}
