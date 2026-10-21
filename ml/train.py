"""Isolated CPU worker. JSON stdin/stdout; no database or network credentials."""
import json
import sys
from pathlib import Path

import joblib
import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, silhouette_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.preprocessing import StandardScaler


def tree_json(estimator, classification=False):
    t = estimator.tree_
    values = t.value[:, 0, :]
    if classification:
        values = values[:, 1] / np.maximum(values.sum(axis=1), 1e-12)
    else:
        values = np.zeros(t.node_count)
    return dict(left=t.children_left.tolist(), right=t.children_right.tolist(),
                feature=t.feature.tolist(), threshold=t.threshold.tolist(),
                value=values.tolist(), samples=t.n_node_samples.tolist())


def main():
    data = json.load(sys.stdin)
    rows = data['samples']
    x = np.asarray([r['x'] for r in rows], dtype=np.float32)
    y = np.asarray([r['y'] for r in rows], dtype=int)
    if len(rows) < 20 or len(set(y)) != 2 or min(np.bincount(y)) < 3:
        raise ValueError('At least 20 enterprises and three examples of each proxy-label class are required.')
    if not np.isfinite(x).all():
        raise ValueError('Non-finite training features.')
    rf = RandomForestClassifier(n_estimators=80, max_depth=8, min_samples_leaf=2,
                                class_weight='balanced', random_state=42, n_jobs=1)
    cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
    predicted = cross_val_predict(rf, x, y, cv=cv, n_jobs=1)
    rf.fit(x, y)
    scaler = StandardScaler().fit(x)
    z = scaler.transform(x)
    if len(np.unique(z, axis=0)) < 2:
        raise ValueError('Degenerate feature distribution.')
    km = KMeans(n_clusters=min(3, len(np.unique(z, axis=0))), n_init=10, random_state=42).fit(z)
    pca = PCA(n_components=2, svd_solver='full').fit(z)
    sizes = np.bincount(km.labels_)
    if len(sizes) < 2 or sizes.min() < 2:
        raise ValueError('Degenerate or singleton clusters.')
    isolation = IsolationForest(n_estimators=80, contamination=0.1, random_state=42, n_jobs=1).fit(x)
    scores = -isolation.score_samples(x)
    # Compare independent seeded forests on identical observations. Constant or
    # unstable anomaly ranks cannot become a champion.
    repeat = IsolationForest(n_estimators=80, contamination=0.1, random_state=99, n_jobs=1).fit(x)
    other = -repeat.score_samples(x)
    stability = max(0.0, 1.0 - float(np.mean(np.abs(scores - other))))
    if float(np.std(scores)) < 1e-6:
        raise ValueError('Degenerate anomaly scores.')
    portable = dict(schema=1, features=data['features'], forest=[tree_json(t, True) for t in rf.estimators_],
                    isolation=[tree_json(t) for t in isolation.estimators_],
                    isolationSamples=int(isolation.max_samples_), anomalyThreshold=float(-isolation.offset_),
                    centers=km.cluster_centers_.tolist(), mean=scaler.mean_.tolist(), scale=scaler.scale_.tolist(),
                    pca=dict(mean=pca.mean_.tolist(), components=pca.components_.tolist(), explainedVariance=pca.explained_variance_ratio_.tolist()))
    metrics = dict(f1=float(f1_score(y, predicted, zero_division=0)), accuracy=float(accuracy_score(y, predicted)),
                   silhouette=float(silhouette_score(z, km.labels_, sample_size=min(len(z), 2000), random_state=42)),
                   anomalyStability=stability, labelSource='derived-rule proxy labels; not inspection ground truth')
    directory = Path(data['directory'])
    directory.mkdir(parents=True, exist_ok=False)
    joblib.dump(rf, directory / 'supervised.joblib')
    joblib.dump(dict(isolation=isolation, clusters=km, scaler=scaler, pca=pca), directory / 'unsupervised.joblib')
    probes = [dict(x=x[i].tolist(), probability=float(rf.predict_proba(x[i:i+1])[0, 1]),
                   anomaly=float(scores[i]), cluster=int(km.labels_[i])) for i in range(min(5, len(x)))]
    print(json.dumps(dict(model=portable, metrics=metrics, probes=probes), allow_nan=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
