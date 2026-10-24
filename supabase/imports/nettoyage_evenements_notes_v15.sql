-- Supprime trois lignes de notes du classeur qui ont été prises pour des événements
-- lors de l'import v15 (aucune vente, dépense ou production ne leur est rattachée).
-- À lancer UNE SEULE FOIS dans Supabase (SQL Editor).
begin;

delete from evenements
 where nom in (
   'TOTAL = 10 évènement(s)',
   'Bénéfice net = CA réel − dépenses (hors primes). Gain par personne = (bénéfice − primes − dîme) ÷ nombre de bénéficiaires.',
   'Les dates de début et de fin se déduisent automatiquement des ventes saisies.'
 )
   and not est_point_de_vente;

select count(*) as evenements_restants from evenements;

commit;
