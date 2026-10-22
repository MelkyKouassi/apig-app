import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assemblerBulletin, type RetenueBulletin, type Snapshot } from "@/lib/bulletins-donnees";
import { BoutonImprimer } from "@/components/BoutonImprimer";
import { BulletinPaie, STYLE_BULLETIN } from "@/components/BulletinPaie";
import { dateFr } from "@/lib/dates";

type Params = { annee?: string; mois?: string };
const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export default function PageMesBulletins(props: PageProps<"/mes-bulletins">) {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuMesBulletins searchParams={props.searchParams as Promise<Params>} />
    </Suspense>
  );
}

// Espace de la collaboratrice : ses bulletins validés, en lecture seule.
async function ContenuMesBulletins({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: collab } = await supabase
    .from("collaborateurs")
    .select("id, nom, parts, matricule, fonction, date_entree, mode_paiement, numero_cnps")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Mes bulletins de paie</h1>
      {!collab && <p className="erreur">Votre compte n&apos;est pas encore rattaché à un collaborateur. Contactez le gérant.</p>}
      {collab && <Contenu collab={collab} sp={sp} supabase={supabase} />}
    </main>
  );
}

async function Contenu({ collab, sp, supabase }: { collab: { id: string; nom: string; parts: number | string; matricule: string | null; fonction: string | null; date_entree: string | null; mode_paiement: string | null; numero_cnps: string | null }; sp: Params; supabase: Awaited<ReturnType<typeof createClient>> }) {
  const [{ data: bulletins }, { data: retenues }, { data: versements }, { data: entreprise }] = await Promise.all([
    supabase.from("bulletins").select("*").eq("collaborateur_id", collab.id),
    supabase.from("retenues_bulletin").select("collaborateur_id, annee, mois, libelle, montant, statut").eq("collaborateur_id", collab.id),
    supabase.from("versements").select("montant, annee, mois").eq("collaborateur_id", collab.id),
    supabase.from("entreprise").select("*").limit(1).maybeSingle(),
  ]);

  const valides = ((bulletins ?? []) as Snapshot[]).sort((a, b) => (b.annee - a.annee) || (b.mois - a.mois));
  if (valides.length === 0) return <p className="note">Aucun bulletin validé pour le moment.</p>;

  const choisi = valides.find((b) => String(b.annee) === sp.annee && String(b.mois) === sp.mois) ?? valides[0];
  const retenuesLignes = (retenues ?? []) as (RetenueBulletin & { annee: number })[];
  const bulletin = assemblerBulletin(collab.id, choisi.mois, choisi, null, retenuesLignes.filter((r) => r.annee === choisi.annee));
  if (!bulletin) return <p className="note">Bulletin introuvable.</p>;
  const verse = ((versements ?? []) as { montant: number | string; annee: number; mois: number }[])
    .filter((v) => v.annee === choisi.annee && v.mois === choisi.mois)
    .reduce((s, v) => s + Number(v.montant), 0);

  return (
    <>
      <p className="note">Validé le {dateFr(choisi.valide_le?.slice(0, 10))}</p>
      <div className="formulaire">
        {valides.map((b) => (
          <Link
            key={`${b.annee}-${b.mois}`}
            href={`/mes-bulletins?annee=${b.annee}&mois=${b.mois}`}
            className={`secondaire lien${b === choisi ? " actif" : ""}`}
          >
            {NOMS_MOIS[b.mois - 1]} {b.annee}
          </Link>
        ))}
      </div>
      <BoutonImprimer />
      <style>{STYLE_BULLETIN}</style>
      <BulletinPaie entreprise={entreprise} collab={{ ...collab, parts: Number(collab.parts) }} annee={choisi.annee} mois={choisi.mois} bulletin={bulletin} verse={verse} />
    </>
  );
}
