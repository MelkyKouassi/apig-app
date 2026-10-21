import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormulaireProduction } from "./FormulaireProduction";
import { Sommaire } from "@/components/Sommaire";

type LigneStock = {
  evenement_id: string;
  evenement_nom: string;
  produit_id: string;
  produit_nom: string;
  quantite_produite: number;
  dons: number;
  quantite_vendue: number;
  stock_restant: number;
  taux_ecoulement: number | null;
  valeur_potentielle: number | null;
  stock_physique_compte: number | null;
  ecart: number | null;
};

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
const nombre = (n: number) => Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export default function PageStock() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuStock />
    </Suspense>
  );
}

async function ContenuStock() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant" && profil?.role !== "comptable") redirect("/");
  const estGerant = profil.role === "gerant";

  const [{ data: lignes }, { data: evenements }, { data: produits }] = await Promise.all([
    supabase.from("v_stock").select("*").order("evenement_nom").order("produit_nom"),
    supabase.from("evenements").select("id, nom").order("nom"),
    supabase.from("produits").select("id, nom").eq("actif", true).order("nom"),
  ]);

  const parEvenement = new Map<string, { nom: string; lignes: LigneStock[] }>();
  for (const l of (lignes ?? []) as LigneStock[]) {
    if (!parEvenement.has(l.evenement_id)) parEvenement.set(l.evenement_id, { nom: l.evenement_nom, lignes: [] });
    parEvenement.get(l.evenement_id)!.lignes.push(l);
  }

  const totalPotentiel = [...parEvenement.values()].reduce(
    (s, e) => s + e.lignes.reduce((t, l) => t + Number(l.valeur_potentielle ?? 0), 0), 0,
  );

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Stock et production</h1>
      <Sommaire items={[
        { id: "ajouter", libelle: "Ajouter une production" },
        { id: "stock", libelle: "Stock par événement" },
      ]} />
      <p className="total">Valeur de production potentielle : {francs(totalPotentiel)}</p>
      <p className="note">Stock restant = produite − dons − vendue. Les dépôts ne sont pas déduits.</p>

      {estGerant && (
        <section id="ajouter" className="carte-vente">
          <p className="entete"><strong>Ajouter une production</strong></p>
          <FormulaireProduction evenements={evenements ?? []} produits={produits ?? []} />
        </section>
      )}

      <h2 id="stock">Stock par événement</h2>
      {parEvenement.size === 0 && <p className="note">Aucune production enregistrée.</p>}

      {[...parEvenement.entries()].map(([id, e]) => (
        <section key={id} className="carte-vente">
          <p className="entete"><strong>{e.nom}</strong></p>
          {e.lignes.map((l) => {
            const negatif = Number(l.stock_restant) < 0;
            const ecart = l.ecart !== null && Math.abs(Number(l.ecart)) > 0.001;
            return (
              <div key={l.produit_id} className="ligne-vente">
                <p>
                  <strong>{l.produit_nom}</strong> : produite {nombre(l.quantite_produite)} · dons {nombre(l.dons)} · vendue {nombre(l.quantite_vendue)} ·{" "}
                  <span className={negatif ? "erreur" : ""}>restant {nombre(l.stock_restant)}</span> · écoulé{" "}
                  {l.taux_ecoulement === null ? "—" : `${Math.round(Number(l.taux_ecoulement) * 100)} %`} ·{" "}
                  valeur {francs(Number(l.valeur_potentielle ?? 0))}
                </p>
                {l.stock_physique_compte === null && <p className="note">Inventaire à saisir</p>}
                {l.stock_physique_compte !== null && (
                  <p className={ecart ? "erreur" : "note"}>
                    Compté {nombre(l.stock_physique_compte)} · écart {nombre(Number(l.ecart ?? 0))}
                  </p>
                )}
                {negatif && <p className="erreur">Stock négatif : vérifiez la production ou les ventes.</p>}
                {estGerant && (
                  <FormulaireProduction
                    evenementId={l.evenement_id}
                    produitId={l.produit_id}
                    quantiteProduite={Number(l.quantite_produite)}
                    dons={Number(l.dons)}
                    stockCompte={l.stock_physique_compte === null ? null : Number(l.stock_physique_compte)}
                  />
                )}
              </div>
            );
          })}
        </section>
      ))}
    </main>
  );
}
