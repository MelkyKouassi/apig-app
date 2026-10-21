"use client";

// Ouvre la boîte d'impression du navigateur : « Enregistrer au format PDF » produit le bulletin.
export function BoutonImprimer() {
  return (
    <button type="button" className="secondaire no-print" onClick={() => window.print()}>
      Imprimer ou enregistrer en PDF
    </button>
  );
}
