"""Pure-Python scikit-learn inspection, DAG/structure builder, form generator, and inference engine.

Extracted and consolidated from ONNX Studio (onnxstudio_worker.py, SklearnModel.cs,
SklearnGraph.cs, SklearnStructure.cs, SklearnInferenceBackend.cs, GraphAnalysisService.cs,
FormGenerationService.cs, TensorInputParser.cs, and InferencePlaygroundViewModel.cs) so it runs
natively inside Pyodide (WebAssembly in the browser) as well as standard desktop Python.
"""

from __future__ import annotations

import csv
import inspect
import io
import json
import math
import os
import pickle
import re
import tempfile
import time
import traceback
import uuid
import warnings
from typing import Any

ENGINE_VERSION = 1
MAX_OUTPUT_ELEMENTS = 200_000
MAX_PREVIEW = 64
MAX_COMPONENTS = 200
MAX_COMPONENT_DEPTH = 8
MAX_COMPONENT_CHILDREN = 50
MAX_FITTED_ATTRIBUTES = 60

# -------------------------------------------------------------- localization

# Locale of engine-generated diagnostics ("en" or "fr"). The web worker calls
# set_locale() after loading the module and whenever the UI language changes.
LOCALE = "en"

_ENGINE_MESSAGES: dict[str, dict[str, str]] = {
    "more_suffix": {
        "en": " (+{count} more)",
        "fr": " (+{count} autres)",
    },
    "skops_untrusted_types": {
        "en": "skops: non-standard types trusted in the WASM sandbox: {preview}{suffix}",
        "fr": "skops : types non-standard approuvés dans le sandbox WASM : {preview}{suffix}",
    },
    "auto_compat_patched": {
        "en": "Auto compatibility: completed attribute(s): {preview}{suffix}",
        "fr": "Compatibilité auto : attribut(s) complété(s) : {preview}{suffix}",
    },
    "skops_format_needs_package": {
        "en": "This model uses the recommended .skops format and requires the Python package 'skops'.",
        "fr": "Ce modèle est au format recommandé .skops et nécessite le package Python 'skops'.",
    },
    "loaded_via_fallback_loader": {
        "en": "Loaded via {loader} (fallback): scikit-learn version incompatibilities may occur. Prefer the .skops format.",
        "fr": "Chargé via {loader} (recours) : des incompatibilités de version scikit-learn peuvent survenir. Privilégiez le format .skops.",
    },
    "cython_binary_mismatch": {
        "en": "Cython binary incompatibility between the training scikit-learn version and this runtime ({error}). Export the model with skops or re-export it.",
        "fr": "Incompatibilité binaire Cython entre la version scikit-learn d'entraînement et ce runtime ({error}). Exportez le modèle avec skops ou ré-exportez-le.",
    },
    "unknown_version": {
        "en": "unknown",
        "fr": "inconnue",
    },
    "inference_version_mismatch": {
        "en": "scikit-learn compatibility error during inference (trained: v{trained}, runtime: v{runtime}): {error}. Prefer the .skops format.",
        "fr": "Erreur de compatibilité scikit-learn à l'inférence (entraîné : v{trained}, runtime : v{runtime}) : {error}. Privilégiez le format .skops.",
    },
}


def set_locale(locale: str) -> None:
    """Set the language used for engine-generated diagnostics ('en' or 'fr')."""
    global LOCALE
    LOCALE = "fr" if str(locale).lower().startswith("fr") else "en"


def tr(key: str, **params: Any) -> str:
    """Translate an engine message into the active locale."""
    entry = _ENGINE_MESSAGES.get(key)
    if entry is None:
        return key
    template = entry.get(LOCALE) or entry["en"]
    return template.format(**params)


CHILD_ATTRIBUTES = (
    "best_estimator_",
    "estimator_",
    "base_estimator_",
    "final_estimator_",
    "regressor_",
    "classifier_",
)
INFERENCE_METHODS = (
    "predict",
    "predict_proba",
    "predict_log_proba",
    "decision_function",
    "transform",
)
CATEGORICAL_ENCODERS = frozenset(
    {
        "OneHotEncoder",
        "OrdinalEncoder",
        "TargetEncoder",
        "LabelEncoder",
        "CountVectorizer",
        "TfidfVectorizer",
        "HashingVectorizer",
        "FeatureHasher",
    }
)
SKOPS_EXTENSIONS = frozenset({".skops"})
COMPRESSED_JOBLIB_EXTENSIONS = frozenset({".joblib", ".jbl", ".z", ".gz", ".bz2", ".xz", ".lzma"})

# In-memory cache of loaded models keyed by model_id so browser inference calls do not unpickle repeatedly.
_SESSION_MODELS: dict[str, dict[str, Any]] = {}


