import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLES_PAR_JEU, type Jeu } from "@/lib/export-donnees";

const LIBELLES: Record<Jeu, { titre: string; detail: string }> = {
  ventes: { titre: "Ventes", detail: "Toutes les lignes de vente, avec lieu, produit, client et statut." },
  depenses: { titre: "Dépenses", detail: "Toutes les dépenses, avec lieu, catégorie et statut." },
  depots: { titre: "Dépôt-vente", detail: "Bilan par ligne de dépôt : confié, donné, vendu, restitué, dû." },
  stock: { titre: "Stock et production", detail: "Stock restant, taux d'écoulement et écart par événement." },
  primes: { titre: "Primes", detail: "Primes commerciales par année, événement et commercial." },
  evenements: { titre: "Résultats par événement", detail: "CA, dépenses, bénéfice, dîme et gain par personne." },
  paie: { titre: "Paie et épargne", detail: "Calcul mensuel, dû par collaborateur et versements. Gérant seul." },
  sauvegarde: { titre: "Sauvegarde complète", detail: "Toutes les tables de la base, à conserver chaque semaine. Gérant seul." },
};

export default function PageExport() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuExport />
    </Suspense>
  );
}

async function ContenuExport() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profil?.role ?? "";
  if (role !== "gerant" && role !== "comptable") redirect("/");

  const disponibles = (Object.keys(ROLES_PAR_JEU) as Jeu[]).filter((j) => (ROLES_PAR_JEU[j] as readonly string[]).includes(role));

  return (
    <main className="page-centree">
      <p className="entete" style={{ display: "flex", justifyContent: "space-between" }}>
        <Link href="/" className="retour">← Accueil</Link>
        <strong>Exports Excel</strong>
      </p>
      <p className="entete" style={{ fontSize: "0.9rem" }}>
        Chaque fichier s&apos;ouvre dans Excel. Les montants sont donnés à l&apos;unité, en F CFA.
      </p>
      <div className="formulaire">
        {disponibles.map((j) => (
          <a key={j} href={`/export/${j}`} className="secondaire lien" download>
            {LIBELLES[j].titre} : {LIBELLES[j].detail}
          </a>
        ))}
      </div>
    </main>
  );
}
