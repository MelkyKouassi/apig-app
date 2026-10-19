import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormulaireNouveauDepot } from "./FormulaireNouveauDepot";

export default function PageNouveauDepot() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuNouveauDepot />
    </Suspense>
  );
}

async function ContenuNouveauDepot() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") redirect("/depot-vente");

  const [{ data: destinataires }, { data: produits }] = await Promise.all([
    supabase.from("tiers").select("id, nom, type").in("type", ["pharmacie", "personnel"]).order("nom"),
    supabase.from("produits").select("id, nom").eq("actif", true).order("nom"),
  ]);

  return (
    <main className="page-centree">
      <Link href="/depot-vente" className="retour">← Dépôt-vente</Link>
      <h1>Nouveau dépôt</h1>
      <p className="note">Un dépôt concerne un produit. Pour plusieurs produits remis en même temps, enregistrez-les un par un.</p>
      <FormulaireNouveauDepot destinataires={destinataires ?? []} produits={produits ?? []} />
    </main>
  );
}
