import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calculerControles, resumeControles } from "@/lib/controles";
import { chargerDonneesControles } from "@/lib/controles-donnees";
import { Sommaire } from "@/components/Sommaire";

export default function PageControles() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuControles />
    </Suspense>
  );
}

async function ContenuControles() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant" && profil?.role !== "comptable") redirect("/");

  const controles = calculerControles(await chargerDonneesControles(supabase));
  const resume = resumeControles(controles);

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Contrôles de cohérence</h1>
      <Sommaire items={[
        { id: "bloquant", libelle: "À corriger" },
        { id: "surveiller", libelle: "À surveiller" },
      ]} />
      <p className="total">
        <span className="erreur">{resume.bloquants} à corriger</span> · {resume.surveiller} à surveiller
      </p>
      {controles.length === 0 && <p className="note">Aucune anomalie détectée.</p>}
      {(["bloquant", "surveiller"] as const).map((g) => (
        <section id={g} key={g} className="carte-vente">
          <p className="entete"><strong>{g === "bloquant" ? "À corriger" : "À surveiller"}</strong></p>
          {controles.filter((c) => c.gravite === g).map((c) => (
            <details key={c.id}>
              <summary>{c.libelle} ({c.lignes.length})</summary>
              {c.lignes.slice(0, 50).map((l, i) => (
                <p key={i} className="note">{l.href ? <Link href={l.href} className="lien-tel">{l.texte}</Link> : l.texte}</p>
              ))}
              {c.lignes.length > 50 && <p className="note">… et {c.lignes.length - 50} autre(s)</p>}
            </details>
          ))}
        </section>
      ))}
    </main>
  );
}
