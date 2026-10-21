-- =====================================================================
-- Stock et production (M7) : vue calculée par événement et produit.
-- Stock restant = produit − dons − vendu (les dépôts sont exclus).
-- Valeur de production potentielle = produit × prix de détail du jour.
-- À exécuter dans Supabase > SQL Editor (une seule fois).
-- =====================================================================

create or replace view v_stock with (security_invoker = true) as
select
  x.*,
  x.quantite_produite - x.dons - x.quantite_vendue as stock_restant,
  case when x.quantite_produite > 0 then x.quantite_vendue / x.quantite_produite end as taux_ecoulement,
  x.quantite_produite * x.prix_detail as valeur_potentielle,
  case when x.stock_physique_compte is null then null
       else x.stock_physique_compte - (x.quantite_produite - x.dons - x.quantite_vendue) end as ecart
from (
  select
    pr.id,
    pr.evenement_id,
    e.nom as evenement_nom,
    pr.produit_id,
    p.nom as produit_nom,
    pr.quantite_produite,
    pr.dons,
    pr.stock_physique_compte,
    coalesce((select sum(v.quantite) from ventes v
               where v.evenement_id = pr.evenement_id
                 and v.produit_id = pr.produit_id
                 and v.statut = 'actif'), 0) as quantite_vendue,
    fn_prix_vente(pr.produit_id, pr.evenement_id, current_date) as prix_detail
  from productions pr
  join evenements e on e.id = pr.evenement_id
  join produits p on p.id = pr.produit_id
) x;
