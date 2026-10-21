import { createClient } from "@/lib/supabase/server";
import { construireExport, JEUX, ROLES_PAR_JEU, type Jeu } from "@/lib/export-donnees";
import { genererXlsx } from "@/lib/xlsx";

// Télécharge un jeu de données au format Excel. Droits vérifiés ici, et la base applique les siennes.
export async function GET(_requete: Request, { params }: { params: Promise<{ jeu: string }> }) {
  const { jeu } = await params;
  if (!(JEUX as string[]).includes(jeu)) return new Response("Export inconnu.", { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Connexion requise.", { status: 401 });

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profil || !(ROLES_PAR_JEU[jeu as Jeu] as readonly string[]).includes(profil.role)) {
    return new Response("Accès refusé.", { status: 403 });
  }

  try {
    const { nom, feuilles } = await construireExport(jeu as Jeu, supabase);
    const octets = genererXlsx(feuilles);
    return new Response(octets as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nom}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("L'export n'a pas pu être préparé. Réessayez ou prévenez le gérant.", { status: 500 });
  }
}
