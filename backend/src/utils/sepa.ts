/**
 * Le fichier de virements groupés SEPA (pain.001.001.03).
 *
 * C'est le format que les banques belges acceptent à l'import — KBC/CBC
 * (KBC Business Dashboard, Isabel), Belfius, BNP Paribas Fortis, ING : un
 * seul fichier, une seule signature, et tous les commerçants et livreurs sont
 * payés.
 */

export interface VirementSepa {
  /** Identifiant unique, repris sur le relevé bancaire du bénéficiaire. */
  id: string;
  nom: string;
  iban: string;
  bic?: string | null;
  montant: number;
  /** La communication libre, 140 caractères au plus. */
  communication: string;
}

export interface DonneurDOrdre {
  nom: string;
  iban: string;
  bic?: string | null;
}

/** Retire espaces et met en majuscules : « be68 5390 0754 7034 » → « BE68539007547034 ». */
export const ibanNormalise = (iban: string) => iban.replace(/\s+/g, "").toUpperCase();

/** Un IBAN valide : format et clé de contrôle (modulo 97). */
export function ibanValide(iban: string | null | undefined) {
  if (!iban) return false;
  const brut = ibanNormalise(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(brut)) return false;
  const deplace = brut.slice(4) + brut.slice(0, 4);
  const chiffres = deplace.replace(/[A-Z]/g, (l) => String(l.charCodeAt(0) - 55));
  let reste = 0;
  for (const c of chiffres) reste = (reste * 10 + Number(c)) % 97;
  return reste === 1;
}

/**
 * Le jeu de caractères SEPA est restreint : les banques rejettent un fichier
 * avec « é », « & » ou un emoji. On garde le sens, sans les accents.
 */
export function texteSepa(texte: string, max: number) {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Le jour (AAAA-MM-JJ) à Bruxelles : minuit belge tombe la veille en UTC. */
export const dateBruxelles = (instant: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);

const xml = (texte: string) =>
  texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Le fichier pain.001.001.03, prêt à importer dans la banque. */
export function fichierSepa(
  donneur: DonneurDOrdre,
  virements: VirementSepa[],
  options: { reference: string; dateExecution: Date; maintenant?: Date }
) {
  const total = virements.reduce((s, v) => s + Math.round(v.montant * 100), 0) / 100;
  const maintenant = options.maintenant ?? new Date();
  const ref = texteSepa(options.reference, 35);
  // La date à Bruxelles : à 00 h 05 le lundi, il est encore dimanche en UTC, et
  // une date d'exécution passée fait rejeter le fichier.
  const jour = dateBruxelles(options.dateExecution);

  const transactions = virements
    .map(
      (v) => `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${xml(texteSepa(v.id, 35))}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${v.montant.toFixed(2)}</InstdAmt></Amt>${
          v.bic ? `\n        <CdtrAgt><FinInstnId><BIC>${xml(v.bic.replace(/\s+/g, "").toUpperCase())}</BIC></FinInstnId></CdtrAgt>` : ""
        }
        <Cdtr><Nm>${xml(texteSepa(v.nom, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${ibanNormalise(v.iban)}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${xml(texteSepa(v.communication, 140))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${xml(ref)}</MsgId>
      <CreDtTm>${maintenant.toISOString().slice(0, 19)}</CreDtTm>
      <NbOfTxs>${virements.length}</NbOfTxs>
      <CtrlSum>${total.toFixed(2)}</CtrlSum>
      <InitgPty><Nm>${xml(texteSepa(donneur.nom, 70))}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${xml(ref)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${virements.length}</NbOfTxs>
      <CtrlSum>${total.toFixed(2)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${jour}</ReqdExctnDt>
      <Dbtr><Nm>${xml(texteSepa(donneur.nom, 70))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${ibanNormalise(donneur.iban)}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId>${
        donneur.bic ? `<BIC>${xml(donneur.bic.replace(/\s+/g, "").toUpperCase())}</BIC>` : "<Othr><Id>NOTPROVIDED</Id></Othr>"
      }</FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${transactions}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}
