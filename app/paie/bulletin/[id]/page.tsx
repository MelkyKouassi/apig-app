import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { chargerPaie } from "@/lib/paie-donnees";
import { BoutonImprimer } from "@/components/BoutonImprimer";

const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F CFA`;
const vide = (v: string | null | undefined, repli = "à compléter") => (v && v.trim() ? v : repli);

type Params = { mois?: string };

export default function PageBulletin(props: PageProps<"/paie/bulletin/[id]">) {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuBulletin params={props.params as Promise<{ id: string }>} searchParams={props.searchParams as Promise<Params>} />
    </Suspense>
  );
}

async function ContenuBulletin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant" && profil?.role !== "comptable") redirect("/");

  const [paie, { data: collab }, { data: entreprise }] = await Promise.all([
    chargerPaie(supabase),
    supabase.from("collaborateurs").select("id, nom, parts, matricule, fonction, date_entree, mode_paiement, numero_cnps").eq("id", id).maybeSingle(),
    supabase.from("entreprise").select("*").limit(1).maybeSingle(),
  ]);
  if (!collab) notFound();

  const dernierMois = Math.max(1, ...paie.lignes.filter((l) => l.enveloppe > 0).map((l) => l.mois));
  const mois = Math.min(12, Math.max(1, Number(sp.mois ?? dernierMois)));
  const du = paie.duParMois.get(id)?.[mois - 1] ?? 0;
  const verse = paie.versements.filter((v) => v.collaborateur_id === id && v.mois === mois).reduce((s, v) => s + v.montant, 0);
  const net = du; // aucune retenue facultative saisie à ce jour
  const enveloppe = paie.lignes[mois - 1]?.enveloppe ?? 0;

  return (
    <main className="bulletin">
      <style>{`
        .bulletin { max-width: 760px; margin: 0 auto; padding: 24px; font-size: 14px; background: #fff; color: #111; }
        .bulletin table { width: 100%; border-collapse: collapse; }
        .bulletin th, .bulletin td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
        .bulletin .nombre { text-align: right; }
        .bulletin h1 { font-size: 20px; margin: 12px 0; text-align: center; }
        .bulletin .entete-entreprise { display: flex; justify-content: space-between; gap: 16px; }
        @page { size: A4; margin: 14mm; }
        @media print {
          .no-print, .retour { display: none !important; }
          body { background: #fff; }
          .bulletin { padding: 0; }
        }
      `}</style>

      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <Link href="/paie" className="retour">← Paie</Link>
        <BoutonImprimer />
      </div>

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

      <h1>BULLETIN DE PAIE — {NOMS_MOIS[mois - 1].toUpperCase()} {paie.annee}</h1>

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
          <tr><td>Part de l&apos;enveloppe du mois ({collab.parts} part{collab.parts > 1 ? "s" : ""} sur {paie.totalParts})</td><td className="nombre">{francs(enveloppe)}</td><td className="nombre">{francs(du)}</td></tr>
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
    </main>
  );
}
