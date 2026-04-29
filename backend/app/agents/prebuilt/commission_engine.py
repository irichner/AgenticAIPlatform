"""Commission Engine — calculates commission for a rep based on plan definition.

Pure Python logic, no LLM required. The plan definition (stored as JSON) drives all
tier math, accelerator rates, clawback rules, and SPIF calculations.

Supports:
- Straight commission (flat rate on all ARR)
- Tiered (different rates above quota thresholds)
- Accelerated (rate multipliers above 100% attainment)
- Draw recovery (recoverable monthly draw against earned commission)
- SPIF overlays (bonus $ per qualified deal)
- What-if simulation (pass hypothetical closed_deals to model scenarios)
"""
from __future__ import annotations
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


@dataclass
class DealRecord:
    id: str
    name: str
    arr: float
    close_date: str
    deal_type: str = "new"
    is_closed_won: bool = True


@dataclass
class CommissionResult:
    user_id: str
    plan_id: str
    plan_name: str
    period_year: int
    period_month: int | None
    quota: float
    attainment_amount: float
    attainment_pct: float
    base_commission: float
    accelerator_bonus: float
    spif_bonus: float
    draw_recovery: float
    total_commission: float
    tier_breakdown: list[dict] = field(default_factory=list)
    deal_breakdown: list[dict] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def _apply_tiers(attainment_amount: float, quota: float, tiers: list[dict]) -> tuple[float, list[dict]]:
    """Apply tiered commission rates. Returns (total_commission, tier_breakdown)."""
    total = 0.0
    breakdown = []
    attainment_pct = (attainment_amount / quota * 100) if quota > 0 else 0

    for tier in sorted(tiers, key=lambda t: t.get("from_pct", 0)):
        from_pct = tier.get("from_pct", 0)
        to_pct = tier.get("to_pct")  # None = unlimited
        rate = tier.get("rate", 0)

        # Calculate the ARR amount that falls within this tier
        from_amount = quota * from_pct / 100
        to_amount = (quota * to_pct / 100) if to_pct is not None else float("inf")

        tier_arr = max(0, min(attainment_amount, to_amount) - from_amount)
        if tier_arr <= 0:
            continue

        tier_commission = tier_arr * rate
        total += tier_commission
        breakdown.append({
            "tier": f"{from_pct}%–{to_pct if to_pct else '∞'}%",
            "arr_in_tier": round(tier_arr, 2),
            "rate": rate,
            "commission": round(tier_commission, 2),
        })

        if attainment_amount <= to_amount:
            break  # we've exhausted the attainment within this tier

    return total, breakdown


def _apply_accelerators(attainment_pct: float, base_commission: float, accelerators: list[dict]) -> float:
    """Apply multiplier accelerators above certain thresholds."""
    bonus = 0.0
    for acc in sorted(accelerators, key=lambda a: a.get("threshold_pct", 0)):
        threshold = acc.get("threshold_pct", 100)
        multiplier = acc.get("multiplier", 1.0)
        cap_pct = acc.get("cap_pct")  # optional cap
        if attainment_pct >= threshold:
            effective_pct = min(attainment_pct, cap_pct) if cap_pct else attainment_pct
            incremental = base_commission * (multiplier - 1.0) * (effective_pct - threshold) / 100
            bonus += max(0, incremental)
    return bonus


def _apply_spifs(deals: list[DealRecord], spif_rules: list[dict]) -> tuple[float, list[dict]]:
    """Apply SPIF (Special Performance Incentive Fund) rules to qualifying deals."""
    total = 0.0
    breakdown = []

    for rule in spif_rules:
        bonus_per_deal = rule.get("bonus_per_deal", 0)
        min_arr = rule.get("min_arr", 0)
        deal_types = rule.get("deal_types", ["new", "expansion"])
        max_deals = rule.get("max_deals")  # cap
        rule_name = rule.get("name", "SPIF")

        qualifying = [
            d for d in deals
            if d.is_closed_won
            and d.arr >= min_arr
            and d.deal_type in deal_types
        ]
        if max_deals:
            qualifying = qualifying[:max_deals]

        spif_total = len(qualifying) * bonus_per_deal
        if spif_total > 0:
            total += spif_total
            breakdown.append({
                "rule": rule_name,
                "qualifying_deals": len(qualifying),
                "bonus_per_deal": bonus_per_deal,
                "total": spif_total,
            })

    return total, breakdown


