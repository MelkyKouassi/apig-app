import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormulaireDatesEvenement, FormulairePalier, FormulairePrimeManuelle } from "./FormulairesPrimes";

type LignePrime = {
  commercial_nom: string;
  evenement_nom: string;
  annee: number;
  mois: number | null;
  total_vendu: number;
  taux: number;
  prime: number;
};

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
const pourcent = (t: number) => `${Math.round(Number(t) * 1000) / 10} %`;

export default function PagePrimes() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuPrimes />
    </Suspense>
  );
}

async function ContenuPrimes() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant" && profil?.role !== "comptable") redirect("/");
  const estGerant = profil.role === "gerant";

  const [{ data: primes }, { data: evenements }, { data: commerciaux }, { data: baremes }] = await Promise.all([
    supabase.from("v_primes").select("*").order("annee").order("evenement_nom").order("commercial_nom"),
    supabase.from("evenements").select("id, nom, date_debut, date_fin").order("nom"),
    supabase.from("commerciaux").select("id, nom").eq("actif", true).order("nom"),
    supabase.from("baremes_prime").select("seuil_ca, taux, evenement_id").order("seuil_ca"),
  ]);

  const lignes = (primes ?? []) as LignePrime[];
  const total = lignes.reduce((s, l) => s + Number(l.prime), 0);
  const nomEvenement = new Map((evenements ?? []).map((e) => [e.id, e.nom]));

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Primes commerciales</h1>
      <p className="total">Total des primes : {francs(total)}</p>
      <p className="note">Prime = total vendu × taux du palier atteint. Rattachée au mois de fin de l&apos;événement (point de vente : année de chaque vente).</p>

      <section className="carte-vente">
        <p className="entete"><strong>Primes par commercial</strong></p>
        {lignes.length === 0 && <p className="note">Aucune prime calculée.</p>}
        {lignes.map((l, i) => (
          <p key={i} className="note">
            {l.commercial_nom} · {l.evenement_nom} · {l.mois ? `${String(l.mois).padStart(2, "0")}/${l.annee}` : l.annee} ·
            vendu {francs(l.total_vendu)} · taux {pourcent(l.taux)} · <strong>prime {francs(l.prime)}</strong>
          </p>
        ))}
      </section>

      {estGerant && (
        <>
          <section className="carte-vente">
            <p className="entete"><strong>Dates des événements</strong></p>
            <p className="note">
              {(evenements ?? []).map((e) => `${e.nom} : ${e.date_debut ?? "?"} → ${e.date_fin ?? "?"}`).join(" · ")}
            </p>
            <FormulaireDatesEvenement evenements={(evenements ?? []).map((e) => ({ id: e.id, nom: e.nom }))} />
          </section>

          <section className="carte-vente">
            <p className="entete"><strong>Barèmes</strong></p>
            {(baremes ?? []).map((b, i) => (
              <p key={i} className="note">
                {b.evenement_id ? nomEvenement.get(b.evenement_id) : "Standard"} · à partir de {francs(Number(b.seuil_ca))} · {pourcent(Number(b.taux))}
              </p>
            ))}
            <FormulairePalier evenements={(evenements ?? []).map((e) => ({ id: e.id, nom: e.nom }))} />
          </section>

          <section className="carte-vente">
            <p className="entete"><strong>Anciennes saisies manuelles de ventes</strong></p>
            <FormulairePrimeManuelle
              evenements={(evenements ?? []).map((e) => ({ id: e.id, nom: e.nom }))}
              commerciaux={(commerciaux ?? []).map((c) => ({ id: c.id, nom: c.nom }))}
            />
          </section>
        </>
      )}
    </main>
  );
}
