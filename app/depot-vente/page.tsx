import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RechercheLoupe } from "@/components/RechercheLoupe";
import { FormulaireReglementDepot } from "./FormulaireReglementDepot";
import { FormulaireQuantiteVendue, FormulaireRestitution } from "./FormulairesLigneDepot";
import { dateFr, dateHeureFr } from "@/lib/dates";

type LigneDepot = {
  id: string;
  tiers_id: string;
  tiers_nom: string;
  tiers_type: string;
  produit_nom: string;
  date_remise: string;
  quantite_confiee: number;
  quantite_donnee: number;
  quantite_vendue: number;
  quantite_restituee: number;
  quantite_a_payer: number;
  montant_du: number | null;
  prix_detail: number | null;
  prix_cession: number | null;
};

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
const libelleType = (t: string) => (t === "pharmacie" ? "Pharmacie" : t === "personnel" ? "Personnel" : t);

export default function PageDepotVente() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuDepotVente />
    </Suspense>
  );
}

async function ContenuDepotVente() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant" && profil?.role !== "comptable") redirect("/");
  const estGerant = profil.role === "gerant";

  const [{ data: lignes }, { data: reglements }] = await Promise.all([
    supabase.from("v_depots_lignes").select("*"),
    supabase.from("reglements").select("tiers_id, montant").eq("origine", "depot").eq("statut", "actif"),
  ]);

  const regleParTiers = new Map<string, number>();
  for (const r of reglements ?? []) {
    regleParTiers.set(r.tiers_id, (regleParTiers.get(r.tiers_id) ?? 0) + Number(r.montant ?? 0));
  }

  type Groupe = {
    id: string;
    nom: string;
    type: string;
    lignes: LigneDepot[];
    confiee: number;
    donnee: number;
    vendue: number;
    restituee: number;
    aPayer: number;
    du: number;
    marge: number;
    valeurRestituee: number;
  };
  const groupes = new Map<string, Groupe>();
  for (const l of (lignes ?? []) as LigneDepot[]) {
    if (!groupes.has(l.tiers_id)) {
      groupes.set(l.tiers_id, {
        id: l.tiers_id, nom: l.tiers_nom, type: l.tiers_type, lignes: [],
        confiee: 0, donnee: 0, vendue: 0, restituee: 0, aPayer: 0, du: 0, marge: 0, valeurRestituee: 0,
      });
    }
    const g = groupes.get(l.tiers_id)!;
    g.lignes.push(l);
    g.confiee += Number(l.quantite_confiee);
    g.donnee += Number(l.quantite_donnee);
    g.vendue += Number(l.quantite_vendue);
    g.restituee += Number(l.quantite_restituee);
    g.aPayer += Number(l.quantite_a_payer);
    g.du += Number(l.montant_du ?? 0);
    // Marge du destinataire : (prix de détail − prix de cession) × quantité vendue.
    g.marge += (Number(l.prix_detail ?? 0) - Number(l.prix_cession ?? 0)) * Number(l.quantite_vendue);
    // Valeur restituée : quantité restituée × prix de cession.
    g.valeurRestituee += Number(l.quantite_restituee) * Number(l.prix_cession ?? 0);
  }

  const liste = [...groupes.values()]
    .map((g) => ({ ...g, recu: regleParTiers.get(g.id) ?? 0 }))
    .map((g) => ({ ...g, reste: g.du - g.recu }))
    .sort((a, b) => b.reste - a.reste);

  const totalReste = liste.reduce((s, g) => s + g.reste, 0);

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <div className="entete-page">
        <h1>Dépôt-vente</h1>
        <RechercheLoupe />
      </div>
      {estGerant && <Link href="/depot-vente/nouveau" className="bouton">Nouveau dépôt</Link>}
      <p className="total">Reste à recevoir des dépôts : {francs(totalReste)} ({liste.length} destinataire(s))</p>
      {liste.length === 0 && <p className="note">Aucun dépôt enregistré.</p>}

      {liste.map((g) => (
        <section key={g.id} className="carte-vente">
          <p className="entete">
            <strong>{g.nom}</strong>
            <span className="badge">{libelleType(g.type)}</span>
          </p>
          <p>Montant dû : <strong>{francs(g.du)}</strong> · Reçu : {francs(g.recu)} · Reste : <strong>{francs(g.reste)}</strong></p>
          <p className="note">
            Confiées : {g.confiee} · Données : {g.donnee} · Vendues : {g.vendue} · Restituées : {g.restituee} · Restant chez le destinataire : {g.aPayer}
          </p>
          <p className="note">
            Marge du destinataire : {francs(g.marge)} · Valeur restituée : {francs(g.valeurRestituee)}
          </p>

          <details>
            <summary>Détail par produit ({g.lignes.length} ligne(s))</summary>
            {g.lignes.map((l) => (
              <div key={l.id} className="carte-vente">
                <p className="note">
                  {l.produit_nom} (remis le {dateFr(l.date_remise)}) : confiées {l.quantite_confiee}, données {l.quantite_donnee}, vendues {l.quantite_vendue}, restituées {l.quantite_restituee} · dû {francs(Number(l.montant_du ?? 0))}
                </p>
                {estGerant && (
                  <>
                    <FormulaireQuantiteVendue depotId={l.id} vendue={Number(l.quantite_vendue)} />
                    <FormulaireRestitution depotId={l.id} restant={Number(l.quantite_a_payer)} />
                  </>
                )}
              </div>
            ))}
          </details>

          {estGerant && <FormulaireReglementDepot tiersId={g.id} reste={g.reste} />}
        </section>
      ))}
    </main>
  );
}
