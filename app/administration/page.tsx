import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormulaireCollaborateur, FormulaireEntreprise, FormulaireParametres, FormulaireProfil } from "./Formulaires";
import { dateHeureFr } from "@/lib/dates";
import { Sommaire } from "@/components/Sommaire";

const TABLES: Record<string, string> = {
  entreprise: "Entreprise",
  parametres: "Paramètres",
  collaborateurs: "Collaborateur",
  profiles: "Compte",
  commerciaux: "Commercial",
  produits: "Produit",
  prix: "Prix",
  prix_evenement: "Prix d'événement",
  baremes_prime: "Barème de prime",
  evenements: "Événement",
  ventes: "Vente",
  reglements: "Règlement",
  depots: "Dépôt-vente",
  depenses: "Dépense",
  versements: "Versement",
  tiers: "Tiers",
  production: "Production",
  restitutions: "Restitution",
};


// Résumé lisible d'une ligne du journal : quels champs ont changé.
function resume(a: { action: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }) {
  if (a.action === "INSERT") return "Création";
  if (a.action === "DELETE") return "Suppression";
  const avant = a.old_data ?? {};
  const apres = a.new_data ?? {};
  const champs = Object.keys(apres).filter((k) => k !== "updated_at" && JSON.stringify(avant[k]) !== JSON.stringify(apres[k]));
  return champs.length ? `Modifié : ${champs.join(", ")}` : "Modification";
}

export default function PageAdministration() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuAdministration />
    </Suspense>
  );
}

async function ContenuAdministration() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") redirect("/");

  const [{ data: entreprise }, { data: parametres }, { data: collabs }, { data: profils }, { data: audit }] = await Promise.all([
    supabase.from("entreprise").select("*").limit(1).maybeSingle(),
    supabase.from("parametres").select("*").limit(1).maybeSingle(),
    supabase.from("collaborateurs").select("id, nom, parts, matricule, fonction, date_entree, mode_paiement, numero_cnps, actif").order("nom"),
    supabase.from("profiles").select("id, nom_complet, role, actif").order("nom_complet"),
    supabase.from("audit_log").select("id, table_name, row_id, action, old_data, new_data, user_id, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const noms = new Map((profils ?? []).map((p) => [p.id, p.nom_complet as string]));

  return (
    <main className="page-centree">
      <p className="entete" style={{ display: "flex", justifyContent: "space-between" }}>
        <Link href="/" className="retour">← Accueil</Link>
        <strong>Administration</strong>
      </p>
      <Sommaire items={[
        { id: "comptes", libelle: "Comptes" },
        { id: "entreprise", libelle: "Entreprise" },
        { id: "collaborateurs", libelle: "Collaborateurs" },
        { id: "parametres", libelle: "Paramètres" },
        { id: "journal", libelle: "Journal d'audit" },
      ]} />

      <nav className="sommaire" aria-label="Sections">
        <a href="#comptes">Comptes</a><a href="#entreprise">Entreprise</a><a href="#collaborateurs">Collaborateurs</a><a href="#parametres">Paramètres</a><a href="#journal">Journal</a>
      </nav>

      <section id="comptes">
        <p className="entete"><strong>Comptes utilisateurs</strong></p>
        <p className="entete" style={{ fontSize: "0.9rem" }}>
          La création d&apos;un compte se fait dans le tableau de bord Supabase (Authentication). Ici, vous donnez le rôle et l&apos;accès.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="tableau">
            <thead><tr><th>Nom</th><th>Rôle</th><th>Actif</th></tr></thead>
            <tbody>
              {(profils ?? []).map((p) => (
                <tr key={p.id}><td>{p.nom_complet}</td><td>{p.role}</td><td>{p.actif ? "Oui" : "Non"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary className="lien">Modifier un compte</summary>
          {(profils ?? []).map((p) => (
            <details key={p.id} style={{ margin: "8px 0" }}>
              <summary>{p.nom_complet}</summary>
              <FormulaireProfil id={p.id} nom={p.nom_complet} role={p.role} actif={p.actif} />
            </details>
          ))}
        </details>
      </section>

      <section id="entreprise" style={{ marginTop: 24 }}>
        <p className="entete"><strong>Entreprise</strong></p>
        {entreprise && <FormulaireEntreprise entreprise={entreprise} />}
      </section>

      <section id="collaborateurs" style={{ marginTop: 24 }}>
        <p className="entete"><strong>Collaborateurs et fiches de paie</strong></p>
        <p className="entete" style={{ fontSize: "0.9rem" }}>
          Le nombre de parts influence directement l&apos;enveloppe de chaque collaborateur.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="tableau">
            <thead><tr><th>Nom</th><th className="nombre">Parts</th><th>Matricule</th><th>CNPS</th><th>Actif</th></tr></thead>
            <tbody>
              {(collabs ?? []).map((c) => (
                <tr key={c.id}><td>{c.nom}</td><td className="nombre">{c.parts}</td><td>{c.matricule ?? "—"}</td><td>{c.numero_cnps ?? "à compléter"}</td><td>{c.actif ? "Oui" : "Non"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {(collabs ?? []).map((c) => (
          <details key={c.id} style={{ margin: "8px 0" }}>
            <summary>Fiche de {c.nom}</summary>
            <FormulaireCollaborateur c={{ id: c.id, nom: c.nom, parts: Number(c.parts), matricule: c.matricule, fonction: c.fonction, date_entree: c.date_entree, mode_paiement: c.mode_paiement, numero_cnps: c.numero_cnps, actif: c.actif }} />
          </details>
        ))}
        <details style={{ marginTop: 12 }}>
          <summary className="lien">Ajouter un collaborateur</summary>
          <FormulaireCollaborateur c={null} />
        </details>
      </section>

      <section id="parametres" style={{ marginTop: 24 }}>
        <p className="entete"><strong>Paramètres</strong></p>
        {parametres && <FormulaireParametres p={parametres as Record<string, number | boolean | null>} />}
      </section>

      <section id="journal" style={{ marginTop: 24 }}>
        <p className="entete"><strong>Journal d&apos;audit</strong></p>
        <p className="entete" style={{ fontSize: "0.9rem" }}>Les 100 dernières modifications. Lecture seule.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="tableau">
            <thead><tr><th>Date</th><th>Utilisateur</th><th>Élément</th><th>Action</th></tr></thead>
            <tbody>
              {(audit ?? []).map((a) => (
                <tr key={a.id}>
                  <td>{dateHeureFr(a.created_at)}</td>
                  <td>{a.user_id ? noms.get(a.user_id) ?? "—" : "Système"}</td>
                  <td>{TABLES[a.table_name] ?? a.table_name}</td>
                  <td>{resume(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
