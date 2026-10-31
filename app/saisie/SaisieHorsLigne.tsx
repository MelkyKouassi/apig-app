"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { MESSAGE_TELEPHONE, INDICATIF_DEFAUT, normaliserTelephone, telephoneVide, variantesTelephone } from "@/lib/telephone";
import { ChampTelephone } from "@/components/ChampTelephone";
import {
  getAttente,
  getProfil,
  getReferentiel,
  prixLocal,
  setAttente,
  setProfil,
  setReferentiel,
  type Profil,
  type Referentiel,
  type VenteEnAttente,
} from "@/lib/hors-ligne";

type TypeRemise = "aucune" | "pct" | "fcfa";
type Ligne = { cle: number; produit_id: string; quantite: string; remise_type: TypeRemise; remise_valeur: string };

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const nouvelId = () => crypto.randomUUID();

export function SaisieHorsLigne() {
  const [ref, setRef] = useState<Referentiel | null>(null);
  const [profil, setProfilState] = useState<Profil | null>(null);
  const [attente, setAttenteState] = useState<VenteEnAttente[]>([]);
  const [enLigne, setEnLigne] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Formulaire
  const [evenementId, setEvenementId] = useState("");
  const [dateVente, setDateVente] = useState("");
  const [mode, setMode] = useState<"comptant" | "credit">("comptant");
  const [tiersId, setTiersId] = useState("");
  const [nouveauClient, setNouveauClient] = useState("");
  const [nouveauTelephone, setNouveauTelephone] = useState("");
  const [nouveauIndicatif, setNouveauIndicatif] = useState(INDICATIF_DEFAUT);
  const [commercialId, setCommercialId] = useState("");
  const [lignes, setLignes] = useState<Ligne[]>([{ cle: 1, produit_id: "", quantite: "1", remise_type: "aucune", remise_valeur: "" }]);
  const [prochaineCle, setProchaineCle] = useState(2);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Chargement initial : données locales d'abord, puis mise à jour si on est en ligne.
  useEffect(() => {
    setDateVente(aujourdhui());
    let annule = false;
    (async () => {
      const [r, p, a] = await Promise.all([getReferentiel(), getProfil(), getAttente()]);
      if (annule) return;
      setRef(r);
      setProfilState(p);
      setAttenteState(a);
      setEnLigne(navigator.onLine);
      if (navigator.onLine) {
        await rafraichir();
      }
    })();

    const surEnLigne = () => {
      setEnLigne(true);
      rafraichir().then(() => synchroniser());
    };
    const surHorsLigne = () => setEnLigne(false);
    window.addEventListener("online", surEnLigne);
    window.addEventListener("offline", surHorsLigne);
    return () => {
      annule = true;
      window.removeEventListener("online", surEnLigne);
      window.removeEventListener("offline", surHorsLigne);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rafraichir() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setMessage("Connectez-vous une fois en ligne pour activer la saisie hors ligne.");
      return;
    }
    const uid = session.user.id;

    const { data: pr } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
    if (pr?.role !== "gerant" && pr?.role !== "commercial") {
      setMessage("Votre rôle ne permet pas la saisie des ventes.");
      return;
    }

    let ficheId: string | null = null;
    if (pr.role === "commercial") {
      const { data: fiche } = await supabase
        .from("commerciaux").select("id").eq("user_id", uid).eq("actif", true).maybeSingle();
      ficheId = fiche?.id ?? null;
    }
    const nouveauProfil: Profil = { user_id: uid, role: pr.role, fiche_id: ficheId };
    await setProfil(nouveauProfil);
    setProfilState(nouveauProfil);

    const [ev, pro, px, pxe, mod, com, tie, stk, sls] = await Promise.all([
      supabase.from("evenements").select("id, nom, est_point_de_vente").order("nom"),
      supabase.from("produits").select("id, nom, prix_base").eq("actif", true).order("nom"),
      supabase.from("prix").select("produit_id, prix_unitaire, date_effet, type_prix"),
      supabase.from("prix_evenement").select("produit_id, evenement_id, prix_unitaire, date_effet, type_prix"),
      supabase.from("mode_prix").select("date_effet, mode"),
      supabase.from("commerciaux").select("id, nom").eq("actif", true).order("nom"),
      supabase.from("tiers").select("id, nom").order("nom"),
      supabase.rpc("mes_stocks_evenements"),
      ficheId
        ? supabase.from("seuils_alerte").select("produit_id, seuil").eq("commercial_id", ficheId)
        : Promise.resolve({ data: [] as { produit_id: string; seuil: number }[] }),
    ]);

    // Lieux ouverts à la vente pour ce commercial : stock validé par le gérant ou le chef, puis confirmé.
    const vs = ficheId
      ? await supabase.from("validation_stock").select("evenement_id, valide_le, confirme_le").eq("commercial_id", ficheId)
      : null;
    const lieuxOuverts = (vs?.data ?? [])
      .filter((v) => v.valide_le && v.confirme_le)
      .map((v) => v.evenement_id as string);

    // Stock personnel : emporté (stock_depart) moins ses ventes déjà envoyées.
    let stockPersonnel: NonNullable<Referentiel["stock_personnel"]> = [];
    if (ficheId) {
      const [sd, vt, mv] = await Promise.all([
        supabase.from("stock_depart").select("evenement_id, produit_id, quantite").eq("commercial_id", ficheId),
        supabase.from("ventes").select("evenement_id, produit_id, quantite").eq("commercial_id", ficheId).eq("statut", "actif"),
        supabase.from("mouvements_stock_lieu").select("evenement_id, produit_id, type, quantite, statut").eq("commercial_id", ficheId),
      ]);
      const cle = (e: unknown, p: unknown) => `${e}|${p}`;
      const vendu = new Map<string, number>();
      for (const v of vt.data ?? []) {
        vendu.set(cle(v.evenement_id, v.produit_id), (vendu.get(cle(v.evenement_id, v.produit_id)) ?? 0) + Number(v.quantite || 0));
      }
      // Restitutions : retirées du stock. Compléments : comptés seulement une fois validés.
      const ajustement = new Map<string, number>();
      for (const m of mv.data ?? []) {
        const k = cle(m.evenement_id, m.produit_id);
        const q = Number(m.quantite || 0);
        if (m.type === "restitution") ajustement.set(k, (ajustement.get(k) ?? 0) - q);
        else if (m.type === "complement" && m.statut === "valide") ajustement.set(k, (ajustement.get(k) ?? 0) + q);
      }
      stockPersonnel = (sd.data ?? []).map((s) => ({
        evenement_id: s.evenement_id as string,
        produit_id: s.produit_id as string,
        quantite: Number(s.quantite) + (ajustement.get(cle(s.evenement_id, s.produit_id)) ?? 0),
        vendu: vendu.get(cle(s.evenement_id, s.produit_id)) ?? 0,
      }));
    }

    const nouveau: Referentiel = {
      lieux_ouverts: lieuxOuverts,
      stock_personnel: stockPersonnel,
      evenements: (ev.data ?? []) as Referentiel["evenements"],
      produits: (pro.data ?? []) as Referentiel["produits"],
      prix: (px.data ?? []) as Referentiel["prix"],
      prix_evenement: (pxe.data ?? []) as Referentiel["prix_evenement"],
      modes: (mod.data ?? []) as Referentiel["modes"],
      commerciaux: (com.data ?? []) as Referentiel["commerciaux"],
      tiers: (tie.data ?? []) as Referentiel["tiers"],
      stocks: (stk.data ?? []) as Referentiel["stocks"],
      seuils: ((sls.data ?? []) as Referentiel["seuils"]) ?? [],
      maj: new Date().toISOString(),
    };
    await setReferentiel(nouveau);
    setRef(nouveau);
    setMessage(null);
  }

  async function synchroniser() {
    if (!navigator.onLine) return;
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setMessage("Reconnectez-vous pour envoyer les ventes en attente. Elles restent sur ce téléphone.");
      return;
    }
    setEnvoi(true);
    const liste = await getAttente();
    const restantes: VenteEnAttente[] = [];
    let interrompu = false;

    for (const vente of liste) {
      if (interrompu) {
        restantes.push(vente);
        continue;
      }
      try {
        let tiers = vente.tiers_id;
        // Nouveau client saisi hors ligne : créé une seule fois, puis son identifiant est gardé.
        if (vente.mode_paiement === "credit" && !tiers && vente.nouveau_client) {
          // Même numéro déjà connu : on réutilise la fiche existante au lieu d'en créer une deuxième.
          const telephone = vente.nouveau_telephone?.trim() || null;
          const { data: deja } = telephone
            ? await supabase.from("tiers").select("id").in("telephone", variantesTelephone(telephone)).limit(1).maybeSingle()
            : { data: null };
          let idClient = deja?.id as string | undefined;
          if (!idClient) {
            const { data, error } = await supabase
              .from("tiers")
              .insert({ nom: vente.nouveau_client, telephone, type: "client", created_by: session.user.id })
              .select("id")
              .single();
            if (error || !data) throw new Error("client");
            idClient = data.id;
          }
          tiers = idClient ?? null;
          vente.tiers_id = tiers;
        }
        const lignesBase = vente.lignes.map((l) => ({
          id: l.id,
          panier_id: vente.id,
          date_vente: vente.date_vente,
          evenement_id: vente.evenement_id,
          produit_id: l.produit_id,
          quantite: l.quantite,
          remise_pct: l.remise_pct ?? null,
          remise_fcfa: l.remise_fcfa ?? null,
          commercial_id: vente.commercial_id,
          mode_paiement: vente.mode_paiement,
          tiers_id: tiers,
          created_by: session.user.id,
        }));
        // upsert + ignoreDuplicates : renvoyer deux fois la même vente ne crée pas de doublon.
        const { error } = await supabase
          .from("ventes")
          .upsert(lignesBase, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw error;
      } catch (erreur) {
        interrompu = true;
        restantes.push(vente);
        // Détail de l'erreur renvoyée par la base, pour le diagnostic.
        const detail = (erreur as { message?: string; code?: string })?.message ?? "erreur inconnue";
        const code = (erreur as { code?: string })?.code;
        setMessage(`L'envoi a été interrompu (${detail}${code ? `, code ${code}` : ""}). Les ventes restent sur ce téléphone et seront renvoyées automatiquement.`);
      }
      if (!interrompu) {
        // Vente envoyée : on ne la garde plus, sauf le client nouvellement créé déjà enregistré.
        continue;
      }
    }

    await setAttente(restantes);
    setAttenteState(restantes);
    setEnvoi(false);
    if (!interrompu) setMessage(null);
  }

  function ajouterLigne() {
    setLignes((l) => [...l, { cle: prochaineCle, produit_id: "", quantite: "1", remise_type: "aucune", remise_valeur: "" }]);
    setProchaineCle((k) => k + 1);
  }

  function modifierLigne(cle: number, champs: Partial<Ligne>) {
    setLignes((l) => l.map((x) => (x.cle === cle ? { ...x, ...champs } : x)));
  }

  // Retire une vente restée sur le téléphone (par exemple un test ou une vente bloquée).
  async function supprimerAttente(id: string) {
    if (!window.confirm("Supprimer cette vente du téléphone ? Elle ne sera pas envoyée à la base.")) return;
    const restantes = attente.filter((v) => v.id !== id);
    await setAttente(restantes);
    setAttenteState(restantes);
    setMessage(null);
  }

  function retirerLigne(cle: number) {
    setLignes((l) => (l.length > 1 ? l.filter((x) => x.cle !== cle) : l));
  }

  const prixLigne = (produitId: string, quantite: string) => {
    if (!ref || !produitId || !evenementId) return null;
    return prixLocal(ref, produitId, evenementId, dateVente) * Number(quantite || 0);
  };
  // Même règle que la base : la remise en F CFA l'emporte ; sinon la remise en %.
  const montantAvecRemise = (l: Ligne) => {
    const brut = prixLigne(l.produit_id, l.quantite) ?? 0;
    const valeur = Number(l.remise_valeur || 0);
    const remise = l.remise_type === "fcfa" ? valeur : l.remise_type === "pct" ? brut * (valeur / 100) : 0;
    return Math.max(0, brut - remise);
  };
  const total = lignes.reduce((s, l) => s + montantAvecRemise(l), 0);

  // Un commercial ne vend que sur les lieux dont le stock est validé et confirmé. Le gérant n'est pas concerné.
  const lieuOuvert = (id: string) =>
    profil?.role !== "commercial" || (ref?.lieux_ouverts ?? []).includes(id);

  // Alertes de stock : stock de la dernière copie, moins les ventes de ce téléphone pas encore envoyées
  // et les lignes en cours. Seuls les produits dont le commercial a fixé un seuil sont surveillés.
  const alertesStock = (() => {
    if (!ref || !evenementId) return [] as { nom: string; reste: number; rupture: boolean }[];
    return (ref.seuils ?? []).flatMap((s) => {
      const depart = (ref.stock_personnel ?? []).find((x) => x.evenement_id === evenementId && x.produit_id === s.produit_id);
      if (!depart) return [];
      const enAttente = attente
        .filter((v) => v.evenement_id === evenementId)
        .flatMap((v) => v.lignes)
        .filter((l) => l.produit_id === s.produit_id)
        .reduce((t, l) => t + Number(l.quantite || 0), 0);
      const enCours = lignes
        .filter((l) => l.produit_id === s.produit_id)
        .reduce((t, l) => t + Number(l.quantite || 0), 0);
      const reste = depart.quantite - depart.vendu - enAttente - enCours;
      if (reste > Number(s.seuil)) return [];
      const nom = ref.produits.find((p) => p.id === s.produit_id)?.nom ?? "Produit";
      return [{ nom, reste, rupture: reste <= 0 }];
    });
  })();

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setConfirmation(null);
    setMessage(null);

    if (!profil) return setMessage("Votre session n'est pas connue sur ce téléphone. Connectez-vous une fois en ligne.");
    if (!evenementId) return setMessage("Choisissez l'événement.");
    if (!lieuOuvert(evenementId)) {
      return setMessage("Ce lieu n'est pas ouvert à la vente : votre stock doit être validé par le gérant ou le chef d'équipe, puis confirmé par vous.");
    }
    const lignesValides = lignes.filter((l) => l.produit_id && Number(l.quantite) > 0);
    if (lignesValides.length === 0) return setMessage("Ajoutez au moins un produit avec une quantité.");
    const remiseInvalide = lignesValides.some((l) => {
      const v = Number(l.remise_valeur || 0);
      return l.remise_type === "pct" ? v < 0 || v > 100 : l.remise_type === "fcfa" ? v < 0 : false;
    });
    if (remiseInvalide) return setMessage("La remise en % doit être entre 0 et 100, et la remise en F CFA ne peut pas être négative.");
    if (mode === "credit" && !tiersId && !nouveauClient.trim()) {
      return setMessage("Pour une vente à crédit, choisissez le client ou saisissez son nom.");
    }
    if (mode === "credit" && !tiersId && !telephoneVide(nouveauTelephone) && !normaliserTelephone(nouveauTelephone, nouveauIndicatif)) {
      return setMessage(MESSAGE_TELEPHONE);
    }

    const commercial = profil.role === "commercial" ? profil.fiche_id : commercialId || null;
    if (profil.role === "commercial" && !commercial) {
      return setMessage("Votre compte n'est pas relié à une fiche commercial. Contactez le gérant.");
    }

    const vente: VenteEnAttente = {
      id: nouvelId(),
      cree_le: new Date().toISOString(),
      date_vente: dateVente,
      evenement_id: evenementId,
      mode_paiement: mode,
      tiers_id: mode === "credit" && tiersId ? tiersId : null,
      nouveau_client: mode === "credit" && !tiersId ? nouveauClient.trim() : null,
      nouveau_telephone: mode === "credit" && !tiersId && !telephoneVide(nouveauTelephone) ? normaliserTelephone(nouveauTelephone, nouveauIndicatif) : null,
      commercial_id: commercial,
      lignes: lignesValides.map((l) => ({
        id: nouvelId(),
        produit_id: l.produit_id,
        quantite: Number(l.quantite),
        remise_pct: l.remise_type === "pct" ? Number(l.remise_valeur || 0) : null,
        remise_fcfa: l.remise_type === "fcfa" ? Number(l.remise_valeur || 0) : null,
      })),
    };

    const nouvelleListe = [...attente, vente];
    await setAttente(nouvelleListe);
    setAttenteState(nouvelleListe);

    // Remise à zéro du formulaire
    setLignes([{ cle: prochaineCle, produit_id: "", quantite: "1", remise_type: "aucune", remise_valeur: "" }]);
    setProchaineCle((k) => k + 1);
    setTiersId("");
    setNouveauClient("");
    setConfirmation(enLigne ? "Vente enregistrée, envoi en cours." : "Vente enregistrée sur ce téléphone. Elle sera envoyée dès que la connexion reviendra.");

    if (navigator.onLine) await synchroniser();
  }

  const estGerant = profil?.role === "gerant";

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Saisie des ventes</h1>
      <p className={enLigne ? "statut en-ligne" : "statut hors-ligne"}>
        {enLigne ? "Connecté" : "Hors connexion"}
        {attente.length > 0 && ` · ${attente.length} vente(s) à envoyer`}
      </p>

      {message && <p className="erreur">{message}</p>}
      {confirmation && <p className="succes">{confirmation}</p>}

      {!ref ? (
        <p className="note">
          {profil ? "Chargement des données..." : "Connectez-vous une fois en ligne pour activer la saisie hors ligne."}
        </p>
      ) : (
        <form onSubmit={enregistrer} className="formulaire">
          <fieldset className="choix-lieux">
            <legend>Événement</legend>
            {ref.evenements.map((ev) => (
              <label key={ev.id} className="choix-lieu-item">
                <input
                  type="radio"
                  name="evenement"
                  value={ev.id}
                  checked={evenementId === ev.id}
                  onChange={() => setEvenementId(ev.id)}
                  disabled={!lieuOuvert(ev.id)}
                  required
                />
                <span>
                  {ev.nom}
                  {!lieuOuvert(ev.id) && <em className="note"> (stock non confirmé)</em>}
                </span>
              </label>
            ))}
          </fieldset>

          <label>
            Date de la vente
            <input type="date" value={dateVente} onChange={(e) => setDateVente(e.target.value)} required />
          </label>

          <label>
            Mode de paiement
            <select value={mode} onChange={(e) => setMode(e.target.value as "comptant" | "credit")}>
              <option value="comptant">Comptant</option>
              <option value="credit">Crédit</option>
            </select>
          </label>

          {mode === "credit" && (
            <fieldset className="client-credit">
              <legend>Client à crédit</legend>
              <label>
                Client existant
                <select value={tiersId} onChange={(e) => setTiersId(e.target.value)}>
                  <option value="">-- Choisir un client --</option>
                  {ref.tiers.map((t) => (
                    <option key={t.id} value={t.id}>{t.nom}</option>
                  ))}
                </select>
              </label>
              <label>
                Ou nouveau client (nom)
                <input value={nouveauClient} onChange={(e) => setNouveauClient(e.target.value)} placeholder="Nom complet" />
              </label>
              <ChampTelephone
                indicatifInitial={nouveauIndicatif}
                numeroInitial={nouveauTelephone}
                onChange={(i, n) => { setNouveauIndicatif(i); setNouveauTelephone(n); }}
                onNom={setNouveauClient}
              />
            </fieldset>
          )}

          {estGerant && (
            <label>
              Commercial
              <select value={commercialId} onChange={(e) => setCommercialId(e.target.value)}>
                <option value="">-- Aucun --</option>
                {ref.commerciaux.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            </label>
          )}

          {alertesStock.length > 0 && (
            <div className="alerte-stock" role="status">
              {alertesStock.map((a) => (
                <p key={a.nom}>
                  <strong>{a.rupture ? "Rupture" : "Stock bas"}</strong> : {a.nom}, reste {Math.max(a.reste, 0)}
                </p>
              ))}
              <p className="note">Votre stock au {ref?.maj ? new Date(ref.maj).toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" }) : "—"}.</p>
            </div>
          )}

          <div className="lignes">
            <p className="sous-titre">Produits</p>
            {lignes.map((l) => (
              <div key={l.cle} className="ligne-vente">
                <select value={l.produit_id} onChange={(e) => modifierLigne(l.cle, { produit_id: e.target.value })}>
                  <option value="">-- Produit --</option>
                  {ref.produits.map((p) => (
                    <option key={p.id} value={p.id}>{p.nom}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={l.quantite}
                  onChange={(e) => modifierLigne(l.cle, { quantite: e.target.value })}
                  aria-label="Quantité"
                />
                <span className="prix-ligne">
                  {prixLigne(l.produit_id, l.quantite) === null ? "" : francs(montantAvecRemise(l))}
                </span>
                <div className="ligne-remise">
                  <select
                    value={l.remise_type}
                    onChange={(e) => modifierLigne(l.cle, { remise_type: e.target.value as TypeRemise, remise_valeur: "" })}
                    aria-label="Type de remise"
                  >
                    <option value="aucune">Sans remise</option>
                    <option value="pct">Remise en %</option>
                    <option value="fcfa">Remise en F CFA</option>
                  </select>
                  {l.remise_type !== "aucune" && (
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      placeholder={l.remise_type === "pct" ? "%" : "F CFA"}
                      value={l.remise_valeur}
                      onChange={(e) => modifierLigne(l.cle, { remise_valeur: e.target.value })}
                      aria-label="Valeur de la remise"
                    />
                  )}
                </div>
                <button type="button" className="secondaire petit" onClick={() => retirerLigne(l.cle)}>Retirer</button>
              </div>
            ))}
            <button type="button" className="secondaire" onClick={ajouterLigne}>+ Ajouter un produit</button>
          </div>

          <p className="total">Total : {francs(total)}</p>
          <p className="note">Le prix affiché vient des données copiées sur ce téléphone. La base recalcule le montant à l&apos;envoi.</p>

          <button type="submit">Enregistrer la vente</button>
        </form>
      )}

      {attente.length > 0 && (
        <section className="attente">
          <p className="sous-titre">Ventes non encore envoyées</p>
          <ul>
            {attente.map((v) => (
              <li key={v.id}>
                <span>{new Date(v.cree_le).toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })} · {v.lignes.length} produit(s) · {v.mode_paiement === "credit" ? "crédit" : "comptant"}</span>{" "}
                <button type="button" className="secondaire petit" onClick={() => supprimerAttente(v.id)} disabled={envoi}>Supprimer</button>
              </li>
            ))}
          </ul>
          <button type="button" className="secondaire" onClick={synchroniser} disabled={envoi || !enLigne}>
            {envoi ? "Envoi en cours..." : "Envoyer maintenant"}
          </button>
        </section>
      )}
    </main>
  );
}
