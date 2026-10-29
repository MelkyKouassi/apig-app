import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormulaireAnnulerDepense, FormulaireDepense } from "./Formulaires";
import { libelleCategorie } from "./categories";

type LigneDepense = {
  id: string;
  date_depense: string;
  motif: string;
  categorie: string;
  quantite: number;
  prix_unitaire: number;
  montant: number;
  statut: string;
  motif_annulation: string | null;
  evenements: { nom: string } | null;
};

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const debutDuMois = () => `${aujourdhui().slice(0, 8)}01`;
const dateValide = (d: string | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);

export default function PageDepenses(props: { searchParams: Promise<{ debut?: string; fin?: string }> }) {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuDepenses searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ContenuDepenses({ searchParams }: { searchParams: Promise<{ debut?: string; fin?: string }> }) {
  const sp = await searchParams;
  const debut = dateValide(sp.debut) ?? debutDuMois();
  const fin = dateValide(sp.fin) ?? aujourdhui();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant" && profil?.role !== "comptable") redirect("/");

  const [{ data: depenses }, { data: lieux }] = await Promise.all([
    supabase
      .from("depenses")
      .select("id, date_depense, motif, categorie, quantite, prix_unitaire, montant, statut, motif_annulation, evenements(nom)")
      .gte("date_depense", debut)
      .lte("date_depense", fin)
      .order("date_depense", { ascending: false })
      .limit(300),
    supabase.from("evenements").select("id, nom").order("nom"),
  ]);

  const lignes = (depenses ?? []) as unknown as LigneDepense[];
  const totalActif = lignes
    .filter((l) => l.statut === "actif")
    .reduce((somme, l) => somme + Number(l.montant ?? 0), 0);

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Dépenses</h1>

      <form method="get" className="filtre-date">
        <input type="date" name="debut" defaultValue={debut} />
        <input type="date" name="fin" defaultValue={fin} />
        <button type="submit" className="secondaire">Afficher</button>
      </form>

      <p className="total">Total actif du {debut} au {fin} : {francs(totalActif)} ({lignes.filter((l) => l.statut === "actif").length} dépense(s))</p>

      <section className="carte-vente">
        <p className="entete"><strong>Nouvelle dépense</strong></p>
        <FormulaireDepense lieux={(lieux ?? []).map((l) => ({ id: l.id, nom: l.nom }))} />
      </section>

      <section className="carte-vente">
        <p className="entete"><strong>Dépenses de la période</strong></p>
        {lignes.length === 0 && <p className="note">Aucune dépense sur cette période.</p>}
        <div style={{ overflowX: "auto" }}>
          <table className="tableau">
            <thead>
              <tr><th>Date</th><th>Lieu</th><th>Motif</th><th>Catégorie</th><th className="nombre">Montant</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} className={l.statut === "annule" ? "annulee" : ""}>
                  <td>{l.date_depense}</td>
                  <td>{l.evenements?.nom ?? "—"}</td>
                  <td>{l.motif}<br /><span className="note">{l.quantite} × {francs(Number(l.prix_unitaire))}</span></td>
                  <td>{libelleCategorie(l.categorie)}</td>
                  <td className="nombre">{francs(Number(l.montant))}</td>
                  <td>
                    {l.statut === "annule" ? `Annulée : ${l.motif_annulation ?? ""}` : (
                      <details>
                        <summary className="lien">Annuler</summary>
                        <FormulaireAnnulerDepense id={l.id} />
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
