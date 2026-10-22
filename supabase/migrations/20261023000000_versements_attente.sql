-- =====================================================================
-- Versements saisis par le comptable : en attente jusqu'à l'accord du gérant.
-- - statut : 'valide' (compte pour le reste à verser), 'attente' (saisi par le comptable), 'refuse'.
-- - Les versements existants restent 'valide'.
-- =====================================================================

alter table versements add column statut text not null default 'valide'
  check (statut in ('attente', 'valide', 'refuse'));
alter table versements add column valide_par uuid;
alter table versements add column valide_le timestamptz;

-- Le comptable peut seulement ajouter un versement en attente. Le gérant peut tout ajouter.
drop policy versements_ajout on versements;
create policy versements_ajout on versements for insert to authenticated
  with check (is_role('gerant') or (is_role('comptable') and statut = 'attente'));
