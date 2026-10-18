"use client";

import { useActionState } from "react";
import { seConnecter } from "./actions";

export default function PageConnexion() {
  const [etat, action, enCours] = useActionState(seConnecter, null);

  return (
    <main className="page-centree">
      <h1>APIG-PHARMA</h1>
      <p className="sous-titre">Connexion</p>

      <form action={action} className="formulaire">
        <label>
          Adresse e-mail
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Mot de passe
          <input name="motDePasse" type="password" autoComplete="current-password" required />
        </label>

        {etat?.erreur && <p className="erreur">{etat.erreur}</p>}

        <button type="submit" disabled={enCours}>
          {enCours ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
