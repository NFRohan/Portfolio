export type AnalyzeShelfRequest = {
  visitId: string;
  imagePath?: string;
  imageUrl?: string;
  confidence?: number;
  saveOverlay?: boolean;
  useLlm?: boolean;
  outletName?: string;
  repNotes?: string;
};

export type AnalyzeShelfResponse = {
  visitId: string;
  yolo: {
    modelName: string;
    modelVersion: string;
    analysisSource: string;
    inputImageSize?: number | null;
    counts: {
      olympic: number;
      competitor: number;
      total: number;
    };
    metrics: {
      countRatio: number;
      visibilityRatio: number;
      olympicAreaRatio: number;
      competitorAreaRatio: number;
    };
    detections: Array<{
      label: string;
      classId: number;
      category: string;
      confidence: number;
      box: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      area: number;
    }>;
    overlayImageUrl?: string | null;
    raw?: unknown;
  };
  llm: null | {
    provider: string;
    model: string;
    posm: {
      detected: boolean;
      confidence: number;
      evidence: string;
      missingReason?: string | null;
    };
    countAudit: {
      olympicEstimate?: number | null;
      competitorEstimate?: number | null;
      visualOlympicShare?: number | null;
      yoloCountReliable: boolean;
      confidence: number;
      rationale: string;
    };
    otherPromotionalMaterial: string;
    shelfQuality: string;
    visibilityNotes: string;
    competitorNotes: string;
    supervisorSummary: string;
    recommendedAction: string;
  };
  compliance: {
    score: number;
    status: string;
    reasons: string[];
    recommendedAction: string;
  };
  supervisorSummary: string;
};