class EngineError(Exception):
    """Structured error returned to the frontend or Pyodide Web Worker."""

    def __init__(self, code: str, message: str, missing_package: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.missing_package = missing_package


# ---------------------------------------------------------------- JSON helpers

def to_py(value: Any) -> Any:
    """Convert numpy / pandas / scipy values to strict JSON-compatible Python values."""
    try:
        import numpy as np
    except ImportError:  # pragma: no cover
        np = None

    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if np is not None:
        if isinstance(value, np.generic):
            return to_py(value.item())
        if isinstance(value, np.ndarray):
            return to_py(value.tolist())
        if isinstance(value, np.dtype):
            return str(value)
    if isinstance(value, (list, tuple, set)):
        return [to_py(v) for v in value]
    if isinstance(value, dict):
        return {str(k): to_py(v) for k, v in value.items()}
    return str(value)


def _error_payload(code: str, message: str, trace: str = "", missing_package: str | None = None) -> dict[str, Any]:
    error: dict[str, Any] = {
        "code": code,
        "message": message,
        "trace": trace,
    }
    if missing_package:
        error["missingPackage"] = missing_package
    return {"ok": False, "error": error, "engineVersion": ENGINE_VERSION}


# --------------------------------------------------------------- model loading

def _coerce_bytes(data: Any) -> bytes:
    """Normalize bytes, bytearray, memoryview, or Pyodide JsProxy typed arrays to bytes."""
    if hasattr(data, "to_py"):
        data = data.to_py()
    if isinstance(data, bytes):
        return data
    return bytes(data)


def _pickle_load(path: str) -> Any:
    with open(path, "rb") as handle:
        return pickle.load(handle)


def _skops_load(path: str, collected_warnings: list[str]) -> Any:
    import skops.io as sio

    untrusted = sio.get_untrusted_types(file=path)
    if untrusted:
        preview = ", ".join(str(t) for t in untrusted[:8])
        suffix = tr("more_suffix", count=len(untrusted) - 8) if len(untrusted) > 8 else ""
        collected_warnings.append(
            tr("skops_untrusted_types", preview=preview, suffix=suffix)
        )
    return sio.load(path, trusted=untrusted)


def _iter_all_estimators(model: Any, seen: set[int] | None = None):
    """Yield every nested estimator/transformer inside pipelines, ensembles, and meta-estimators."""
    if seen is None:
        seen = set()
    if model is None or isinstance(model, (str, bytes, int, float, bool)):
        return
    obj_id = id(model)
    if obj_id in seen:
        return
    seen.add(obj_id)
    yield model

    for _, step in steps_of(model):
        yield from _iter_all_estimators(step, seen)

    for attr_name in ("transformers_", "transformers", "transformer_list"):
        items = getattr(model, attr_name, None)
        if isinstance(items, (list, tuple)):
            for item in items:
                if isinstance(item, (list, tuple)) and len(item) > 1:
                    yield from _iter_all_estimators(item[1], seen)

    for attr_name in ("estimators_", "estimators"):
        items = getattr(model, attr_name, None)
        if isinstance(items, (list, tuple)):
            for item in items:
                est = item[1] if isinstance(item, (list, tuple)) and len(item) > 1 else item
                yield from _iter_all_estimators(est, seen)

    for attr_name in CHILD_ATTRIBUTES:
        child = getattr(model, attr_name, None)
        if child is not None:
            yield from _iter_all_estimators(child, seen)

    calibrated = getattr(model, "calibrated_classifiers_", None)
    if isinstance(calibrated, (list, tuple)):
        for cal in calibrated:
            for sub_attr in ("estimator", "base_estimator"):
                sub = getattr(cal, sub_attr, None)
                if sub is not None:
                    yield from _iter_all_estimators(sub, seen)


def _harmonize_loaded_model(model: Any, collected_warnings: list[str]) -> Any:
    """Layer A: Best-effort compatibility patching for cross-version scikit-learn models."""
    patched: list[str] = []

    for est in _iter_all_estimators(model):
        cls = type(est)
        cls_name = cls.__name__
        if not hasattr(est, "__dict__"):
            continue

        # 1. Generic __init__ default injection for missing hyperparameters
        try:
            sig = inspect.signature(cls.__init__)
            for param_name, param in sig.parameters.items():
                if param_name == "self":
                    continue
                if param.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
                    continue
                if param.default is inspect.Parameter.empty:
                    continue
                if not hasattr(est, param_name):
                    try:
                        setattr(est, param_name, param.default)
                        patched.append(f"{cls_name}.{param_name}")
                    except Exception:  # noqa: BLE001
                        pass
        except (ValueError, TypeError):
            pass

        # 2. Targeted cross-version attribute migrations
        if cls_name == "LogisticRegression" and not hasattr(est, "multi_class"):
            try:
                est.multi_class = "auto"
                patched.append("LogisticRegression.multi_class='auto'")
            except Exception:  # noqa: BLE001
                pass

        if cls_name == "OneHotEncoder":
            if hasattr(est, "sparse_output") and not hasattr(est, "sparse"):
                try:
                    est.sparse = est.sparse_output
                    patched.append("OneHotEncoder.sparse")
                except Exception:  # noqa: BLE001
                    pass
            elif hasattr(est, "sparse") and not hasattr(est, "sparse_output"):
                try:
                    est.sparse_output = est.sparse
                    patched.append("OneHotEncoder.sparse_output")
                except Exception:  # noqa: BLE001
                    pass

        if cls_name == "SimpleImputer" and not hasattr(est, "_fill_dtype"):
            stats = getattr(est, "statistics_", None)
            if stats is not None and hasattr(stats, "dtype"):
                try:
                    est._fill_dtype = stats.dtype
                    patched.append("SimpleImputer._fill_dtype")
                except Exception:  # noqa: BLE001
                    pass

        if any(
            k in cls_name
            for k in ("Tree", "Forest", "GradientBoosting", "ExtraTrees", "HistGradientBoosting")
        ) and not hasattr(est, "monotonic_cst"):
            try:
                est.monotonic_cst = None
                patched.append(f"{cls_name}.monotonic_cst=None")
            except Exception:  # noqa: BLE001
                pass

    if patched:
        unique_patched = list(dict.fromkeys(patched))
        preview = ", ".join(unique_patched[:8])
        suffix = tr("more_suffix", count=len(unique_patched) - 8) if len(unique_patched) > 8 else ""
        collected_warnings.append(
            tr("auto_compat_patched", preview=preview, suffix=suffix)
        )

    return model


def _is_cython_binary_mismatch(error: Exception) -> bool:
    msg = str(error).lower()
    return (
        "incompatible dtype" in msg
        or "node array from the pickle" in msg
        or "buffer dtype mismatch" in msg
    )


def _run_loaders(path: str, extension: str, collected_warnings: list[str]) -> Any:
    try:
        import skops.io  # noqa: F401
        has_skops = True
    except ImportError:
        has_skops = False

    if extension in SKOPS_EXTENSIONS and not has_skops:
        raise EngineError(
            "missing_module",
            tr("skops_format_needs_package"),
            missing_package="skops",
        )

    try:
        import joblib
    except ImportError:
        joblib = None

    loaders: list[tuple[str, Any]] = []
    if extension in SKOPS_EXTENSIONS:
        loaders.append(("skops", lambda p: _skops_load(p, collected_warnings)))
    else:
        if has_skops:
            loaders.append(("skops", lambda p: _skops_load(p, collected_warnings)))
        if extension in COMPRESSED_JOBLIB_EXTENSIONS:
            if joblib is not None:
                loaders.append(("joblib", joblib.load))
            loaders.append(("pickle", _pickle_load))
        else:
            loaders.append(("pickle", _pickle_load))
            if joblib is not None:
                loaders.append(("joblib", joblib.load))

    last_error: Exception | None = None
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        for loader_name, loader in loaders:
            try:
                model = loader(path)
                for item in caught:
                    collected_warnings.append(f"{item.category.__name__}: {item.message}")
                if loader_name in ("pickle", "joblib"):
                    collected_warnings.append(
                        tr("loaded_via_fallback_loader", loader=loader_name)
                    )
                return _harmonize_loaded_model(model, collected_warnings)
            except ModuleNotFoundError as error:
                missing_name = (error.name or "").split(".")[0] or None
                raise EngineError(
                    "missing_module",
                    f"The model needs the Python package '{error.name}', which is not installed in this runtime.",
                    missing_package=missing_name,
                ) from error
            except Exception as error:  # noqa: BLE001
                last_error = error

    if last_error is not None and _is_cython_binary_mismatch(last_error):
        raise EngineError(
            "load_failed",
            tr(
                "cython_binary_mismatch",
                error=f"{type(last_error).__name__}: {last_error}",
            ),
        )

    raise EngineError(
        "load_failed",
        f"The file could not be loaded as a skops, joblib or pickle model: {type(last_error).__name__}: {last_error}",
    )


def load_model(path: str, collected_warnings: list[str]) -> Any:
    """Load a joblib or pickle model from a filesystem path."""
    if not os.path.isfile(path):
        raise EngineError("file_not_found", f"The model file does not exist: {path}")
    extension = os.path.splitext(path)[1].lower()
    return _run_loaders(path, extension, collected_warnings)


def load_model_from_bytes(data: bytes | bytearray | memoryview, filename: str, collected_warnings: list[str]) -> Any:
    """Load a joblib or pickle model from an in-memory buffer (Pyodide-friendly)."""
    raw_bytes = _coerce_bytes(data)
    if not raw_bytes:
        raise EngineError("invalid_input", "The uploaded model file is empty.")

    extension = os.path.splitext(filename or "model.joblib")[1].lower() or ".joblib"
    fd, temp_path = tempfile.mkstemp(prefix="sklearnstudio_", suffix=extension)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw_bytes)
        return _run_loaders(temp_path, extension, collected_warnings)
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


# --------------------------------------------------------------- introspection

def steps_of(model: Any) -> list[tuple[str, Any]]:
    steps = getattr(model, "steps", None)
    if isinstance(steps, list):
        return [(name, estimator) for name, estimator in steps if estimator not in (None, "passthrough")]
    return []


def first_estimator(model: Any) -> Any:
    steps = steps_of(model)
    return steps[0][1] if steps else model


def last_estimator(model: Any) -> Any:
    steps = steps_of(model)
    return last_estimator(steps[-1][1]) if steps else model


def iter_estimators(model: Any):
    yield model
    for _, step in steps_of(model):
        yield from iter_estimators(step)
    transformers = getattr(model, "transformers", None)
    if isinstance(transformers, list):
        for item in transformers:
            if len(item) > 1 and hasattr(item[1], "fit"):
                yield from iter_estimators(item[1])


def has_column_transformer(model: Any) -> bool:
    return any(type(e).__name__ == "ColumnTransformer" for e in iter_estimators(model))


def is_text_model(model: Any) -> bool:
    try:
        from sklearn.feature_extraction import text as sk_text
        text_types = (sk_text.CountVectorizer, sk_text.TfidfVectorizer, sk_text.HashingVectorizer)
        return isinstance(first_estimator(model), text_types)
    except Exception:  # noqa: BLE001
        return False


def sklearn_version_of(model: Any) -> str | None:
    try:
        return model.__getstate__().get("_sklearn_version")
    except Exception:  # noqa: BLE001
        return None


def installed_versions() -> dict[str, str | None]:
    versions: dict[str, str | None] = {}
    try:
        from importlib import metadata
        for name in ("skops", "numpy", "scipy", "pandas", "scikit-learn", "joblib"):
            try:
                versions[name] = metadata.version(name)
            except Exception:  # noqa: BLE001
                versions[name] = None
    except Exception:  # noqa: BLE001
        pass
    return versions


def short_repr(value: Any, limit: int = 120) -> str:
    text = repr(value)
    return text if len(text) <= limit else text[: limit - 3] + "..."


def is_classifier(estimator: Any, classes: Any) -> bool:
    try:
        from sklearn.base import is_classifier as sk_is_classifier
        if sk_is_classifier(estimator):
            return True
    except Exception:  # noqa: BLE001
        pass
    return classes is not None and hasattr(estimator, "predict_proba")


def is_estimator(value: Any) -> bool:
    return hasattr(value, "get_params") and hasattr(value, "fit")


def describe_param(value: Any) -> str:
    """Readable, bounded text of a hyper-parameter (nested estimators are shown by name)."""
    if is_estimator(value):
        return type(value).__name__
    if isinstance(value, (list, tuple)) and value and all(isinstance(v, tuple) and v and isinstance(v[0], str) for v in value):
        return "[" + ", ".join(str(v[0]) for v in value[:20]) + ("..." if len(value) > 20 else "") + "]"
    return short_repr(value, 200)


def parameters_of(estimator: Any) -> dict[str, str]:
    try:
        return {str(k): describe_param(v) for k, v in list(estimator.get_params(deep=False).items())[:100]}
    except Exception:  # noqa: BLE001
        return {}


def estimator_kind(estimator: Any) -> str:
    name = type(estimator).__name__
    if getattr(estimator, "steps", None) is not None:
        return "Pipeline"
    if name in ("ColumnTransformer", "FeatureUnion"):
        return name
    try:
        from sklearn.base import is_classifier as sk_is_classifier, is_regressor as sk_is_regressor
        if sk_is_classifier(estimator):
            return "Classifier"
        if sk_is_regressor(estimator):
            return "Regressor"
    except Exception:  # noqa: BLE001
        pass
    if hasattr(estimator, "transform"):
        return "Transformer"
    return "Estimator"


