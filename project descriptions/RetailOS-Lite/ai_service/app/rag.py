import json
import re
from urllib import error, request

from . import config
from .logging_utils import log_event
from .observability import assistant_latency, capture_exception, observe_latency, openai_latency, pinecone_latency
from .schemas import (
    AssistantCitation,
    AssistantContextItem,
    AssistantMatch,
    AssistantQueryRequest,
    AssistantQueryResponse,
    VisitReportIndexRequest,
    VisitReportIndexResponse,
)


ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "citations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "visitId": {"type": "string"},
                    "outletName": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["visitId", "outletName", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["answer", "citations"],
    "additionalProperties": False,
}


class RagConfigurationError(RuntimeError):
    pass


class PineconeRequestError(RuntimeError):
    def __init__(self, status_code: int, detail: str):
        super().__init__(f"Pinecone request failed ({status_code}): {detail}")
        self.status_code = status_code
        self.detail = detail


_detected_embedding_dimensions: int | None = None


def rag_is_configured() -> bool:
    return bool(config.PINECONE_API_KEY and config.PINECONE_HOST and config.PINECONE_INDEX)


def openai_is_configured() -> bool:
    try:
        import os

        return bool(os.getenv("OPENAI_API_KEY"))
    except Exception:
        return False


def index_visit_report(payload: VisitReportIndexRequest) -> VisitReportIndexResponse:
    ensure_rag_configured()
    vector_id = vector_id_for_visit(payload.visit_id)
    values = embed_text(payload.retrieval_text)
    metadata = {
        "visitId": payload.visit_id,
        "outletId": payload.outlet_id,
        "title": payload.title[:500],
        "summary": payload.summary[:1000],
        "retrievalText": payload.retrieval_text[:12000],
        "createdAt": payload.created_at or "",
        "source": "visit_report",
    }

    upsert_payload = {
        "vectors": [
            {
                "id": vector_id,
                "values": values,
                "metadata": metadata,
            }
        ],
        "namespace": config.PINECONE_NAMESPACE,
    }
    try:
        pinecone_post("/vectors/upsert", upsert_payload)
    except PineconeRequestError as error:
        dimensions = dimension_from_pinecone_error(error)
        if not dimensions:
            raise
        values = embed_text(payload.retrieval_text, dimensions=dimensions)
        upsert_payload["vectors"][0]["values"] = values
        pinecone_post("/vectors/upsert", upsert_payload)

    log_event(
        "visit_report_indexed",
        visitId=payload.visit_id,
        vectorId=vector_id,
        index=config.PINECONE_INDEX,
        namespace=config.PINECONE_NAMESPACE,
        embeddingModel=config.EMBEDDING_MODEL,
    )
    return VisitReportIndexResponse(
        status="indexed",
        vectorId=vector_id,
        namespace=config.PINECONE_NAMESPACE,
        embeddingModel=config.EMBEDDING_MODEL,
    )


def query_assistant(payload: AssistantQueryRequest) -> AssistantQueryResponse:
    warnings: list[str] = []
    vector_matches: list[AssistantMatch] = []
    started_context_count = len(payload.exact_context)

    with observe_latency(
        assistant_latency,
        ("pending",),
        "assistant_query_completed",
        stage="assistant",
        exactContextCount=started_context_count,
        topK=payload.top_k,
    ):
        if payload.top_k > 0 and rag_is_configured() and openai_is_configured():
            try:
                vector_matches = search_visit_reports(payload.question, payload.top_k)
            except Exception as error:
                warnings.append("Vector retrieval failed; answered from exact database context only.")
                capture_exception(error, stage="assistant", model=config.EMBEDDING_MODEL, inference_type="vector_search")
                log_event("rag_vector_search_failed", stage="assistant", status="error", error=str(error))
        elif payload.top_k > 0:
            warnings.append("Vector retrieval is not configured; answered from exact database context only.")

        answer, citations = generate_answer(payload.question, payload.exact_context, vector_matches)
        mode = retrieval_mode(payload.exact_context, vector_matches)
        return AssistantQueryResponse(
            answer=answer,
            citations=citations,
            matches=vector_matches,
            model=config.CHAT_MODEL,
            embeddingModel=config.EMBEDDING_MODEL,
            retrievalMode=mode,
            warnings=warnings,
        )


