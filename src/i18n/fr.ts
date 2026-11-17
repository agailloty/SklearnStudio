/**
 * French message catalog.
 * Keys must stay aligned with `en.ts`.
 */
import type { MessageKey } from './en';

export const fr: Record<MessageKey, string> = {
  // Common
  'common.close': 'Fermer',
  'common.prev': 'Précédent',
  'common.next': 'Suivant',

  // Pyodide bootstrap progress
  'progress.idle': 'En attente de démarrage…',
  'progress.loadingPython': 'Chargement de l’environnement Python…',
  'progress.loadingPackages':
    'Chargement des paquets Python (numpy, scipy, scikit-learn, pandas, joblib, skops)…',
  'progress.installingSkops': 'Installation de skops via micropip…',
  'progress.initEngine': 'Initialisation du moteur d’analyse…',
  'progress.ready': 'Environnement prêt',
  'progress.workerError': 'Erreur Worker : {message}',
  'progress.initFailed': 'Échec d’initialisation Pyodide : {message}',

  // Top bar
  'topbar.closeTab': 'Fermer et libérer la mémoire',
  'topbar.closeModel': 'Fermer {name}',
  'topbar.inspector': 'Inspecteur',
  'topbar.inference': 'Inférence en ligne',
  'topbar.metadata': 'Métadonnées & Poids',
  'topbar.versionMismatchTitle':
    'Modèle entraîné avec scikit-learn {trained}, inspecté avec {runtime}',
  'topbar.trained': 'Entraîné',
  'topbar.warningsShort': '{count} avert.',
  'topbar.themeLight': 'Passer au thème clair',
  'topbar.themeDark': 'Passer au thème sombre',
  'topbar.toggleTheme': 'Basculer le thème',
  'topbar.openModel': 'Ouvrir un modèle',
  'topbar.language': 'Langue',

  // App shell (banners, KPI toolbar)
  'app.missingDependency': 'Dépendance Python manquante : {pkg}',
  'app.loadFailed': 'Impossible de charger le modèle',
  'app.dismissAlert': "Fermer l'alerte",
  'app.installing': 'Installation de {pkg}…',
  'app.installAndRetry': 'Installer « {pkg} » via micropip et réessayer',
  'app.installFailed':
    'Impossible d’installer « {pkg} » via micropip ({error}). Certains packages compilés C/C++ ne sont pas disponibles dans Pyodide.',
  'app.emptyFile': 'Le fichier sélectionné est vide.',
  'app.emptyPackageName': 'nom de package vide.',
  'app.purePythonWheelMissing': 'wheel pur Python introuvable',
  'app.nodes': 'Nœuds :',
  'app.edges': 'Arêtes :',
  'app.parameters': 'Paramètres :',
  'app.classes': 'Classes :',
  'app.searchNode': 'Rechercher un nœud…',
  'app.dagGraph': 'Graphe DAG',
  'app.structureTree': 'Arbre de structure',

  // Welcome dropzone
  'welcome.localBadge':
    'Traitement local dans le navigateur — aucun fichier envoyé sur serveur',
  'welcome.title': 'Inspecteur & Playground',
  'welcome.subtitle':
    'Explorez le graphe DAG, les hyperparamètres, les attributs appris et testez l’inférence en ligne directement dans votre navigateur.',
  'welcome.securityTitle': 'Format de recours Pickle / Joblib — Sécurité & Compatibilité',
  'welcome.securityBody':
    'Les fichiers .joblib et .pkl peuvent exécuter du code Python à l’ouverture et souffrir d’incompatibilités de version entre l’environnement d’entraînement et Pyodide (ex. attributs supprimés ou structures Cython). Privilégiez le format .skops dès que possible. Tout s’exécute localement dans le sandbox WebAssembly sans envoi sur Internet. Charger {file} ?',
  'welcome.cancel': 'Annuler',
  'welcome.loadThisFile': 'Charger ce fichier uniquement',
  'welcome.trustSession': 'Faire confiance pour cette session',
  'welcome.loadingModel': 'Chargement et introspection du modèle en cours…',
  'welcome.dropzone': 'Glissez-déposez un modèle scikit-learn ici, ou cliquez pour parcourir',
  'welcome.recommended': 'Recommandé : .skops',
  'welcome.fallback': 'Recours : .joblib, .pkl, .pickle, .gz, .bz2, .xz, .lzma',
  'welcome.note':
    'Note : les fichiers pickle/joblib peuvent rencontrer des erreurs de compatibilité selon la version de scikit-learn utilisée à l’entraînement (une normalisation automatique est tentée au chargement).',
  'welcome.demoSection': 'Modèles de démonstration instantanés',
  'welcome.irisSubtitle':
    'StandardScaler → LogisticRegression (4 variables numériques nommées)',
  'welcome.textSubtitle': 'TfidfVectorizer → MultinomialNB (classification de texte brut)',

  // Node inspector panel
  'inspector.selectNode': 'Sélectionnez un nœud du graphe',
  'inspector.selectNodeHint':
    'Cliquez sur une étape du pipeline pour inspecter ses hyperparamètres et ses attributs appris.',
  'inspector.copyValue': 'Copier la valeur complète',
  'inspector.pagination': '{start}–{end} sur {total}',
  'inspector.close': "Fermer l'inspecteur",
  'inspector.depends': 'dépend de {up} nœud(s) • utilisé par {down} nœud(s)',
  'inspector.hyperparams': 'Hyperparamètres ({count})',
  'inspector.filterParams': 'Filtrer les hyperparamètres…',
  'inspector.noParams': 'Aucun hyperparamètre.',
  'inspector.fitted': 'Attributs appris ({count})',
  'inspector.noFitted': 'Aucun attribut appris exposé pour ce nœud.',

  // Inference playground
  'playground.title': "Entrées d'inférence",
  'playground.method': 'Méthode :',
  'playground.methodAll': 'all (toutes)',
  'playground.form': 'Formulaire',
  'playground.vector': 'Vecteur brut',
  'playground.batch': 'Batch CSV',
  'playground.errorFinite': 'Entrez un nombre fini.',
  'playground.errorInvalidNumber': 'Nombre invalide (ou laissez vide pour NaN).',
  'playground.errorBatchEmpty': 'Veuillez saisir au moins une ligne de données.',
  'playground.errorCsvTooLarge': 'Le fichier CSV dépasse la limite de 10 Mo.',
  'playground.errorCsvRead': 'Impossible de lire le fichier CSV.',
  'playground.batchHint': 'Une ligne par échantillon (séparateur `,`, `;` ou tabulation)',
  'playground.importCsv': 'Importer un .csv',
  'playground.batchPlaceholderText': 'Une phrase ou document par ligne…',
  'playground.plausible': 'Valeurs plausibles',
  'playground.plausibleTitle':
    'Générer des valeurs réalistes à partir des statistiques apprises du modèle',
  'playground.reset': 'Réinitialiser',
  'playground.run': "Exécuter l'inférence",
  'playground.computing': 'Calcul…',
  'playground.emptyNan': '(vide = NaN)',

  // Inference results
  'results.title': 'Résultats en direct',
  'results.none': 'Aucune prédiction exécutée',
  'results.noneHint':
    'Remplissez le formulaire à gauche et cliquez sur « Exécuter l’inférence ».',
  'results.sampleOne': '1 échantillon',
  'results.samplesMany': '{count} échantillons',
  'results.warningsCount': '{count} avertissement(s)',
  'results.mainPrediction': 'Prédiction principale (predict)',
  'results.history': 'Historique de session ({count}/10)',
  'results.historyRows': '{count} lignes',

  // Metadata & weights view
  'metadata.general': 'Informations générales',
  'metadata.file': 'Fichier',
  'metadata.size': 'Taille',
  'metadata.rootClass': 'Classe racine',
  'metadata.inputLayout': "Layout d'entrée",
  'metadata.trainedWith': 'Entraîné avec',
  'metadata.runtimeSklearn': 'Runtime scikit-learn',
  'metadata.unknown': 'Inconnu',
  'metadata.packages': 'Versions des paquets',
  'metadata.warningsTitle': 'Avertissements ({count})',
  'metadata.inputSchema': "Schéma d'entrée ({count})",
  'metadata.outputSchema': 'Schéma de sortie ({count})',
  'metadata.weights': 'Poids & Attributs appris ({count} • {elements} éléments)',
  'metadata.filterWeights': 'Filtrer les poids…',
  'metadata.colName': 'Nom',
  'metadata.colSummary': 'Résumé',
  'metadata.colElements': 'Éléments',
  'metadata.colPreview': 'Aperçu',
  'metadata.noWeights': 'Aucun poids trouvé.',
  'metadata.page': 'Page {page} / {total}',

  // Structure tree
  'tree.title': 'Arbre hiérarchique du modèle',
  'tree.fittedCount': '{count} attr.',
  'tree.viewInGraph': 'Voir dans le graphe',
  'tree.viewInGraphTitle': 'Voir ce composant dans le graphe DAG',

  // Graph canvas
  'canvas.zoomIn': 'Zoom avant',
  'canvas.zoomOut': 'Zoom arrière',
  'canvas.fit': "Ajuster à l'écran (Home)",
  'canvas.minimap': 'Afficher / masquer la minimap',

  // Error boundary
  'error.title': "Une erreur d'affichage est survenue",
  'error.fallback': 'Erreur inattendue lors du rendu.',
  'error.reset': 'Réinitialiser la vue',
};
