import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormulaireVente } from "./FormulaireVente";

export default function PageNouvelleVente() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuNouvelleVente />
    </Suspense>
  );
}

async function ContenuNouvelleVente() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profil || (profil.role !== "gerant" && profil.role !== "commercial")) {
    redirect("/");
  }

  const [{ data: evenements }, { data: produits }, { data: commerciaux }] = await Promise.all([
    supabase.from("evenements").select("id, nom").order("nom"),
    supabase.from("produits").select("id, nom").eq("actif", true).order("nom"),
    supabase.from("commerciaux").select("id, nom").eq("actif", true).order("nom"),
  ]);

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Nouvelle vente</h1>
      <FormulaireVente
        evenements={evenements ?? []}
        produits={produits ?? []}
        commerciaux={commerciaux ?? []}
        estGerant={profil.role === "gerant"}
      />
    </main>
  );
}
