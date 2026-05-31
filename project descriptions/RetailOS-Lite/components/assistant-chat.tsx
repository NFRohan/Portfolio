"use client";

import { FormEvent, useEffect, useState, useTransition, type KeyboardEvent } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantAnswer } from "@/lib/assistant";
import { Bot, Database, Loader2, Search, Send, Sparkles } from "lucide-react";

type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; result: AssistantAnswer };

const EXAMPLE_PROMPTS = [
  "Which outlets are failing compliance?",
  "Where is Olympic POSM missing?",
  "Show visits that need supervisor review and why.",
  "Which outlets have fraud signals?",
];
const CHAT_STORAGE_KEY = "retailos:assistant-chat:v1";

export function AssistantChat() {
  const [question, setQuestion] = useState(EXAMPLE_PROMPTS[0]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadedSavedChat, setLoadedSavedChat] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved) as ChatMessage[]);
    } catch {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    }
    setLoadedSavedChat(true);
  }, []);

  useEffect(() => {
    if (!loadedSavedChat) return;
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-20)));
  }, [loadedSavedChat, messages]);

  function askAssistant(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isPending) return;

    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setQuestion("");
    startTransition(async () => {
      const response = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const result = (await response.json()) as AssistantAnswer | { error: string };
      if ("error" in result) {
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: result.error,
            result: {
              answer: result.error,
              citations: [],
              matches: [],
              model: "error",
              embeddingModel: "not-used",
              retrievalMode: "none",
              warnings: [],
              exactContextCount: 0,
            },
          },
        ]);
        return;
      }
      setMessages((current) => [...current, { role: "assistant", content: result.answer, result }]);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-h-[620px] border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl text-navy">
                <Bot className="h-5 w-5 text-teal" />
                RetailOS AI Assistant
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask operational questions over visit reports, compliance scores, POSM findings, and fraud signals.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="success" className="gap-1">
                <Database className="h-3.5 w-3.5" />
                SQL facts
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Search className="h-3.5 w-3.5" />
                Pinecone RAG
              </Badge>
              {messages.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setMessages([])}
                >
                  Clear chat
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-[530px] flex-col gap-4 p-5">
          <div className="flex-1 space-y-4 overflow-y-auto rounded-xl bg-[#f6f8fc] p-4">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal/10 text-teal">
                  <Sparkles className="h-7 w-7" />
                </div>
                <p className="max-w-md text-lg font-semibold text-navy">Your supervisor copilot is ready.</p>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  It combines exact Postgres facts with semantic report retrieval, so list questions stay precise and
                  narrative questions can use prior visit memory.
                </p>
              </div>
            ) : (
              messages.map((message, index) =>
                message.role === "user" ? (
                  <div key={index} className="ml-auto max-w-2xl rounded-2xl bg-navy px-4 py-3 text-sm text-white">
                    {message.content}
                  </div>
                ) : (
                  <AssistantMessage key={index} message={message} />
                ),
              )
            )}
            {isPending && (
              <div className="flex max-w-xl items-center gap-2 rounded-2xl border border-[#d6ddea] bg-white px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-teal" />
                Searching reports and drafting the answer...
              </div>
            )}
          </div>

          <form onSubmit={askAssistant} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setQuestion(prompt)}
                  className="rounded-full border border-[#c1c7cc] bg-white px-3 py-1 text-xs font-semibold text-navy transition-colors hover:border-teal hover:bg-[#e9f7fb]"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 lg:flex-row">
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    askAssistant();
                  }
                }}
                placeholder="Ask about failing outlets, POSM gaps, fraud signals..."
                className="min-h-20 flex-1 resize-none border-[#c1c7cc] bg-white focus-visible:ring-teal/30"
              />
              <Button type="submit" className="h-auto min-h-12 bg-navy px-6 text-white hover:bg-navy/90" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Ask
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
        <CardHeader>
          <CardTitle className="text-lg text-navy">How It Answers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="rounded-xl bg-[#eef2fb] p-4">
            <p className="font-semibold text-navy">Exact questions use database facts first.</p>
            <p className="mt-1">Compliance, fraud, and POSM lists are assembled from Postgres before the LLM responds.</p>
          </div>
          <div className="rounded-xl bg-[#e9f7fb] p-4">
            <p className="font-semibold text-navy">Open questions use report memory.</p>
            <p className="mt-1">Visit report text is embedded with OpenAI and searched in Pinecone for similar cases.</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-4 text-amber-900">
            <p className="font-semibold">Resilient fallback</p>
            <p className="mt-1">If the AI service is offline, the API returns a deterministic database fallback answer.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AssistantMessage({ message }: { message: Extract<ChatMessage, { role: "assistant" }> }) {
  return (
    <div className="max-w-3xl rounded-2xl border border-[#d6ddea] bg-white p-4 shadow-sm">
      <div className="prose prose-sm max-w-none text-navy">
        <p className="whitespace-pre-wrap leading-6">{message.content}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">Mode: {message.result.retrievalMode}</Badge>
        <Badge variant="outline">Exact reports: {message.result.exactContextCount}</Badge>
        <Badge variant="outline">Model: {message.result.model}</Badge>
      </div>
      {message.result.warnings.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          {message.result.warnings.join(" ")}
        </div>
      )}
      {message.result.citations.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Citations</p>
          {message.result.citations.map((citation) => (
            <Link
              key={`${citation.visitId}-${citation.reason}`}
              href={`/supervisor/visits/${citation.visitId}`}
              className="block rounded-lg border border-[#d6ddea] px-3 py-2 text-sm transition-colors hover:border-teal hover:bg-[#e9f7fb]"
            >
              <span className="font-semibold text-navy">{citation.outletName}</span>
              <span className="ml-2 text-xs text-muted-foreground">{citation.visitId}</span>
              <p className="mt-1 text-xs text-muted-foreground">{citation.reason}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
