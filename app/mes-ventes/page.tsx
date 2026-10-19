import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoutonAnnuler } from "../ventes/BoutonAnnuler";
import { FormulaireModifierLigne } from "../ventes/FormulaireModifierLigne";

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

export default function PageMesVentes() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuMesVentes />
    </Suspense>
  );
}

async function ContenuMesVentes() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "commercial") redirect("/");

  const { data: fiche } = await supabase
    .from("commerciaux")
    .select("id")
    .eq("user_id", user.id)
    .eq("actif", true)
    .maybeSingle();

  // Ventes saisies aujourd'hui (date UTC, Abidjan = UTC).
  const debutJour = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString();

  const { data: produitsData } = await supabase.from("produits").select("id, nom").eq("actif", true).order("nom");
  const produits = produitsData ?? [];

  const { data } = fiche
    ? await supabase
        .from("ventes")
        .select("id, panier_id, produit_id, quantite, montant, statut, motif_annulation, created_at, produits(nom), evenements(nom)")
        .eq("commercial_id", fiche.id)
        .gte("created_at", debutJour)
        .order("created_at", { ascending: true })
    : { data: [] };

  const lignes = (data ?? []) as unknown as LigneVente[];

  const paniers = new Map<string, LigneVente[]>();
  for (const l of lignes) {
    const liste = paniers.get(l.panier_id) ?? [];
    liste.push(l);
    paniers.set(l.panier_id, liste);
  }

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Mes ventes du jour</h1>

      {!fiche && (
        <p className="erreur">Votre compte n&apos;est pas encore relié à une fiche commercial. Contactez le gérant.</p>
      )}

      {fiche && paniers.size === 0 && <p className="note">Vous n&apos;avez pas encore saisi de vente aujourd&apos;hui.</p>}

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
                    produitId={l.produit_id}
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

      <Link href="/ventes/nouvelle" className="bouton">Nouvelle vente</Link>
    </main>
  );
}
