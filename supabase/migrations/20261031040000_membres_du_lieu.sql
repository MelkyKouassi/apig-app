-- =====================================================================
-- Liste des commerciaux d'un lieu, visible par le gérant et par le chef d'équipe de ce lieu.
-- Un chef non-gérant ne voit normalement que sa propre ligne : cette fonction lui donne
-- seulement les membres de SON lieu (nom et rôle de chef), rien d'autre.
-- À exécuter dans Supabase > SQL Editor (une seule fois).
-- =====================================================================

create or replace function membres_du_lieu(p_evenement uuid)
returns table (commercial_id uuid, nom text, est_chef boolean)
language sql stable security definer set search_path = public as $$
  select ec.commercial_id, c.nom, ec.est_chef
    from evenement_commerciaux ec
    join commerciaux c on c.id = ec.commercial_id
   where ec.evenement_id = p_evenement
     and peut_valider_stock(p_evenement)
   order by c.nom
$$;

grant execute on function membres_du_lieu(uuid) to authenticated;
