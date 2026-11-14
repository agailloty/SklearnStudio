# SklearnStudio

Application web client-side (sans serveur) pour inspecter visuellement des modèles `scikit-learn` (`.joblib` / `.pkl` / `.pickle`) et tester leur inférence en ligne dans le navigateur grâce à **Pyodide (WebAssembly)**.

## Contenu actuel

- [`core/sklearn_engine.py`](core/sklearn_engine.py) : moteur Python unifié et autonome extrait d'`ONNXStudio`, prêt pour Pyodide :
  - Chargement de modèles `joblib` / `pickle` depuis des octets en mémoire (`load_and_inspect_bytes`) avec capture d'avertissements et détection des dépendances manquantes (`missing_module`).
  - Introspection complète (estimateurs imbriqués, pipelines, `ColumnTransformer`, hyperparamètres, attributs appris, versions).
  - Inférence des schémas d'entrée/sortie (détection automatique `text` / `columns` catégorielles & numériques / `matrix`).
  - Construction du graphe DAG topologique (coordonnées `x, y` prêtes pour rendu SVG/Canvas), des statistiques et de l'arbre de structure hiérarchique.
  - Génération automatique du schéma de formulaire d'inférence, parsing multi-mode (formulaire par variable, vecteur, CSV batch) et exécution des prédictions avec classement des classes.
  - Générateur de 3 modèles de démonstration (`iris_pipeline`, `titanic_columntransformer`, `text_tfidf_classifier`).
- [`PROMPT_IA.md`](PROMPT_IA.md) : cahier des charges et instructions détaillées prêtes à être fournies à une IA pour implémenter l'interface web complète autour de `core/sklearn_engine.py`.