def child_estimators(model: Any) -> list[tuple[str, Any, str]]:
    """Nested estimators as (name, estimator, note): pipeline steps, column transformers, ensembles, wrappers."""
    children: list[tuple[str, Any, str]] = []
    steps = getattr(model, "steps", None)
    transformers = getattr(model, "transformers_", None) or getattr(model, "transformers", None)
    union = getattr(model, "transformer_list", None)
    estimators = getattr(model, "estimators", None)
    if isinstance(steps, list):
        children = [(item[0], item[1], "") for item in steps if len(item) > 1]
    elif isinstance(transformers, list):
        children = [(item[0], item[1], "columns: " + short_repr(item[2], 160)) for item in transformers if len(item) > 2]
    elif isinstance(union, list):
        children = [(item[0], item[1], "") for item in union if len(item) > 1]
    elif isinstance(estimators, list) and estimators and all(isinstance(item, tuple) and len(item) == 2 for item in estimators):
        children = [(item[0], item[1], "") for item in estimators]

    known = {id(c[1]) for c in children}
    for attribute in CHILD_ATTRIBUTES:
        try:
            value = getattr(model, attribute, None)
        except Exception:  # noqa: BLE001
            value = None
        if value is not None and is_estimator(value) and id(value) not in known:
            children.append((attribute, value, ""))
            known.add(id(value))
    return children


def scalar_text(value: Any) -> str:
    if isinstance(value, float):
        value = float(value)
        return repr(value) if math.isfinite(value) else str(value)
    if isinstance(value, int) and not isinstance(value, bool):
        return str(int(value))
    return short_repr(value, 200) if not isinstance(value, str) else (value if len(value) <= 200 else value[:197] + "...")


def summarize_attribute(name: str, value: Any, preview: int) -> dict[str, Any]:
    """One learned (fitted) attribute: scalars as text, arrays/lists/dicts as a bounded preview."""
    import numpy as np

    item: dict[str, Any] = {
        "name": name,
        "kind": "scalar",
        "dtype": None,
        "shape": [],
        "count": 1,
        "values": [],
        "summary": "",
    }
    try:
        if hasattr(value, "to_numpy") and not hasattr(value, "tocoo"):
            value = value.to_numpy()
        if value is None or isinstance(value, (bool, int, float, str)):
            item["summary"] = scalar_text(value)
        elif isinstance(value, np.generic):
            item["summary"] = scalar_text(value.item())
            item["dtype"] = str(value.dtype)
        elif hasattr(value, "tocoo"):
            item.update(kind="sparse", shape=[int(d) for d in value.shape], count=int(value.nnz), dtype=str(value.dtype))
            item["summary"] = f"sparse {value.dtype} matrix {tuple(value.shape)}, {value.nnz} stored values"
        elif isinstance(value, np.ndarray) or (
            isinstance(value, (list, tuple))
            and len(value) <= 100_000
            and all(isinstance(v, (bool, int, float, str, np.generic)) or v is None for v in value[:200])
        ):
            array = value if isinstance(value, np.ndarray) else np.asarray(value)
            item.update(kind="array", dtype=str(array.dtype), shape=[int(d) for d in array.shape], count=int(array.size))
            item["summary"] = f"{array.dtype} {tuple(array.shape)}"
            head = array.flat[:preview]
            item["values"] = (
                [(v if isinstance(v, str) else short_repr(v, 80)) if array.dtype == object else v for v in to_py(head)]
                if preview > 0
                else []
            )
        elif isinstance(value, dict):
            item.update(kind="dict", count=len(value))
            item["summary"] = f"{len(value)} entries"
            item["values"] = [f"{k}: {short_repr(v, 80)}" for k, v in list(value.items())[:preview]]
        elif isinstance(value, (list, tuple)):
            kinds: dict[str, int] = {}
            for entry in value:
                key = type(entry).__name__
                kinds[key] = kinds.get(key, 0) + 1
            item.update(kind="list", count=len(value))
            item["summary"] = f"{len(value)} x " + ", ".join(f"{n} {k}" for k, n in list(kinds.items())[:5])
        elif is_estimator(value):
            item.update(kind="object")
            item["summary"] = type(value).__name__
        else:
            item.update(kind="object")
            item["summary"] = f"{type(value).__name__}: {short_repr(value, 160)}"
    except Exception as error:  # noqa: BLE001
        item.update(kind="object", values=[])
        item["summary"] = f"unavailable ({type(error).__name__}: {error})"
    return item


def fitted_attributes(estimator: Any, skip: set[int], preview: int) -> list[dict[str, Any]]:
    try:
        attributes = vars(estimator)
    except TypeError:
        attributes = {}
    entries: list[dict[str, Any]] = []
    for key, value in attributes.items():
        if not key.endswith("_") or key.startswith("_") or id(value) in skip:
            continue
        if key == "tree_":
            for stat in ("node_count", "max_depth", "n_leaves", "n_features", "n_outputs"):
                if hasattr(value, stat):
                    entries.append(
                        {
                            "name": "tree_." + stat,
                            "kind": "scalar",
                            "dtype": None,
                            "shape": [],
                            "count": 1,
                            "values": [],
                            "summary": str(getattr(value, stat)),
                        }
                    )
            continue
        entries.append(summarize_attribute(key, value, preview))
    if "feature_importances_" not in attributes and hasattr(type(estimator), "feature_importances_"):
        try:
            entries.append(summarize_attribute("feature_importances_", estimator.feature_importances_, preview))
        except Exception:  # noqa: BLE001
            pass
    return entries[:MAX_FITTED_ATTRIBUTES]


def build_component(name: str, estimator: Any, note: str, preview: int, state: dict[str, int], depth: int = 0) -> dict[str, Any]:
    state["count"] += 1
    node: dict[str, Any] = {
        "name": name,
        "className": type(estimator).__name__,
        "module": type(estimator).__module__,
        "kind": "Passthrough" if isinstance(estimator, str) else estimator_kind(estimator),
        "description": note,
        "parameters": {},
        "fitted": [],
        "children": [],
    }
    if not is_estimator(estimator):
        node["className"] = str(estimator) if isinstance(estimator, str) else type(estimator).__name__
        return node

    node["parameters"] = parameters_of(estimator)
    children = child_estimators(estimator)
    node["fitted"] = fitted_attributes(estimator, {id(c[1]) for c in children}, preview)
    if depth < MAX_COMPONENT_DEPTH:
        for child_name, child, child_note in children[:MAX_COMPONENT_CHILDREN]:
            if state["count"] >= MAX_COMPONENTS:
                break
            node["children"].append(build_component(str(child_name), child, child_note, preview, state, depth + 1))
    return node


def build_summary(info: dict[str, Any]) -> str:
    if info.get("isPipeline"):
        steps = info.get("steps") or []
        return " -> ".join(s["className"] for s in steps) if steps else info["className"]
    return info["className"]


def inspect_model(model: Any, collected_warnings: list[str], preview: int = MAX_PREVIEW) -> dict[str, Any]:
    import sklearn

    feature_names = getattr(model, "feature_names_in_", None)
    n_features = getattr(model, "n_features_in_", None)
    classes = getattr(last_estimator(model), "classes_", None)

    try:
        params = {k: short_repr(v) for k, v in list(model.get_params(deep=False).items())[:40]}
    except Exception:  # noqa: BLE001
        params = {}

    steps = [{"name": name, "className": type(est).__name__} for name, est in steps_of(model)]
    info: dict[str, Any] = {
        "components": build_component(type(model).__name__, model, "", preview, {"count": 0}),
        "className": type(model).__name__,
        "module": type(model).__module__,
        "isPipeline": bool(steps),
        "steps": steps,
        "finalEstimator": type(last_estimator(model)).__name__,
        "isClassifier": is_classifier(last_estimator(model), classes),
        "isTextModel": is_text_model(model),
        "nFeaturesIn": int(n_features) if n_features is not None else None,
        "featureNamesIn": [str(n) for n in feature_names] if feature_names is not None else None,
        "classes": to_py(classes)[:200] if classes is not None else None,
        "methods": [m for m in INFERENCE_METHODS if callable(getattr(model, m, None))],
        "parameters": params,
        "trainedWithSklearn": sklearn_version_of(model),
        "runtimeSklearn": sklearn.__version__,
        "warnings": list(collected_warnings),
        "packages": installed_versions(),
    }
    info["summary"] = build_summary(info)
    return info


# ------------------------------------------- schema inference (SklearnModel.cs)

def _descendants(root: dict[str, Any] | None):
    if root is None:
        return
    yield root
    for child in root.get("children") or []:
        yield from _descendants(child)


