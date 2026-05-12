import os
import traceback
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from indicators import calculate_indicators
from ml_model import NiftyPredictor

app = FastAPI(title="NiftyPredictor ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/predict")
def predict(request: PredictRequest) -> dict[str, Any]:
    if len(request.candles) < 30:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 30 candles, got {len(request.candles)}.",
        )

    try:
        df = pd.DataFrame([c.model_dump() for c in request.candles])
        df = calculate_indicators(df)

        model_files = ["model_5min.pkl", "model_10min.pkl", "model_30min.pkl"]
        models_exist = all(
            os.path.exists(os.path.join(os.path.dirname(__file__), f))
            for f in model_files
        )

        if not models_exist:
            print(f"[ML] Training models on {len(df)} candles for {request.symbol}...")
            predictor.train(df)

        result = predictor.predict(df)
        return result

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal ML error. Check server logs.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
