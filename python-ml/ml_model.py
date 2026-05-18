"""
NiftyPredictor — RF+GradientBoost Ensemble  +  LSTM  →  Meta-ensemble prediction.

Final confidence for each timeframe:
  - If LSTM is available and trained:
      direction  = majority vote (ensemble vs LSTM)
      confidence = weighted avg  (ensemble 40%  +  LSTM 60%)
  - Else:
      direction/confidence from RF+GB ensemble only

Walk-forward TimeSeriesSplit validation runs on both models independently.
"""

import os
import time
import json
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, VotingClassifier
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import accuracy_score

from lstm_model import LSTMPredictor

FEATURES = [
    "rsi", "macd", "macd_signal", "macd_hist",
    "bb_upper", "bb_lower", "bb_mid",
    "ema9", "ema21", "ema_cross_up",
    "rsi_overbought", "rsi_oversold",
    "candle_body", "candle_direction",
    "prev1_dir", "prev2_dir", "prev3_dir", "volume_change",
    # Phase 2
    "price_vs_vwap", "atr", "candle_body_atr",
    "is_opening_range", "is_closing_hour",
    "momentum_3", "momentum_5", "high_low_range",
    "volume_ratio",
    # Step 2 (ADX regime) — added later; safe to include now (filled 0 if missing)
    "adx", "regime",
]

MODEL_DIR    = os.path.dirname(os.path.abspath(__file__))
MODEL_5      = os.path.join(MODEL_DIR, "model_5min.pkl")
MODEL_10     = os.path.join(MODEL_DIR, "model_10min.pkl")
MODEL_30     = os.path.join(MODEL_DIR, "model_30min.pkl")
IMPUTER_PATH = os.path.join(MODEL_DIR, "imputer.pkl")
SCALER_PATH  = os.path.join(MODEL_DIR, "scaler.pkl")
METRICS_PATH = os.path.join(MODEL_DIR, "metrics.json")

MODEL_TTL_SECONDS = 3600

# Weights for meta-ensemble (LSTM gets higher weight — research shows +4-8% edge)
ENSEMBLE_WEIGHT = 0.40
LSTM_WEIGHT     = 0.60


