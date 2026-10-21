// Liens d'accès direct aux sections d'une page (ancres), visibles en haut et collés à l'écran au défilement.
export type ItemSommaire = { id: string; libelle: string };

export function Sommaire({ items }: { items: ItemSommaire[] }) {
  return (
    <nav className="sommaire" aria-label="Aller à une section">
      {items.map((i) => (
        <a key={i.id} href={`#${i.id}`}>{i.libelle}</a>
      ))}
    </nav>
  );
}