def is_categorical(root_component: dict[str, Any] | None, column_name: str) -> bool:
    """Return True when any ColumnTransformer branch targeting column_name contains a categorical encoder."""
    for comp in _descendants(root_component):
        if comp.get("kind") != "ColumnTransformer":
            continue
        for branch in comp.get("children") or []:
            desc = branch.get("description") or ""
            if (f"'{column_name}'" in desc or f'"{column_name}"' in desc) and any(
                d.get("className") in CATEGORICAL_ENCODERS for d in _descendants(branch)
            ):
                return True
    return False


def format_tensor_display(dtype: str, shape: list[int | None]) -> str:
    dims = ", ".join("?" if d is None else str(d) for d in shape)
    return f"{dtype}[{dims}]"


def _make_schema(name: str, dtype: str, shape: list[int | None], description: str = "") -> dict[str, Any]:
    return {
        "name": name,
        "type": dtype,
        "shape": shape,
        "hasDynamicDimension": any(d is None for d in shape),
        "display": format_tensor_display(dtype, shape),
        "description": description,
    }


def build_inputs_schema(info: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """Infer input layout ('text' | 'columns' | 'matrix') and tensor schemas matching SklearnModel.cs."""
    if info.get("isTextModel"):
        return "text", [_make_schema("text", "string", [None, 1], "One text per row")]

    feature_names = info.get("featureNamesIn")
    components = info.get("components")
    if feature_names and any(c.get("kind") == "ColumnTransformer" for c in _descendants(components)):
        columns = [
            _make_schema(name, "string" if is_categorical(components, name) else "float64", [None, 1])
            for name in feature_names
        ]
        return "columns", columns

    features = info.get("nFeaturesIn")
    if features is None and feature_names:
        features = len(feature_names)
    desc = ", ".join(feature_names) if feature_names else "Feature values of each row"
    return "matrix", [_make_schema("X", "float64", [None, features], desc)]


def _all_integer_labels(classes: list[Any] | None) -> bool:
    if not classes:
        return False
    for entry in classes:
        if isinstance(entry, bool):
            return False
        if isinstance(entry, int):
            continue
        try:
            int(str(entry).strip())
        except ValueError:
            return False
    return True


def build_outputs_schema(info: dict[str, Any]) -> list[dict[str, Any]]:
    """Infer output tensor schemas per supported inference method matching SklearnModel.cs."""
    classes = info.get("classes")
    class_count = len(classes) if classes is not None else None
    integer_labels = _all_integer_labels(classes)
    methods = info.get("methods") or ["predict"]

    outputs: list[dict[str, Any]] = []
    for method in methods:
        if method == "predict":
            dtype = ("int64" if integer_labels else "string") if info.get("isClassifier") else "float64"
            outputs.append(_make_schema(method, dtype, [None]))
        elif method in ("predict_proba", "predict_log_proba"):
            outputs.append(_make_schema(method, "float64", [None, class_count]))
        elif method == "decision_function":
            shape: list[int | None] = [None, class_count] if (class_count is not None and class_count > 2) else [None]
            outputs.append(_make_schema(method, "float64", shape))
        else:
            outputs.append(_make_schema(method, "float64", [None, None]))
    return outputs


def build_weights(root_component: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Collect learned array/sparse attributes across all estimator components."""
    weights: list[dict[str, Any]] = []
    for component in _descendants(root_component):
        for attr in component.get("fitted") or []:
            shape = attr.get("shape") or []
            if attr.get("kind") in ("array", "sparse") and len(shape) > 0:
                element_count = 1
                for dim in shape:
                    element_count *= int(dim)
                weights.append(
                    {
                        "name": f"{component['name']}.{attr['name']}",
                        "shape": shape,
                        "dtype": attr.get("dtype"),
                        "kind": attr.get("kind"),
                        "elementCount": element_count,
                        "summary": attr.get("summary", ""),
                        "values": attr.get("values") or [],
                    }
                )
    return weights


# ------------------------------------ DAG computation graph + structure builder

def _qualified_name(component: dict[str, Any]) -> str:
    module = component.get("module") or ""
    class_name = component.get("className") or ""
    return f"{module}.{class_name}" if module else class_name


def _format_fitted_entry(attribute: dict[str, Any]) -> dict[str, Any]:
    values = attribute.get("values") or []
    shape = attribute.get("shape") or []
    count = int(attribute.get("count") or 1)
    if not values:
        return {
            "key": attribute["name"],
            "displayValue": attribute.get("summary", ""),
            "hasValues": False,
            "count": 1,
            "values": [],
            "shape": shape,
            "dtype": attribute.get("dtype"),
        }

    shape_part = f" · {attribute.get('dtype')} ({', '.join(str(d) for d in shape)})" if shape else ""
    preview_part = f" · first {len(values):,} of {count:,}" if count > len(values) else ""
    return {
        "key": f"{attribute['name']}{shape_part}{preview_part}",
        "displayValue": attribute.get("summary", ""),
        "hasValues": True,
        "count": len(values),
        "totalCount": count,
        "values": values,
        "shape": shape,
        "dtype": attribute.get("dtype"),
    }


def _component_attributes_map(component: dict[str, Any]) -> dict[str, Any]:
    attrs: dict[str, Any] = {"Class": _qualified_name(component)}
    if component.get("description"):
        attrs["Details"] = component["description"]
    for k, v in (component.get("parameters") or {}).items():
        attrs[k] = v
    for fitted in component.get("fitted") or []:
        entry = _format_fitted_entry(fitted)
        attrs[entry["key"]] = entry["values"] if entry["hasValues"] else entry["displayValue"]
    return attrs


def _role_of(parent: dict[str, Any], child: dict[str, Any]) -> str:
    parent_kind = parent.get("kind")
    child_name = child.get("name") or ""
    if parent_kind == "Pipeline":
        return "step"
    if parent_kind in ("ColumnTransformer", "FeatureUnion"):
        return "branch"
    if child_name == "best_estimator_":
        return "step"
    if child_name.endswith("_"):
        return "inner"
    return "branch"


def _compute_graph_layout(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> None:
    """Compute layered DAG positions (BFS topological layering from GraphViewer.cs)."""
    ids = {n["id"] for n in nodes}
    incoming = {node_id: 0 for node_id in ids}
    outgoing: dict[str, list[str]] = {node_id: [] for node_id in ids}
    for edge in edges:
        src = edge["fromNodeId"]
        dst = edge["toNodeId"]
        if src in ids and dst in ids:
            outgoing[src].append(dst)
            incoming[dst] += 1

    layers = {node_id: 0 for node_id in ids}
    queue = [n["id"] for n in nodes if incoming[n["id"]] == 0]
    while queue:
        current = queue.pop(0)
        for target in outgoing[current]:
            layers[target] = max(layers[target], layers[current] + 1)
            incoming[target] -= 1
            if incoming[target] == 0:
                queue.append(target)

    rows_per_layer: dict[int, int] = {}
    for node in nodes:
        layer = layers[node["id"]]
        row = rows_per_layer.get(layer, 0)
        rows_per_layer[layer] = row + 1
        node["layer"] = layer
        node["row"] = row
        node["x"] = layer * 230
        node["y"] = row * 90
        node["width"] = 185
        node["height"] = 58


def build_computation_graph(
    info: dict[str, Any],
    inputs_schema: list[dict[str, Any]],
    outputs_schema: list[dict[str, Any]] | None = None,
    weights: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], dict[int, str]]:
    """Build DAG nodes, edges, topological layout, and statistics matching SklearnGraph.cs."""
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    producers: dict[str, str] = {}
    node_ids: dict[int, str] = {}

    def add_node(name: str, op_type: str, module: str, inputs: list[str], category: str, attributes: dict[str, Any]) -> str:
        node_id = f"node_{len(nodes)}"
        output = f"{name}:{node_id}"
        nodes.append(
            {
                "id": node_id,
                "name": name,
                "opType": op_type,
                "domain": (module or "").split(".")[0],
                "category": category,
                "attributes": attributes,
                "inputIds": list(inputs),
                "outputIds": [output],
            }
        )
        seen: set[str] = set()
        for inp in inputs:
            if inp in seen:
                continue
            seen.add(inp)
            if inp in producers:
                edges.append({"tensorName": inp, "fromNodeId": producers[inp], "toNodeId": node_id})
        producers[output] = node_id
        return node_id

    def emit(component: dict[str, Any], inputs: list[str]) -> list[str]:
        children = component.get("children") or []
        steps = [c for c in children if _role_of(component, c) == "step"]
        if steps:
            current = list(inputs)
            for step in steps:
                current = emit(step, current)
            return current

        branches = [c for c in children if _role_of(component, c) == "branch"]
        merged = [out for branch in branches for out in emit(branch, inputs)] if branches else list(inputs)

        kind = component.get("kind") or "Estimator"
        if branches or kind in ("ColumnTransformer", "FeatureUnion"):
            category = "Pipeline"
        elif kind in ("Transformer", "Classifier", "Regressor"):
            category = kind
        elif kind == "Passthrough":
            category = "Other"
        else:
            category = "Estimator"

        node_id = add_node(
            component.get("name", ""),
            component.get("className", ""),
            component.get("module", ""),
            merged,
            category,
            _component_attributes_map(component),
        )
        node_ids[id(component)] = node_id
        return list(nodes[-1]["outputIds"])

    input_names = [i["name"] for i in inputs_schema]
    root = info.get("components")
    if root is not None:
        emit(root, input_names)
    else:
        add_node(
            info["className"],
            info["className"],
            info.get("module", ""),
            input_names,
            "Classifier" if info.get("isClassifier") else "Estimator",
            {},
        )

    _compute_graph_layout(nodes, edges)

    # Precompute incoming/outgoing dependency lists per node
    deps_in: dict[str, list[str]] = {n["id"]: [] for n in nodes}
    deps_out: dict[str, list[str]] = {n["id"]: [] for n in nodes}
    for edge in edges:
        if edge["toNodeId"] in deps_in and edge["fromNodeId"] not in deps_in[edge["toNodeId"]]:
            deps_in[edge["toNodeId"]].append(edge["fromNodeId"])
        if edge["fromNodeId"] in deps_out and edge["toNodeId"] not in deps_out[edge["fromNodeId"]]:
            deps_out[edge["fromNodeId"]].append(edge["toNodeId"])
    for node in nodes:
        node["dependsOn"] = deps_in[node["id"]]
        node["dependedBy"] = deps_out[node["id"]]

    weights_list = weights if weights is not None else build_weights(root)
    categories = ["All"] + sorted({n["category"] for n in nodes})
    statistics = {
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "initializerCount": len(weights_list),
        "totalParameters": sum(int(w["elementCount"]) for w in weights_list),
        "inputCount": len(inputs_schema),
        "outputCount": len(outputs_schema or []),
        "distinctOpTypes": len({n["opType"] for n in nodes}),
    }

    return {"nodes": nodes, "edges": edges, "categories": categories, "statistics": statistics}, node_ids


def _overview_entries(info: dict[str, Any]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    if info.get("featureNamesIn"):
        entries.append({"key": "Input features", "value": info["featureNamesIn"]})
    elif info.get("nFeaturesIn") is not None:
        entries.append({"key": "Input features", "value": info["nFeaturesIn"]})
    if info.get("classes"):
        entries.append({"key": "Classes", "value": info["classes"]})
    if info.get("methods"):
        entries.append({"key": "Methods", "value": ", ".join(info["methods"])})
    if info.get("warnings"):
        entries.append({"key": "Warnings", "value": info["warnings"]})
    if info.get("trainedWithSklearn"):
        entries.append({"key": "Trained with scikit-learn", "value": info["trainedWithSklearn"]})
    if info.get("runtimeSklearn"):
        entries.append({"key": "Inspected with scikit-learn", "value": info["runtimeSklearn"]})
    if info.get("packages"):
        entries.append(
            {
                "key": "Packages",
                "value": [f"{k} {v}" for k, v in info["packages"].items() if v is not None],
            }
        )
    return entries


def _structure_component_node(
    component: dict[str, Any],
    header: str | None,
    overview: list[dict[str, Any]] | None,
    node_ids: dict[int, str],
) -> dict[str, Any]:
    name = component.get("name") or ""
    class_name = component.get("className") or ""
    title = header or (class_name if name == class_name else f"{name} : {class_name}")
    qualified = _qualified_name(component)
    desc = component.get("description") or ""
    subtitle = f"{qualified} · {desc}" if desc else qualified

    params = list(overview or [])
    params.append({"key": "Class", "value": qualified})
    if desc:
        params.append({"key": "Details", "value": desc})
    for k, v in (component.get("parameters") or {}).items():
        params.append({"key": k, "value": v})

    fitted = [_format_fitted_entry(attr) for attr in (component.get("fitted") or [])]
    children = [
        _structure_component_node(child, None, None, node_ids)
        for child in (component.get("children") or [])
    ]
    return {
        "header": title,
        "kind": component.get("kind", "Estimator"),
        "description": subtitle,
        "nodeId": node_ids.get(id(component)),
        "parameters": params,
        "fitted": fitted,
        "children": children,
    }


def build_structure_tree(
    info: dict[str, Any],
    inputs_schema: list[dict[str, Any]],
    outputs_schema: list[dict[str, Any]],
    node_ids: dict[int, str],
) -> dict[str, Any]:
    """Build hierarchical structure tree mirroring SklearnStructure.cs + StructureBuilder.cs."""
    overview = _overview_entries(info)
    root = info.get("components")
    if root is None:
        estimator_node = {
            "header": info["summary"],
            "kind": "scikit-learn",
            "description": f"{info.get('module', '')}.{info['className']}",
            "nodeId": None,
            "parameters": overview + [{"key": k, "value": v} for k, v in (info.get("parameters") or {}).items()],
            "fitted": [],
            "children": [],
        }
    else:
        estimator_node = _structure_component_node(root, info["summary"], overview, node_ids)

    inputs_node = {
        "header": "Inputs",
        "kind": "Section",
        "description": f"{len(inputs_schema)} input tensor(s)",
        "nodeId": None,
        "parameters": [{"key": i["name"], "value": i["display"]} for i in inputs_schema],
        "fitted": [],
        "children": [
            {
                "header": i["name"],
                "kind": "Tensor",
                "description": i["display"],
                "nodeId": None,
                "parameters": [
                    {"key": "Type", "value": i["type"]},
                    {"key": "Shape", "value": i["display"]},
                    *([] if not i.get("description") else [{"key": "Description", "value": i["description"]}]),
                ],
                "fitted": [],
                "children": [],
            }
            for i in inputs_schema
        ],
    }

    outputs_node = {
        "header": "Outputs",
        "kind": "Section",
        "description": f"{len(outputs_schema)} output tensor(s)",
        "nodeId": None,
        "parameters": [{"key": o["name"], "value": o["display"]} for o in outputs_schema],
        "fitted": [],
        "children": [
            {
                "header": o["name"],
                "kind": "Tensor",
                "description": o["display"],
                "nodeId": None,
                "parameters": [
                    {"key": "Type", "value": o["type"]},
                    {"key": "Shape", "value": o["display"]},
                ],
                "fitted": [],
                "children": [],
            }
            for o in outputs_schema
        ],
    }

    return {
        "header": info["className"],
        "kind": "Model",
        "description": info["summary"],
        "nodeId": None,
        "parameters": [
            {"key": "Estimator", "value": info["summary"]},
            {"key": "Trained with", "value": info.get("trainedWithSklearn") or "unknown"},
            {"key": "Runtime", "value": info.get("runtimeSklearn") or "unknown"},
        ],
        "fitted": [],
        "children": [inputs_node, estimator_node, outputs_node],
    }


# ------------------------------------ form generation & input parsing (US-003)

def _default_vector_text(shape: list[int | None]) -> str:
    """Match PlaygroundFieldViewModel.DefaultVector: up to 16 comma-separated zeros."""
    count = 1
    for dimension in shape:
        effective = 1 if dimension is None else dimension
        if (dimension is not None and (dimension > 16 or dimension <= 0)) or count > 16 // effective:
            return ""
        count *= effective
    return ", ".join(["0"] * count)


def generate_form_schema(
    info: dict[str, Any],
    input_layout: str,
    inputs_schema: list[dict[str, Any]],
) -> dict[str, Any]:
    """Generate both tensor-level form fields (FormGenerationService.cs) and per-feature fields for rich UIs."""
    fields: list[dict[str, Any]] = []
    for schema in inputs_schema:
        shape = schema["shape"]
        rank = len(shape)
        static_dims = [d for d in shape if d is not None]
        element_count = 1
        for dim in static_dims:
            if dim <= 0 or element_count > 10**12 // dim:
                element_count = 10**12
                break
            element_count *= dim

        dtype = schema["type"]
        if dtype == "string":
            fields.append(
                {
                    "inputName": schema["name"],
                    "label": schema["name"],
                    "kind": "text",
                    "type": dtype,
                    "typeDisplay": schema["display"],
                    "shape": shape,
                    "shapeDisplay": schema["display"],
                    "hasDynamicShape": schema["hasDynamicDimension"],
                    "isRequired": True,
                    "defaultValue": "",
                    "defaultText": "",
                    "description": schema.get("description") or "Enter text",
                }
            )
        elif rank == 0 or (not schema["hasDynamicDimension"] and element_count == 1):
            fields.append(
                {
                    "inputName": schema["name"],
                    "label": schema["name"],
                    "kind": "number",
                    "type": dtype,
                    "typeDisplay": schema["display"],
                    "shape": shape,
                    "shapeDisplay": schema["display"],
                    "hasDynamicShape": schema["hasDynamicDimension"],
                    "isRequired": True,
                    "defaultValue": 0.0,
                    "defaultText": "0",
                    "description": schema.get("description") or "Single value",
                }
            )
        else:
            default_vec = _default_vector_text(shape)
            fields.append(
                {
                    "inputName": schema["name"],
                    "label": schema["name"],
                    "kind": "vector",
                    "type": dtype,
                    "typeDisplay": schema["display"],
                    "shape": shape,
                    "shapeDisplay": schema["display"],
                    "hasDynamicShape": schema["hasDynamicDimension"],
                    "isRequired": True,
                    "defaultValue": default_vec,
                    "defaultText": default_vec,
                    "description": schema.get("description") or f"Enter {element_count} comma-separated values",
                }
            )

    # Rich per-feature UI fields for HTML form rendering in the browser
    feature_fields: list[dict[str, Any]] = []
    if input_layout == "text":
        feature_fields.append(
            {
                "name": "text",
                "label": "text",
                "inputType": "text",
                "dtype": "string",
                "defaultValue": "",
                "placeholder": "Enter text input (one document per row in batch mode)",
                "description": "Raw text input",
            }
        )
    elif input_layout == "columns":
        for schema in inputs_schema:
            is_str = schema["type"] == "string"
            feature_fields.append(
                {
                    "name": schema["name"],
                    "label": schema["name"],
                    "inputType": "text" if is_str else "number",
                    "dtype": schema["type"],
                    "defaultValue": "" if is_str else "0",
                    "step": None if is_str else "any",
                    "placeholder": "category / text" if is_str else "0",
                    "description": f"Column '{schema['name']}' ({schema['type']})",
                }
            )
    else:
        feature_names = info.get("featureNamesIn")
        n_features = info.get("nFeaturesIn")
        if not n_features and feature_names:
            n_features = len(feature_names)
        if n_features is not None and n_features > 0:
            for idx in range(int(n_features)):
                fname = feature_names[idx] if feature_names and idx < len(feature_names) else f"feature_{idx}"
                feature_fields.append(
                    {
                        "name": fname,
                        "label": fname,
                        "index": idx,
                        "inputType": "number",
                        "dtype": "float64",
                        "defaultValue": "0",
                        "step": "any",
                        "placeholder": "0",
                        "description": f"Numeric feature #{idx}",
                    }
                )

    return {
        "inputLayout": input_layout,
        "fields": fields,
        "featureFields": feature_fields,
        "supportsNamedFeatures": bool(info.get("featureNamesIn")),
        "nFeaturesIn": info.get("nFeaturesIn"),
        "featureNames": info.get("featureNamesIn") or [f["name"] for f in feature_fields],
    }


def _parse_float_token(token: str) -> float:
    value = float(token)
    if not math.isfinite(value):
        raise ValueError("Enter a finite number.")
    return value


def _parse_bool_token(token: str) -> bool:
    low = token.strip().lower()
    if low in ("1", "true"):
        return True
    if low in ("0", "false"):
        return False
    raise ValueError(f"Cannot parse '{token}' as boolean.")


def parse_tensor_input(schema: dict[str, Any], text: str, explicit_shape: str | None = None) -> tuple[list[Any], list[int]]:
    """Parse raw text into typed flat data + concrete shape matching TensorInputParser.cs."""
    dtype = schema["type"]
    if dtype == "string":
        parts: list[Any] = [text]
    else:
        tokens = [t for t in re.split(r"[,;\s]+", (text or "").strip()) if t]
        if not tokens:
            raise EngineError("invalid_input", f"Input '{schema['name']}': Enter at least one value.")
        try:
            if dtype in ("int64", "int32", "int16", "int8", "uint8", "uint16", "uint32", "uint64"):
                parts = [int(t) for t in tokens]
            elif dtype == "bool":
                parts = [_parse_bool_token(t) for t in tokens]
            else:
                parts = [_parse_float_token(t) for t in tokens]
        except ValueError as error:
            raise EngineError("invalid_input", f"Invalid {dtype} input for '{schema['name']}': {error}") from error

    expected_shape: list[int | None] = schema["shape"]
    if explicit_shape and explicit_shape.strip():
        try:
            shape = [int(t) for t in re.split(r"[,x\s]+", explicit_shape.strip()) if t]
        except ValueError as error:
            raise EngineError("invalid_input", f"Invalid shape '{explicit_shape}': {error}") from error
    else:
        shape = [-1 if d is None else int(d) for d in expected_shape]
        dynamic_count = sum(1 for d in shape if d == -1)
        if dynamic_count > 1:
            raise EngineError("invalid_input", f"Enter a shape for '{schema['name']}' because it has several dynamic dimensions.")
        if dynamic_count == 1:
            fixed_count = 1
            for d in shape:
                if d != -1:
                    fixed_count *= d
            if fixed_count <= 0 or len(parts) % fixed_count != 0:
                raise EngineError("invalid_input", f"Input '{schema['name']}': the number of values does not match the fixed dimensions.")
            shape[shape.index(-1)] = len(parts) // fixed_count

    if len(shape) != len(expected_shape) or any(
        d <= 0 or (expected_shape[i] is not None and expected_shape[i] != d)
        for i, d in enumerate(shape)
    ):
        raise EngineError("invalid_input", f"Shape must match {schema['display']}.")

    prod = 1
    for d in shape:
        prod *= d
    if prod != len(parts):
        raise EngineError("invalid_input", f"The number of values ({len(parts)}) does not match shape {shape}.")

    return parts, shape


def _cell_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        if not math.isfinite(value):
            return ""
        return repr(value)
    return str(value)


def _parse_batch_text(batch_text: str, expected_width: int | None, expected_columns: list[str] | None) -> tuple[list[str] | None, list[list[str]]]:
    lines = [line for line in (batch_text or "").splitlines() if line.strip()]
    if not lines:
        raise EngineError("invalid_input", "No input rows were provided.")

    sample = "\n".join(lines[:5])
    if "\t" in sample:
        delimiter = "\t"
    elif ";" in sample and "," not in sample:
        delimiter = ";"
    else:
        delimiter = ","

    if expected_width == 1 and expected_columns is None:
        # Raw text mode: treat each non-empty line as one sample
        return None, [[line] for line in lines]

    parsed_rows = [row for row in csv.reader(lines, delimiter=delimiter) if any(cell.strip() for cell in row)]
    if not parsed_rows:
        raise EngineError("invalid_input", "No valid rows could be parsed.")

    columns = expected_columns
    # Detect optional CSV header row matching feature names
    if expected_columns and len(parsed_rows[0]) == len(expected_columns):
        first_stripped = [c.strip() for c in parsed_rows[0]]
        if set(expected_columns).issubset(set(first_stripped)) and len(parsed_rows) > 1:
            columns = first_stripped
            parsed_rows = parsed_rows[1:]

    return columns, [[cell.strip() for cell in row] for row in parsed_rows]


def parse_playground_inputs(
    input_layout: str,
    inputs_schema: list[dict[str, Any]],
    info: dict[str, Any],
    payload: dict[str, Any],
) -> tuple[list[str] | None, list[list[Any]]]:
    """Normalize form inputs ('features', 'fields', 'batch', or direct 'rows') into (columns, rows)."""
    # 1. Direct rows payload
    if payload.get("rows") is not None:
        return payload.get("columns"), payload["rows"]

    # 2. Multi-row CSV / batch text payload
    if payload.get("batchText") is not None:
        expected_cols = (
            None
            if input_layout == "text"
            else ([s["name"] for s in inputs_schema] if input_layout == "columns" else info.get("featureNamesIn"))
        )
        expected_width = 1 if input_layout == "text" else (len(expected_cols) if expected_cols else info.get("nFeaturesIn"))
        return _parse_batch_text(str(payload["batchText"]), expected_width, expected_cols)

    # 3. Per-feature HTML form values (dict of featureName -> scalar value)
    if payload.get("featureValues") is not None:
        feature_values: dict[str, Any] = payload["featureValues"]
        if input_layout == "text":
            text_val = feature_values.get("text", "")
            return None, [["" if text_val is None else str(text_val)]]
        if input_layout == "columns":
            columns = [s["name"] for s in inputs_schema]
            row = []
            for schema in inputs_schema:
                val = _cell_str(feature_values.get(schema["name"]))
                if schema["type"] == "float64" and val.strip() != "" and val.strip().lower() not in ("nan", "na", "null", "none"):
                    try:
                        _parse_float_token(val)
                    except ValueError as error:
                        raise EngineError("invalid_input", f"Input '{schema['name']}': {error}") from error
                row.append(val)
            return columns, [row]

        feature_names = info.get("featureNamesIn")
        n_features = info.get("nFeaturesIn") or (len(feature_names) if feature_names else len(feature_values))
        row_cells: list[str] = []
        for idx in range(int(n_features)):
            key = feature_names[idx] if feature_names and idx < len(feature_names) else f"feature_{idx}"
            raw_val = feature_values.get(key)
            val = _cell_str(raw_val)
            try:
                _parse_float_token(val)
            except ValueError as error:
                raise EngineError("invalid_input", f"Input '{key}': {error}") from error
            row_cells.append(val)
        return feature_names, [row_cells]

    # 4. Tensor-schema field values (matching SklearnInferenceBackend.ToRows + TensorInputParser)
    field_values: dict[str, Any] = payload.get("fieldValues") or {}
    parsed_by_name: dict[str, tuple[list[Any], list[int]]] = {}
    for schema in inputs_schema:
        entry = field_values.get(schema["name"], "")
        if isinstance(entry, dict):
            raw_text = "" if entry.get("text") is None else str(entry.get("text"))
            explicit_shape = entry.get("shape")
        else:
            raw_text = "" if entry is None else str(entry)
            explicit_shape = None
        parsed_by_name[schema["name"]] = parse_tensor_input(schema, raw_text, explicit_shape)

    if input_layout == "text":
        data, _ = parsed_by_name[inputs_schema[0]["name"]]
        return None, [[_cell_str(v)] for v in data]

    if input_layout == "columns":
        row_counts = {len(parsed_by_name[s["name"]][0]) for s in inputs_schema}
        if len(row_counts) != 1:
            raise EngineError("invalid_input", "All input columns must contain the same number of rows.")
        columns = [s["name"] for s in inputs_schema]
        cols_cells = [[_cell_str(v) for v in parsed_by_name[col][0]] for col in columns]
        n_rows = min(len(c) for c in cols_cells)
        rows = [[cols_cells[c_idx][r_idx] for c_idx in range(len(columns))] for r_idx in range(n_rows)]
        return columns, rows

    schema = inputs_schema[0]
    data, shape = parsed_by_name[schema["name"]]
    cells = [_cell_str(v) for v in data]
    width = schema["shape"][1] if len(schema["shape"]) > 1 and schema["shape"][1] is not None else (shape[1] if len(shape) > 1 else len(cells))
    width = max(1, int(width))
    n_rows = max(1, len(cells) // width)
    rows = [cells[r * width : (r + 1) * width] for r in range(n_rows)]
    return info.get("featureNamesIn"), rows


# ------------------------------------------------------------------- inference

def parse_column(values: list[Any]) -> list[Any]:
    """Strings -> floats when every value is numeric (empty = NaN), otherwise kept as text."""
    parsed: list[float] = []
    for raw in values:
        if isinstance(raw, (int, float)) and not isinstance(raw, bool):
            parsed.append(float(raw))
            continue
        text = "" if raw is None else str(raw).strip()
        if text == "" or text.lower() in ("nan", "na", "null", "none"):
            parsed.append(float("nan"))
            continue
        try:
            parsed.append(float(text))
        except ValueError:
            return [("" if v is None else str(v)) for v in values]
    return parsed


def build_input(model: Any, columns: list[str] | None, rows: list[list[Any]]) -> Any:
    import numpy as np

    if not rows:
        raise EngineError("invalid_input", "No input rows were provided.")
    width = len(rows[0])
    if any(len(r) != width for r in rows):
        raise EngineError("invalid_input", "All input rows must have the same number of values.")

    cells = [parse_column([row[i] for row in rows]) for i in range(width)]

    if is_text_model(model):
        if width != 1:
            raise EngineError("invalid_input", "This model takes raw text: provide exactly one value per row.")
        return ["" if row[0] is None else str(row[0]) for row in rows]

    names = getattr(model, "feature_names_in_", None)
    if names is not None:
        names_list = [str(n) for n in names]
        if columns and set(names_list).issubset(set(columns)):
            order = [columns.index(n) for n in names_list]
        elif len(names_list) == width:
            order = list(range(width))
        else:
            raise EngineError(
                "invalid_input",
                f"The model expects {len(names_list)} features ({', '.join(names_list)}), but {width} were provided.",
            )
        try:
            import pandas as pd
        except ImportError as error:
            raise EngineError(
                "missing_module",
                "The model was trained on named columns and needs the Python package 'pandas'.",
                missing_package="pandas",
            ) from error
        return pd.DataFrame({names_list[k]: cells[order[k]] for k in range(len(names_list))}, columns=names_list)

    if all(all(isinstance(v, float) for v in column) for column in cells):
        return np.array(cells, dtype=float).T
    return np.array(cells, dtype=object).T


def to_dense(value: Any) -> Any:
    try:
        from scipy import sparse
        if sparse.issparse(value):
            if value.shape[0] * value.shape[1] > MAX_OUTPUT_ELEMENTS:
                raise EngineError(
                    "prediction_failed",
                    f"The sparse result is too large to display ({value.shape[0]} x {value.shape[1]}).",
                )
            return value.toarray()
    except ImportError:
        pass
    return value


def output_of(name: str, value: Any) -> dict[str, Any]:
    import numpy as np

    value = to_dense(value)
    if hasattr(value, "to_numpy"):
        value = value.to_numpy()
    if isinstance(value, (list, tuple)):
        parts = [np.asarray(to_dense(v)) for v in value]
        try:
            array = np.stack(parts, axis=1)
        except ValueError:
            array = np.asarray(parts, dtype=object)
    else:
        array = np.asarray(value)

    truncated = False
    if array.size > MAX_OUTPUT_ELEMENTS and array.ndim > 0:
        per_row = max(1, array.size // max(1, array.shape[0]))
        array = array[: max(1, MAX_OUTPUT_ELEMENTS // per_row)]
        truncated = True

    return {
        "name": name,
        "dtype": str(array.dtype),
        "shape": [int(d) for d in array.shape],
        "values": to_py(array),
        "truncated": truncated,
    }


def _flatten_values(node: Any, out: list[Any]) -> None:
    if isinstance(node, list):
        for item in node:
            _flatten_values(item, out)
    else:
        out.append(node)


def format_prediction_outputs(outputs: list[dict[str, Any]], classes: list[Any] | None) -> list[dict[str, Any]]:
    """Attach UI display metadata (matching OutputItemViewModel.cs) for browser rendering."""
    formatted: list[dict[str, Any]] = []
    for output in outputs:
        shape = output["shape"]
        shape_display = "[" + ", ".join(str(d) for d in shape) + "]"
        dtype = output["dtype"]
        flat: list[Any] = []
        _flatten_values(output["values"], flat)

        is_string_like = "str" in dtype or dtype.startswith("<U") or dtype == "object"
        is_float_like = dtype.startswith("float")

        scalar_display = ""
        display_kind = "Values"
        top_classes: list[dict[str, Any]] = []
        display_values: list[str] = []

        if is_string_like and not all(isinstance(v, (int, float)) for v in flat if v is not None):
            display_kind = "Text"
            scalar_display = "\n".join("" if v is None else str(v) for v in flat[:16])
            display_values = ["" if v is None else str(v) for v in flat[:16]]
        else:
            if len(flat) == 1:
                scalar_display = _cell_str(flat[0])
            num_vals = [float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else math.nan for v in flat]
            if (
                output["name"] in ("predict_proba", "predict_log_proba", "decision_function")
                and len(shape) == 2
                and shape[0] == 1
                and is_float_like
                and (classes is not None or len(num_vals) > 4)
            ):
                display_kind = "Top classes (raw scores)"
                scored = sorted(enumerate(num_vals), key=lambda pair: -1e308 if math.isnan(pair[1]) else -pair[1])[:5]
                for idx, val in scored:
                    label = str(classes[idx]) if classes and idx < len(classes) else f"Class {idx}"
                    top_classes.append({"index": idx, "label": label, "value": None if math.isnan(val) else val})
                    display_values.append(f"{label}: {val:.6g}")
            elif len(flat) <= 16:
                display_kind = "Values"
                display_values = [_cell_str(v) for v in flat]
            else:
                display_kind = "First values"
                display_values = [_cell_str(v) for v in flat[:16]]

        formatted.append(
            {
                **output,
                "shapeDisplay": shape_display,
                "displayKind": display_kind,
                "scalarDisplay": scalar_display,
                "displayValues": display_values,
                "topClasses": top_classes,
            }
        )
    return formatted


def predict(model: Any, request: dict[str, Any], collected_warnings: list[str]) -> dict[str, Any]:
    requested = (request.get("method") or "auto").lower()
    available = [m for m in INFERENCE_METHODS if callable(getattr(model, m, None))]
    if not available:
        raise EngineError(
            "unsupported_model",
            f"The loaded object ({type(model).__name__}) exposes none of: {', '.join(INFERENCE_METHODS)}.",
        )

    if requested == "auto":
        methods = ["predict" if "predict" in available else available[0]]
    elif requested == "all":
        methods = available
    elif requested in available:
        methods = [requested]
    else:
        raise EngineError(
            "invalid_input",
            f"The model does not support '{requested}'. Available: {', '.join(available)}.",
        )

    started = time.perf_counter()
    data = build_input(model, request.get("columns"), request.get("rows") or [])
    outputs: list[dict[str, Any]] = []
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            for method in methods:
                outputs.append(output_of(method, getattr(model, method)(data)))
        except (AttributeError, ValueError) as error:
            if isinstance(error, AttributeError) or _is_cython_binary_mismatch(error):
                trained_ver = sklearn_version_of(model) or tr("unknown_version")
                runtime_ver = installed_versions().get("scikit-learn") or tr("unknown_version")
                raise EngineError(
                    "predict_failed",
                    tr(
                        "inference_version_mismatch",
                        trained=trained_ver,
                        runtime=runtime_ver,
                        error=f"{type(error).__name__}: {error}",
                    ),
                ) from error
            raise
        for item in caught:
            collected_warnings.append(f"{item.category.__name__}: {item.message}")
    elapsed_ms = max(0, int(round((time.perf_counter() - started) * 1000)))

    classes = getattr(last_estimator(model), "classes_", None)
    classes_py = to_py(classes)[:200] if classes is not None else None
    formatted = format_prediction_outputs(outputs, classes_py)
    return {
        "outputs": outputs,
        "formattedOutputs": formatted,
        "classes": classes_py,
        "rowCount": len(request.get("rows") or []),
        "elapsedMs": elapsed_ms,
        "warnings": collected_warnings,
    }


# ------------------------------------------------ high-level browser/Pyodide API

def inspect_loaded_model(model: Any, filename: str, size_bytes: int, collected_warnings: list[str], model_id: str | None = None) -> dict[str, Any]:
    """Produce complete inspection, graph, structure, weights, and form schema for an already-loaded model."""
    resolved_id = model_id or uuid.uuid4().hex
    info = inspect_model(model, collected_warnings)
    input_layout, inputs_schema = build_inputs_schema(info)
    outputs_schema = build_outputs_schema(info)
    weights = build_weights(info.get("components"))
    graph, node_ids = build_computation_graph(info, inputs_schema, outputs_schema, weights)
    structure = build_structure_tree(info, inputs_schema, outputs_schema, node_ids)
    form_schema = generate_form_schema(info, input_layout, inputs_schema)

    _SESSION_MODELS[resolved_id] = {
        "model": model,
        "info": info,
        "inputLayout": input_layout,
        "inputs": inputs_schema,
        "filename": filename,
    }

    return to_py(
        {
            "ok": True,
            "engineVersion": ENGINE_VERSION,
            "model": {
                "id": resolved_id,
                "name": os.path.splitext(os.path.basename(filename))[0],
                "filename": os.path.basename(filename),
                "sizeBytes": size_bytes,
                "format": "scikit-learn",
                "summary": info["summary"],
                "inputLayout": input_layout,
                "info": info,
                "inputs": inputs_schema,
                "outputs": outputs_schema,
                "weights": weights,
                "graph": graph,
                "structure": structure,
                "formSchema": form_schema,
            },
        }
    )


def load_and_inspect_bytes(data: Any, filename: str, model_id: str | None = None) -> dict[str, Any]:
    """Load raw joblib/pickle bytes in Pyodide and return inspection + graph + structure + form schema."""
    try:
        raw_bytes = _coerce_bytes(data)
        collected_warnings: list[str] = []
        model = load_model_from_bytes(raw_bytes, filename, collected_warnings)
        return inspect_loaded_model(model, filename, len(raw_bytes), collected_warnings, model_id=model_id)
    except EngineError as error:
        return _error_payload(error.code, error.message, traceback.format_exc(), missing_package=error.missing_package)
    except Exception as error:  # noqa: BLE001
        return _error_payload("worker_failed", f"{type(error).__name__}: {error}", traceback.format_exc())


def run_inference(model_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Execute online inference on a cached loaded model using form, feature, batch, or row inputs."""
    try:
        entry = _SESSION_MODELS.get(model_id)
        if entry is None:
            raise EngineError("model_not_found", f"Model session '{model_id}' is not loaded. Please load the model again.")

        columns, rows = parse_playground_inputs(entry["inputLayout"], entry["inputs"], entry["info"], payload or {})
        request = {
            "method": (payload or {}).get("method") or "all",
            "columns": columns,
            "rows": rows,
        }
        collected_warnings: list[str] = []
        result = predict(entry["model"], request, collected_warnings)
        return to_py({"ok": True, "engineVersion": ENGINE_VERSION, "modelId": model_id, "result": result})
    except EngineError as error:
        return _error_payload(error.code, error.message, traceback.format_exc(), missing_package=error.missing_package)
    except Exception as error:  # noqa: BLE001
        return _error_payload("predict_failed", f"{type(error).__name__}: {error}", traceback.format_exc())


def unload_model(model_id: str) -> dict[str, Any]:
    removed = _SESSION_MODELS.pop(model_id, None) is not None
    return {"ok": True, "removed": removed, "loadedCount": len(_SESSION_MODELS)}


def clear_models() -> dict[str, Any]:
    _SESSION_MODELS.clear()
    return {"ok": True, "loadedCount": 0}


def list_loaded_models() -> list[dict[str, Any]]:
    return [
        {"id": k, "filename": v["filename"], "summary": v["info"]["summary"]}
        for k, v in _SESSION_MODELS.items()
    ]


# -------------------------------------------------------- built-in demo models

def create_demo_model_bytes(kind: str = "iris_pipeline") -> tuple[str, bytes]:
    """Synthesize a small real scikit-learn model serialized with skops (fallback joblib) for instant browser demos."""
    kind_normalized = (kind or "iris_pipeline").strip().lower()
    if kind_normalized == "iris_pipeline":
        from sklearn.datasets import load_iris
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        iris = load_iris(as_frame=True)
        model = Pipeline(
            [
                ("scaler", StandardScaler()),
                ("clf", LogisticRegression(max_iter=300)),
            ]
        )
        model.fit(iris.data, iris.target_names[iris.target])
        base_name = "demo_iris_pipeline"

    elif kind_normalized == "titanic_columntransformer":
        import pandas as pd
        from sklearn.compose import ColumnTransformer
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.impute import SimpleImputer
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import OneHotEncoder, StandardScaler

        df = pd.DataFrame(
            {
                "age": [22.0, 38.0, 26.0, 35.0, 54.0, 2.0, 27.0, 14.0, 4.0, 58.0, 20.0, 39.0],
                "fare": [7.25, 71.28, 7.92, 53.10, 51.86, 21.07, 11.13, 30.07, 16.70, 26.55, 8.05, 31.27],
                "sex": ["male", "female", "female", "female", "male", "male", "female", "female", "female", "female", "male", "male"],
                "embarked": ["S", "C", "S", "S", "S", "S", "S", "C", "S", "S", "S", "C"],
            }
        )
        y = ["no", "yes", "yes", "yes", "no", "no", "yes", "yes", "yes", "no", "no", "no"]

        pre = ColumnTransformer(
            [
                ("num", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), ["age", "fare"]),
                ("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("ohe", OneHotEncoder(handle_unknown="ignore"))]), ["sex", "embarked"]),
            ]
        )
        model = Pipeline([("preprocess", pre), ("forest", RandomForestClassifier(n_estimators=12, max_depth=4, random_state=42))])
        model.fit(df, y)
        base_name = "demo_mixed_columntransformer"

    elif kind_normalized == "text_tfidf_classifier":
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.naive_bayes import MultinomialNB
        from sklearn.pipeline import Pipeline

        docs = [
            "model accuracy is high and inference is fast",
            "great prediction score on test dataset",
            "training pipeline converged cleanly",
            "excellent precision and recall metrics",
            "crash error failed to load corrupted pickle",
            "exception timeout missing package failure",
            "invalid shape mismatch error during inference",
            "broken pipeline prediction failed badly",
        ]
        labels = ["positive", "positive", "positive", "positive", "negative", "negative", "negative", "negative"]
        model = Pipeline([("tfidf", TfidfVectorizer()), ("nb", MultinomialNB())])
        model.fit(docs, labels)
        base_name = "demo_text_tfidf_classifier"

    else:
        raise EngineError("invalid_input", f"Unknown demo model kind '{kind}'.")

    buf = io.BytesIO()
    try:
        import skops.io as sio

        sio.dump(model, buf)
        return f"{base_name}.skops", buf.getvalue()
    except ImportError:
        import joblib

        joblib.dump(model, buf)
        return f"{base_name}.joblib", buf.getvalue()


def load_demo_model(kind: str = "iris_pipeline", model_id: str | None = None) -> dict[str, Any]:
    """Build and inspect one of the built-in demo scikit-learn models."""
    try:
        filename, raw = create_demo_model_bytes(kind)
        return load_and_inspect_bytes(raw, filename, model_id=model_id)
    except EngineError as error:
        return _error_payload(error.code, error.message, traceback.format_exc(), missing_package=error.missing_package)
    except Exception as error:  # noqa: BLE001
        return _error_payload("worker_failed", f"{type(error).__name__}: {error}", traceback.format_exc())


# JSON string wrappers for clean FFI calls from Pyodide JavaScript workers
def load_and_inspect_bytes_json(data: Any, filename: str, model_id: str | None = None) -> str:
    return json.dumps(load_and_inspect_bytes(data, filename, model_id=model_id), ensure_ascii=False, allow_nan=False)


def run_inference_json(model_id: str, payload_json: str) -> str:
    payload = json.loads(payload_json) if isinstance(payload_json, str) and payload_json else (payload_json or {})
    return json.dumps(run_inference(model_id, payload), ensure_ascii=False, allow_nan=False)


def load_demo_model_json(kind: str = "iris_pipeline", model_id: str | None = None) -> str:
    return json.dumps(load_demo_model(kind, model_id=model_id), ensure_ascii=False, allow_nan=False)
