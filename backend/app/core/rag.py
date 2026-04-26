from __future__ import annotations
import uuid
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.embeddings import embed_query


def chunk_text(text_content: str, chunk_size: int = 800, overlap: int = 100) -> list[str]:
    """Split text into overlapping chunks by character count."""
    if not text_content.strip():
        return []
    chunks = []
    start = 0
    while start < len(text_content):
        end = start + chunk_size
        chunks.append(text_content[start:end].strip())
        start += chunk_size - overlap
    return [c for c in chunks if c]


async def get_rag_context(
    db: AsyncSession,
    business_unit_id: uuid.UUID,
    query: str,
    top_k: int = 5,
) -> str:
    """
    Embed the query, run cosine similarity search against document_chunks
    scoped to this BU (RLS enforces tenant isolation), and return top-k
    chunks formatted as a context block for the system prompt.
    """
    if not query.strip():
        return ""

    try:
        query_embedding = await embed_query(query)
    except Exception:
        # Embedding unavailable (no API key, etc.) — skip RAG gracefully
        return ""

    # pgvector cosine distance: 1 - cosine_similarity
    result = await db.execute(
        text(
            """
            SELECT content, 1 - (embedding <=> cast(:embedding AS vector)) AS similarity
            FROM document_chunks
            WHERE business_unit_id = :bu_id
              AND embedding IS NOT NULL
            ORDER BY embedding <=> cast(:embedding AS vector)
            LIMIT :top_k
            """
        ),
        {
            "embedding": str(query_embedding),
            "bu_id": str(business_unit_id),
            "top_k": top_k,
        },
    )
    rows = result.fetchall()
    if not rows:
        return ""

    parts = ["## Relevant Knowledge Base Context"]
    for i, (content, similarity) in enumerate(rows, 1):
        parts.append(f"[{i}] (relevance: {similarity:.2f})\n{content}")
    return "\n\n".join(parts)
