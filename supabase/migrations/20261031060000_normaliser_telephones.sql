-- =====================================================================
-- Normalisation des téléphones déjà enregistrés (tous les clients, particuliers et pharmacies).
-- Format cible : « +225 » suivi de 10 chiffres (ex. +225 0700000000).
-- 1) Sauvegarde des anciens numéros dans une table de secours (pour pouvoir revenir en arrière).
-- 2) Mise à jour seulement des numéros qui contiennent exactement 10 chiffres (avec ou sans indicatif).
--    Les autres ne sont pas touchés : ils sont listés à la fin pour correction manuelle.
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- =====================================================================

create table if not exists tiers_telephones_sauvegarde as
  select id, nom, telephone, now() as sauvegarde_le from tiers;

with propres as (
  select id, regexp_replace(telephone, '\D', '', 'g') as chiffres
    from tiers
   where telephone is not null
)
update tiers t
   set telephone = '+225 ' || right(p.chiffres, 10)
  from propres p
 where p.id = t.id
   and (
        length(p.chiffres) = 10
     or (length(p.chiffres) = 13 and left(p.chiffres, 3) = '225')
     or (length(p.chiffres) = 15 and left(p.chiffres, 5) = '00225')
   );

-- Numéros restants à vérifier à la main (à lister seulement, rien n'est modifié ici) :
select nom, telephone
  from tiers
 where telephone is not null
   and telephone !~ '^\+225 [0-9]{10}$';
