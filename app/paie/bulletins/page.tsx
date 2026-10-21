import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { chargerPaie } from "@/lib/paie-donnees";
import { BoutonImprimer } from "@/components/BoutonImprimer";
import { BulletinPaie, STYLE_BULLETIN } from "@/components/BulletinPaie";

type Params = { mois?: string };

export default function PageBulletins(props: PageProps<"/paie/bulletins">) {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuBulletins searchParams={props.searchParams as Promise<Params>} />
    </Suspense>
  );
}

async function ContenuBulletins({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant" && profil?.role !== "comptable") redirect("/");

  const [paie, { data: collabs }, { data: entreprise }] = await Promise.all([
    chargerPaie(supabase),
    supabase.from("collaborateurs").select("id, nom, parts, matricule, fonction, date_entree, mode_paiement, numero_cnps").order("nom"),
    supabase.from("entreprise").select("*").limit(1).maybeSingle(),
  ]);

  const dernierMois = Math.max(1, ...paie.lignes.filter((l) => l.enveloppe > 0).map((l) => l.mois));
  const mois = Math.min(12, Math.max(1, Number(sp.mois ?? dernierMois)));
  const enveloppe = paie.lignes[mois - 1]?.enveloppe ?? 0;

  return (
    <main>
      <style>{STYLE_BULLETIN}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, margin: "12px 24px 0", flexWrap: "wrap" }}>
        <Link href={`/paie?mois=${mois}`} className="retour">← Paie</Link>
        <span>{collabs?.length ?? 0} bulletin(s) pour le mois sélectionné</span>
        <BoutonImprimer />
      </div>
      {(collabs ?? []).map((c) => {
        const id = c.id;
        const du = paie.duParMois.get(id)?.[mois - 1] ?? 0;
        const verse = paie.versements.filter((v) => v.collaborateur_id === id && v.mois === mois).reduce((s, v) => s + v.montant, 0);
        return (
          <BulletinPaie
            key={id}
            entreprise={entreprise}
            collab={{ ...c, parts: Number(c.parts) }}
            annee={paie.annee}
            mois={mois}
            totalParts={paie.totalParts}
            enveloppe={enveloppe}
            du={du}
            verse={verse}
          />
        );
      })}
    </main>
  );
}
