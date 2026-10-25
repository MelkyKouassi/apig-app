import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormulaireMode, FormulairePrix, FormulaireProduit } from "./Formulaires";
import { basculerProduit } from "./actions";

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
const nomType = (t: string) => (t === "promotionnel" ? "promotionnel" : "normal");

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

  const [{ data: produits }, { data: prix }, { data: prixEvt }, { data: cessions }, { data: evenements }, { data: modes }] = await Promise.all([
    supabase.from("produits").select("id, nom, prix_base, actif").order("nom"),
    supabase.from("prix").select("id, produit_id, date_effet, prix_unitaire, type_prix").order("date_effet", { ascending: false }),
    supabase.from("prix_evenement").select("id, produit_id, evenement_id, date_effet, prix_unitaire, type_prix").order("date_effet", { ascending: false }).limit(30),
    supabase.from("produit_cession").select("produit_id, coefficient"),
    supabase.from("evenements").select("id, nom").order("nom"),
    supabase.from("mode_prix").select("date_effet, mode").order("date_effet", { ascending: false }),
  ]);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const nomProduit = new Map((produits ?? []).map((p) => [p.id, p.nom]));
  const nomEvenement = new Map((evenements ?? []).map((e) => [e.id, e.nom]));
  const coefficient = new Map((cessions ?? []).map((c) => [c.produit_id, Number(c.coefficient)]));

  // Mode en vigueur aujourd'hui (le plus récent dont la date est passée) et changements à venir.
  const modeEnVigueur = (modes ?? []).find((m) => m.date_effet <= aujourdhui);
  const modeActuel = modeEnVigueur?.mode === "promotionnel" ? "promotionnel" : "normal";
  const changementsPrevus = (modes ?? []).filter((m) => m.date_effet > aujourdhui).reverse();

  // Prix en vigueur d'un type : la ligne la plus récente dont la date d'effet est aujourd'hui ou avant.
  const prixDuJour = (produitId: string, type: "normal" | "promotionnel") =>
    (prix ?? []).find((p) => p.produit_id === produitId && p.type_prix === type && p.date_effet <= aujourdhui)?.prix_unitaire;

  const historique = [
    ...(prix ?? []).map((p) => ({ cle: `b${p.id}`, date: p.date_effet, produit: nomProduit.get(p.produit_id) ?? "", lieu: "Prix de base", type: nomType(p.type_prix), montant: Number(p.prix_unitaire) })),
    ...(prixEvt ?? []).map((p) => ({ cle: `e${p.id}`, date: p.date_effet, produit: nomProduit.get(p.produit_id) ?? "", lieu: nomEvenement.get(p.evenement_id) ?? "Événement", type: nomType(p.type_prix), montant: Number(p.prix_unitaire) })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 30);

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Catalogue et prix</h1>
      <p className="note">Un changement de prix crée une nouvelle ligne datée. Chaque produit a un prix normal et un prix promotionnel ; sans prix promotionnel, c&apos;est le prix normal qui s&apos;applique.</p>

      <section className="carte-vente">
        <p className="entete"><strong>Prix appliqué</strong></p>
        <p>
          Aujourd&apos;hui : <strong>prix {modeActuel}</strong>
          {modeEnVigueur ? ` (depuis le ${modeEnVigueur.date_effet})` : ""}.
        </p>
        {changementsPrevus.map((m) => (
          <p key={m.date_effet} className="note">Changement prévu le {m.date_effet} : prix {nomType(m.mode)}.</p>
        ))}
        <p className="note">Ce réglage s&apos;applique à tous les produits et à tous les lieux, pour les ventes, les primes et le dépôt-vente. Les ventes déjà enregistrées à partir de la date choisie sont recalculées.</p>
        <FormulaireMode />
      </section>

      <section className="carte-vente">
        <p className="entete"><strong>Produits</strong></p>
        <div style={{ overflowX: "auto" }}>
          <table className="tableau">
            <thead><tr><th>Produit</th><th className="nombre">Prix normal</th><th className="nombre">Prix promo</th><th className="nombre">Coefficient</th><th>Actif</th><th></th></tr></thead>
            <tbody>
              {(produits ?? []).map((p) => {
                const normal = Number(prixDuJour(p.id, "normal") ?? p.prix_base ?? 0);
                const promo = prixDuJour(p.id, "promotionnel");
                return (
                  <tr key={p.id}>
                    <td>{p.nom}</td>
                    <td className="nombre">{francs(normal)}</td>
                    <td className="nombre">{promo === undefined ? "— (normal)" : francs(Number(promo))}</td>
                    <td className="nombre">{coefficient.get(p.id) ?? "—"}</td>
                    <td>{p.actif ? "Oui" : "Non"}</td>
                    <td>
                      <form action={basculerProduit.bind(null, p.id, !p.actif)}>
                        <button type="submit" className="secondaire petit">{p.actif ? "Désactiver" : "Réactiver"}</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
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
            <li key={h.cle}>{h.date} · {h.produit} · {h.lieu} · prix {h.type} · {francs(h.montant)}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
