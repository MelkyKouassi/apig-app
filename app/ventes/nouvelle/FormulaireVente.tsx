"use client";

import { useActionState, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { enregistrerVente, type ResultatVente } from "./actions";
import { ChampTelephone } from "@/components/ChampTelephone";

type Option = { id: string; nom: string };
type TypeRemise = "aucune" | "pct" | "fcfa";
type Ligne = { cle: number; produit_id: string; quantite: string; prix: number | null; remise_type: TypeRemise; remise_valeur: string };

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Même règle que la base : la remise en F CFA l'emporte ; sinon la remise en %.
function montantLigne(prix: number | null, quantite: string, remiseType: TypeRemise, remiseValeur: string): number {
  const brut = (prix ?? 0) * Number(quantite || 0);
  const valeur = Number(remiseValeur || 0);
  let remise = 0;
  if (remiseType === "fcfa") remise = valeur;
  else if (remiseType === "pct") remise = brut * (valeur / 100);
  return Math.max(0, brut - remise);
}

export function FormulaireVente({
  evenements,
  produits,
  commerciaux,
  clients,
  estGerant,
}: {
  evenements: Option[];
  produits: Option[];
  commerciaux: Option[];
  clients: Option[];
  estGerant: boolean;
}) {
  const [etat, action, enCours] = useActionState<ResultatVente, FormData>(enregistrerVente, null);
  const [evenementId, setEvenementId] = useState("");
  const [dateVente, setDateVente] = useState(aujourdhui());
  const [modePaiement, setModePaiement] = useState<"comptant" | "credit">("comptant");
  const [lignes, setLignes] = useState<Ligne[]>([{ cle: 1, produit_id: "", quantite: "1", prix: null, remise_type: "aucune", remise_valeur: "" }]);
  const [prochaineCle, setProchaineCle] = useState(2);
  const [nouveauNom, setNouveauNom] = useState("");

  // Recalcule l'aperçu des prix quand l'événement ou la date change.
  useEffect(() => {
    if (!evenementId || !dateVente) return;
    const supabase = createClient();
    let annule = false;
    (async () => {
      const prix = await Promise.all(
        lignes.map(async (l) => {
          if (!l.produit_id) return null;
          const { data } = await supabase.rpc("fn_prix_vente", {
            p_produit: l.produit_id,
            p_evenement: evenementId,
            p_date: dateVente,
          });
          return typeof data === "number" ? data : Number(data ?? 0);
        })
      );
      if (!annule) {
        setLignes((actuelles) => actuelles.map((l, i) => ({ ...l, prix: prix[i] ?? null })));
      }
    })();
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evenementId, dateVente, lignes.map((l) => l.produit_id).join("|")]);

  function modifierLigne(cle: number, champs: Partial<Ligne>) {
    setLignes((actuelles) => actuelles.map((l) => (l.cle === cle ? { ...l, ...champs } : l)));
  }

  function ajouterLigne() {
    setLignes((actuelles) => [...actuelles, { cle: prochaineCle, produit_id: "", quantite: "1", prix: null, remise_type: "aucune", remise_valeur: "" }]);
    setProchaineCle((k) => k + 1);
  }

  function supprimerLigne(cle: number) {
    setLignes((actuelles) => (actuelles.length > 1 ? actuelles.filter((l) => l.cle !== cle) : actuelles));
  }

  const total = lignes.reduce((somme, l) => somme + montantLigne(l.prix, l.quantite, l.remise_type, l.remise_valeur), 0);
  const lignesJson = JSON.stringify(
    lignes
      .filter((l) => l.produit_id)
      .map((l) => ({
        produit_id: l.produit_id,
        quantite: Number(l.quantite),
        remise_pct: l.remise_type === "pct" ? Number(l.remise_valeur || 0) : null,
        remise_fcfa: l.remise_type === "fcfa" ? Number(l.remise_valeur || 0) : null,
      }))
  );

  if (etat?.ok) {
    return (
      <section className="confirmation">
        <p className="succes">Vente enregistrée : {etat.nombre} produit(s), total {francs(etat.total)}.</p>
        <a href="/ventes/nouvelle" className="bouton">Nouvelle vente</a>
      </section>
    );
  }

  return (
    <form action={action} className="formulaire">
      <label>
        Événement
        <select name="evenement_id" value={evenementId} onChange={(e) => setEvenementId(e.target.value)} required>
          <option value="">-- Choisir --</option>
          {evenements.map((e) => (
            <option key={e.id} value={e.id}>{e.nom}</option>
          ))}
        </select>
      </label>

      <label>
        Date de la vente
        <input name="date_vente" type="date" value={dateVente} onChange={(e) => setDateVente(e.target.value)} required />
      </label>

      <label>
        Mode de paiement
        <select
          name="mode_paiement"
          value={modePaiement}
          onChange={(e) => setModePaiement(e.target.value as "comptant" | "credit")}
        >
          <option value="comptant">Comptant</option>
          <option value="credit">Crédit</option>
        </select>
      </label>

      {modePaiement === "credit" && (
        <fieldset className="client-credit">
          <legend>Client à crédit</legend>
          <label>
            Client existant
            <select name="tiers_id" defaultValue="">
              <option value="">-- Choisir un client --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </label>
          <label>
            Ou nouveau client (nom)
            <input name="nouveau_client" value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} placeholder="Nom complet" />
          </label>
          <ChampTelephone nomIndicatif="nouveau_indicatif" nomNumero="nouveau_telephone" onNom={setNouveauNom} />
        </fieldset>
      )}

      {estGerant && (
        <label>
          Commercial
          <select name="commercial_id" defaultValue="">
            <option value="">-- Aucun --</option>
            {commerciaux.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </label>
      )}

      <div className="lignes">
        <p className="sous-titre">Produits</p>
        {lignes.map((l) => (
          <div key={l.cle} className="ligne-vente">
            <select value={l.produit_id} onChange={(e) => modifierLigne(l.cle, { produit_id: e.target.value })}>
              <option value="">-- Produit --</option>
              {produits.map((p) => (
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
              {l.prix === null ? "" : francs(montantLigne(l.prix, l.quantite, l.remise_type, l.remise_valeur))}
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
            <button type="button" className="secondaire petit" onClick={() => supprimerLigne(l.cle)}>
              Retirer
            </button>
          </div>
        ))}
        <button type="button" className="secondaire" onClick={ajouterLigne}>+ Ajouter un produit</button>
      </div>

      <p className="total">Total : {francs(total)}</p>
      <p className="note">Le prix est calculé par la base au moment de l&apos;enregistrement.</p>

      <input type="hidden" name="lignes" value={lignesJson} />

      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}

      <button type="submit" disabled={enCours || !evenementId}>
        {enCours ? "Enregistrement..." : "Enregistrer la vente"}
      </button>
    </form>
  );
}
