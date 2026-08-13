import { useState } from "react";
import { Info, ArrowRight, Database, Server, Monitor, Code2, RefreshCw, BookOpen, ExternalLink, GitBranch, Layers, Sparkles, AlertCircle, AlertTriangle, Info as InfoIcon } from "lucide-react";
import type { FlowGraph, FlowNode, FlowEdge, CodeFile } from "@/types";
import { EDGE_COLORS, NODE_COLORS } from "@/types";
import { explainNode, explainEdge } from "@/lib/analyzer";
import { getDocsForNode, getDocsForEdge } from "@/lib/docs";
import type { CodeIssue } from "@/lib/issues";
import { getIssueCounts } from "@/lib/issues";

interface InfoPanelProps {
  graph: FlowGraph;
  activeStep: number | null;
  selectedNodeId: string | null;
  onClearSelection: () => void;
  files: CodeFile[];
  onAskAi: (question: string) => void;
  issues: CodeIssue[];
  onJumpToIssue: (file: string, line: number) => void;
}

const KIND_ICON = {
  frontend: Monitor,
  backend: Server,
  database: Database,
  function: Code2,
};

const KIND_LABEL = {
  frontend: "Frontend",
  backend: "Backend",
  database: "Database",
  function: "Function",
};

function SectionHeader({ icon: Icon, title, accent }: { icon: typeof Info; title: string; accent: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={14} style={{ color: accent }} />
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>{title}</span>
      <div className="flex-1 h-px ml-1" style={{ background: `linear-gradient(to right, ${accent}30, transparent)` }} />
    </div>
  );
}

function DocLinks({ links }: { links: { technology: string; label: string; url: string }[] }) {
  if (links.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {links.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-app-card hover:bg-app-hover border border-border-subtle hover:border-accent-primary/40 transition-all"
        >
          <BookOpen size={13} className="text-fg-muted group-hover:text-accent-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-fg-secondary group-hover:text-accent-primary truncate">{link.label}</div>
            <div className="text-[10px] text-fg-muted truncate">{link.technology}</div>
          </div>
          <ExternalLink size={11} className="text-fg-faint group-hover:text-accent-primary flex-shrink-0" />
        </a>
      ))}
    </div>
  );
}

