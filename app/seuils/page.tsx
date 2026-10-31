import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { enregistrerSeuils, type EtatSeuils } from "./actions";
import { FormulaireSeuils } from "./Formulaire";

export default function PageSeuils() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuSeuils />
    </Suspense>
  );
}

async function ContenuSeuils() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "commercial") redirect("/");

  const { data: fiche } = await supabase
    .from("commerciaux").select("id").eq("user_id", user.id).eq("actif", true).maybeSingle();

  const [{ data: produits }, { data: seuils }] = await Promise.all([
    supabase.from("produits").select("id, nom").eq("actif", true).order("nom"),
    fiche
      ? supabase.from("seuils_alerte").select("produit_id, seuil").eq("commercial_id", fiche.id)
      : Promise.resolve({ data: [] as { produit_id: string; seuil: number }[] }),
  ]);

  const seuilDe = new Map((seuils ?? []).map((s) => [s.produit_id, Number(s.seuil)]));

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Mes seuils d&apos;alerte</h1>
      <p className="note">
        Indiquez, pour chaque produit, à partir de combien d&apos;unités restantes vous voulez être averti pendant la vente.
        Laissez vide pour ne pas être averti. Le seuil est le vôtre : il ne concerne que votre saisie.
      </p>
      {!fiche ? (
        <p className="erreur">Votre compte n&apos;est pas encore relié à une fiche commercial. Contactez le gérant.</p>
      ) : (
        <FormulaireSeuils
          action={enregistrerSeuils as (etat: EtatSeuils, f: FormData) => Promise<EtatSeuils>}
          produits={(produits ?? []).map((p) => ({ id: p.id, nom: p.nom, seuil: seuilDe.get(p.id) ?? null }))}
        />
      )}
    </main>
  );
}
