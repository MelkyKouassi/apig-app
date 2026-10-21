import Link from "next/link";
import { calculerControles, resumeControles } from "@/lib/controles";
import { chargerDonneesControles } from "@/lib/controles-donnees";
import { createClient } from "@/lib/supabase/server";

// Bandeau de contrôles : nombre de points à corriger et à surveiller. Affiché au gérant et au comptable.
export async function BandeauControles() {
  const supabase = await createClient();
  const controles = calculerControles(await chargerDonneesControles(supabase));
  const resume = resumeControles(controles);
  const rien = resume.bloquants === 0 && resume.surveiller === 0;
  return (
    <Link href="/controles" className="bandeau-controles" style={{ textDecoration: "none", color: "inherit" }}>
      <span className="chiffre">{resume.bloquants}</span> à corriger · <span className="chiffre">{resume.surveiller}</span> à surveiller
      {rien && " · tout est cohérent"}
    </Link>
  );
}
