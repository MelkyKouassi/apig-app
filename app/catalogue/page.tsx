import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormulairePrix, FormulaireProduit } from "./Formulaires";
import { basculerProduit } from "./actions";

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;

export default function PageCatalogue() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuCatalogue />
    </Suspense>
  );
}

async function ContenuCatalogue() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") redirect("/");

  const [{ data: produits }, { data: prix }, { data: prixEvt }, { data: cessions }, { data: evenements }] = await Promise.all([
    supabase.from("produits").select("id, nom, prix_base, actif").order("nom"),
    supabase.from("prix").select("id, produit_id, date_effet, prix_unitaire").order("date_effet", { ascending: false }),
    supabase.from("prix_evenement").select("id, produit_id, evenement_id, date_effet, prix_unitaire").order("date_effet", { ascending: false }).limit(30),
    supabase.from("produit_cession").select("produit_id, coefficient"),
    supabase.from("evenements").select("id, nom").order("nom"),
  ]);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const nomProduit = new Map((produits ?? []).map((p) => [p.id, p.nom]));
  const nomEvenement = new Map((evenements ?? []).map((e) => [e.id, e.nom]));
  const coefficient = new Map((cessions ?? []).map((c) => [c.produit_id, Number(c.coefficient)]));

  // Prix en vigueur : la ligne la plus récente dont la date d'effet est aujourd'hui ou avant (liste triée du plus récent).
  const prixDuJour = (produitId: string) =>
    (prix ?? []).find((p) => p.produit_id === produitId && p.date_effet <= aujourdhui)?.prix_unitaire;

  const historique = [
    ...(prix ?? []).map((p) => ({ cle: `b${p.id}`, date: p.date_effet, produit: nomProduit.get(p.produit_id) ?? "", lieu: "Prix de base", montant: Number(p.prix_unitaire) })),
    ...(prixEvt ?? []).map((p) => ({ cle: `e${p.id}`, date: p.date_effet, produit: nomProduit.get(p.produit_id) ?? "", lieu: nomEvenement.get(p.evenement_id) ?? "Événement", montant: Number(p.prix_unitaire) })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 30);

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Catalogue et prix</h1>
      <p className="note">Un changement de prix crée une nouvelle ligne datée. Les ventes déjà enregistrées gardent leur prix.</p>

      <section className="carte-vente">
        <p className="entete"><strong>Produits</strong></p>
        <div style={{ overflowX: "auto" }}>
          <table className="tableau">
            <thead><tr><th>Produit</th><th>Prix actuel</th><th>Coefficient</th><th>Actif</th><th></th></tr></thead>
            <tbody>
              {(produits ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{p.nom}</td>
                  <td>{francs(Number(prixDuJour(p.id) ?? p.prix_base))}</td>
                  <td>{coefficient.get(p.id) ?? "—"}</td>
                  <td>{p.actif ? "Oui" : "Non"}</td>
                  <td>
                    <form action={basculerProduit.bind(null, p.id, !p.actif)}>
                      <button type="submit" className="secondaire petit">{p.actif ? "Désactiver" : "Réactiver"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="carte-vente">
        <p className="entete"><strong>Nouveau prix</strong></p>
        <FormulairePrix produits={(produits ?? []).map((p) => ({ id: p.id, nom: p.nom }))} evenements={(evenements ?? []).map((e) => ({ id: e.id, nom: e.nom }))} />
      </section>

      <section className="carte-vente">
        <p className="entete"><strong>Ajouter un produit</strong></p>
        <FormulaireProduit />
      </section>

      <section className="carte-vente">
        <p className="entete"><strong>Historique des prix (30 dernières lignes)</strong></p>
        <ul>
          {historique.map((h) => (
            <li key={h.cle}>{h.date} · {h.produit} · {h.lieu} · {francs(h.montant)}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
