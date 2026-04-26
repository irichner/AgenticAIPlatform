"""
Lanara SPM MCP Server — Sales Performance Management tools.

Phase 1B: mock data. Phase 2: replace with real CRM/SPM system calls.
Runs as a standalone service on port 8001 (streamable-http transport).
"""
import os
import random
from datetime import date, timedelta
from mcp.server.fastmcp import FastMCP

_port = int(os.getenv("PORT", "8001"))
_host = os.getenv("HOST", "0.0.0.0")

mcp = FastMCP(
    "lanara-spm",
    instructions=(
        "You are connected to the Lanara SPM toolkit. "
        "Use these tools to analyse quota attainment, forecast performance, "
        "detect clawback risk, and calculate SPIF payouts."
    ),
    host=_host,
    port=_port,
)


# ── Quota & Forecasting ───────────────────────────────────────────────────────

@mcp.tool()
def get_quota_attainment(rep_id: str, period: str = "current_quarter") -> dict:
    """
    Return quota vs actual for a rep in the given period.

    Args:
        rep_id:  Rep identifier (e.g. 'rep_001').
        period:  'current_quarter' | 'last_quarter' | 'ytd'

    Returns dict with quota, actual, attainment_pct, status.
    """
    seed = hash(rep_id + period) % 1000
    random.seed(seed)
    quota = round(random.uniform(200_000, 800_000), -3)
    actual = round(quota * random.uniform(0.55, 1.35), -3)
    pct = round(actual / quota * 100, 1)
    return {
        "rep_id": rep_id,
        "period": period,
        "quota": quota,
        "actual": actual,
        "attainment_pct": pct,
        "status": "on_track" if pct >= 85 else "at_risk" if pct >= 60 else "critical",
        "currency": "USD",
    }


@mcp.tool()
def forecast_quota_attainment(
    rep_id: str,
    current_pipeline: float,
    historical_close_rate: float = 0.25,
) -> dict:
    """
    Forecast end-of-quarter attainment given current pipeline and close rate.

    Args:
        rep_id:                 Rep identifier.
        current_pipeline:       Total open pipeline value in USD.
        historical_close_rate:  Historical win rate (0–1, default 0.25).

    Returns projected attainment, gap to quota, and recommendation.
    """
    attainment = get_quota_attainment(rep_id, "current_quarter")
    already_closed = attainment["actual"]
    projected_closes = current_pipeline * historical_close_rate
    projected_total = already_closed + projected_closes
    quota = attainment["quota"]
    gap = quota - projected_total
    projected_pct = round(projected_total / quota * 100, 1)
    return {
        "rep_id": rep_id,
        "already_closed": already_closed,
        "projected_from_pipeline": round(projected_closes, -2),
        "projected_total": round(projected_total, -2),
        "quota": quota,
        "projected_attainment_pct": projected_pct,
        "gap_to_quota": round(gap, -2),
        "recommendation": (
            "On track — maintain deal velocity."
            if gap <= 0
            else f"Need to close an additional ${gap:,.0f}. "
                 f"Recommend adding ${gap / (historical_close_rate or 0.25):,.0f} to pipeline."
        ),
    }


@mcp.tool()
def check_cumulative_achievement(
    rep_id: str,
    lookback_months: int = 3,
    target_pct: float = 1.10,
) -> dict:
    """
    Performio-style cumulative achievement check.
    Returns whether the rep's rolling average exceeds target_pct.

    Args:
        rep_id:          Rep identifier.
        lookback_months: Number of months to look back (default 3).
        target_pct:      Achievement threshold as a decimal (default 1.10 = 110 %).
    """
    random.seed(hash(rep_id) % 999)
    monthly = [round(random.uniform(0.70, 1.45), 3) for _ in range(lookback_months)]
    cumulative = round(sum(monthly) / lookback_months, 3)
    return {
        "rep_id": rep_id,
        "lookback_months": lookback_months,
        "monthly_achievement": monthly,
        "cumulative_achievement": cumulative,
        "target_pct": target_pct,
        "meets_threshold": cumulative >= target_pct,
        "delta_to_threshold": round(cumulative - target_pct, 3),
    }


