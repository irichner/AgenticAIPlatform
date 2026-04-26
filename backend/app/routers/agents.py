from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from langchain_core.messages import HumanMessage
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.agents.llm import get_active_llm
from app.agents.prebuilt import PREBUILT_META, list_prebuilt_types
from app.dependencies import get_db
from app.models.agent import Agent, AgentVersion
from app.models.business_unit import BusinessUnit
from app.schemas.agent import AgentCreate, AgentUpdate, AgentOut, AgentVersionOut

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentOut])
async def list_agents(
    business_unit_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Agent)
    if business_unit_id:
        stmt = stmt.where(Agent.business_unit_id == business_unit_id)
    result = await db.execute(stmt.order_by(Agent.name))
    return result.scalars().all()


class GenerateInstructionsRequest(BaseModel):
    name: str
    description: str | None = None
    swarm_name: str


@router.post("/generate-instructions")
async def generate_agent_instructions(
    payload: GenerateInstructionsRequest,
    db: AsyncSession = Depends(get_db),
):
    llm = await get_active_llm(db)

    context_lines = [f"Agent name: {payload.name}"]
    if payload.description:
        context_lines.append(f"Description: {payload.description}")
    context_lines.append(f"Swarm (team/department): {payload.swarm_name}")
    context = "\n".join(context_lines)

    user_msg = HumanMessage(content=(
        f"Generate a detailed system prompt for an AI agent with the following details:\n\n"
        f"{context}\n\n"
        "The instructions should define the agent's role, responsibilities, tone, key capabilities, "
        "and any important constraints. Write only the system prompt text itself — no preamble, "
        "no explanation, no markdown headers. Ready to paste directly into an instructions field."
    ))

    response = await llm.ainvoke([user_msg])
    content = response.content
    if isinstance(content, list):
        text = " ".join(
            b.get("text", "") for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        )
    else:
        text = str(content)

    return {"prompt": text.strip()}


@router.post("", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
async def create_agent(
    payload: AgentCreate,
    db: AsyncSession = Depends(get_db),
):
    bu_result = await db.execute(select(BusinessUnit).where(BusinessUnit.id == payload.business_unit_id))
    if bu_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business unit not found")

    agent = Agent(
        business_unit_id=payload.business_unit_id,
        name=payload.name,
        description=payload.description,
        status=payload.status or "draft",
        group_id=payload.group_id,
    )
    db.add(agent)
    await db.flush()

    version = AgentVersion(
        agent_id=agent.id,
        version_number=1,
        prompt=payload.prompt,
        graph_definition=None,
        tools=[],
    )
    db.add(version)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=AgentOut)
async def update_agent(
    agent_id: UUID,
    payload: AgentUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    update_data = payload.model_dump(exclude_unset=True)
    prompt = update_data.pop("prompt", None)

    for field, value in update_data.items():
        setattr(agent, field, value)

    if prompt is not None:
        ver_result = await db.execute(
            select(AgentVersion)
            .where(AgentVersion.agent_id == agent_id)
            .order_by(AgentVersion.version_number.desc())
            .limit(1)
        )
        version = ver_result.scalar_one_or_none()
        if version:
            version.prompt = prompt

    await db.commit()
    await db.refresh(agent)
    return agent


@router.post("/{agent_id}/publish", response_model=AgentOut)
async def publish_agent(agent_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    agent.status = "published"
    await db.commit()
    await db.refresh(agent)
    return agent


@router.get("/{agent_id}/versions", response_model=list[AgentVersionOut])
async def list_agent_versions(agent_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AgentVersion)
        .where(AgentVersion.agent_id == agent_id)
        .order_by(AgentVersion.version_number.desc())
    )
    return result.scalars().all()


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(agent_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    await db.delete(agent)
    await db.commit()


# ── Pre-built agents ──────────────────────────────────────────────────────────

@router.get("/prebuilt/types")
async def list_prebuilt_agent_types():
    return {"types": list_prebuilt_types(), "meta": PREBUILT_META}


@router.post("/prebuilt/{agent_type}", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
async def create_prebuilt_agent(
    agent_type: str,
    business_unit_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    if agent_type not in list_prebuilt_types():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown agent type '{agent_type}'. Valid: {list_prebuilt_types()}",
        )

    bu_res = await db.execute(select(BusinessUnit).where(BusinessUnit.id == business_unit_id))
    if bu_res.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business unit not found")

    meta = PREBUILT_META[agent_type]
    agent = Agent(
        business_unit_id=business_unit_id,
        name=meta["name"],
        description=f"Pre-built {meta['name']} agent.",
        status="published",
    )
    db.add(agent)
    await db.flush()

    version = AgentVersion(
        agent_id=agent.id,
        version_number=1,
        graph_definition={"type": agent_type},
        prompt=None,
        tools=[],
    )
    db.add(version)
    await db.commit()
    await db.refresh(agent)
    return agent
