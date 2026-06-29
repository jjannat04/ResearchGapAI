"use client";

import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Cloud,
  FileText,
  Lightbulb,
  Loader2,
  Server,
  Sparkles,
  UploadCloud,
  WandSparkles,
  Zap,
} from "lucide-react";
import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

type Summary = {
  title: string;
  objective: string;
  methodology: string;
  findings: string;
};

type ExtractedPaper = {
  filename: string;
  textLength: number;
};

type ExtractedPaperResponse = {
  filename: string;
  text: string;
};

type ComparisonRow = {
  paper: string;
  objective: string;
  methodology: string;
  dataset_or_scope: string;
  key_findings: string;
  limitations: string;
};

type AnalysisResponse = {
  extracted_papers: ExtractedPaperResponse[];
  summaries: Summary[];
  comparison_table: ComparisonRow[];
  research_gaps: string[];
  novel_ideas: string[];
};

type NormalizedAnalysis = {
  extracted_papers: ExtractedPaper[];
  summaries: Summary[];
  comparison_table: ComparisonRow[];
  research_gaps: string[];
  novel_ideas: string[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://researchgap-backend.onrender.com";
const pipelineStages = [
  "Uploading files",
  "Extracting text",
  "AI analysis",
  "Generating output",
];
const pipelineMessages = [
  "Uploading files...",
  "Extracting text from your PDFs...",
  "Running Gemini analysis...",
  "Preparing your dashboard...",
];
const ANALYSIS_REQUEST_TIMEOUT_MS = 90000;
const ANALYSIS_TIMEOUT_MESSAGE =
  "Analysis is taking longer than expected. Please try again with a smaller PDF or try again in a few minutes.";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [extractedPapers, setExtractedPapers] = useState<ExtractedPaper[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
  const [researchGaps, setResearchGaps] = useState<string[]>([]);
  const [novelIdeas, setNovelIdeas] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canAnalyze = useMemo(() => files.length > 0 && files.length <= 3 && !loading, [files, loading]);
  const uploadProgress = Math.min((files.length / 3) * 100, 100);
  const hasResults = summaries.length > 0 || comparisonRows.length > 0 || researchGaps.length > 0 || novelIdeas.length > 0;

  const clearResults = useCallback(() => {
    setExtractedPapers([]);
    setSummaries([]);
    setComparisonRows([]);
    setResearchGaps([]);
    setNovelIdeas([]);
  }, []);

  useEffect(() => {
    if (!loading) {
      setCurrentStageIndex(0);
      return;
    }

    const timers = [
      window.setTimeout(() => {
        setCurrentStageIndex((current) => Math.max(current, 1));
      }, 4000),
      window.setTimeout(() => {
        setCurrentStageIndex((current) => Math.max(current, 2));
      }, 18000),
    ];

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [loading]);

  function selectFiles(selectedFiles: File[]) {
    const selected = selectedFiles.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    clearResults();
    setError("");

    if (selected.length !== selectedFiles.length) {
      setError("Only PDF files can be uploaded.");
    }

    if (!selected.length) {
      setFiles([]);
      return;
    }

    if (selected.length > 3) {
      setFiles(selected.slice(0, 3));
      setError("Maximum 3 PDFs allowed. The first 3 files were selected.");
      return;
    }

    setFiles(selected);
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    selectFiles(Array.from(event.target.files ?? []));
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    selectFiles(Array.from(event.dataTransfer.files));
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    clearResults();

    if (!canAnalyze) {
      setError("Select at least 1 PDF before analyzing.");
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    setLoading(true);
    setCurrentStageIndex(0);
    await nextFrame();

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, ANALYSIS_REQUEST_TIMEOUT_MS);

    try {
      setCurrentStageIndex(0);
      const response = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      setCurrentStageIndex((current) => Math.max(current, 1));
      await nextFrame();
      const responseText = await response.text();

      if (!response.ok) {
        const body = await parseJsonSafely(responseText);
        throw new Error(body?.detail ?? "Analysis failed.");
      }

      setCurrentStageIndex(pipelineStages.length - 1);
      await nextFrame();
      const payload = await parseJsonInWorker<AnalysisResponse>(responseText);
      const normalized = normalizeAnalysis(payload);

      await revealResults(normalized, startTransition, {
        setExtractedPapers,
        setSummaries,
        setComparisonRows,
        setResearchGaps,
        setNovelIdeas,
      });
    } catch (caught) {
      setError(isAbortError(caught) ? ANALYSIS_TIMEOUT_MESSAGE : caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <div className="border-b border-blue-100/70 bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2 text-xs font-semibold sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            
            <span>Powered by Gemini API</span>
          </div>
          <div className="flex items-center gap-2 text-blue-50">
            <Cloud className="size-3.5" aria-hidden="true" />
            <span>Deployed on Google Cloud Run</span>
          </div>
        </div>
      </div>

      <nav className="sticky top-0 z-20 border-b border-blue-100/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-sm font-black text-white shadow-lg shadow-blue-600/25">
              RG
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-slate-950">ResearchGap AI</p>
              <p className="text-xs font-medium text-slate-500">PDF intelligence dashboard</p>
            </div>
          </div>
          <div className="hidden items-center gap-7 text-sm font-semibold text-slate-600 md:flex" aria-label="Primary navigation">
            <a className="rounded-full px-2 py-1 transition hover:bg-blue-50 hover:text-blue-700" href="#upload">
              Upload
            </a>
            <a className="rounded-full px-2 py-1 transition hover:bg-blue-50 hover:text-blue-700" href="#dashboard">
              Dashboard
            </a>
          </div>
        </div>
      </nav>

      <section className="relative mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-14">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.22),transparent_34rem)]" />
        <div className="flex flex-col justify-center">
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1 text-sm font-semibold text-blue-700 shadow-sm">
            
            AI research copilot
          </div>
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl lg:leading-[1.02]">
            Turn papers into research direction.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
            Upload your PDFs and get concise summaries, side-by-side comparison, high-signal gaps, and novel ideas.
          </p>
        </div>

        <form
          id="upload"
          className="rounded-[2rem] border border-blue-100 bg-white/95 p-4 shadow-2xl shadow-blue-950/10 backdrop-blur sm:p-6"
          onSubmit={handleSubmit}
          aria-describedby="upload-help"
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-blue-600">Upload workspace</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">Analyze your papers</h2>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">
              {files.length}/3 PDFs
            </div>
          </div>

          <label
            className={`group relative flex min-h-80 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border p-8 text-center transition duration-300 ${
              dragging
                ? "scale-[1.01] border-blue-500 bg-blue-50 shadow-inner"
                : "border-blue-100 bg-gradient-to-br from-blue-50 via-white to-sky-50 hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-950/10"
            }`}
            htmlFor="pdfs"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            aria-label="Drag and drop PDF files or choose files"
          >
            <div className="absolute inset-x-10 top-8 h-20 rounded-full bg-blue-400/10 blur-3xl transition group-hover:bg-blue-500/20" />
            <div className="relative mb-6 grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-2xl shadow-blue-600/30 transition duration-300 group-hover:-translate-y-1 group-hover:scale-105">
              <UploadCloud className="size-9" aria-hidden="true" />
            </div>
            <span className="relative text-2xl font-extrabold tracking-tight text-slate-950">Drop PDFs to begin</span>
            <small id="upload-help" className="relative mt-3 max-w-md text-sm leading-6 text-slate-500">
              Drag and drop up to 3 research papers, or browse from your device. Selectable-text PDFs work best.
            </small>
            <div className="relative mt-4 flex max-w-md items-start gap-2 rounded-2xl border border-blue-100 bg-white/75 px-3 py-2 text-left text-xs leading-5 text-slate-500 shadow-sm">
              <Zap className="mt-0.5 size-3.5 shrink-0 text-blue-500" aria-hidden="true" />
              <span>
                Demo version powered by Gemini API free tier. Response times may vary during high usage or with very large files.
              </span>
            </div>
          </label>

          <input
            ref={fileInputRef}
            id="pdfs"
            className="hidden"
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleFiles}
          />

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-500">
              <span>Upload progress</span>
              <span>{files.length} of 3 selected</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-blue-50" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={files.length}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400 transition-all duration-500"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>

          {files.length > 0 && (
            <div className="mt-5 grid gap-3">
              {files.map((file) => (
                <div
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  key={`${file.name}-${file.size}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                      <FileText className="size-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{file.name}</p>
                      <p className="text-xs text-slate-500">{Math.round(file.size / 1024).toLocaleString()} KB</p>
                    </div>
                  </div>
                  <CheckCircle2 className="size-5 shrink-0 text-blue-600" aria-label="Selected" />
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="alert" aria-live="polite">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{error}</p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              Choose PDFs
            </button>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              disabled={!canAnalyze}
              aria-disabled={!canAnalyze}
            >
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <WandSparkles className="size-4" aria-hidden="true" />}
              {loading ? "Analyzing..." : "Analyze Papers"}
            </button>
          </div>
        </form>
      </section>

      <section id="dashboard" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        {loading && (
          <div className="grid gap-5">
            <AnalysisProgress currentStageIndex={currentStageIndex} />
            <LoadingState message={pipelineMessages[currentStageIndex]} currentStep={pipelineStages[currentStageIndex]} />
          </div>
        )}

        {!loading && !hasResults && (
          <EmptyDashboard />
        )}

        {hasResults && (
          <div className="grid gap-8" aria-live="polite">
            {extractedPapers.length > 0 && (
              <ResultBlock eyebrow="Processed files" title="Uploaded Papers">
                <div className="grid gap-4 md:grid-cols-3">
                  {extractedPapers.map((paper) => (
                    <article
                      className="rounded-[1.5rem] border border-blue-100 bg-white p-5 shadow-sm shadow-blue-950/5 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-950/10"
                      key={paper.filename}
                    >
                      <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                        <FileText className="size-5" aria-hidden="true" />
                      </div>
                      <p className="truncate font-bold text-slate-950">{paper.filename}</p>
                      <p className="mt-2 text-sm text-slate-500">{paper.textLength.toLocaleString()} characters extracted</p>
                    </article>
                  ))}
                </div>
              </ResultBlock>
            )}

            {summaries.length > 0 && (
            <ResultBlock eyebrow="Section 1" title="Paper Summaries">
              <div className="grid gap-5 lg:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
                {summaries.map((summary) => (
                  <article
                    className="rounded-[1.75rem] border border-blue-100 bg-white p-6 shadow-sm shadow-blue-950/5 transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-950/10"
                    key={summary.title}
                  >
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <h3 className="text-lg font-extrabold tracking-tight text-slate-950">{summary.title}</h3>
                      <Brain className="size-5 shrink-0 text-blue-600" aria-hidden="true" />
                    </div>
                    <SummaryItem label="Objective">{summary.objective}</SummaryItem>
                    <SummaryItem label="Methodology">{summary.methodology}</SummaryItem>
                    <SummaryItem label="Findings">{summary.findings}</SummaryItem>
                  </article>
                ))}
              </div>
            </ResultBlock>
            )}

            {comparisonRows.length > 0 && (
            <ResultBlock eyebrow="Section 2" title="Comparison Table">
              <div className="overflow-hidden rounded-[1.75rem] border border-blue-100 bg-white shadow-lg shadow-blue-950/5">
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] border-collapse text-left text-sm">
                    <thead className="bg-blue-600 text-xs uppercase text-white">
                      <tr>
                        <th className="px-5 py-4 font-bold">Paper</th>
                        <th className="px-5 py-4 font-bold">Objective</th>
                        <th className="px-5 py-4 font-bold">Methodology</th>
                        <th className="px-5 py-4 font-bold">Dataset / Scope</th>
                        <th className="px-5 py-4 font-bold">Key Findings</th>
                        <th className="px-5 py-4 font-bold">Limitations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-50">
                      {comparisonRows.map((row) => (
                        <tr className="align-top transition hover:bg-blue-50/60" key={row.paper}>
                          <td className="px-5 py-4 font-bold text-slate-950">{row.paper}</td>
                          <td className="px-5 py-4 text-slate-600">{row.objective}</td>
                          <td className="px-5 py-4 text-slate-600">{row.methodology}</td>
                          <td className="px-5 py-4 text-slate-600">{row.dataset_or_scope}</td>
                          <td className="px-5 py-4 text-slate-600">{row.key_findings}</td>
                          <td className="px-5 py-4 text-slate-600">{row.limitations}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </ResultBlock>
            )}

            {researchGaps.length > 0 && (
            <ResultBlock eyebrow="Section 3" title="Research Gaps">
              <div className="grid gap-4 md:grid-cols-2">
                {researchGaps.map((gap, index) => (
                  <article
                    className="group rounded-[1.75rem] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-6 shadow-sm shadow-blue-950/5 transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-amber-950/10"
                    key={gap}
                  >
                    <div className="mb-5 flex items-center justify-between">
                      <div className="grid size-12 place-items-center rounded-2xl bg-amber-100 text-amber-700 transition group-hover:scale-105">
                        {index % 2 === 0 ? <AlertTriangle className="size-6" aria-hidden="true" /> : <Lightbulb className="size-6" aria-hidden="true" />}
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wide text-amber-700">Gap {index + 1}</span>
                    </div>
                    <p className="text-sm leading-7 text-slate-700">{gap}</p>
                  </article>
                ))}
              </div>
            </ResultBlock>
            )}

            {novelIdeas.length > 0 && (
            <ResultBlock eyebrow="Section 4" title="Novel Research Ideas">
              <div className="grid gap-5 lg:grid-cols-2">
                {novelIdeas.map((idea, index) => (
                  <article
                    className="group relative overflow-hidden rounded-[1.75rem] border border-blue-100 bg-slate-950 p-6 text-white shadow-2xl shadow-blue-950/15 transition duration-300 hover:-translate-y-1 hover:shadow-blue-950/25"
                    key={idea}
                  >
                    <div className="absolute right-0 top-0 size-36 rounded-full bg-blue-500/20 blur-3xl transition group-hover:bg-blue-400/30" />
                    <div className="relative mb-6 flex items-center justify-between">
                      <div className="grid size-12 place-items-center rounded-2xl bg-white/10 text-blue-200">
                        
                      </div>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-blue-100">Idea {index + 1}</span>
                    </div>
                    <p className="relative text-base leading-8 text-blue-50">{idea}</p>
                    
                  </article>
                ))}
              </div>
            </ResultBlock>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function ResultBlock({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4">
        <p className="text-sm font-bold uppercase tracking-wide text-blue-600">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EmptyDashboard() {
  return (
    <section className="rounded-[2rem] border border-dashed border-blue-200 bg-white/80 p-6 shadow-sm shadow-blue-950/5 sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div>
          <div className="mb-5 grid size-14 place-items-center rounded-3xl bg-blue-50 text-blue-700">
            <Server className="size-7" aria-hidden="true" />
          </div>
          <p className="text-sm font-bold uppercase tracking-wide text-blue-600">Dashboard preview</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">Your analysis will appear here.</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Upload at least one PDF to generate paper summaries, a comparison table, research gaps, and novel research ideas.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {["Paper summaries", "Comparison table", "Research gaps", "Novel ideas"].map((item) => (
            <div className="rounded-3xl border border-blue-100 bg-blue-50/50 p-5" key={item}>
              <div className="mb-4 h-2 w-12 rounded-full bg-blue-200" />
              <p className="font-bold text-slate-800">{item}</p>
              <p className="mt-2 text-sm text-slate-500">Ready after analysis</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-5 rounded-2xl bg-blue-50/60 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{children}</p>
    </div>
  );
}

function AnalysisProgress({ currentStageIndex }: { currentStageIndex: number }) {
  const progress = ((currentStageIndex + 1) / pipelineStages.length) * 100;

  return (
    <section className="rounded-[2rem] border border-blue-100 bg-white p-5 shadow-lg shadow-blue-950/5" aria-live="polite">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-blue-600">Analysis progress</p>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">{pipelineStages[currentStageIndex]}</h2>
        </div>
        <p className="text-sm font-bold text-slate-500">
          Stage {currentStageIndex + 1} of {pipelineStages.length}
        </p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-blue-50" role="progressbar" aria-valuemin={1} aria-valuemax={pipelineStages.length} aria-valuenow={currentStageIndex + 1}>
        <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400 transition-all duration-700" style={{ width: `${progress}%` }} />
      </div>

      <ol className="mt-5 grid gap-3 md:grid-cols-4">
        {pipelineStages.map((step, index) => {
          const isComplete = index < currentStageIndex;
          const isActive = index === currentStageIndex;

          return (
            <li
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                isActive
                  ? "border-blue-200 bg-blue-50 text-blue-800 shadow-sm"
                  : isComplete
                    ? "border-blue-100 bg-white text-slate-600"
                    : "border-slate-100 bg-slate-50 text-slate-400"
              }`}
              key={step}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : isComplete
                        ? "bg-blue-100 text-blue-700"
                        : "bg-white text-slate-400"
                  }`}
                >
                  {index + 1}
                </span>
                <span>{step}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function LoadingState({ message, currentStep }: { message: string; currentStep: string }) {
  return (
    <div className="rounded-[2rem] border border-blue-100 bg-white p-6 shadow-2xl shadow-blue-950/10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative grid size-16 place-items-center rounded-3xl bg-blue-600 text-white shadow-xl shadow-blue-600/25">
            <Loader2 className="size-8 animate-spin" aria-hidden="true" />
            <span className="absolute inset-0 animate-ping rounded-3xl bg-blue-500/20" />
          </div>
          <div>
            <p className="text-lg font-extrabold text-slate-950">Analyzing your research papers...</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Current step: <span className="font-semibold text-blue-700">{currentStep}</span>
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
          {message}
        </div>
      </div>

      <div className="mt-6 h-2 overflow-hidden rounded-full bg-blue-50">
        <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-blue-600 via-sky-400 to-blue-600" />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="rounded-3xl border border-blue-50 bg-blue-50/50 p-5" key={index}>
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-blue-100" />
            <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-blue-100" />
            <div className="mt-2 h-3 w-5/6 animate-pulse rounded-full bg-blue-100" />
            <div className="mt-2 h-3 w-4/6 animate-pulse rounded-full bg-blue-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeAnalysis(payload: AnalysisResponse): NormalizedAnalysis {
  return {
    extracted_papers: (payload.extracted_papers ?? []).map((paper) => ({
      filename: paper.filename,
      textLength: paper.text?.length ?? 0,
    })),
    summaries: payload.summaries ?? [],
    comparison_table: payload.comparison_table ?? [],
    research_gaps: payload.research_gaps ?? [],
    novel_ideas: payload.novel_ideas ?? [],
  };
}

async function revealResults(
  data: NormalizedAnalysis,
  startTransition: (callback: () => void) => void,
  setters: {
    setExtractedPapers: (papers: ExtractedPaper[]) => void;
    setSummaries: (summaries: Summary[]) => void;
    setComparisonRows: (rows: ComparisonRow[]) => void;
    setResearchGaps: (gaps: string[]) => void;
    setNovelIdeas: (ideas: string[]) => void;
  },
) {
  startTransition(() => {
    setters.setExtractedPapers(data.extracted_papers);
    setters.setSummaries(data.summaries);
  });

  await delay(120);
  startTransition(() => {
    setters.setComparisonRows(data.comparison_table);
  });

  await delay(140);
  startTransition(() => {
    setters.setResearchGaps(data.research_gaps);
  });

  await delay(140);
  startTransition(() => {
    setters.setNovelIdeas(data.novel_ideas);
  });
}

function parseJsonSafely(text: string): Promise<{ detail?: string } | null> {
  return parseJsonInWorker<{ detail?: string }>(text).catch(() => null);
}

function parseJsonInWorker<T>(text: string): Promise<T> {
  if (typeof Worker === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
    return Promise.resolve(JSON.parse(text) as T);
  }

  const workerSource = `
    self.onmessage = (event) => {
      try {
        self.postMessage({ ok: true, value: JSON.parse(event.data) });
      } catch (error) {
        self.postMessage({ ok: false, error: error instanceof Error ? error.message : "Invalid JSON" });
      }
    };
  `;

  return new Promise<T>((resolve, reject) => {
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);

    worker.onmessage = (event: MessageEvent<{ ok: boolean; value?: T; error?: string }>) => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);

      if (event.data.ok) {
        resolve(event.data.value as T);
      } else {
        reject(new Error(event.data.error ?? "Invalid JSON"));
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      reject(new Error(event.message));
    };

    worker.postMessage(text);
  });
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
