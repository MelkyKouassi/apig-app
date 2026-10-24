-- Rétablit le lien compte de connexion <-> collaborateur après l'import v15.
-- À lancer APRÈS import_v15_reprise.sql, dans l'éditeur SQL de Supabase.
-- La table sauvegarde_liens_collaborateurs est créée par effacer_donnees_avant_reprise_v15.sql.

begin;

update collaborateurs c
set user_id = s.user_id
from sauvegarde_liens_collaborateurs s
where s.nom = c.nom
  and c.user_id is null;

-- Contrôle : les collaborateurs liés à un compte, et ceux restés sans lien
select nom, (user_id is not null) as lie_a_un_compte
from collaborateurs
order by nom;

commit;
