# Instructions d'implémentation — SklearnStudio (Application Web 100 % Navigateur avec Pyodide)

Tu es chargé(e) de développer **SklearnStudio**, une application web monopage (SPA) **100 % côté client (sans serveur backend)** permettant d'inspecter visuellement des modèles `scikit-learn` (`.joblib`, `.pkl`, `.pickle`, archives compressées `.gz`, `.bz2`, `.xz`, `.lzma`), d'explorer leur graphe d'architecture et leurs attributs appris, et d'exécuter de l'inférence en ligne grâce à un formulaire généré automatiquement — le tout directement dans le navigateur via **Pyodide (Python compilé en WebAssembly)**.

---

## 1. Point de départ déjà fourni (OBLIGATOIRE À RÉUTILISER)

Le cœur métier Python extrait d'ONNXStudio est déjà implémenté dans :
- `core/sklearn_engine.py`

Ce module est **pur Python**, autonome, compatible Pyodide et CPython, et fournit déjà :
1. Le chargement mémoire depuis des octets navigateur (`Uint8Array` -> `bytes` / fichier temporaire dans le FS virtuel Emscripten) pour `.joblib` et `.pickle` (y compris compressés).
2. L'introspection complète des modèles scikit-learn (`Pipeline`, `ColumnTransformer`, `FeatureUnion`, `GridSearchCV`/`best_estimator_`, classifieurs, régresseurs, transformeurs, Vectorizers texte).
3. L'inférence automatique des schémas d'entrée (`text`, `columns` avec détection automatique des colonnes catégorielles encodées par `OneHotEncoder`/`OrdinalEncoder`/etc., ou `matrix`) et de sortie (`predict`, `predict_proba`, `predict_log_proba`, `decision_function`, `transform`).
4. La construction du **graphe DAG** avec positionnement topologique par couches (`x`, `y`, `width`, `height`, `category`, `dependsOn`, `dependedBy`, `statistics`, `categories`).
5. La construction de l'**arbre de structure hiérarchique** relié aux nœuds du graphe (`nodeId`) et la liste des attributs appris (`weights`, `fitted` bornés à 64 valeurs en aperçu).
6. La **génération automatique du formulaire d'inférence** (`formSchema.fields` et `formSchema.featureFields`), le **parsing strict** des saisies (formulaire champ-par-champ, vecteur libre ou CSV batch multi-lignes) et le **formatage des prédictions** (`formattedOutputs` avec `topClasses`).
7. Un générateur de **3 modèles de démonstration intégrés** (`create_demo_model_bytes` / `load_demo_model_json`) pour tester immédiatement tous les cas d'usage sans fichier local.

> **Règle stricte** : Ne réécris pas cette logique d'introspection, de graphe ou de parsing en JavaScript. Monte `core/sklearn_engine.py` dans Pyodide et utilise ses fonctions JSON comme contrat unique entre l'UI et Python.

---

## 2. Contraintes techniques et architecture Web Worker + Pyodide

