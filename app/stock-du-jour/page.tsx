import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormulaireStock } from "./Formulaire";

export default function PageStockDuJour({ searchParams }: { searchParams: Promise<{ lieu?: string }> }) {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuStockDuJour searchParams={searchParams} />
    </Suspense>
  );
}

async function ContenuStockDuJour({ searchParams }: { searchParams: Promise<{ lieu?: string }> }) {
  const { lieu } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "commercial") redirect("/");

  const { data: fiche } = await supabase
    .from("commerciaux").select("id").eq("user_id", user.id).eq("actif", true).maybeSingle();

  const [{ data: evenements }, { data: produits }] = await Promise.all([
    supabase.from("evenements").select("id, nom").order("nom"),
    supabase.from("produits").select("id, nom").eq("actif", true).order("nom"),
  ]);

  const lieuChoisi = (evenements ?? []).find((e) => e.id === lieu) ?? (evenements ?? [])[0];

  let stock: { produit_id: string; quantite: number }[] = [];
  let statut: "attente" | "valide" | "confirme" = "attente";
  if (fiche && lieuChoisi) {
    const [{ data: lignes }, { data: validation }] = await Promise.all([
      supabase.from("stock_depart").select("produit_id, quantite")
        .eq("evenement_id", lieuChoisi.id).eq("commercial_id", fiche.id),
      supabase.from("validation_stock").select("valide_le, confirme_le")
        .eq("evenement_id", lieuChoisi.id).eq("commercial_id", fiche.id).maybeSingle(),
    ]);
    stock = (lignes ?? []).map((l) => ({ produit_id: l.produit_id, quantite: Number(l.quantite) }));
    if (validation?.valide_le && validation?.confirme_le) statut = "confirme";
    else if (validation?.valide_le) statut = "valide";
  }

  const quantiteDe = new Map(stock.map((s) => [s.produit_id, s.quantite]));
  const messageStatut = {
    attente: "En attente de validation par le gérant ou le chef d'équipe. Vous ne pouvez pas encore vendre sur ce lieu.",
    valide: "Stock validé. Vérifiez les quantités puis confirmez-les pour pouvoir vendre.",
    confirme: "Stock confirmé : vous pouvez vendre sur ce lieu.",
  }[statut];

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Mon stock du jour</h1>
      <p className="note">
        Indiquez le stock que vous emportez pour le lieu. Il doit être validé par le gérant ou le chef d&apos;équipe,
        puis confirmé par vous, avant toute vente. Toute modification remet la validation à zéro.
      </p>

      {!fiche ? (
        <p className="erreur">Votre compte n&apos;est pas encore relié à une fiche commercial. Contactez le gérant.</p>
      ) : !lieuChoisi ? (
        <p className="note">Aucun lieu enregistré pour le moment.</p>
      ) : (
        <>
          <form method="get" className="formulaire">
            <label>
              Lieu
              <select name="lieu" defaultValue={lieuChoisi.id}>
                {(evenements ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{e.nom}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="secondaire">Afficher</button>
          </form>

          <p className={statut === "confirme" ? "succes" : "note"}>{messageStatut}</p>

          <FormulaireStock
            evenementId={lieuChoisi.id}
            statut={statut}
            produits={(produits ?? []).map((p) => ({ id: p.id, nom: p.nom, quantite: quantiteDe.get(p.id) ?? null }))}
          />
        </>
      )}
    </main>
  );
}
