import { createClient } from "@/lib/supabase/server";
import { BarreMenu, type Groupe, type Lien } from "./BarreMenu";

// Navigation commune, présente sur chaque page. Elle n'affiche que les écrans du profil connecté.
// Sur téléphone : barre en bas, une rubrique s'ouvre au-dessus. Sur ordinateur : menu latéral.
export async function BarreNavigation() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profil?.role ?? "";

  const groupes: Groupe[] = [];
  let directs: Lien[] = [];

  if (role === "collaboratrice") {
    directs = [{ href: "/mes-bulletins", libelle: "Mes bulletins" }];
  }
  if (role === "commercial") {
    // Un commercial voit la validation seulement s'il est chef d'équipe d'au moins un lieu.
    const { data: fiche } = await supabase
      .from("commerciaux").select("id").eq("user_id", user.id).eq("actif", true).maybeSingle();
    let estChef = false;
    if (fiche) {
      const { data: chefs } = await supabase
        .from("evenement_commerciaux").select("evenement_id").eq("commercial_id", fiche.id).eq("est_chef", true).limit(1);
      estChef = (chefs ?? []).length > 0;
    }
    groupes.push({ titre: "Ventes", liens: [
      { href: "/stock-du-jour", libelle: "Mon stock du jour" },
      { href: "/saisie", libelle: "Nouvelle vente" },
      { href: "/mes-ventes", libelle: "Mes ventes" },
      { href: "/seuils", libelle: "Mes seuils" },
      ...(estChef ? [{ href: "/validation-stock", libelle: "Validation du stock" }] : []),
    ] });
  }
  if (role === "gerant" || role === "comptable") {
    groupes.push(
      { titre: "Ventes", liens: [
        { href: "/ventes", libelle: "Ventes du jour" },
        { href: role === "gerant" ? "/saisie" : "/ventes/nouvelle", libelle: "Nouvelle vente" },
        ...(role === "gerant" ? [{ href: "/validation-stock", libelle: "Validation du stock" }] : []),
      ] },
      { titre: "Clients", liens: [
        { href: "/depot-vente", libelle: "Dépôt-vente" },
        { href: "/creances", libelle: "Créances" },
      ] },
      { titre: "Gestion", liens: [
        { href: "/depenses", libelle: "Dépenses" },
        { href: "/stock", libelle: "Stock" },
        { href: "/primes", libelle: "Primes" },
        { href: "/tableau-de-bord", libelle: "Tableau de bord" },
        { href: "/controles", libelle: "Contrôles" },
        ...(role === "gerant" ? [{ href: "/catalogue", libelle: "Catalogue et prix" }] : []),
      ] },
      { titre: "Paie", liens: [
        { href: "/paie", libelle: "Paie" },
        { href: "/export", libelle: "Exports" },
      ] },
    );
  }
  if (role === "gerant") {
    groupes.push({ titre: "Administration", liens: [
      { href: "/administration", libelle: "Administration" },
    ] });
  }

  return <BarreMenu groupes={groupes} directs={directs} />;
}
