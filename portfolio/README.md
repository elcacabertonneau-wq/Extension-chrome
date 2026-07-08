# SIGNAL — portfolio one-page

Portfolio développeur en HTML/CSS/JS vanilla + Three.js + GSAP.
**Zéro build, zéro dépendance externe** : tout est vendorisé (libs + polices).

## Déployer

- **Netlify** : glisser-déposer le dossier `portfolio/`, ou connecter le repo
  (le `netlify.toml` à la racine publie déjà ce dossier).
- **En local** : `npx serve portfolio` (un simple serveur statique suffit —
  les modules ES exigent `http://`, pas `file://`).

## Personnaliser

Les points à éditer sont marqués `⚠️` dans `index.html` :

- **Nom** : `.hero__title` (les deux lignes `BERTON` / `NEAU/`) + `<title>`.
- **Email** : les deux liens `mailto:` de la section contact.
- **Projets** : les 4 `.showcase__row` (titre, description, tags, année, lien).
  Les visuels de l'aperçu flottant sont des dégradés CSS (`.project-visual--0X`) —
  remplaçables par des captures d'écran.
- **Compétences** : le tableau `SKILLS` en tête de la section 5a de `main.js`
  (nom, catégorie, description, années, niveau).
- **Réseaux** : `.contact__socials`.
- **Couleurs** : variables CSS en tête de `style.css` (`--acid`, `--violet`…).

## Architecture

| Fichier | Rôle |
|---|---|
| `index.html` | structure des 5 sections + nav (rail vertical & sommaire plein écran) |
| `style.css` | direction artistique, boutons custom, cards, responsive |
| `main.js` | effet « decode », curseur, menu, reveals GSAP, tilt, scène Three.js |
| `vendor/` | three.module.min.js, gsap + plugins (versions figées) |
| `fonts/` | Space Grotesk & JetBrains Mono auto-hébergées (woff2 latin) |

## Performance

- Bruit simplex calculé **dans le vertex shader** (GPU) → 60fps.
- Rendu 3D **mis en pause** quand le hero sort de l'écran ou l'onglet est caché.
- Géométrie réduite + pixel ratio plafonné sur mobile.
- `prefers-reduced-motion` respecté (animations coupées).