### 2.1. Exécution 100 % navigateur sans serveur applicatif
- Aucun backend HTTP (pas de FastAPI, Flask, Express ou serveur Python d'inférence).
- Toute l'application doit pouvoir être déployée en hébergement purement statique (fichiers HTML/CSS/JS + `core/sklearn_engine.py` servis par GitHub Pages, Cloudflare Pages, Netlify, ou localement via `npx vite` / `python -m http.server`).
- **Stack front recommandée** : Vite + React + TypeScript (ou Preact/Solid/Vue 3 + TypeScript) avec Tailwind CSS (ou CSS Modules avec variables sémantiques). Utiliser React + TypeScript + Vite est recommandé pour la richesse de l'arbre récursif, du panneau inspecteur et du SVG DAG interactif. Assure-toi d'inclure `core/sklearn_engine.py` dans `public/core/sklearn_engine.py` (ou de le charger en raw import Vite `?raw`) afin qu'il soit disponible au runtime pour le Web Worker.

### 2.2. Isolation dans un Web Worker (`src/workers/pyodide.worker.ts`)
Le chargement de Pyodide (~15-30 Mo de WebAssembly + paquets scientifiques) et la désérialisation `joblib`/`pickle` ne doivent **jamais** figer le thread principal UI.

Cycle de vie du Worker :
1. **Initialisation** (`init`) :
   - Charger Pyodide (ex. `https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.mjs` en worker module, ou `pyodide.js`).
   - Émettre des messages de progression vers l'UI à chaque phase :
     1. Téléchargement du noyau WebAssembly Pyodide
     2. Chargement des paquets Python (`micropip`, `numpy`, `scipy`, `scikit-learn`, `pandas`, `joblib`) via `await pyodide.loadPackage(["micropip", "numpy", "scipy", "scikit-learn", "pandas", "joblib"])`
     3. Montage de `core/sklearn_engine.py` dans le FS Pyodide (`pyodide.FS.writeFile("/home/pyodide/sklearn_engine.py", engineSource)`) puis `import sklearn_engine`.
2. **Protocole RPC asynchrone** (`requestId`, `type`, `payload`) :
   - Toutes les requêtes vers le Worker sont exécutées séquentiellement via une file de promesses (Pyodide est mono-thread).
   - Commandes à supporter :
     - `LOAD_MODEL_BYTES`: `{ filename: string, buffer: ArrayBuffer }` (transférable via `postMessage(..., [buffer])`) -> appelle `sklearn_engine.load_and_inspect_bytes_json(data, filename)`.
     - `LOAD_DEMO_MODEL`: `{ kind: "iris_pipeline" | "titanic_columntransformer" | "text_tfidf_classifier" }` -> appelle `sklearn_engine.load_demo_model_json(kind)`.
     - `RUN_INFERENCE`: `{ modelId: string, payload: object }` -> appelle `sklearn_engine.run_inference_json(modelId, JSON.stringify(payload))`.
     - `UNLOAD_MODEL`: `{ modelId: string }` -> appelle `sklearn_engine.unload_model(modelId)` (critique pour libérer la mémoire RAM/WASM quand l'utilisateur ferme un modèle).
     - `INSTALL_PACKAGE`: `{ packageName: string }` -> appelle `await pyodide.loadPackage("micropip");` puis `micropip.install(packageName)` dans Pyodide.

Exemple exact de pont JS -> Python dans le worker :
```ts
// Charger un buffer binaire en Python sans copie inutile excessive
pyodide.globals.set("_tmp_bytes", new Uint8Array(buffer));
pyodide.globals.set("_tmp_filename", filename);
const rawJson = pyodide.runPython(`
sklearn_engine.load_and_inspect_bytes_json(_tmp_bytes, _tmp_filename)
`);
pyodide.globals.delete("_tmp_bytes");
pyodide.globals.delete("_tmp_filename");
return JSON.parse(rawJson);
```
> **Important** : Nettoie toujours `_tmp_bytes` et `_tmp_payload_json` des `pyodide.globals` après chaque appel pour éviter toute rétention mémoire en WASM.

### 2.3. Gestion des dépendances manquantes & sécurité Pickle
- **Dépendance manquante** : si Python retourne `{ ok: false, error: { code: "missing_module", missingPackage: "..." } }`, afficher une bannière ou modale claire indiquant le package requis (`xgboost`, `lightgbm`, `category_encoders`, etc.) avec un bouton **« Installer `<package>` via micropip et réessayer »** (et un fallback informatif si le package n'a pas de wheel pur Python compatible Pyodide).
- **Avertissement de sécurité** : avant de désérialiser un fichier local utilisateur (`.joblib` / `.pkl`), afficher une mention claire expliquant que `pickle`/`joblib` peut exécuter du code Python à l'ouverture, et que tout s'exécute localement dans le sandbox WebAssembly du navigateur sans envoi sur Internet. Permettre d'accepter d'un clic (option « Faire confiance pour cette session »).
- **Incompatibilité de version scikit-learn** : si `model.info.trainedWithSklearn && model.info.trainedWithSklearn !== model.info.runtimeSklearn`, afficher un badge d'alerte ambre dans l'en-tête (`Entraîné avec vX.Y • Runtime vA.B`) et lister les `warnings` collectés par `sklearn_engine`.

---

## 3. Contrat JSON exact de `core/sklearn_engine.py`

### 3.1. Retour de `load_and_inspect_bytes_json` / `load_demo_model_json`
```json
{
  "ok": true,
  "engineVersion": 1,
  "model": {
    "id": "hex_uuid",
    "name": "mon_modele",
    "filename": "mon_modele.joblib",
    "sizeBytes": 12450,
    "format": "scikit-learn",
    "summary": "StandardScaler -> LogisticRegression",
    "inputLayout": "matrix | columns | text",
    "info": {
      "className": "Pipeline",
      "module": "sklearn.pipeline",
      "isPipeline": true,
      "steps": [{ "name": "scaler", "className": "StandardScaler" }],
      "finalEstimator": "LogisticRegression",
      "isClassifier": true,
      "isTextModel": false,
      "nFeaturesIn": 4,
      "featureNamesIn": ["sepal length (cm)", "..."],
      "classes": ["setosa", "versicolor", "virginica"],
      "methods": ["predict", "predict_proba", "predict_log_proba", "decision_function"],
      "trainedWithSklearn": "1.6.1",
      "runtimeSklearn": "1.6.1",
      "warnings": [],
      "packages": { "numpy": "...", "scikit-learn": "...", "joblib": "..." },
      "components": { "name": "...", "className": "...", "kind": "...", "parameters": {}, "fitted": [], "children": [] }
    },
    "inputs": [
      { "name": "X", "type": "float64", "shape": [null, 4], "hasDynamicDimension": true, "display": "float64[?, 4]", "description": "..." }
    ],
    "outputs": [
      { "name": "predict", "type": "string", "shape": [null], "hasDynamicDimension": true, "display": "string[?]", "description": "" },
      { "name": "predict_proba", "type": "float64", "shape": [null, 3], "hasDynamicDimension": true, "display": "float64[?, 3]", "description": "" }
    ],
    "weights": [
      { "name": "clf.coef_", "shape": [3, 4], "dtype": "float64", "kind": "array", "elementCount": 12, "summary": "float64 (3, 4)", "values": [...] }
    ],
    "graph": {
      "nodes": [
        {
          "id": "node_0",
          "name": "scaler",
          "opType": "StandardScaler",
          "domain": "sklearn",
          "category": "Transformer",
          "attributes": { "Class": "sklearn.preprocessing._data.StandardScaler", "with_mean": "True", "mean_ · float64 (4)": [5.84, 3.05, 3.75, 1.19] },
          "inputIds": ["X"],
          "outputIds": ["scaler:node_0"],
          "dependsOn": [],
          "dependedBy": ["node_1"],
          "layer": 0,
          "row": 0,
          "x": 0,
          "y": 0,
          "width": 185,
          "height": 58
        }
      ],
      "edges": [{ "tensorName": "scaler:node_0", "fromNodeId": "node_0", "toNodeId": "node_1" }],
      "categories": ["All", "Classifier", "Transformer"],
      "statistics": { "nodeCount": 2, "edgeCount": 1, "initializerCount": 6, "totalParameters": 35, "inputCount": 1, "outputCount": 4, "distinctOpTypes": 2 }
    },
    "structure": {
      "header": "Pipeline",
      "kind": "Model",
      "description": "StandardScaler -> LogisticRegression",
      "nodeId": null,
      "parameters": [...],
      "fitted": [...],
      "children": [...]
    },
    "formSchema": {
      "inputLayout": "matrix",
      "fields": [
        { "inputName": "X", "label": "X", "kind": "vector", "type": "float64", "typeDisplay": "float64[?, 4]", "shape": [null, 4], "shapeDisplay": "float64[?, 4]", "hasDynamicShape": true, "isRequired": true, "defaultValue": "0, 0, 0, 0", "defaultText": "0, 0, 0, 0", "description": "..." }
      ],
      "featureFields": [
        { "name": "sepal length (cm)", "label": "sepal length (cm)", "index": 0, "inputType": "number", "dtype": "float64", "defaultValue": "0", "step": "any", "placeholder": "0", "description": "Numeric feature #0" }
      ],
      "supportsNamedFeatures": true,
      "nFeaturesIn": 4,
      "featureNames": ["sepal length (cm)", "..."]
    }
  }
}
```

### 3.2. Appels acceptés par `run_inference_json(model_id, payload_json)`
Le paramètre `payload` supporte 3 modes sans ambiguïté :
1. **Mode Formulaire champ-par-champ (`featureValues`)** :
   ```json
   {
     "method": "all",
     "featureValues": { "age": "34", "fare": "72.5", "sex": "female", "embarked": "C" }
   }
   ```
2. **Mode Vecteur / Tenseur (`fieldValues`)** :
   ```json
   {
     "method": "all",
     "fieldValues": { "X": { "text": "5.1, 3.5, 1.4, 0.2", "shape": "" } }
   }
   ```
3. **Mode Batch CSV / Multi-lignes (`batchText`)** :
   ```json
   {
     "method": "all",
     "batchText": "5.1, 3.5, 1.4, 0.2\n6.7, 3.0, 5.2, 2.3"
   }
   ```

### 3.3. Retour de `run_inference_json`
```json
{
  "ok": true,
  "engineVersion": 1,
  "modelId": "hex_uuid",
  "result": {
    "rowCount": 1,
    "elapsedMs": 3,
    "classes": ["setosa", "versicolor", "virginica"],
    "warnings": [],
    "outputs": [...],
    "formattedOutputs": [
      {
        "name": "predict",
        "dtype": "<U10",
        "shape": [1],
        "shapeDisplay": "[1]",
        "values": ["setosa"],
        "displayKind": "Text",
        "scalarDisplay": "setosa",
        "displayValues": ["setosa"],
        "topClasses": []
      },
      {
        "name": "predict_proba",
        "dtype": "float64",
        "shape": [1, 3],
        "shapeDisplay": "[1, 3]",
        "values": [[0.98, 0.02, 0.0]],
        "displayKind": "Top classes (raw scores)",
        "scalarDisplay": "",
        "displayValues": ["setosa: 0.98", "versicolor: 0.02", "virginica: 0"],
        "topClasses": [
          { "index": 0, "label": "setosa", "value": 0.98 },
          { "index": 1, "label": "versicolor", "value": 0.02 },
          { "index": 2, "label": "virginica", "value": 0.0 }
        ]
      }
    ]
  }
}
```

---

## 4. Spécifications UI / UX — « Très belle interface scientifique »

### 4.1. Direction visuelle & Design System
Conçois une interface haut de gamme inspirée de **Netron**, **Linear** et **Observable** :
- **Thèmes Sombre (par défaut) et Clair** avec bouton bascule persistant dans `localStorage`.
- **Palette Sombre recommandée** :
  - Arrière-plan principal : `#090D16`
  - Panneaux / cartes : `#111827` avec bordures `1px solid rgba(148, 163, 184, 0.14)`
  - Surfaces surélevées : `#1A2234`
  - Couleur d'accentuation : `#38BDF8` (Cyan électrique) / `#6366F1` (Indigo)
  - Couleurs sémantiques des nœuds par `node.category` :
    - `Pipeline` : Indigo (`#6366F1`)
    - `Transformer` : Ambre (`#F59E0B`)
    - `Classifier` : Émeraude (`#10B981`)
    - `Regressor` : Violet (`#A855F7`)
    - `Estimator` / `Other` : Bleu-gris (`#64748B`)
- **Typographie** : `Inter` (ou pile système moderne sans-serif) pour l'UI et `JetBrains Mono` / monospace pour tous les noms techniques (`StandardScaler`, `float64[?, 4]`, poids, JSON, vecteurs).

### 4.2. Structure générale (Layout Studio)
1. **Topbar compacte (52px)** :
   - Titre + badge *« 100% Local • Pyodide WASM »* (avec pastille verte une fois Pyodide prêt, ou barre de progression non bloquante pendant le bootstrap).
   - Onglets des modèles chargés en mémoire (permet de comparer plusieurs `.joblib` et de fermer un modèle en appelant `UNLOAD_MODEL`).
   - Navigation entre vues du modèle actif : **Inspecteur (Graphe & Structure)** | **Inférence en ligne** | **Métadonnées & Poids**.
   - Switch Thème Sombre/Clair + Bouton **+ Ouvrir un modèle**.
2. **Écran d'accueil (quand aucun modèle n'est chargé, ou modal « Ouvrir »)** :
   - Grande **Dropzone** animée acceptant `.joblib`, `.pkl`, `.pickle`, `.gz`, `.bz2`, `.xz`, `.lzma`.
   - Badge de confidentialité explicite : *« Vos modèles ne quittent jamais votre ordinateur »*.
   - **3 cartes Modèles de démo instantanés** :
     1. *Iris Classifier Pipeline* (`iris_pipeline` — layout `matrix` avec `featureNamesIn`)
     2. *Mixed Tabular Pipeline* (`titanic_columntransformer` — layout `columns` mixte numérique + catégoriel)
     3. *Sentiment Text Classifier* (`text_tfidf_classifier` — layout `text` brut)

### 4.3. Vue « Inspecteur de Modèle »
Disposition en 3 zones :
- **Barre de statistiques & filtres en haut** : cartes KPI compactes (`graph.statistics` : Nœuds, Arêtes, Paramètres appris totaux, Version scikit-learn, Méthodes supportées, Classes) + champ de recherche en temps réel (`name` / `opType`) + filtres pilules par `graph.categories` + bascule **Graphe DAG** / **Arbre de structure**.
- **Zone centrale (Vue Graphe SVG interactif)** :
  - Rendu SVG net (netteté Retina) utilisant les coordonnées `x, y, width, height` calculées par `sklearn_engine`.
  - Arêtes dessinées en courbes de Bézier cubiques fluides entre le bord droit du nœud source et le bord gauche du nœud cible, avec pointe de flèche.
  - Contrôles : Zoom à la molette vers le curseur, déplacement clic-glisser (*pan*), boutons flottants `+`, `-`, *Fit to screen* (`Home`), et **Minimap** optionnelle pour les gros ensembles/pipelines.
  - Clic sur un nœud -> surbrillance de l'anneau + animation subtile sur ses arêtes entrantes/sortantes (`dependsOn` / `dependedBy`) + ouverture du panneau de détails.
- **Zone centrale alternative (Arbre de structure)** :
  - Arbre dépliable récursif rendant `model.structure` (`Inputs`, hiérarchie des estimateurs, `Outputs`).
  - Clic sur un composant qui possède un `nodeId` -> affiche ses détails et permet un bouton *« Voir dans le graphe »*.
- **Panneau latéral droit (Inspecteur de nœud / poids, 360–420px)** :
  - Titre + badge de catégorie + classe Python complète (`attributes.Class`) + résumé des dépendances (*dépend de X nœud(s) • utilisé par Y nœud(s)*).
  - Section **Hyperparamètres** : table clé/valeur filtrable.
  - Section **Attributs appris (`fitted`)** :
    - **Exigence critique de performance** : lorsqu'un attribut est un tableau (`Array.isArray(val)`), implémenter une **pagination par tranche de 16 valeurs** (`1–16 sur N`, boutons `< Précédent` / `Suivant >`), avec troncature des chaînes à 256 caractères et infobulle/copie de la valeur complète, afin qu'un `RandomForest` ou `TfidfVectorizer` ne gèle jamais le DOM.
    - Mini-visualisation inline optionnelle pour les vecteurs courts (ex. barre proportionnelle pour `feature_importances_`).

### 4.4. Vue « Playground d'Inférence en ligne »
Disposition en 2 colonnes équilibrées (Formulaire à gauche, Résultats à droite) :
- **Colonne gauche — Formulaire auto-généré (`model.formSchema`)** :
  - Sélecteur de mode d'entrée par onglets :
    1. **Formulaire guidé** (recommandé par défaut si `featureFields.length > 0`) : génère automatiquement un champ HTML adapté pour chaque feature/colonne (`input type="number" step="any"` pour `float64`, `input type="text"` pour colonnes catégorielles, `<textarea>` si `inputLayout === "text"`), avec le type affiché (`float64` / `string`), la description et la possibilité de laisser vide (`NaN` -> imputé par le pipeline si présent).
    2. **Vecteur brut** (`fields`) : reproduit les champs tenseurs (`X`, ou chaque colonne) acceptant des nombres séparés par des virgules/espaces/retours à la ligne (`TensorInputParser`), pratique pour copier-coller un vecteur Python ou tester `n_features` inconnu.
    3. **Batch CSV / Multi-lignes** (`batchText`) : zone de texte multi-lignes + bouton **Importer un `.csv`**, avec détection automatique du séparateur (`,`, `;`, `\t`) et des en-têtes.
  - **Boutons d'aide utilisateur** :
    - Sélecteur de méthode (`all` par défaut, ou une méthode spécifique de `info.methods`).
    - **« Générer des valeurs plausibles »** (ex. valeurs aléatoires normales `N(0,1)` ou moyennes si `mean_` est trouvé dans un `StandardScaler` du graphe ! Astuce UX géniale : inspecter `mean_` / `scale_` dans `model.weights` pour générer des valeurs réalistes).
    - **« Réinitialiser »** et bouton principal **« Exécuter l'inférence »** (raccourci clavier `Ctrl+Enter`).
  - Gestion claire des erreurs de validation par champ et globales.
- **Colonne droite — Résultats en direct** :
  - Bandeau de synthèse : temps d'exécution (`elapsedMs ms`), nombre d'échantillons (`rowCount`), et éventuels `warnings`.
  - Si prédiction unitaire (`rowCount === 1`) :
    - Carte **Prédiction principale** (`predict`) mise en exergue.
    - Graphique en **barres horizontales triées** pour `formattedOutputs[...].topClasses` (`predict_proba` / `predict_log_proba` / `decision_function`), affichant le nom de la classe et le score en pourcentage (`98.0%`).
    - Cartes pour toute autre méthode disponible (`transform`, etc.).
  - Si prédiction par lot (`rowCount > 1`) :
    - Tableau de résultats interactif alignant les lignes d'entrée et les colonnes de prédiction/probabilités.
  - Boutons **Exporter JSON** et **Exporter CSV**.
  - **Historique de session** (dernières 10 exécutions d'inférence du modèle avec possibilité de recharger les entrées d'un clic).

---

## 5. Organisation de fichiers suggérée

```text
SklearnStudio/
├── core/
│   └── sklearn_engine.py        # Déjà implémenté — moteur extrait d'ONNXStudio
├── public/
│   └── core/
│       └── sklearn_engine.py    # Copie ou lien servi statiquement pour le Worker Pyodide
├── src/
│   ├── workers/
│   │   └── pyodide.worker.ts    # Bootstrap Pyodide + micropip + pont RPC
│   ├── services/
│   │   └── pyodideClient.ts     # Client TypeScript typé vers le Web Worker
│   ├── types/
│   │   └── model.ts             # Interfaces TypeScript correspondant exactement au contrat JSON §3
│   ├── components/
│   │   ├── TopBar.tsx
│   │   ├── WelcomeDropzone.tsx
│   │   ├── GraphCanvas.tsx      # SVG DAG zoom/pan/minimap
│   │   ├── StructureTree.tsx    # Arbre hiérarchique dépliable
│   │   ├── NodeInspectorPanel.tsx # Hyperparamètres + attributs paginés (16/page)
│   │   ├── InferencePlayground.tsx # Formulaire auto-généré (Form/Vector/Batch)
│   │   └── InferenceResults.tsx  # Barres de probabilités + tableau batch + export
│   ├── App.tsx
│   └── index.css
├── package.json
├── vite.config.ts
└── README.md
```

---

## 6. Plan d'implémentation à suivre étape par étape

1. **Initialiser le projet Vite + React + TypeScript** (sans aucune dépendance serveur ; vérifier que `core/sklearn_engine.py` est accessible au worker).
2. **Définir les types TypeScript stricts** (`src/types/model.ts`) reflétant exactement la section §3.
3. **Construire `src/workers/pyodide.worker.ts` et `src/services/pyodideClient.ts`** : tester en premier le démarrage de Pyodide + chargement des 3 modèles démo (`iris_pipeline`, `titanic_columntransformer`, `text_tfidf_classifier`).
4. **Implémenter le Shell, les thèmes Sombre/Clair, et l'écran d'accueil Drag & Drop** avec bandeau de sécurité pickle et gestion `missing_module` via `micropip`.
5. **Implémenter l'Inspecteur de modèle** :
   - Graphe DAG SVG avec zoom/pan, recherche et filtres par catégorie.
   - Arbre de structure synchronisé.
   - Panneau latéral avec pagination stricte à 16 éléments pour `fitted`.
6. **Implémenter le Playground d'inférence** :
   - Formulaire auto-généré à partir de `formSchema` (`featureFields` + `fields` + `batchText`).
   - Exécution `run_inference_json` et rendu graphique des probabilités (`topClasses`), export CSV/JSON et historique.
7. **Tester tous les scénarios critiques** :
   - Modèle `matrix` (`iris_pipeline`) : inspecteur + formulaire 4 champs + barres `predict_proba`.
   - Modèle `columns` (`titanic_columntransformer`) : branches `ColumnTransformer` dans le DAG + mix champs numériques / texte + valeur vide (`NaN`) imputée.
   - Modèle `text` (`text_tfidf_classifier`) : saisie texte brute + mode batch multi-lignes.
   - Erreur d'entrée invalide (NaN, texte dans un champ numérique) : message clair sans crasher le worker.
   - Chargement d'un fichier corrompu + fermeture d'onglet appelant `unload_model`.
   - Build statique final (`npm run build`) vérifié sur `vite preview` sans aucun appel réseau backend (hors CDN Pyodide / packages WASM).
