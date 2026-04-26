from __future__ import annotations
import io
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.embeddings import embed_texts
from app.core.rag import chunk_text
from app.core.rbac import require_role
from app.dependencies import get_db
from app.models.document import Document, DocumentChunk
from app.models.business_unit import BusinessUnit
from app.schemas.document import DocumentOut, SearchRequest, SearchResult

router = APIRouter(prefix="/documents", tags=["documents"])

SUPPORTED_TYPES = {"text/plain", "text/markdown", "application/pdf"}


def _extract_text(content_bytes: bytes, content_type: str | None) -> str:
    if content_type == "application/pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content_bytes))
            return "\n\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"PDF extraction failed: {e}")
    try:
        return content_bytes.decode("utf-8", errors="replace")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode file as text")


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    business_unit_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["admin", "editor"])),
):
    bu = await db.execute(select(BusinessUnit).where(BusinessUnit.id == business_unit_id))
    if bu.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Business unit not found")

    content_type = file.content_type or "text/plain"
    content_bytes = await file.read()

    raw_text = _extract_text(content_bytes, content_type)
    chunks = chunk_text(raw_text)

    doc = Document(
        business_unit_id=business_unit_id,
        filename=file.filename or "upload",
        content_type=content_type,
        status="processing",
    )
    db.add(doc)
    await db.flush()

    if chunks:
        try:
            embeddings = await embed_texts(chunks)
            for i, (chunk_text_val, embedding) in enumerate(zip(chunks, embeddings)):
                db.add(DocumentChunk(
                    document_id=doc.id,
                    business_unit_id=business_unit_id,
                    chunk_index=i,
                    content=chunk_text_val,
                    embedding=embedding,
                ))
            doc.status = "ready"
        except Exception:
            doc.status = "error"
            for i, chunk_text_val in enumerate(chunks):
                db.add(DocumentChunk(
                    document_id=doc.id,
                    business_unit_id=business_unit_id,
                    chunk_index=i,
                    content=chunk_text_val,
                ))

    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    business_unit_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Document).order_by(Document.created_at.desc())
    if business_unit_id:
        stmt = stmt.where(Document.business_unit_id == business_unit_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["admin", "editor"])),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(doc)
    await db.commit()


@router.post("/search", response_model=list[SearchResult])
async def search_documents(
    payload: SearchRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        from app.core.embeddings import embed_query
        query_vec = await embed_query(payload.query)
    except Exception:
        raise HTTPException(status_code=503, detail="Embedding service unavailable")

    result = await db.execute(
        text(
            """
            SELECT dc.content,
                   1 - (dc.embedding <=> cast(:embedding AS vector)) AS similarity,
                   dc.document_id
            FROM document_chunks dc
            WHERE dc.business_unit_id = :bu_id
              AND dc.embedding IS NOT NULL
            ORDER BY dc.embedding <=> cast(:embedding AS vector)
            LIMIT :top_k
            """
        ),
        {
            "embedding": str(query_vec),
            "bu_id": str(payload.business_unit_id),
            "top_k": payload.top_k,
        },
    )
    rows = result.fetchall()
    return [SearchResult(content=r[0], similarity=float(r[1]), document_id=r[2]) for r in rows]
