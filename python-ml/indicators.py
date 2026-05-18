import pandas as pd
import pandas_ta as ta
import numpy as np


# ── Regime thresholds (research-backed) ───────────────────────────────────────
# ADX > 25 → trending market  → follow momentum signals (EMA, MACD)
# ADX < 20 → ranging market   → mean-reversion signals (BB bands, RSI extremes)
# 20-25    → transitional / neutral
ADX_TRENDING  = 25
ADX_RANGING   = 20

# Regime codes stored as integer feature for the ML model
REGIME_TRENDING    = 2   # strong trend   → momentum works
REGIME_NEUTRAL     = 1   # transitional
REGIME_RANGING     = 0   # sideways       → mean-reversion works


def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df = df.sort_values("time").reset_index(drop=True)

    # ── Trend ──────────────────────────────────────────────────────────────────
    df["ema9"]  = ta.ema(df["close"], length=9)
    df["ema21"] = ta.ema(df["close"], length=21)

    # ── Momentum ───────────────────────────────────────────────────────────────
    df["rsi"] = ta.rsi(df["close"], length=14)

    macd_df = ta.macd(df["close"], fast=12, slow=26, signal=9)
    if macd_df is not None:
        df["macd"]        = macd_df.iloc[:, 0]
        df["macd_hist"]   = macd_df.iloc[:, 1]
        df["macd_signal"] = macd_df.iloc[:, 2]
    else:
        df["macd"] = df["macd_hist"] = df["macd_signal"] = np.nan

    # ── Volatility ─────────────────────────────────────────────────────────────
    bb_df = ta.bbands(df["close"], length=20, std=2)
    if bb_df is not None:
        df["bb_lower"] = bb_df.iloc[:, 0]
        df["bb_mid"]   = bb_df.iloc[:, 1]
        df["bb_upper"] = bb_df.iloc[:, 2]
    else:
        df["bb_lower"] = df["bb_mid"] = df["bb_upper"] = np.nan

    df["atr"] = ta.atr(df["high"], df["low"], df["close"], length=14)

    # ── ADX + Directional Indicators (+DI / -DI) ───────────────────────────────
    # ADX measures trend STRENGTH (0–100), not direction.
    # +DI > -DI → bulls in control;  -DI > +DI → bears in control
    adx_df = ta.adx(df["high"], df["low"], df["close"], length=14)
    if adx_df is not None and len(adx_df.columns) >= 3:
        df["adx"]   = adx_df.iloc[:, 0]   # ADX value
        df["adx_pos"] = adx_df.iloc[:, 1] # +DI
        df["adx_neg"] = adx_df.iloc[:, 2] # -DI
    else:
        df["adx"] = df["adx_pos"] = df["adx_neg"] = np.nan

    # ── Market Regime (0 = ranging, 1 = neutral, 2 = trending) ───────────────
    # Used as a categorical feature AND as a filter in confluence scoring
    def _regime(adx_val: float) -> int:
        if pd.isna(adx_val):
            return REGIME_NEUTRAL
        if adx_val >= ADX_TRENDING:
            return REGIME_TRENDING
        if adx_val <= ADX_RANGING:
            return REGIME_RANGING
        return REGIME_NEUTRAL

    df["regime"] = df["adx"].apply(_regime)

    # ── ADX trend direction flag (+DI vs -DI) ────────────────────────────────
    # 1 = bullish trend  (ADX trending AND +DI > -DI)
    # -1 = bearish trend (ADX trending AND -DI > +DI)
    # 0 = no clear directional trend
    def _adx_direction(row) -> int:
        if pd.isna(row["adx"]) or row["adx"] < ADX_TRENDING:
            return 0
        return 1 if row["adx_pos"] > row["adx_neg"] else -1

    df["adx_direction"] = df.apply(_adx_direction, axis=1)

    # ── Derived flags ──────────────────────────────────────────────────────────
    df["ema_cross_up"]   = (df["ema9"] > df["ema21"]).astype(int)
    df["rsi_overbought"] = (df["rsi"] > 70).astype(int)
    df["rsi_oversold"]   = (df["rsi"] < 30).astype(int)
    df["near_bb_upper"]  = (df["close"] > df["bb_upper"] * 0.99).astype(int)
    df["near_bb_lower"]  = (df["close"] < df["bb_lower"] * 1.01).astype(int)

    # ── Price action ───────────────────────────────────────────────────────────
    df["candle_body"]      = (df["close"] - df["open"]).abs()
    df["candle_direction"] = (df["close"] > df["open"]).astype(int)
    df["high_low_range"]   = (df["high"] - df["low"]) / df["close"].replace(0, np.nan)

    df["prev1_dir"] = df["candle_direction"].shift(1)
    df["prev2_dir"] = df["candle_direction"].shift(2)
    df["prev3_dir"] = df["candle_direction"].shift(3)

    # ── Volume ─────────────────────────────────────────────────────────────────
    df["volume_change"] = df["volume"] / df["volume"].shift(1).replace(0, np.nan)
    df["volume_ma20"]   = df["volume"].rolling(20).mean()
    df["volume_ratio"]  = df["volume"] / df["volume_ma20"].replace(0, np.nan)

    # ── VWAP (reset each session by date) ──────────────────────────────────────
    df["_dt"]   = pd.to_datetime(df["time"], unit="s", utc=True).dt.tz_convert("Asia/Kolkata")
    df["_date"] = df["_dt"].dt.date
    typical_price = (df["high"] + df["low"] + df["close"]) / 3
    cum_tp_vol = (typical_price * df["volume"]).groupby(df["_date"]).cumsum()
    cum_vol    = df["volume"].groupby(df["_date"]).cumsum()
    df["vwap"]        = cum_tp_vol / cum_vol.replace(0, np.nan)
    df["price_vs_vwap"] = (df["close"] - df["vwap"]) / df["vwap"].replace(0, np.nan)
    df.drop(columns=["_dt", "_date"], inplace=True)

    # ── ATR-normalised candle body ──────────────────────────────────────────────
    df["candle_body_atr"] = df["candle_body"] / df["atr"].replace(0, np.nan)

    # ── Price momentum ──────────────────────────────────────────────────────────
    df["momentum_3"] = df["close"] / df["close"].shift(3).replace(0, np.nan) - 1
    df["momentum_5"] = df["close"] / df["close"].shift(5).replace(0, np.nan) - 1

    # ── Session-time features (IST minutes since midnight) ─────────────────────
    session_minutes = (
        pd.to_datetime(df["time"], unit="s", utc=True)
        .dt.tz_convert("Asia/Kolkata")
        .apply(lambda t: t.hour * 60 + t.minute)
    )
    df["is_opening_range"] = ((session_minutes >= 555) & (session_minutes <= 570)).astype(int)
    df["is_closing_hour"]  = (session_minutes >= 840).astype(int)

    return df


