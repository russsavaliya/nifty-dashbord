"""
LSTM model for Nifty intraday direction prediction.

Architecture:
  Input  : (batch, LOOKBACK, num_features)  — sliding window of last N candles
  LSTM(64, return_sequences=True) → Dropout(0.2)
  LSTM(32) → Dropout(0.2)
  Dense(16, relu) → Dense(1, sigmoid)
  Output : probability that next close > current close  (1 = UP, 0 = DOWN)

Separate models are trained for 5-min, 10-min, 30-min horizons.
Models are saved as .keras files alongside the pkl ensemble models.
"""

import os
import time
import json
import numpy as np
import pandas as pd

# Suppress TF info/warning logs
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))

LOOKBACK = 30          # how many past candles the LSTM sees
EPOCHS   = 40          # max training epochs (early stopping will cut this)
BATCH    = 32
LSTM_TTL = 3600        # retrain every hour (same as ensemble)

LSTM_5   = os.path.join(MODEL_DIR, "lstm_5min.keras")
LSTM_10  = os.path.join(MODEL_DIR, "lstm_10min.keras")
LSTM_30  = os.path.join(MODEL_DIR, "lstm_30min.keras")
LSTM_SCALER = os.path.join(MODEL_DIR, "lstm_scaler.pkl")
LSTM_METRICS = os.path.join(MODEL_DIR, "lstm_metrics.json")


def _is_tf_available() -> bool:
    try:
        import tensorflow  # noqa: F401
        return True
    except ImportError:
        return False


def _build_model(n_features: int):
    """Build and compile LSTM model."""
    import tensorflow as tf
    from tensorflow.keras import layers, models  # type: ignore

    inp = layers.Input(shape=(LOOKBACK, n_features))
    x   = layers.LSTM(64, return_sequences=True)(inp)
    x   = layers.Dropout(0.2)(x)
    x   = layers.LSTM(32)(x)
    x   = layers.Dropout(0.2)(x)
    x   = layers.Dense(16, activation="relu")(x)
    out = layers.Dense(1, activation="sigmoid")(x)

    model = models.Model(inp, out)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )
    return model


def _make_sequences(X: np.ndarray, y: np.ndarray, lookback: int):
    """Convert flat (N, features) array → sequences (N-lookback, lookback, features)."""
    Xs, ys = [], []
    for i in range(lookback, len(X)):
        Xs.append(X[i - lookback: i])
        ys.append(y[i])
    return np.array(Xs, dtype=np.float32), np.array(ys, dtype=np.float32)


class LSTMPredictor:
    """
    Trains three LSTM models (5-min, 10-min, 30-min horizon).
    Expects X_scaled (already imputed + scaled by NiftyPredictor's scaler).
    """

    def __init__(self):
        self.available = _is_tf_available()
        if not self.available:
            print("[LSTM] TensorFlow not installed — LSTM disabled. Run: pip install tensorflow")

    def should_retrain(self) -> bool:
        if not self.available:
            return False
        if not all(os.path.exists(p) for p in [LSTM_5, LSTM_10, LSTM_30]):
            return True
        age = time.time() - os.path.getmtime(LSTM_5)
        return age > LSTM_TTL

    def train(self, X_scaled: np.ndarray, close: np.ndarray) -> dict:
        """
        Train 3 LSTM models on pre-scaled features.
        Returns dict of per-timeframe validation accuracy.
        """
        if not self.available:
            return {}

        import tensorflow as tf
        from tensorflow.keras.callbacks import EarlyStopping  # type: ignore

        tf.random.set_seed(42)
        np.random.seed(42)

        # Labels — same logic as ensemble (no look-ahead)
        y_5  = (close[1:]  > close[:-1]).astype(np.float32)
        y_10 = (close[2:]  > close[:-2]).astype(np.float32)
        y_30 = (close[6:]  > close[:-6]).astype(np.float32)
        X_5, X_10, X_30 = X_scaled[:-1], X_scaled[:-2], X_scaled[:-6]

        n_features = X_scaled.shape[1]
        metrics    = {}
        es = EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True, verbose=0)

        for tag, Xd, yd, path in [
            ("5min",  X_5,  y_5,  LSTM_5),
            ("10min", X_10, y_10, LSTM_10),
            ("30min", X_30, y_30, LSTM_30),
        ]:
            if len(Xd) < LOOKBACK + 20:
                print(f"[LSTM] Not enough rows for {tag}, skipping.")
                continue

            Xs, ys = _make_sequences(Xd, yd, LOOKBACK)

            # 80/20 time-ordered split — no shuffling
            split  = int(len(Xs) * 0.8)
            X_tr, X_val = Xs[:split], Xs[split:]
            y_tr, y_val = ys[:split], ys[split:]

            model = _build_model(n_features)
            model.fit(
                X_tr, y_tr,
                validation_data=(X_val, y_val),
                epochs=EPOCHS,
                batch_size=BATCH,
                callbacks=[es],
                verbose=0,
            )
            model.save(path)

            # Validation accuracy
            y_pred = (model.predict(X_val, verbose=0).flatten() >= 0.5).astype(int)
            acc    = float(np.mean(y_pred == y_val.astype(int)))
            metrics[tag] = round(acc * 100, 2)
            print(f"[LSTM] {tag} trained. val_acc={metrics[tag]}%  rows={len(Xs)}")

        with open(LSTM_METRICS, "w") as f:
            json.dump({"accuracy": metrics, "trained_at": time.time()}, f)

        return metrics

    def predict(self, X_scaled: np.ndarray) -> dict:
        """
        Run inference on last LOOKBACK rows of X_scaled.
        Returns per-timeframe {direction, confidence, validated_accuracy}.
        """
        if not self.available:
            return {}
        if not all(os.path.exists(p) for p in [LSTM_5, LSTM_10, LSTM_30]):
            return {}

        import tensorflow as tf  # noqa: F401
        from tensorflow.keras.models import load_model  # type: ignore

        if len(X_scaled) < LOOKBACK:
            return {}

        seq = X_scaled[-LOOKBACK:].reshape(1, LOOKBACK, X_scaled.shape[1]).astype(np.float32)

        saved_acc = {}
        if os.path.exists(LSTM_METRICS):
            with open(LSTM_METRICS) as f:
                saved_acc = json.load(f).get("accuracy", {})

        result = {}
        for tag, path in [("5min", LSTM_5), ("10min", LSTM_10), ("30min", LSTM_30)]:
            model = load_model(path, compile=False)
            prob  = float(model.predict(seq, verbose=0)[0][0])
            direction  = "UP" if prob >= 0.5 else "DOWN"
            confidence = int(max(prob, 1 - prob) * 100)
            result[tag] = {
                "direction":  direction,
                "confidence": confidence,
                "raw_prob":   round(prob, 4),
            }
            if tag in saved_acc:
                result[tag]["validated_accuracy"] = saved_acc[tag]

        return result
