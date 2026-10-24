-- Affectation de tous les commerciaux actifs à tous les événements,
-- existants et à venir (décision du 24/10/2026).
-- Le gérant peut toujours retirer une affectation dans la table evenement_commerciaux.

-- 1) Existant : chaque événement reçoit chaque commercial actif
insert into evenement_commerciaux (evenement_id, commercial_id)
select e.id, c.id
  from evenements e
  cross join commerciaux c
 where c.actif
on conflict (evenement_id, commercial_id) do nothing;

-- 2) Nouvel événement : affecté à tous les commerciaux actifs
create or replace function affecte_commerciaux_a_evenement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into evenement_commerciaux (evenement_id, commercial_id)
  select new.id, c.id from commerciaux c where c.actif
  on conflict (evenement_id, commercial_id) do nothing;
  return new;
end $$;

create trigger evenements_affectation_trg
  after insert on evenements
  for each row execute function affecte_commerciaux_a_evenement();

-- 3) Nouveau commercial (ou réactivé) : affecté à tous les événements
create or replace function affecte_commercial_a_evenements() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.actif then
    insert into evenement_commerciaux (evenement_id, commercial_id)
    select e.id, new.id from evenements e
    on conflict (evenement_id, commercial_id) do nothing;
  end if;
  return new;
end $$;

create trigger commerciaux_affectation_trg
  after insert or update of actif on commerciaux
  for each row execute function affecte_commercial_a_evenements();