# ── Clawback ──────────────────────────────────────────────────────────────────

@mcp.tool()
def detect_clawback_events(rep_id: str, lookback_days: int = 90) -> dict:
    """
    Scan for deals that may trigger a clawback (churned / refunded within lookback window).

    Args:
        rep_id:        Rep identifier.
        lookback_days: How many days back to scan (default 90).

    Returns list of at-risk deals and estimated clawback exposure.
    """
    random.seed(hash(rep_id + str(lookback_days)) % 777)
    n_deals = random.randint(0, 4)
    deals = []
    total_exposure = 0.0
    for i in range(n_deals):
        deal_value = round(random.uniform(10_000, 120_000), -2)
        commission_pct = round(random.uniform(0.05, 0.12), 3)
        exposure = round(deal_value * commission_pct, 2)
        total_exposure += exposure
        close_date = date.today() - timedelta(days=random.randint(10, lookback_days))
        deals.append({
            "deal_id": f"deal_{rep_id}_{i+1:03d}",
            "deal_value": deal_value,
            "close_date": close_date.isoformat(),
            "reason": random.choice(["customer_churn", "partial_refund", "contract_downgrade"]),
            "commission_at_risk": exposure,
        })
    return {
        "rep_id": rep_id,
        "lookback_days": lookback_days,
        "clawback_events": deals,
        "total_exposure_usd": round(total_exposure, 2),
        "risk_level": "high" if total_exposure > 10_000 else "medium" if total_exposure > 3_000 else "low",
    }


# ── SPIF ──────────────────────────────────────────────────────────────────────

@mcp.tool()
def calculate_spif_payout(rep_id: str, spif_plan_id: str) -> dict:
    """
    Calculate SPIF (Special Performance Incentive Fund) payout for a rep.

    Args:
        rep_id:       Rep identifier.
        spif_plan_id: SPIF plan identifier (e.g. 'spif_q4_2026').

    Returns eligibility status, payout tiers, and calculated amount.
    """
    achievement = check_cumulative_achievement(rep_id)
    cum = achievement["cumulative_achievement"]
    base_spif = 5_000.0
    if cum >= 1.50:
        tier, multiplier = "platinum", 3.0
    elif cum >= 1.25:
        tier, multiplier = "gold", 2.0
    elif cum >= 1.10:
        tier, multiplier = "silver", 1.5
    elif cum >= 1.00:
        tier, multiplier = "bronze", 1.0
    else:
        tier, multiplier = "not_eligible", 0.0

    payout = round(base_spif * multiplier, 2)
    return {
        "rep_id": rep_id,
        "spif_plan_id": spif_plan_id,
        "cumulative_achievement": cum,
        "tier": tier,
        "base_spif": base_spif,
        "multiplier": multiplier,
        "payout_usd": payout,
        "eligible": multiplier > 0,
    }


@mcp.tool()
def get_team_leaderboard(business_unit_id: str, metric: str = "quota_attainment") -> dict:
    """
    Return a sorted leaderboard for a business unit.

    Args:
        business_unit_id: Business unit identifier.
        metric:           'quota_attainment' | 'spif_payout' | 'pipeline_coverage'
    """
    random.seed(hash(business_unit_id) % 555)
    reps = [f"rep_{business_unit_id[:4]}_{i:03d}" for i in range(1, 8)]
    entries = []
    for rep in reps:
        att = get_quota_attainment(rep)
        entries.append({
            "rep_id": rep,
            "attainment_pct": att["attainment_pct"],
            "actual": att["actual"],
            "quota": att["quota"],
            "status": att["status"],
        })
    entries.sort(key=lambda x: x["attainment_pct"], reverse=True)
    for rank, e in enumerate(entries, 1):
        e["rank"] = rank
    return {
        "business_unit_id": business_unit_id,
        "metric": metric,
        "leaderboard": entries,
        "generated_at": date.today().isoformat(),
    }


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
