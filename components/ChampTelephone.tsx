"use client";

import { useEffect, useState } from "react";
import { choisirContact, repertoireDisponible } from "@/lib/contacts";
import { INDICATIFS, INDICATIF_DEFAUT, decouperTelephone } from "@/lib/telephone";

// Téléphone avec choix de l'indicatif pays. Le répertoire du téléphone remplit le nom et le numéro, si disponible.
export function ChampTelephone({
  nomIndicatif = "indicatif",
  nomNumero = "telephone",
  indicatifInitial = INDICATIF_DEFAUT,
  numeroInitial = "",
  onChange,
  onNom,
}: {
  nomIndicatif?: string;
  nomNumero?: string;
  indicatifInitial?: string;
  numeroInitial?: string;
  onChange?: (indicatif: string, numero: string) => void;
  onNom?: (nom: string) => void;
}) {
  const [indicatif, setIndicatif] = useState(indicatifInitial);
  const [numero, setNumero] = useState(numeroInitial);
  const [peutRepertoire, setPeutRepertoire] = useState(false);
  useEffect(() => { setPeutRepertoire(repertoireDisponible()); }, []);

  const majuscule = (i: string, n: string) => {
    setIndicatif(i);
    setNumero(n);
    onChange?.(i, n);
  };

  return (
    <>
      <label>
        Téléphone
        <span className="tel-ligne">
          <select
            name={nomIndicatif}
            value={indicatif}
            onChange={(e) => majuscule(e.target.value, numero)}
            aria-label="Indicatif pays"
          >
            {INDICATIFS.map((i) => (
              <option key={i.code} value={i.code}>+{i.code} {i.pays}</option>
            ))}
          </select>
          <input
            name={nomNumero}
            type="tel"
            inputMode="tel"
            value={numero}
            onChange={(e) => majuscule(indicatif, e.target.value)}
            placeholder="07 00 00 00 00"
          />
        </span>
      </label>
      {peutRepertoire && (
        <button
          type="button"
          className="secondaire"
          onClick={async () => {
            const c = await choisirContact();
            if (!c) return;
            if (c.nom) onNom?.(c.nom);
            const d = c.telephone ? decouperTelephone(c.telephone, indicatif) : null;
            if (d) majuscule(d.code, d.national);
            else if (c.telephone) majuscule(indicatif, c.telephone);
          }}
        >
          Prendre dans mon répertoire
        </button>
      )}
    </>
  );
}