class NiftyPredictor:
    def __init__(self):
        self.imputer = SimpleImputer(strategy="mean")
        self.scaler  = StandardScaler()
        self.lstm    = LSTMPredictor()

    # ── Feature preparation ────────────────────────────────────────────────

    def _build_feature_matrix(self, df: pd.DataFrame) -> np.ndarray:
        X = df[[f for f in FEATURES if f in df.columns]].copy()
        for col in FEATURES:
            if col not in X.columns:
                X[col] = 0.0
        return X[FEATURES].values.astype(float)

    def _prepare_train(self, df: pd.DataFrame) -> np.ndarray:
        X_raw    = self._build_feature_matrix(df)
        X_imp    = self.imputer.fit_transform(X_raw)
        X_scaled = self.scaler.fit_transform(X_imp)
        joblib.dump(self.imputer, IMPUTER_PATH)
        joblib.dump(self.scaler,  SCALER_PATH)
        return X_scaled

    def _prepare_predict(self, df: pd.DataFrame) -> np.ndarray:
        if os.path.exists(IMPUTER_PATH):
            self.imputer = joblib.load(IMPUTER_PATH)
        if os.path.exists(SCALER_PATH):
            self.scaler = joblib.load(SCALER_PATH)
        X_raw = self._build_feature_matrix(df)
        X_imp = self.imputer.transform(X_raw)
        return self.scaler.transform(X_imp)

    # ── Ensemble builder ───────────────────────────────────────────────────

    def _make_ensemble(self) -> VotingClassifier:
        clf_rf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
        clf_gb = GradientBoostingClassifier(n_estimators=100, max_depth=3,
                                             learning_rate=0.1, random_state=42)
        return VotingClassifier(estimators=[("rf", clf_rf), ("gb", clf_gb)], voting="soft")

    # ── Training ───────────────────────────────────────────────────────────

    def train(self, df: pd.DataFrame) -> None:
        X_scaled = self._prepare_train(df)
        close    = df["close"].values

        y_5  = (close[1:]  > close[:-1]).astype(int)
        y_10 = (close[2:]  > close[:-2]).astype(int)
        y_30 = (close[6:]  > close[:-6]).astype(int)
        X_5, X_10, X_30 = X_scaled[:-1], X_scaled[:-2], X_scaled[:-6]

        if len(X_5) < 50:
            raise ValueError("Not enough candle data to train (need at least 50 rows).")

        # Walk-forward validation — ensemble
        metrics = {"ensemble": {}, "lstm": {}}
        for name, Xd, yd in [("5min", X_5, y_5), ("10min", X_10, y_10), ("30min", X_30, y_30)]:
            tscv = TimeSeriesSplit(n_splits=5)
            accs = []
            for tr, val in tscv.split(Xd):
                clf = self._make_ensemble()
                clf.fit(Xd[tr], yd[tr])
                accs.append(accuracy_score(yd[val], clf.predict(Xd[val])))
            metrics["ensemble"][name] = round(float(np.mean(accs)) * 100, 2)

        # Train final ensemble models on all data
        clf5, clf10, clf30 = self._make_ensemble(), self._make_ensemble(), self._make_ensemble()
        clf5.fit(X_5,  y_5);  joblib.dump(clf5,  MODEL_5)
        clf10.fit(X_10, y_10); joblib.dump(clf10, MODEL_10)
        clf30.fit(X_30, y_30); joblib.dump(clf30, MODEL_30)

        # Train LSTM on same scaled data
        if self.lstm.available:
            lstm_acc = self.lstm.train(X_scaled, close)
            metrics["lstm"] = lstm_acc

        with open(METRICS_PATH, "w") as f:
            json.dump({"accuracy": metrics, "trained_at": time.time()}, f)

        print(f"[ML] Trained ensemble+LSTM. Rows={len(X_5)}. Metrics={metrics}")

    # ── Retrain check ──────────────────────────────────────────────────────

    def should_retrain(self) -> bool:
        if not all(os.path.exists(p) for p in [MODEL_5, MODEL_10, MODEL_30]):
            return True
        age = time.time() - os.path.getmtime(MODEL_5)
        return age > MODEL_TTL_SECONDS

    # ── Prediction — meta-ensemble ─────────────────────────────────────────

    def predict(self, df: pd.DataFrame) -> dict:
        if not all(os.path.exists(p) for p in [MODEL_5, MODEL_10, MODEL_30]):
            raise FileNotFoundError("Models not found. Call train() first.")

        clf5  = joblib.load(MODEL_5)
        clf10 = joblib.load(MODEL_10)
        clf30 = joblib.load(MODEL_30)

        X_scaled = self._prepare_predict(df)
        last     = X_scaled[-1].reshape(1, -1)

        saved_acc = {"ensemble": {}, "lstm": {}}
        if os.path.exists(METRICS_PATH):
            raw = json.load(open(METRICS_PATH))
            saved_acc["ensemble"] = raw.get("accuracy", {}).get("ensemble", raw.get("accuracy", {}))
            saved_acc["lstm"]     = raw.get("accuracy", {}).get("lstm", {})

        # Ensemble probabilities (prob of UP = class 1)
        def ens_prob(clf) -> float:
            proba = clf.predict_proba(last)[0]
            classes = list(clf.classes_)
            return float(proba[classes.index(1)] if 1 in classes else proba[1])

        ens_probs = {
            "5min":  ens_prob(clf5),
            "10min": ens_prob(clf10),
            "30min": ens_prob(clf30),
        }

        # LSTM probabilities
        lstm_preds = self.lstm.predict(X_scaled)

        output = {}
        for key in ["5min", "10min", "30min"]:
            ep = ens_probs[key]
            lp = lstm_preds.get(key, {}).get("raw_prob", None)

            if lp is not None:
                # Weighted meta-ensemble
                final_prob = ENSEMBLE_WEIGHT * ep + LSTM_WEIGHT * lp
                model_used = "RF+GB+LSTM"
            else:
                final_prob = ep
                model_used = "RF+GB"

            direction  = "UP" if final_prob >= 0.5 else "DOWN"
            confidence = int(max(final_prob, 1 - final_prob) * 100)

            entry = {
                "direction":  direction,
                "confidence": confidence,
                "model":      model_used,
                "ensemble_prob": round(ep, 4),
            }
            if lp is not None:
                entry["lstm_prob"] = round(lp, 4)

            # Validated accuracy — average of both if available
            ens_acc  = saved_acc["ensemble"].get(key)
            lstm_acc = saved_acc["lstm"].get(key)
            if ens_acc and lstm_acc:
                entry["validated_accuracy"] = round(
                    ENSEMBLE_WEIGHT * ens_acc + LSTM_WEIGHT * lstm_acc, 1
                )
            elif ens_acc:
                entry["validated_accuracy"] = ens_acc

            output[key] = entry

        output["source"] = "ml"
        return output

    # ── Backtest ───────────────────────────────────────────────────────────

    def backtest(self, df: pd.DataFrame) -> dict:
        X_scaled = self._prepare_train(df)
        close    = df["close"].values

        y_5  = (close[1:]  > close[:-1]).astype(int)
        y_10 = (close[2:]  > close[:-2]).astype(int)
        y_30 = (close[6:]  > close[:-6]).astype(int)
        X_5, X_10, X_30 = X_scaled[:-1], X_scaled[:-2], X_scaled[:-6]

        results = {}
        for name, Xd, yd in [("5min", X_5, y_5), ("10min", X_10, y_10), ("30min", X_30, y_30)]:
            tscv = TimeSeriesSplit(n_splits=5)
            all_preds, all_true = [], []
            for tr, val in tscv.split(Xd):
                clf = self._make_ensemble()
                clf.fit(Xd[tr], yd[tr])
                all_preds.extend(clf.predict(Xd[val]).tolist())
                all_true.extend(yd[val].tolist())
            acc = accuracy_score(all_true, all_preds)
            results[name] = {
                "accuracy_pct":       round(acc * 100, 2),
                "total_predictions":  len(all_preds),
                "correct":            int(sum(p == t for p, t in zip(all_preds, all_true))),
                "baseline_pct":       50.0,
                "edge_pct":           round((acc - 0.5) * 100, 2),
            }
        return results