def calculate_commission(
    user_id: str,
    plan: dict,
    quota: float,
    closed_deals: list[DealRecord],
    period_year: int,
    period_month: int | None = None,
    draw_already_paid: float = 0.0,
) -> CommissionResult:
    """
    Calculate commission for a rep given:
    - plan: the CommissionPlan.definition dict
    - quota: the rep's quota amount for this period
    - closed_deals: list of closed-won deals in this period
    - draw_already_paid: recoverable draw already issued this period
    """
    definition = plan.get("definition", plan)  # accept both wrapped and unwrapped
    plan_type = plan.get("plan_type", "tiered")
    plan_name = plan.get("name", "Commission Plan")
    plan_id = plan.get("id", "")

    # Total attainment from closed-won deals
    attainment_amount = sum(d.arr for d in closed_deals if d.is_closed_won)
    attainment_pct = (attainment_amount / quota * 100) if quota > 0 else 0

    # Calculate base commission
    tiers = definition.get("tiers", [])
    base_rate = definition.get("base_rate", 0.10)
    base_commission = 0.0
    tier_breakdown = []

    if tiers:
        base_commission, tier_breakdown = _apply_tiers(attainment_amount, quota, tiers)
    else:
        # Straight commission
        base_commission = attainment_amount * base_rate
        tier_breakdown = [{"tier": "flat", "rate": base_rate, "arr_in_tier": attainment_amount, "commission": base_commission}]

    # Accelerators (multipliers above threshold)
    accelerators = definition.get("accelerators", [])
    accelerator_bonus = _apply_accelerators(attainment_pct, base_commission, accelerators)

    # SPIFs
    spif_rules = definition.get("spif_rules", [])
    spif_bonus, spif_breakdown = _apply_spifs(closed_deals, spif_rules)

    # Draw recovery
    draw_amount = definition.get("draw_amount", 0)
    gross_commission = base_commission + accelerator_bonus + spif_bonus
    draw_recovery = 0.0
    notes = []
    if draw_amount > 0:
        draw_period = draw_already_paid or draw_amount
        if gross_commission >= draw_period:
            # Rep earned more than draw — pay commission net of draw
            draw_recovery = draw_period
            notes.append(f"Draw of ${draw_period:,.0f} recovered from commission")
        else:
            # Draw exceeds earned — rep owes the difference (tracked, not deducted here)
            notes.append(f"Commission ${gross_commission:,.0f} < draw ${draw_period:,.0f}. Deficit ${draw_period - gross_commission:,.0f} carried forward.")
            draw_recovery = gross_commission

    total_commission = gross_commission - draw_recovery

    return CommissionResult(
        user_id=user_id,
        plan_id=plan_id,
        plan_name=plan_name,
        period_year=period_year,
        period_month=period_month,
        quota=quota,
        attainment_amount=attainment_amount,
        attainment_pct=round(attainment_pct, 2),
        base_commission=round(base_commission, 2),
        accelerator_bonus=round(accelerator_bonus, 2),
        spif_bonus=round(spif_bonus, 2),
        draw_recovery=round(draw_recovery, 2),
        total_commission=round(total_commission, 2),
        tier_breakdown=tier_breakdown,
        deal_breakdown=[
            {
                "deal_id": d.id,
                "deal_name": d.name,
                "arr": d.arr,
                "deal_type": d.deal_type,
                "close_date": d.close_date,
            }
            for d in closed_deals if d.is_closed_won
        ],
        notes=notes,
    )


def what_if_simulation(
    user_id: str,
    plan: dict,
    quota: float,
    current_deals: list[DealRecord],
    hypothetical_deals: list[DealRecord],
    period_year: int,
    period_month: int | None = None,
) -> dict:
    """Run two commission calculations: current state vs. with hypothetical deals added."""
    current = calculate_commission(user_id, plan, quota, current_deals, period_year, period_month)
    with_hypo = calculate_commission(
        user_id, plan, quota,
        current_deals + [d for d in hypothetical_deals if d.is_closed_won],
        period_year, period_month,
    )
    return {
        "current": {
            "attainment_pct": current.attainment_pct,
            "attainment_amount": current.attainment_amount,
            "total_commission": current.total_commission,
            "tier_breakdown": current.tier_breakdown,
        },
        "with_hypothetical": {
            "attainment_pct": with_hypo.attainment_pct,
            "attainment_amount": with_hypo.attainment_amount,
            "total_commission": with_hypo.total_commission,
            "tier_breakdown": with_hypo.tier_breakdown,
            "incremental_commission": round(with_hypo.total_commission - current.total_commission, 2),
            "incremental_arr": round(with_hypo.attainment_amount - current.attainment_amount, 2),
        },
        "hypothetical_deals": [{"name": d.name, "arr": d.arr} for d in hypothetical_deals],
    }
