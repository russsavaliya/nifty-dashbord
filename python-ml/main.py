import os
import json
import traceback
from typing import Any, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from indicators import calculate_indicators, compute_confluence
from ml_model import NiftyPredictor, METRICS_PATH

app = FastAPI(title="NiftyPredictor ML Service", version="3.0.0")

_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

predictor = NiftyPredictor()


class CandleItem(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float


class PredictRequest(BaseModel):
    candles: list[CandleItem]
    symbol: str = "nifty50"
    pcr: Optional[float] = None   # Put-Call Ratio (volume-based), passed from Next.js


@app.get("/health")
def health() -> dict[str, Any]:
    accuracy = {}
    if os.path.exists(METRICS_PATH):
        with open(METRICS_PATH) as f:
            data = json.load(f)
            accuracy = data.get("accuracy", {})
    return {
        "status":             "ok",
        "version":            "3.0.0",
        "validated_accuracy": accuracy,
        "features":           "VWAP+ATR+ADX+Regime+Session+Momentum+PCR+LSTM+Ensemble",
    }


@app.post("/predict")
def predict(request: PredictRequest) -> dict[str, Any]:
    if len(request.candles) < 50:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 50 candles, got {len(request.candles)}.",
        )

    try:
        df = pd.DataFrame([c.model_dump() for c in request.candles])
        df = calculate_indicators(df)

        # Auto-retrain if models are missing or stale
        if predictor.should_retrain():
            print(f"[ML] Retraining on {len(df)} candles for {request.symbol}...")
            predictor.train(df)

        result = predictor.predict(df)

        # Confluence scoring on latest candle (regime-aware + PCR if provided)
        last_row   = df.iloc[-1]
        confluence = compute_confluence(last_row, pcr=request.pcr)
        result["confluence"] = confluence

        return result

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal ML error. Check server logs.")


@app.post("/backtest")
def backtest(request: PredictRequest) -> dict[str, Any]:
    """Walk-forward backtest — returns real validated directional accuracy."""
    if len(request.candles) < 100:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 100 candles for backtest, got {len(request.candles)}.",
        )
    try:
        df = pd.DataFrame([c.model_dump() for c in request.candles])
        df = calculate_indicators(df)
        results = predictor.backtest(df)
        return {"symbol": request.symbol, "candles_used": len(df), "results": results}
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Backtest failed. Check server logs.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