def search_visit_reports(question: str, top_k: int) -> list[AssistantMatch]:
    ensure_rag_configured()
    values = embed_text(question)
    query_payload = {
        "vector": values,
        "topK": top_k,
        "includeMetadata": True,
        "namespace": config.PINECONE_NAMESPACE,
    }
    try:
        response = pinecone_post("/query", query_payload)
    except PineconeRequestError as error:
        dimensions = dimension_from_pinecone_error(error)
        if not dimensions:
            raise
        query_payload["vector"] = embed_text(question, dimensions=dimensions)
        response = pinecone_post("/query", query_payload)
    matches = response.get("matches", [])
    normalized: list[AssistantMatch] = []
    for match in matches:
        metadata = match.get("metadata") if isinstance(match, dict) else None
        if not isinstance(metadata, dict):
            continue
        visit_id = as_string(metadata.get("visitId")) or as_string(match.get("id")) or "unknown"
        normalized.append(
            AssistantMatch(
                visitId=visit_id,
                outletId=as_string(metadata.get("outletId")),
                outletName=outlet_name_from_report(metadata),
                score=float(match["score"]) if isinstance(match.get("score"), (int, float)) else None,
                summary=as_string(metadata.get("summary"))
                or as_string(metadata.get("retrievalText"))
                or "Retrieved visit report",
            )
        )
    return normalized


def generate_answer(
    question: str,
    exact_context: list[AssistantContextItem],
    vector_matches: list[AssistantMatch],
) -> tuple[str, list[AssistantCitation]]:
    if not openai_is_configured():
        return fallback_answer(question, exact_context, vector_matches)

    try:
        from openai import OpenAI
    except ImportError:
        return fallback_answer(question, exact_context, vector_matches)

    client = OpenAI()
    system_prompt = """
You are the RetailOS supervisor AI assistant.
Answer only from the supplied RetailOS visit context.
Prefer exact database context over vector matches for list/count/compliance/fraud/POSM questions.
For fraud questions, only name outlets whose exact database context has fraudCount greater than 0.
Do not treat REVIEW_NEEDED as fraud unless fraudCount is greater than 0.
Use semantic vector matches only as background for narrative questions, not as proof for fraud/compliance lists.
If the answer is a list, include outlet names, visit ids, compliance scores, and concise reasons.
If context is insufficient, say what is missing instead of guessing.
Keep the answer operational and under 180 words.
""".strip()
    user_prompt = json.dumps(
        {
            "question": question,
            "exactDatabaseContext": [item.model_dump(by_alias=True) for item in exact_context],
            "semanticVectorMatches": [item.model_dump(by_alias=True) for item in vector_matches],
        },
        ensure_ascii=True,
    )

    try:
        with observe_latency(
            openai_latency,
            ("assistant", config.CHAT_MODEL),
            "openai_assistant_completed",
            stage="assistant",
            model=config.CHAT_MODEL,
        ):
            response = client.responses.create(
                model=config.CHAT_MODEL,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "retailos_assistant_answer",
                        "strict": True,
                        "schema": ANSWER_SCHEMA,
                    }
                },
            )
        parsed = parse_json_output(response.output_text)
        citations = [
            AssistantCitation(
                visitId=item["visitId"],
                outletName=item["outletName"],
                reason=item["reason"],
            )
            for item in parsed.get("citations", [])
        ]
        return parsed["answer"], citations
    except Exception as error:
        capture_exception(error, stage="assistant", model=config.CHAT_MODEL, inference_type="rag_generation")
        log_event("assistant_generation_failed", model=config.CHAT_MODEL, error=str(error))
        return fallback_answer(question, exact_context, vector_matches)


