import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RechercheLoupe } from "@/components/RechercheLoupe";
import { BoutonAnnuler } from "./BoutonAnnuler";
import { FormulaireModifierLigne } from "./FormulaireModifierLigne";

type LigneVente = {
  id: string;
  panier_id: string;
  produit_id: string;
  quantite: number;
  montant: number | null;
  statut: string;
  motif_annulation: string | null;
  created_at: string;
  produits: { nom: string } | null;
  evenements: { nom: string } | null;
};

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

export default function PageVentes(props: PageProps<"/ventes">) {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuVentes searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ContenuVentes({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateBrute } = await searchParams;
  const date = dateBrute && /^\d{4}-\d{2}-\d{2}$/.test(dateBrute) ? dateBrute : aujourdhui();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") redirect("/");

  const { data: produitsData } = await supabase.from("produits").select("id, nom").eq("actif", true).order("nom");
  const produits = produitsData ?? [];

  const { data } = await supabase
    .from("ventes")
    .select("id, panier_id, produit_id, quantite, montant, statut, motif_annulation, created_at, produits(nom), evenements(nom)")
    .eq("date_vente", date)
    .order("created_at", { ascending: true });

  const lignes = (data ?? []) as unknown as LigneVente[];

  // Regroupe les lignes par panier (une vente = un panier).
  const paniers = new Map<string, LigneVente[]>();
  for (const l of lignes) {
    const liste = paniers.get(l.panier_id) ?? [];
    liste.push(l);
    paniers.set(l.panier_id, liste);
  }

  const totalActif = lignes
    .filter((l) => l.statut === "actif")
    .reduce((somme, l) => somme + Number(l.montant ?? 0), 0);

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <div className="entete-page">
        <h1>Ventes du jour</h1>
        <RechercheLoupe />
      </div>

      <form method="get" className="filtre-date">
        <input type="date" name="date" defaultValue={date} />
        <button type="submit" className="secondaire">Afficher</button>
      </form>

      <p className="total">Total actif : {francs(totalActif)} ({paniers.size} vente(s))</p>

      {paniers.size === 0 && <p className="note">Aucune vente enregistrée à cette date.</p>}

      {[...paniers.entries()].map(([panierId, ligneDuPanier]) => {
        const annule = ligneDuPanier.every((l) => l.statut === "annule");
        const totalPanier = ligneDuPanier.reduce((s, l) => s + Number(l.montant ?? 0), 0);
        const heure = new Date(ligneDuPanier[0].created_at).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Africa/Abidjan",
        });

        return (
          <section key={panierId} className={`carte-vente ${annule ? "annulee" : ""}`}>
            <p className="entete">
              <strong>{ligneDuPanier[0].evenements?.nom ?? "Événement"}</strong> · {heure}
              {annule && <span className="badge">Annulée</span>}
            </p>
            {annule ? (
              <ul>
                {ligneDuPanier.map((l) => (
                  <li key={l.id}>
                    {l.produits?.nom ?? "Produit"} × {l.quantite} : {francs(Number(l.montant ?? 0))}
                  </li>
                ))}
              </ul>
            ) : (
              ligneDuPanier.map((l) => (
                <div key={l.id} className="ligne-editable">
                  <p className="note">{l.produits?.nom ?? "Produit"} × {l.quantite} : {francs(Number(l.montant ?? 0))}</p>
                  <FormulaireModifierLigne
                    ligneId={l.id}
                    produitId={(l as unknown as { produit_id: string }).produit_id}
                    quantite={l.quantite}
                    produits={produits}
                  />
                </div>
              ))
            )}
            {annule ? (
              <p className="note">Motif : {ligneDuPanier[0].motif_annulation ?? "non précisé"}</p>
            ) : (
              <>
                <p className="total">{francs(totalPanier)}</p>
                <BoutonAnnuler panierId={panierId} />
              </>
            )}
          </section>
        );
      })}
    </main>
  );
}
