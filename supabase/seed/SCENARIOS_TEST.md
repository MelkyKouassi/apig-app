# Scénarios de test — stock de départ, validation et clients

À utiliser après exécution de `jeu_de_test_stock.sql` **sur un projet de test**.

## Comptes à créer (Supabase > Authentication > Users)
- `test.gerant@exemple.test` : profil **gérant**
- `test.aya@exemple.test` : profil **commercial**, à relier à « TEST Commercial 1 — Aya »
- `test.kofi@exemple.test` : profil **commercial**, à relier à « TEST Commercial 2 — Kofi »
- `test.mariam@exemple.test` : profil **commercial**, à relier à « TEST Chef — Mariam » (chef du Lieu A)

Liens : Administration > Commerciaux > Lien compte.

## Résultats attendus avant tout test
| Commercial | Lieu | Produit A | Produit B | Statut |
|---|---|---|---|---|
| Aya | Lieu A | 12 | 9 | Confirmé : peut vendre |
| Kofi | Lieu A | 15 | 0 | Validé, non confirmé : ne peut pas vendre |
| Mariam | — | — | — | Chef du Lieu A |
| Aya | Lieu B | 0 | 0 | Aucun stock : en attente |

## Parcours à tester (téléphone, 360 px)
1. **Aya, Lieu A** : « Mon stock du jour » indique « Stock confirmé ». « Nouvelle vente » propose le Lieu A. Les quantités restantes sont justes (12 et 9).
2. **Kofi, Lieu A** : le bouton « Je confirme mon stock » est actif, mais le Lieu A est grisé dans la saisie hors ligne et la vente est refusée en ligne.
3. **Kofi confirme** : le Lieu A devient disponible pour lui.
4. **Mariam (chef du Lieu A)** : « Validation du stock » affiche Aya et Kofi. Elle valide le stock de Kofi. Elle ne peut pas valider le sien.
5. **Gérant** : « Validation du stock » affiche le complément de 5 × Produit B d'Aya. Le valider : le reste de Produit B passe à 14.
6. **Restitution** : Aya rend 2 × Produit A. Elle rend 13 de Produit B : refusé (au-delà du stock restant).
7. **Aya, Lieu B** : aucun stock. Le formulaire de stock est présent, la vente est bloquée.
8. **Modification** : Aya change son stock du Lieu A. Sa validation est annulée, elle doit être refaite (par le gérant, puis confirmée).
9. **Clients** : une vente à crédit avec « +33 612345678 » est enregistrée. Une deuxième vente à crédit avec « 07 00 00 00 02 » réutilise « TEST Client 2 (ancien format) » au lieu d'en créer une autre.
10. **Hors connexion** : couper le réseau, enregistrer une vente au Lieu B pour Aya (refusée), puis remettre le réseau.

## Nettoyage
Les ventes ne peuvent pas être supprimées dans l'application. Pour repartir de zéro, recréer le projet de test.
