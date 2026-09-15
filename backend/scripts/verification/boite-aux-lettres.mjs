import { createServer } from "node:net";

/**
 * Serveur SMTP minimal, pour attraper les courriels envoyés pendant une
 * vérification.
 *
 * Les jetons de confirmation et de réinitialisation n'existent en clair que
 * dans le lien expédié : la base n'en garde qu'une empreinte. Les lire dans le
 * message reçu est donc la seule façon de vérifier le parcours de bout en bout
 * — et cela prouve au passage que le courriel part vraiment, avec un lien
 * utilisable.
 *
 * Nodemailer vise localhost:1025 par défaut, la même adresse que MailHog ou
 * Mailpit : rien à configurer côté application.
 */

export async function ouvrirBoiteAuxLettres(port = 1025) {
  const messages = [];

  const serveur = createServer((socket) => {
    let tampon = "";
    let dansLeCorps = false;
    let corps = "";

    socket.write("220 boite-de-test\r\n");

    socket.on("data", (bloc) => {
      tampon += bloc.toString("utf-8");

      // Le corps se termine par une ligne ne contenant qu'un point.
      if (dansLeCorps) {
        const fin = tampon.indexOf("\r\n.\r\n");

        if (fin === -1) {
          corps += tampon;
          tampon = "";
          return;
        }

        corps += tampon.slice(0, fin);
        tampon = tampon.slice(fin + 5);
        dansLeCorps = false;

        messages.push(decoder(corps));
        corps = "";
        socket.write("250 recu\r\n");
      }

      let saut;
      while (!dansLeCorps && (saut = tampon.indexOf("\r\n")) !== -1) {
        const ligne = tampon.slice(0, saut);
        tampon = tampon.slice(saut + 2);

        const commande = ligne.split(" ")[0].toUpperCase();

        if (commande === "EHLO" || commande === "HELO") {
          socket.write("250-boite-de-test\r\n250 OK\r\n");
        } else if (commande === "DATA") {
          socket.write("354 envoyez\r\n");
          dansLeCorps = true;
        } else if (commande === "QUIT") {
          socket.write("221 au revoir\r\n");
          socket.end();
        } else {
          socket.write("250 OK\r\n");
        }
      }
    });

    socket.on("error", () => undefined);
  });

  await new Promise((resoudre, rejeter) => {
    serveur.once("error", rejeter);
    serveur.listen(port, "127.0.0.1", resoudre);
  });

  return {
    /** Tous les messages reçus jusqu'ici. */
    messages,

    /** Vide la boîte, pour ne pas confondre deux étapes d'un même script. */
    vider() {
      messages.length = 0;
    },

    /**
     * Attend un message dont le contenu satisfait le prédicat.
     * L'envoi est asynchrone côté application : sans attente, on lit une
     * boîte encore vide.
     */
    async attendre(predicat, delaiMs = 8000) {
      const limite = Date.now() + delaiMs;

      while (Date.now() < limite) {
        const trouve = messages.find(predicat);
        if (trouve) return trouve;
        await new Promise((r) => setTimeout(r, 120));
      }

      return null;
    },

    async fermer() {
      await new Promise((resoudre) => serveur.close(resoudre));
    },
  };
}

/** Le corps arrive encodé ; on en extrait de quoi lire les liens. */
function decoder(brut) {
  const separation = brut.indexOf("\r\n\r\n");
  const entetes = separation === -1 ? brut : brut.slice(0, separation);
  let contenu = separation === -1 ? "" : brut.slice(separation + 4);

  // L'encodage se cherche dans tout le message : un envoi en plusieurs parties
  // (texte et HTML) le déclare dans chaque partie, pas dans l'en-tête
  // principal.
  if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(brut)) {
    // Un « = » en fin de ligne est une coupure ajoutée par l'encodage : elle
    // tombe au milieu des liens. Les octets, eux, s'écrivent =XX.
    const octets = contenu
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    // Les accents occupent plusieurs octets : on repasse par UTF-8.
    contenu = Buffer.from(octets, "binary").toString("utf-8");
  } else if (/Content-Transfer-Encoding:\s*base64/i.test(brut)) {
    contenu = Buffer.from(contenu.replace(/\r?\n/g, ""), "base64").toString("utf-8");
  }

  const sujet = entetes.match(/^Subject: (.*)$/im)?.[1] || "";
  const destinataire = entetes.match(/^To: (.*)$/im)?.[1] || "";

  return {
    sujet: sujet.startsWith("=?")
      ? Buffer.from(sujet.replace(/^=\?[^?]+\?B\?(.*)\?=$/i, "$1"), "base64").toString("utf-8")
      : sujet,
    destinataire,
    contenu,
    brut,

    /** Premier lien du message pointant vers le chemin demandé. */
    lien(chemin) {
      const motif = new RegExp(`https?://[^\\s"'<>]*${chemin}[^\\s"'<>]*`);
      return contenu.match(motif)?.[0] || null;
    },
  };
}
