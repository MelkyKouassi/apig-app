import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Barre de navigation commune, présente sur chaque page. Elle n'affiche que les écrans du profil connecté.
export async function BarreNavigation() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profil?.role ?? "";

  const liens: { href: string; libelle: string }[] = [{ href: "/", libelle: "Accueil" }];
  if (role === "commercial") {
    liens.push({ href: "/ventes/nouvelle", libelle: "Nouvelle vente" }, { href: "/mes-ventes", libelle: "Mes ventes" });
  }
  if (role === "gerant" || role === "comptable") {
    liens.push(
      { href: "/ventes", libelle: "Ventes du jour" },
      { href: "/ventes/nouvelle", libelle: "Nouvelle vente" },
      { href: "/depot-vente", libelle: "Dépôt-vente" },
      { href: "/creances", libelle: "Créances" },
      { href: "/stock", libelle: "Stock" },
      { href: "/primes", libelle: "Primes" },
      { href: "/tableau-de-bord", libelle: "Tableau de bord" },
      { href: "/controles", libelle: "Contrôles" },
      { href: "/paie", libelle: "Paie" },
      { href: "/export", libelle: "Exports" },
    );
  }
  if (role === "gerant") liens.push({ href: "/administration", libelle: "Administration" });

  return (
    <nav className="barre-nav" aria-label="Navigation principale">
      {liens.map((l) => (
        <Link key={l.href} href={l.href} className="barre-lien">{l.libelle}</Link>
      ))}
    </nav>
  );
}
