from pydantic import BaseModel, Field


class DetectionBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class Detection(BaseModel):
    label: str
    class_id: int = Field(..., alias="classId")
    category: str
    confidence: float
    box: DetectionBox
    area: float

    class Config:
        populate_by_name = True


class DetectionCounts(BaseModel):
    olympic: int
    competitor: int
    total: int


class DetectionAreas(BaseModel):
    olympic: float
    competitor: float
    total: float


class DetectionMetrics(BaseModel):
    count_ratio: float = Field(..., alias="countRatio")
    visibility_ratio: float = Field(..., alias="visibilityRatio")
    olympic_area_ratio: float = Field(..., alias="olympicAreaRatio")
    competitor_area_ratio: float = Field(..., alias="competitorAreaRatio")

    class Config:
        populate_by_name = True


class YoloDetectRequest(BaseModel):
    visit_id: str | None = Field(default=None, alias="visitId")
    image_path: str | None = Field(default=None, alias="imagePath")
    image_url: str | None = Field(default=None, alias="imageUrl")
    confidence: float | None = None
    image_size: int | None = Field(default=None, alias="imageSize")
    save_overlay: bool = Field(default=True, alias="saveOverlay")
    use_llm: bool = Field(default=True, alias="useLlm")
    outlet_name: str | None = Field(default=None, alias="outletName")
    rep_notes: str | None = Field(default=None, alias="repNotes")

    class Config:
        populate_by_name = True


class YoloResponse(BaseModel):
    visit_id: str | None = Field(default=None, alias="visitId")
    model_name: str = Field(..., alias="modelName")
    model_version: str = Field(..., alias="modelVersion")
    analysis_source: str = Field(..., alias="analysisSource")
    image_width: int = Field(..., alias="imageWidth")
    image_height: int = Field(..., alias="imageHeight")
    confidence_threshold: float = Field(..., alias="confidenceThreshold")
    input_image_size: int | None = Field(default=None, alias="inputImageSize")
    inference_ms: float = Field(..., alias="inferenceMs")
    counts: DetectionCounts
    areas: DetectionAreas
    metrics: DetectionMetrics
    detections: list[Detection]
    overlay_image_url: str | None = Field(default=None, alias="overlayImageUrl")

    class Config:
        populate_by_name = True


class ComplianceResult(BaseModel):
    score: int
    status: str
    reasons: list[str]
    recommended_action: str = Field(..., alias="recommendedAction")

    class Config:
        populate_by_name = True


class POSMAnalysis(BaseModel):
    detected: bool
    confidence: float
    evidence: str
    missing_reason: str | None = Field(default=None, alias="missingReason")

    class Config:
        populate_by_name = True


class CountAudit(BaseModel):
    olympic_estimate: int | None = Field(default=None, alias="olympicEstimate")
    competitor_estimate: int | None = Field(default=None, alias="competitorEstimate")
    visual_olympic_share: float | None = Field(default=None, alias="visualOlympicShare")
    yolo_count_reliable: bool = Field(..., alias="yoloCountReliable")
    confidence: float
    rationale: str

    class Config:
        populate_by_name = True


class LLMRetailAnalysis(BaseModel):
    provider: str
    model: str
    posm: POSMAnalysis
    count_audit: CountAudit = Field(..., alias="countAudit")
    other_promotional_material: str = Field(..., alias="otherPromotionalMaterial")
    shelf_quality: str = Field(..., alias="shelfQuality")
    visibility_notes: str = Field(..., alias="visibilityNotes")
    competitor_notes: str = Field(..., alias="competitorNotes")
    supervisor_summary: str = Field(..., alias="supervisorSummary")
    recommended_action: str = Field(..., alias="recommendedAction")
    raw: dict | None = None

    class Config:
        populate_by_name = True


class ShelfAnalysisResponse(BaseModel):
    visit_id: str | None = Field(default=None, alias="visitId")
    yolo: YoloResponse
    llm: LLMRetailAnalysis | None = None
    compliance: ComplianceResult
    supervisor_summary: str = Field(..., alias="supervisorSummary")
    warnings: list[str] = Field(default_factory=list)

    class Config:
        populate_by_name = True


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool = Field(..., alias="modelLoaded")
    model_path: str = Field(..., alias="modelPath")

    class Config:
        populate_by_name = True


class ReadyResponse(BaseModel):
    status: str
    yolo_backend: str = Field(..., alias="yoloBackend")
    errors: list[str]

    class Config:
        populate_by_name = True


class VisitReportIndexRequest(BaseModel):
    visit_id: str = Field(..., alias="visitId")
    outlet_id: str = Field(..., alias="outletId")
    title: str
    summary: str
    retrieval_text: str = Field(..., alias="retrievalText")
    facts: dict = Field(default_factory=dict)
    created_at: str | None = Field(default=None, alias="createdAt")

    class Config:
        populate_by_name = True


class VisitReportIndexResponse(BaseModel):
    status: str
    vector_id: str = Field(..., alias="vectorId")
    namespace: str
    embedding_model: str = Field(..., alias="embeddingModel")

    class Config:
        populate_by_name = True


class AssistantContextItem(BaseModel):
    visit_id: str = Field(..., alias="visitId")
    outlet_id: str | None = Field(default=None, alias="outletId")
    outlet_name: str = Field(..., alias="outletName")
    visit_date: str | None = Field(default=None, alias="visitDate")
    compliance_score: int | None = Field(default=None, alias="complianceScore")
    compliance_status: str | None = Field(default=None, alias="complianceStatus")
    risk_status: str | None = Field(default=None, alias="riskStatus")
    fraud_count: int = Field(default=0, alias="fraudCount")
    missing_posm: bool | None = Field(default=None, alias="missingPosm")
    summary: str
    retrieval_text: str = Field(..., alias="retrievalText")

    class Config:
        populate_by_name = True


class AssistantQueryRequest(BaseModel):
    question: str
    exact_context: list[AssistantContextItem] = Field(default_factory=list, alias="exactContext")
    top_k: int = Field(default=5, alias="topK", ge=0, le=10)

    class Config:
        populate_by_name = True


class AssistantCitation(BaseModel):
    visit_id: str = Field(..., alias="visitId")
    outlet_name: str = Field(..., alias="outletName")
    reason: str

    class Config:
        populate_by_name = True


class AssistantMatch(BaseModel):
    visit_id: str = Field(..., alias="visitId")
    outlet_id: str | None = Field(default=None, alias="outletId")
    outlet_name: str = Field(..., alias="outletName")
    score: float | None = None
    summary: str

    class Config:
        populate_by_name = True


class AssistantQueryResponse(BaseModel):
    answer: str
    citations: list[AssistantCitation]
    matches: list[AssistantMatch]
    model: str
    embedding_model: str = Field(..., alias="embeddingModel")
    retrieval_mode: str = Field(..., alias="retrievalMode")
    warnings: list[str] = Field(default_factory=list)

    class Config:
        populate_by_name = True
