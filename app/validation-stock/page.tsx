import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoutonValider, BoutonValiderMouvement, FormulaireChef } from "./Formulaire";

type Membre = { commercial_id: string; nom: string; est_chef: boolean };
type LigneMouvement = { id: string; commercial: string; produit: string; quantite: number };

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
    const [{ data: membres }, { data: stocks }, { data: validations }, { data: produits }] = await Promise.all([
      supabase.rpc("membres_du_lieu", { p_evenement: lieuChoisi.id }),
      supabase.from("stock_depart").select("commercial_id, quantite, produit_id").eq("evenement_id", lieuChoisi.id),
      supabase.from("validation_stock").select("commercial_id, valide_le, confirme_le").eq("evenement_id", lieuChoisi.id),
      supabase.from("produits").select("id, nom"),
    ]);
    const listeMembres = (membres ?? []) as Membre[];
    affectes = listeMembres.map((m) => ({ id: m.commercial_id, nom: m.nom }));
    chefActuel = listeMembres.find((m) => m.est_chef)?.commercial_id ?? null;

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

  // Compléments à valider et restitutions à contrôler, pour le lieu choisi.
  let mouvementsEnAttente: LigneMouvement[] = [];
  let restitutions: LigneMouvement[] = [];
  if (lieuChoisi) {
    const { data: mv } = await supabase.from("mouvements_stock_lieu")
      .select("id, commercial_id, produit_id, type, quantite, statut")
      .eq("evenement_id", lieuChoisi.id).order("declare_le", { ascending: false });
    const { data: tousProduits } = await supabase.from("produits").select("id, nom");
    const { data: tousMembres } = await supabase.rpc("membres_du_lieu", { p_evenement: lieuChoisi.id });
    const nomP = new Map((tousProduits ?? []).map((p) => [p.id, p.nom]));
    const nomC = new Map(((tousMembres ?? []) as Membre[]).map((c) => [c.commercial_id, c.nom]));
    const ligne = (m: { id: string; commercial_id: string; produit_id: string; quantite: number | string }): LigneMouvement => ({
      id: m.id,
      commercial: nomC.get(m.commercial_id) ?? "Commercial",
      produit: nomP.get(m.produit_id) ?? "Produit",
      quantite: Number(m.quantite),
    });
    mouvementsEnAttente = (mv ?? []).filter((m) => m.type === "complement" && m.statut === "en_attente").map(ligne);
    restitutions = (mv ?? []).filter((m) => m.type === "restitution").map(ligne);
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

              {mouvementsEnAttente.length > 0 && (
                <section className="carte">
                  <h2>Compléments à valider</h2>
                  {mouvementsEnAttente.map((m) => (
                    <div key={m.id} className="validation-bouton">
                      <p>{m.commercial} : {m.quantite} × {m.produit}</p>
                      <BoutonValiderMouvement mouvementId={m.id} />
                    </div>
                  ))}
                </section>
              )}

              {restitutions.length > 0 && (
                <section className="carte">
                  <h2>Restitutions déclarées</h2>
                  <ul>
                    {restitutions.map((m) => (
                      <li key={m.id}>{m.commercial} : {m.quantite} × {m.produit}</li>
                    ))}
                  </ul>
                </section>
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