def fallback_answer(
    question: str,
    exact_context: list[AssistantContextItem],
    vector_matches: list[AssistantMatch],
) -> tuple[str, list[AssistantCitation]]:
    if exact_context:
        rows = []
        citations: list[AssistantCitation] = []
        for item in exact_context[:8]:
            score = "unknown" if item.compliance_score is None else f"{item.compliance_score}%"
            rows.append(f"{item.outlet_name} ({item.visit_id}): compliance {score}; {item.summary}")
            citations.append(
                AssistantCitation(
                    visitId=item.visit_id,
                    outletName=item.outlet_name,
                    reason="Exact database context",
                )
            )
        return "From the matching visit reports: " + " ".join(rows), citations

    if vector_matches:
        rows = [f"{match.outlet_name} ({match.visit_id}): {match.summary}" for match in vector_matches[:5]]
        citations = [
            AssistantCitation(
                visitId=match.visit_id,
                outletName=match.outlet_name,
                reason="Semantic vector match",
            )
            for match in vector_matches[:5]
        ]
        return "Closest matching historical reports: " + " ".join(rows), citations

    return (
        f"I do not have enough indexed visit context to answer: {question}",
        [],
    )


def embed_text(text: str, dimensions: int | None = None) -> list[float]:
    if not openai_is_configured():
        raise RagConfigurationError("OPENAI_API_KEY is required for embeddings.")
    try:
        from openai import OpenAI
    except ImportError as error:
        raise RagConfigurationError("openai package is required for embeddings.") from error

    client = OpenAI()
    requested_dimensions = dimensions or active_embedding_dimensions()
    kwargs = {"model": config.EMBEDDING_MODEL, "input": text}
    if requested_dimensions:
        kwargs["dimensions"] = requested_dimensions
    with observe_latency(
        openai_latency,
        ("embedding", config.EMBEDDING_MODEL),
        "openai_embedding_completed",
        stage="embedding",
        model=config.EMBEDDING_MODEL,
        dimensions=requested_dimensions,
    ):
        response = client.embeddings.create(**kwargs)
    return response.data[0].embedding


def pinecone_post(path: str, payload: dict) -> dict:
    url = f"{config.PINECONE_HOST}{path}"
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Api-Key": config.PINECONE_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with observe_latency(
            pinecone_latency,
            (path.strip("/") or "root",),
            "pinecone_request_completed",
            stage="embedding" if "upsert" in path else "assistant",
            path=path,
        ):
            with request.urlopen(req, timeout=20) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else {}
    except error.HTTPError as http_error:
        detail = http_error.read().decode("utf-8", errors="replace")
        pinecone_error = PineconeRequestError(http_error.code, detail)
        capture_exception(pinecone_error, stage="embedding" if "upsert" in path else "assistant", model=config.EMBEDDING_MODEL)
        raise pinecone_error from http_error


def ensure_rag_configured() -> None:
    if not rag_is_configured():
        raise RagConfigurationError("PINECONE_API_KEY, PINECONE_INDEX, and PINECONE_HOST are required.")


def parse_json_output(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    return json.loads(cleaned)


def active_embedding_dimensions() -> int | None:
    if config.EMBEDDING_DIMENSIONS > 0:
        return config.EMBEDDING_DIMENSIONS
    return _detected_embedding_dimensions


def dimension_from_pinecone_error(error: PineconeRequestError) -> int | None:
    global _detected_embedding_dimensions
    match = re.search(r"index\s+(\d+)", error.detail)
    if not match:
        return None
    dimensions = int(match.group(1))
    _detected_embedding_dimensions = dimensions
    log_event(
        "pinecone_embedding_dimension_detected",
        dimensions=dimensions,
        embeddingModel=config.EMBEDDING_MODEL,
    )
    return dimensions


def vector_id_for_visit(visit_id: str) -> str:
    return f"visit-report:{visit_id}"


def outlet_name_from_report(metadata: dict) -> str:
    retrieval_text = as_string(metadata.get("retrievalText")) or ""
    for line in retrieval_text.splitlines():
        if line.lower().startswith("outlet:"):
            return line.split(":", 1)[1].strip() or "Unknown outlet"
    return as_string(metadata.get("title")) or "Unknown outlet"


def retrieval_mode(
    exact_context: list[AssistantContextItem],
    vector_matches: list[AssistantMatch],
) -> str:
    if exact_context and vector_matches:
        return "exact_and_vector"
    if exact_context:
        return "exact"
    if vector_matches:
        return "vector"
    return "none"


def as_string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None
