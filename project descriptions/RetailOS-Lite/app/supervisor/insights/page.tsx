import { AssistantChat } from "@/components/assistant-chat";

export default function SupervisorInsightsPage() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal">AI Insights</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Ask RetailOS Anything</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Query previous visit reports with exact database facts, OpenAI synthesis, and Pinecone semantic retrieval.
        </p>
      </div>
      <AssistantChat />
    </div>
  );
}
