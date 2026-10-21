// Mise en page d'un bulletin de paie (A4). Partagée par le bulletin individuel et l'impression groupée.

export const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F CFA`;
const vide = (v: string | null | undefined, repli = "à compléter") => (v && v.trim() ? v : repli);

export type EntrepriseBulletin = {
  raison_sociale?: string | null;
  adresse?: string | null;
  ville?: string | null;
  telephone?: string | null;
  rccm?: string | null;
  compte_contribuable?: string | null;
  numero_cnps?: string | null;
  signataire?: string | null;
  signataire_qualite?: string | null;
} | null;

export type CollaborateurBulletin = {
  id: string;
  nom: string;
  parts: number;
  matricule: string | null;
  fonction: string | null;
  date_entree: string | null;
  mode_paiement: string | null;
  numero_cnps: string | null;
};

// Styles communs : à placer une seule fois dans la page.
export const STYLE_BULLETIN = `
  .bulletin { max-width: 760px; margin: 0 auto; padding: 24px; font-size: 14px; background: #fff; color: #111; }
  .bulletin table { width: 100%; border-collapse: collapse; }
  .bulletin th, .bulletin td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
  .bulletin .nombre { text-align: right; }
  .bulletin h1 { font-size: 20px; margin: 12px 0; text-align: center; }
  .bulletin .entete-entreprise { display: flex; justify-content: space-between; gap: 16px; }
  .bulletin + .bulletin { break-before: page; page-break-before: always; }
  @page { size: A4; margin: 14mm; }
  @media print {
    .no-print, .retour { display: none !important; }
    body { background: #fff; }
    .bulletin { padding: 0; }
  }
`;

type Props = {
  entreprise: EntrepriseBulletin;
  collab: CollaborateurBulletin;
  annee: number;
  mois: number;
  totalParts: number;
  enveloppe: number;
  du: number;
  verse: number;
};

export function BulletinPaie({ entreprise, collab, annee, mois, totalParts, enveloppe, du, verse }: Props) {
  const net = du; // aucune retenue facultative saisie à ce jour
  return (
    <section className="bulletin">
      <div className="entete-entreprise">
        <div>
          <strong>{entreprise?.raison_sociale ?? "APIG-PHARMA"}</strong><br />
          {vide(entreprise?.adresse, "")}<br />
          {vide(entreprise?.ville, "")}<br />
          Tél. {vide(entreprise?.telephone, "—")}
        </div>
        <div>
          RCCM : {vide(entreprise?.rccm, "—")}<br />
          N° contribuable : {vide(entreprise?.compte_contribuable, "—")}<br />
          N° CNPS employeur : {vide(entreprise?.numero_cnps)}
        </div>
      </div>

      <h1>BULLETIN DE PAIE — {NOMS_MOIS[mois - 1].toUpperCase()} {annee}</h1>

      <table>
        <tbody>
          <tr><th style={{ width: "32%" }}>Nom et prénoms</th><td>{collab.nom}</td><th style={{ width: "18%" }}>Matricule</th><td>{vide(collab.matricule, "—")}</td></tr>
          <tr><th>Fonction</th><td>{vide(collab.fonction, "—")}</td><th>Date d&apos;entrée</th><td>{vide(collab.date_entree, "—")}</td></tr>
          <tr><th>N° CNPS</th><td>{vide(collab.numero_cnps)}</td><th>Mode de paiement</th><td>{vide(collab.mode_paiement, "—")}</td></tr>
        </tbody>
      </table>

      <h1 style={{ fontSize: 16 }}>Détail de la rémunération</h1>
      <table>
        <thead>
          <tr><th>Libellé</th><th className="nombre">Base</th><th className="nombre">Montant</th></tr>
        </thead>
        <tbody>
          <tr><td>Part de l&apos;enveloppe du mois ({collab.parts} part{collab.parts > 1 ? "s" : ""} sur {totalParts})</td><td className="nombre">{francs(enveloppe)}</td><td className="nombre">{francs(du)}</td></tr>
          <tr><td>Retenues facultatives</td><td className="nombre">—</td><td className="nombre">0 F CFA</td></tr>
          <tr><th>Net à payer</th><td></td><th className="nombre">{francs(net)}</th></tr>
          <tr><td>Déjà versé pour ce mois</td><td></td><td className="nombre">{francs(verse)}</td></tr>
          <tr><th>Reste à verser</th><td></td><th className="nombre">{francs(net - verse)}</th></tr>
        </tbody>
      </table>

      <p style={{ marginTop: 24 }}>
        Fait à {vide(entreprise?.ville, "Abidjan")}, le ____________
      </p>
      <p style={{ display: "flex", justifyContent: "space-between", marginTop: 32 }}>
        <span>Le collaborateur<br /><br />______________________</span>
        <span>{vide(entreprise?.signataire, "Le gérant")}<br />{vide(entreprise?.signataire_qualite, "")}<br /><br />______________________</span>
      </p>
    </section>
  );
}
