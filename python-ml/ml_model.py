import os
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer

FEATURES = [
    "rsi", "macd", "macd_signal", "macd_hist",
    "bb_upper", "bb_lower", "bb_mid",
    "ema9", "ema21", "ema_cross_up",
    "rsi_overbought", "rsi_oversold",
    "candle_body", "candle_direction",
    "prev1_dir", "prev2_dir", "prev3_dir", "volume_change",
]

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_5 = os.path.join(MODEL_DIR, "model_5min.pkl")
MODEL_10 = os.path.join(MODEL_DIR, "model_10min.pkl")
MODEL_30 = os.path.join(MODEL_DIR, "model_30min.pkl")


class NiftyPredictor:
    def __init__(self):
        self.imputer = SimpleImputer(strategy="mean")

    def prepare_features(self, df: pd.DataFrame) -> np.ndarray:
        available = [f for f in FEATURES if f in df.columns]
        X = df[available].copy()
        for col in FEATURES:
            if col not in X.columns:
                X[col] = 0.0
        X = X[FEATURES]
        X_arr = self.imputer.fit_transform(X.values.astype(float))
        return X_arr

    def train(self, df: pd.DataFrame) -> None:
        X = self.prepare_features(df)

        close = df["close"].values
        y_5 = (np.roll(close, -1) > close).astype(int)
        y_10 = (np.roll(close, -2) > close).astype(int)
        y_30 = (np.roll(close, -6) > close).astype(int)

        # Drop last rows where we can't compute future labels
        X_5, y_5 = X[:-1], y_5[:-1]
        X_10, y_10 = X[:-2], y_10[:-2]
        X_30, y_30 = X[:-6], y_30[:-6]

        if len(X_5) < 20:
            raise ValueError("Not enough candle data to train (need at least 20 rows).")

        clf5 = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
        clf10 = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
        clf30 = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)

        clf5.fit(X_5, y_5)
        clf10.fit(X_10, y_10)
        clf30.fit(X_30, y_30)

        joblib.dump(clf5, MODEL_5)
        joblib.dump(clf10, MODEL_10)
        joblib.dump(clf30, MODEL_30)

        print(f"[ML] Models trained and saved. Rows used: {len(X_5)}")

    def predict(self, df: pd.DataFrame) -> dict:
        if not all(os.path.exists(p) for p in [MODEL_5, MODEL_10, MODEL_30]):
            raise FileNotFoundError("Models not found. Call train() first.")

        clf5 = joblib.load(MODEL_5)
        clf10 = joblib.load(MODEL_10)
        clf30 = joblib.load(MODEL_30)

        X = self.prepare_features(df)
        last = X[-1].reshape(1, -1)

        def classify(clf) -> dict:
            pred = clf.predict(last)[0]
            proba = clf.predict_proba(last)[0]
            confidence = int(max(proba) * 100)
            return {"direction": "UP" if pred == 1 else "DOWN", "confidence": confidence}

        return {
            "5min": classify(clf5),
            "10min": classify(clf10),
            "30min": classify(clf30),
        }