export function InfoPanel({ graph, activeStep, selectedNodeId, onClearSelection, files, onAskAi, issues, onJumpToIssue }: InfoPanelProps) {
  const [activeTab, setActiveTab] = useState<"details" | "issues">("details");

  const activeEdge: FlowEdge | null = activeStep !== null ? graph.edges[activeStep] ?? null : null;
  const selectedNode: FlowNode | null = selectedNodeId
    ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  const focusNode: FlowNode | null = selectedNode
    ?? (activeEdge ? graph.nodes.find((n) => n.id === activeEdge.to) ?? null : null);

  const edgeExplanation = activeEdge ? explainEdge(activeEdge, graph) : null;
  const nodeExplanation = focusNode ? explainNode(focusNode, graph) : null;

  const edgeDocs = activeEdge ? getDocsForEdge(activeEdge, graph) : [];
  const nodeDocs = focusNode ? getDocsForNode(focusNode, graph) : [];

  const hasContent = activeEdge || focusNode;
  const issueCounts = getIssueCounts(issues);

  const handleAskAboutNode = () => {
    if (focusNode) {
      onAskAi(`Explain the "${focusNode.label}" ${focusNode.kind} node in detail. What does it do and how does it connect to the rest of the system?`);
    }
  };

  const handleAskAboutEdge = () => {
    if (activeEdge) {
      onAskAi(`Explain the "${activeEdge.label}" connection. What data flows through it and why is it important?`);
    }
  };

  const handleAskOverview = () => {
    onAskAi("Give me an overview of this system's architecture. What are the main components and how do they interact?");
  };

  return (
    <div className="flex flex-col h-full bg-app-panel backdrop-blur-xl">
      {/* Tab switcher */}
      <div className="flex border-b border-border-subtle flex-shrink-0">
        <button
          onClick={() => setActiveTab("details")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
            activeTab === "details" ? "text-accent-primary border-b-2 border-accent-primary" : "text-fg-muted hover:text-fg-secondary"
          }`}
        >
          <Info size={13} /> Details
        </button>
        <button
          onClick={() => setActiveTab("issues")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors relative ${
            activeTab === "issues" ? "text-accent-primary border-b-2 border-accent-primary" : "text-fg-muted hover:text-fg-secondary"
          }`}
        >
          <AlertTriangle size={13} /> Issues
          {issues.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[9px] font-bold">
              {issues.length}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "details" && (
          <div className="p-4 space-y-6">
            {/* Ask AI button */}
            {graph.nodes.length > 0 && (
              <section>
                <button
                  onClick={focusNode ? handleAskAboutNode : activeEdge ? handleAskAboutEdge : handleAskOverview}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent-primary/15 hover:bg-accent-primary/25 text-accent-primary text-sm font-medium border border-accent-primary/30 transition-all"
                >
                  <Sparkles size={15} />
                  {focusNode ? `Ask AI about "${focusNode.label}"` : activeEdge ? "Ask AI about this step" : "Ask AI: Overview"}
                </button>
              </section>
            )}

            {/* Current Step Section */}
            {activeEdge && (
              <section>
                <SectionHeader icon={GitBranch} title="Current Step" accent={EDGE_COLORS[activeEdge.kind]} />
                <div className="rounded-xl p-3 bg-app-card border border-border-subtle">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-bold uppercase"
                      style={{ background: `${EDGE_COLORS[activeEdge.kind]}22`, color: EDGE_COLORS[activeEdge.kind] }}
                    >
                      {activeEdge.kind}
                    </span>
                    <span className="text-sm text-fg-primary font-mono truncate">{activeEdge.label}</span>
                  </div>
                  <p className="text-sm text-fg-secondary leading-relaxed">{edgeExplanation}</p>
                </div>
                {edgeDocs.length > 0 && (
                  <div className="mt-3">
                    <SectionHeader icon={BookOpen} title="Documentation" accent="#38bdf8" />
                    <DocLinks links={edgeDocs} />
                  </div>
                )}
              </section>
            )}

            {/* Selected Node Section */}
            {focusNode && (
              <section>
                <SectionHeader
                  icon={KIND_ICON[focusNode.kind]}
                  title={KIND_LABEL[focusNode.kind]}
                  accent={NODE_COLORS[focusNode.kind]}
                />
                <div className="rounded-xl p-3 bg-app-card border border-border-subtle">
                  <div className="flex items-center gap-2 mb-2.5">
                    {(() => {
                      const Icon = KIND_ICON[focusNode.kind];
                      return <Icon size={16} style={{ color: NODE_COLORS[focusNode.kind] }} />;
                    })()}
                    <span className="text-sm font-semibold text-fg-primary truncate">{focusNode.label}</span>
                  </div>
                  <p className="text-sm text-fg-secondary leading-relaxed">{nodeExplanation}</p>
                  <div className="mt-3 pt-3 border-t border-border-subtle space-y-2 text-xs">
                    <div className="flex gap-2">
                      <span className="text-fg-muted w-16 flex-shrink-0">File</span>
                      <span className="text-fg-secondary font-mono break-all">{focusNode.file || "—"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-fg-muted w-16 flex-shrink-0">Line</span>
                      <span className="text-fg-secondary font-mono">{focusNode.line || "—"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-fg-muted w-16 flex-shrink-0">Code</span>
                      <span className="text-fg-secondary font-mono break-all leading-relaxed">{focusNode.snippet}</span>
                    </div>
                  </div>
                </div>
                {nodeDocs.length > 0 && (
                  <div className="mt-3">
                    <SectionHeader icon={BookOpen} title="Documentation" accent={NODE_COLORS[focusNode.kind]} />
                    <DocLinks links={nodeDocs} />
                  </div>
                )}
              </section>
            )}

            {/* Empty State */}
            {!hasContent && graph.nodes.length === 0 && (
              <div className="text-center py-12 text-fg-muted">
                <Info size={32} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm leading-relaxed max-w-[220px] mx-auto">
                  Run the analysis to generate your flow graph, then click any node or connection to see details here.
                </p>
              </div>
            )}

            {/* System Overview Section */}
            {graph.nodes.length > 0 && (
              <section className="pt-1">
                <SectionHeader icon={Layers} title="System Overview" accent="#64748b" />
                <div className="rounded-xl p-3 bg-app-card border border-border-subtle space-y-2">
                  {(["frontend", "backend", "database", "function"] as const).map((kind) => {
                    const count = graph.nodes.filter((n) => n.kind === kind).length;
                    if (count === 0) return null;
                    const Icon = KIND_ICON[kind];
                    return (
                      <div key={kind} className="flex items-center gap-2 text-sm">
                        <Icon size={14} style={{ color: NODE_COLORS[kind] }} />
                        <span className="text-fg-secondary">{KIND_LABEL[kind]}</span>
                        <ArrowRight size={12} className="text-fg-faint ml-auto" />
                        <span className="text-fg-primary font-mono">{count}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 text-sm pt-2 border-t border-border-subtle mt-2">
                    <GitBranch size={14} className="text-fg-muted" />
                    <span className="text-fg-secondary">Connections</span>
                    <ArrowRight size={12} className="text-fg-faint ml-auto" />
                    <span className="text-fg-primary font-mono">{graph.edges.length}</span>
                  </div>
                </div>
              </section>
            )}

            {/* Clear Selection */}
            {selectedNodeId && (
              <button
                onClick={onClearSelection}
                className="w-full py-2 rounded-lg bg-app-card hover:bg-app-hover text-fg-muted hover:text-fg-primary text-sm transition-colors flex items-center justify-center gap-2 border border-border-subtle"
              >
                <RefreshCw size={14} /> Clear selection
              </button>
            )}
          </div>
        )}

        {activeTab === "issues" && (
          <div className="p-3 space-y-2">
            {issues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle size={32} className="text-fg-faint mb-3 opacity-40" />
                <p className="text-sm text-fg-muted leading-relaxed max-w-[220px]">
                  No issues detected yet. Run an AI security scan for a deep analysis of your code.
                </p>
              </div>
            ) : (
              <>
                {(issueCounts.errors > 0 || issueCounts.warnings > 0) && (
                  <div className="flex gap-2 text-[10px] mb-2">
                    {issueCounts.errors > 0 && (
                      <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">
                        {issueCounts.errors} Error{issueCounts.errors !== 1 ? "s" : ""}
                      </span>
                    )}
                    {issueCounts.warnings > 0 && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                        {issueCounts.warnings} Warning{issueCounts.warnings !== 1 ? "s" : ""}
                      </span>
                    )}
                    {issueCounts.info > 0 && (
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-medium">
                        {issueCounts.info} Info
                      </span>
                    )}
                  </div>
                )}
                {issues.map((issue) => {
                  const Icon = issue.severity === "error" ? AlertCircle : issue.severity === "warning" ? AlertTriangle : InfoIcon;
                  const color = issue.severity === "error" ? "#ef4444" : issue.severity === "warning" ? "#fbbf24" : "#38bdf8";
                  return (
                    <div key={issue.id} className="rounded-lg border border-border-subtle bg-app-card p-2.5">
                      <div className="flex items-start gap-2">
                        <Icon size={14} className="flex-shrink-0 mt-0.5" style={{ color }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-fg-primary">{issue.title}</div>
                          <button
                            onClick={() => onJumpToIssue(issue.file, issue.line)}
                            className="text-[10px] text-fg-muted hover:text-accent-primary font-mono mt-0.5"
                          >
                            {issue.file}:{issue.line}
                          </button>
                          <p className="text-xs text-fg-secondary mt-1.5 leading-relaxed">{issue.description}</p>
                          <div className="mt-2 rounded bg-app-input border border-border-subtle p-2">
                            <div className="text-[9px] font-semibold uppercase text-fg-faint mb-1">
                              {issue.source === "ai" ? "AI Fix Suggestion" : "Suggestion"}
                            </div>
                            <p className="text-xs text-fg-secondary font-mono leading-relaxed">{issue.suggestion}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
