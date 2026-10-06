/**
 * Le numéro court d'une commande, tel que tout le monde le lit.
 *
 * « #4F82A1C9 » : la fin de l'identifiant, comme sur la fiche de la commande
 * et le ticket imprimé. Le début, horodaté, est presque le même d'une
 * commande à l'autre — le client, le commerçant et le livreur doivent lire
 * le même numéro au moment de la remise.
 */
export function numeroCourt(id: string) {
  return `#${id.slice(-8).toUpperCase()}`;
}
