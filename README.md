# SklearnStudio

Application web client-side (sans serveur) pour inspecter visuellement des modèles `scikit-learn` (`.skops`, `.joblib`, `.pkl`, `.pickle`) et tester leur inférence en ligne dans le navigateur.

## Architecture

- [`core/sklearn_engine.py`](core/sklearn_engine.py) : moteur Python unifié et autonome :
  - Chargement de modèles `.skops` (recommandé) et `joblib` / `pickle` (en recours) depuis des octets en mémoire (`load_and_inspect_bytes`) avec harmonisation automatique des attributs inter-versions et détection des dépendances manquantes (`missing_module`).
  - Introspection complète (estimateurs imbriqués, pipelines, `ColumnTransformer`, hyperparamètres, attributs appris, versions).
  - Inférence des schémas d'entrée/sortie (détection automatique `text` / `columns` catégorielles & numériques / `matrix`).
  - Construction du graphe DAG topologique (coordonnées `x, y` pour rendu SVG), des statistiques et de l'arbre de structure hiérarchique.
  - Génération du schéma de formulaire d'inférence, parsing multi-mode (formulaire par variable, vecteur, CSV batch) et exécution des prédictions avec classement des classes.
- `src/` : interface React + TypeScript + Tailwind CSS exécutant le moteur Python dans un Web Worker isolé.

## Développement local

```bash
npm install
npm run dev
```

## Build statique

```bash
npm run build
npm run preview
```
