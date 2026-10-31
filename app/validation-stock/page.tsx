import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoutonValider, FormulaireChef } from "./Formulaire";

export default function PageValidationStock({ searchParams }: { searchParams: Promise<{ lieu?: string }> }) {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuValidation searchParams={searchParams} />
    </Suspense>
  );
}

async function ContenuValidation({ searchParams }: { searchParams: Promise<{ lieu?: string }> }) {
  const { lieu } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profil?.role ?? "";
  if (role !== "gerant" && role !== "commercial") redirect("/");

  // Le gérant voit tous les lieux. Un commercial ne voit que les lieux dont il est chef d'équipe.
  let lieux: { id: string; nom: string }[] = [];
  let monId: string | null = null;
  if (role === "gerant") {
    const { data } = await supabase.from("evenements").select("id, nom").order("nom");
    lieux = data ?? [];
  } else {
    const { data: fiche } = await supabase
      .from("commerciaux").select("id").eq("user_id", user.id).eq("actif", true).maybeSingle();
    monId = fiche?.id ?? null;
    if (monId) {
      const { data: chefs } = await supabase
        .from("evenement_commerciaux").select("evenement_id").eq("commercial_id", monId).eq("est_chef", true);
      const ids = (chefs ?? []).map((c) => c.evenement_id);
      if (ids.length > 0) {
        const { data } = await supabase.from("evenements").select("id, nom").in("id", ids).order("nom");
        lieux = data ?? [];
      }
    }
  }

  const lieuChoisi = lieux.find((l) => l.id === lieu) ?? lieux[0];

  let blocs: { commercialId: string; nom: string; lignes: { produit: string; quantite: number }[]; statut: "attente" | "valide" | "confirme" }[] = [];
  let affectes: { id: string; nom: string }[] = [];
  let chefActuel: string | null = null;

  if (lieuChoisi) {
    const [{ data: affectations }, { data: stocks }, { data: validations }, { data: produits }] = await Promise.all([
      supabase.from("evenement_commerciaux").select("commercial_id, est_chef").eq("evenement_id", lieuChoisi.id),
      supabase.from("stock_depart").select("commercial_id, quantite, produit_id").eq("evenement_id", lieuChoisi.id),
      supabase.from("validation_stock").select("commercial_id, valide_le, confirme_le").eq("evenement_id", lieuChoisi.id),
      supabase.from("produits").select("id, nom"),
    ]);
    const idsAffectes = (affectations ?? []).map((a) => a.commercial_id);
    chefActuel = (affectations ?? []).find((a) => a.est_chef)?.commercial_id ?? null;

    const { data: noms } = idsAffectes.length > 0
      ? await supabase.from("commerciaux").select("id, nom").in("id", idsAffectes).order("nom")
      : { data: [] as { id: string; nom: string }[] };
    affectes = noms ?? [];

    const nomProduit = new Map((produits ?? []).map((p) => [p.id, p.nom]));
    blocs = affectes.map((c) => {
      const v = (validations ?? []).find((x) => x.commercial_id === c.id);
      const statut: "attente" | "valide" | "confirme" = v?.valide_le && v?.confirme_le ? "confirme" : v?.valide_le ? "valide" : "attente";
      return {
        commercialId: c.id,
        nom: c.nom,
        lignes: (stocks ?? [])
          .filter((s) => s.commercial_id === c.id)
          .map((s) => ({ produit: nomProduit.get(s.produit_id) ?? "Produit", quantite: Number(s.quantite) })),
        statut,
      };
    });
  }

  const libelle = { attente: "À valider", valide: "Validé, à confirmer par le commercial", confirme: "Confirmé : vente possible" };

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Validation du stock</h1>

      {lieux.length === 0 ? (
        <p className="note">Aucun lieu à valider pour le moment.</p>
      ) : (
        <>
          <form method="get" className="formulaire">
            <label>
              Lieu
              <select name="lieu" defaultValue={lieuChoisi?.id}>
                {lieux.map((l) => (
                  <option key={l.id} value={l.id}>{l.nom}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="secondaire">Afficher</button>
          </form>

          {lieuChoisi && (
            <>
              {role === "gerant" && (
                <FormulaireChef
                  evenementId={lieuChoisi.id}
                  commerciaux={affectes}
                  chefActuel={chefActuel}
                />
              )}

              {blocs.length === 0 ? (
                <p className="note">Aucun commercial affecté à ce lieu.</p>
              ) : (
                blocs.map((b) => (
                  <section key={b.commercialId} className="carte">
                    <h2>{b.nom}</h2>
                    <p className="note">{libelle[b.statut]}</p>
                    {b.lignes.length === 0 ? (
                      <p className="note">Aucun stock saisi.</p>
                    ) : (
                      <ul>
                        {b.lignes.map((l) => (
                          <li key={l.produit}>{l.produit} : {l.quantite}</li>
                        ))}
                      </ul>
                    )}
                    {b.statut === "attente" && b.lignes.length > 0 && (
                      <BoutonValider evenementId={lieuChoisi.id} commercialId={b.commercialId} />
                    )}
                  </section>
                ))
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