def compute_confluence(row: pd.Series, pcr: float | None = None) -> dict:
    """
    Rule-based confluence scoring (-7 to +7).

    Regime-aware: In a trending market, momentum signals get double weight.
    In ranging market, mean-reversion signals get double weight.

    Returns score, bias, signals list, and action_suggestion.
    """
    score   = 0
    signals = []
    regime  = int(row.get("regime", REGIME_NEUTRAL))

    # ── 1. EMA Cross ──────────────────────────────────────────────────────────
    if row.get("ema_cross_up", 0) == 1:
        w = 2 if regime == REGIME_TRENDING else 1
        score += w
        signals.append("EMA bullish cross" + (" (trending)" if w == 2 else ""))
    else:
        w = 2 if regime == REGIME_TRENDING else 1
        score -= w
        signals.append("EMA bearish cross" + (" (trending)" if w == 2 else ""))

    # ── 2. VWAP position ──────────────────────────────────────────────────────
    pvwap = row.get("price_vs_vwap", 0) or 0
    if pvwap > 0.001:
        score += 1; signals.append("Above VWAP")
    elif pvwap < -0.001:
        score -= 1; signals.append("Below VWAP")

    # ── 3. RSI ────────────────────────────────────────────────────────────────
    rsi = row.get("rsi", 50) or 50
    if regime == REGIME_RANGING:
        # In ranging market → RSI extremes are strong reversal signals
        if rsi < 30:
            score += 2; signals.append("RSI oversold (ranging — reversal)")
        elif rsi > 70:
            score -= 2; signals.append("RSI overbought (ranging — reversal)")
        elif rsi > 55:
            score += 1; signals.append("RSI bullish")
        elif rsi < 45:
            score -= 1; signals.append("RSI bearish")
    else:
        # In trending market → RSI extremes show momentum continuation
        if rsi > 55:
            score += 1; signals.append("RSI bullish momentum")
        elif rsi < 45:
            score -= 1; signals.append("RSI bearish momentum")

    # ── 4. MACD histogram ─────────────────────────────────────────────────────
    macd_hist = row.get("macd_hist", 0) or 0
    if macd_hist > 0:
        score += 1; signals.append("MACD bullish histogram")
    elif macd_hist < 0:
        score -= 1; signals.append("MACD bearish histogram")

    # ── 5. Volume surge confirmation ──────────────────────────────────────────
    vol_ratio = row.get("volume_ratio", 1) or 1
    if vol_ratio > 1.5:
        signals.append("Volume surge — confirms move")
        # Amplify existing direction
        if score > 0:
            score += 1
        elif score < 0:
            score -= 1

    # ── 6. ADX directional indicator ──────────────────────────────────────────
    adx_dir = row.get("adx_direction", 0) or 0
    adx_val = row.get("adx", 0) or 0
    if adx_dir == 1:
        score += 1; signals.append(f"ADX bullish trend (ADX={adx_val:.1f})")
    elif adx_dir == -1:
        score -= 1; signals.append(f"ADX bearish trend (ADX={adx_val:.1f})")
    elif adx_val < ADX_RANGING:
        signals.append(f"ADX weak ({adx_val:.1f}) — sideways market, trade carefully")

    # ── 7. PCR (Put-Call Ratio of Volume) ─────────────────────────────────────
    if pcr is not None:
        if pcr > 1.2:
            score += 1; signals.append(f"PCR bullish ({pcr:.2f} > 1.2)")
        elif pcr < 0.8:
            score -= 1; signals.append(f"PCR bearish ({pcr:.2f} < 0.8)")
        else:
            signals.append(f"PCR neutral ({pcr:.2f})")

    # ── Clamp and decide ──────────────────────────────────────────────────────
    score = max(-7, min(7, score))

    if score >= 3:
        bias   = "BULLISH"
        action = "BUY CALL"
    elif score <= -3:
        bias   = "BEARISH"
        action = "BUY PUT"
    else:
        bias   = "NEUTRAL"
        action = "WAIT"

    regime_label = {REGIME_TRENDING: "TRENDING", REGIME_NEUTRAL: "NEUTRAL", REGIME_RANGING: "RANGING"}.get(regime, "NEUTRAL")

    return {
        "score":             score,
        "bias":              bias,
        "regime":            regime_label,
        "adx_value":         round(float(adx_val), 1),
        "signals":           signals,
        "action_suggestion": action,
    }
