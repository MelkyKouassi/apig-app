import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { seDeconnecter } from "./connexion/actions";

const LIBELLES_ROLE: Record<string, string> = {
  gerant: "Gérant",
  commercial: "Commercial",
  collaborateur: "Collaborateur",
  comptable: "Comptable",
};

export default function PageAccueil() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuAccueil />
    </Suspense>
  );
}

async function ContenuAccueil() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase
    .from("profiles")
    .select("nom_complet, role")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="page-centree">
      <h1>APIG-PHARMA</h1>
      {profil ? (
        <>
          <p className="sous-titre">Bonjour {profil.nom_complet}</p>
          <p>Rôle : {LIBELLES_ROLE[profil.role] ?? profil.role}</p>
          <Link href="/ventes/nouvelle" className="bouton">Nouvelle vente</Link>
          {profil.role === "gerant" && (
            <Link href="/ventes" className="secondaire lien">Ventes du jour</Link>
          )}
          {profil.role === "commercial" && (
            <Link href="/mes-ventes" className="secondaire lien">Mes ventes du jour</Link>
          )}
          {(profil.role === "gerant" || profil.role === "comptable") && (
            <Link href="/creances" className="secondaire lien">Créances</Link>
          )}
          {(profil.role === "gerant" || profil.role === "comptable") && (
            <Link href="/depot-vente" className="secondaire lien">Dépôt-vente</Link>
          )}
          {(profil.role === "gerant" || profil.role === "comptable") && (
            <Link href="/stock" className="secondaire lien">Stock et production</Link>
          )}
          {(profil.role === "gerant" || profil.role === "comptable") && (
            <Link href="/primes" className="secondaire lien">Primes</Link>
          )}
          {(profil.role === "gerant" || profil.role === "comptable") && (
            <Link href="/tableau-de-bord" className="secondaire lien">Tableau de bord</Link>
          )}
        </>
      ) : (
        <p className="erreur">
          Votre compte n&apos;est pas encore rattaché à l&apos;entreprise. Contactez le gérant.
        </p>
      )}

      <form action={seDeconnecter}>
        <button type="submit" className="secondaire">Se déconnecter</button>
      </form>
    </main>
  );
}
