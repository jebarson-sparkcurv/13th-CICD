import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Sparkles, Loader2, RefreshCw, Save, FileDown, Trash2, Plus, ArrowLeft, Camera } from "lucide-react";
import api, { assetUrl, formatApiErrorDetail } from "../../../api/client";

const SPACE_TYPES = [
  { v: "LivingRoom", l: "Living Room" }, { v: "Bedroom", l: "Bedroom" },
  { v: "Kitchen", l: "Kitchen" }, { v: "Bathroom", l: "Bathroom" },
  { v: "DiningRoom", l: "Dining Room" }, { v: "Office", l: "Office" },
  { v: "Exterior", l: "Exterior" }, { v: "Garden", l: "Garden" },
];
const STYLES = ["Modern", "Scandinavian", "Industrial", "Minimalist", "Farmhouse",
                  "Contemporary", "Bohemian", "Traditional", "Mid-Century", "Japandi",
                  "Rustic", "Luxury"];
const CATS = ["Flooring", "Paint/Wall Finish", "Furniture", "Lighting", "Fixtures", "Labour"];

const fmtINR = (n) => {
  const v = Number(n || 0);
  const abs = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `(₹${abs})` : `₹${abs}`;
};

/* --------------------------------------------------------------------- */
/* Before / After slider — swipeable                                     */
/* --------------------------------------------------------------------- */
const BeforeAfterSlider = ({ before, after }) => {
  const [pct, setPct] = useState(50);
  const wrap = useRef(null);
  const drag = (e) => {
    const rect = wrap.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    setPct(Math.max(0, Math.min(100, (x / rect.width) * 100)));
  };
  return (
    <div ref={wrap}
      className="relative surface overflow-hidden select-none aspect-[4/3] cursor-ew-resize touch-none"
      onMouseMove={(e) => e.buttons === 1 && drag(e)}
      onTouchMove={drag}
      data-testid="before-after-slider">
      <img src={after} alt="After — restyled render" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>
        <img src={before} alt="Before — original photo" className="absolute inset-y-0 left-0 w-[100vw] max-w-none h-full object-cover" />
      </div>
      <input type="range" min="0" max="100" value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
        className="absolute inset-x-0 bottom-3 mx-auto w-3/4 accent-amber-500"
        aria-label="Before / After slider" data-testid="ba-slider-input" />
      <div className="absolute inset-y-0" style={{ left: `${pct}%`, transform: "translateX(-50%)" }}>
        <div className="w-0.5 h-full bg-white/90 shadow-lg" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center text-slate-700">
          ‹›
        </div>
      </div>
      <span className="absolute top-3 left-3 chip chip-info">Before</span>
      <span className="absolute top-3 right-3 chip chip-success">After</span>
    </div>
  );
};

/* --------------------------------------------------------------------- */
/* Cost table                                                            */
/* --------------------------------------------------------------------- */
const CostLinesEditor = ({ concept, onChange }) => {
  const patch = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/concepts/${concept.id}/lines/${id}`, body).then((r) => r.data),
    onSuccess: onChange,
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/concepts/${concept.id}/lines/${id}`).then((r) => r.data),
    onSuccess: onChange,
  });
  const add = useMutation({
    mutationFn: () => api.post(`/concepts/${concept.id}/lines`, {
      category: "Furniture", description: "New item", quantity: 1, unit: "pcs", rate: 0,
    }).then((r) => r.data),
    onSuccess: onChange,
  });

  const commit = (li, field, value) => {
    const body = { category: li.category, description: li.description, quantity: li.quantity,
                     unit: li.unit, rate: li.rate, [field]: value };
    patch.mutate({ id: li.id, body });
  };

  return (
    <div className="surface overflow-hidden" data-testid="cost-lines-editor">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="section-eyebrow">Itemized Cost Estimate</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{concept.lines.length} line items · edit inline, totals recalculate live</div>
        </div>
        <button data-testid="add-line-btn" onClick={() => add.mutate()}
          className="inline-flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-600 dark:text-slate-300 hover:border-amber-400 hover:text-amber-600 transition-colors">
          <Plus size={12} /> Add Line
        </button>
      </div>

      {/* Desktop table */}
      <div className="overflow-x-auto table-desktop">
        <table className="data-table">
          <thead>
            <tr>
              <th>Category</th><th>Description</th>
              <th className="text-right">Qty</th><th>Unit</th>
              <th className="text-right">Rate</th><th className="text-right">Subtotal</th><th />
            </tr>
          </thead>
          <tbody>
            {concept.lines.map((li) => (
              <tr key={li.id} data-testid={`line-row-${li.id}`}>
                <td>
                  <select value={li.category} onChange={(e) => commit(li, "category", e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    data-testid={`line-cat-${li.id}`}>
                    {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td>
                  <input type="text" defaultValue={li.description}
                    onBlur={(e) => e.target.value !== li.description && commit(li, "description", e.target.value)}
                    className="bg-transparent w-full text-sm focus:outline-none focus:border-b focus:border-amber-500"
                    data-testid={`line-desc-${li.id}`} />
                </td>
                <td className="text-right">
                  <input type="number" step="0.1" defaultValue={li.quantity}
                    onBlur={(e) => Number(e.target.value) !== li.quantity && commit(li, "quantity", Number(e.target.value))}
                    className="bg-transparent w-20 text-sm text-right tabular-nums focus:outline-none focus:border-b focus:border-amber-500"
                    data-testid={`line-qty-${li.id}`} />
                </td>
                <td className="text-xs">
                  <input type="text" defaultValue={li.unit}
                    onBlur={(e) => e.target.value !== li.unit && commit(li, "unit", e.target.value)}
                    className="bg-transparent w-16 text-sm focus:outline-none focus:border-b focus:border-amber-500"
                    data-testid={`line-unit-${li.id}`} />
                </td>
                <td className="text-right">
                  <input type="number" step="1" defaultValue={li.rate}
                    onBlur={(e) => Number(e.target.value) !== li.rate && commit(li, "rate", Number(e.target.value))}
                    className="bg-transparent w-28 text-sm text-right tabular-nums focus:outline-none focus:border-b focus:border-amber-500"
                    data-testid={`line-rate-${li.id}`} />
                </td>
                <td className="text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums" data-testid={`line-subtotal-${li.id}`}>{fmtINR(li.subtotal)}</td>
                <td>
                  <button onClick={() => remove.mutate(li.id)} data-testid={`delete-line-${li.id}`}
                    title="Remove" className="p-1 text-slate-400 hover:text-rose-500 transition-colors">
                    <Trash2 size={14} strokeWidth={2.25} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 dark:bg-slate-900/60">
              <td colSpan={5} className="px-4 py-3 uppercase text-[10px] tracking-[0.2em] text-slate-500 dark:text-slate-400 font-bold text-right">Total Estimate</td>
              <td className="px-4 py-3 text-right font-heading font-bold text-lg text-slate-900 dark:text-slate-100 tabular-nums" data-testid="cost-total">{fmtINR(concept.total_estimate)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="row-card divide-y divide-slate-100 dark:divide-slate-800/60">
        {concept.lines.map((li) => (
          <div key={li.id} className="p-4" data-testid={`line-card-${li.id}`}>
            <div className="flex items-center justify-between gap-2">
              <select value={li.category} onChange={(e) => commit(li, "category", e.target.value)}
                className="chip bg-slate-100 border-slate-200 dark:bg-slate-800 dark:border-slate-700 !text-slate-700 dark:!text-slate-200">
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={() => remove.mutate(li.id)} className="p-1 text-slate-400 hover:text-rose-500">
                <Trash2 size={14} strokeWidth={2.25} />
              </button>
            </div>
            <input type="text" defaultValue={li.description}
              onBlur={(e) => e.target.value !== li.description && commit(li, "description", e.target.value)}
              className="mt-2 bg-transparent w-full text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-b focus:border-amber-500" />
            <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
              <div>
                <div className="text-[9px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">Qty</div>
                <input type="number" step="0.1" defaultValue={li.quantity}
                  onBlur={(e) => Number(e.target.value) !== li.quantity && commit(li, "quantity", Number(e.target.value))}
                  className="bg-transparent w-full text-sm tabular-nums focus:outline-none focus:border-b focus:border-amber-500" />
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">Unit</div>
                <input type="text" defaultValue={li.unit}
                  onBlur={(e) => e.target.value !== li.unit && commit(li, "unit", e.target.value)}
                  className="bg-transparent w-full text-sm focus:outline-none focus:border-b focus:border-amber-500" />
              </div>
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">Rate</div>
                <input type="number" defaultValue={li.rate}
                  onBlur={(e) => Number(e.target.value) !== li.rate && commit(li, "rate", Number(e.target.value))}
                  className="bg-transparent w-full text-sm text-right tabular-nums focus:outline-none focus:border-b focus:border-amber-500" />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold">Subtotal</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{fmtINR(li.subtotal)}</span>
            </div>
          </div>
        ))}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-bold">Total</span>
          <span className="font-heading font-bold text-lg text-slate-900 dark:text-slate-100 tabular-nums">{fmtINR(concept.total_estimate)}</span>
        </div>
      </div>
    </div>
  );
};

/* --------------------------------------------------------------------- */
/* Main page                                                             */
/* --------------------------------------------------------------------- */
export default function ConceptStudioPage() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef(null);

  const [conceptId, setConceptId] = useState(routeId ? Number(routeId) : null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [form, setForm] = useState({ space_type: "LivingRoom", style: "Scandinavian", sqft: 180, region: "India" });

  useEffect(() => { setConceptId(routeId ? Number(routeId) : null); }, [routeId]);

  const { data: concept, refetch } = useQuery({
    queryKey: ["concept", conceptId],
    queryFn: () => api.get(`/concepts/${conceptId}`).then((r) => r.data),
    enabled: !!conceptId,
    refetchInterval: (data) => (data && data.state?.data?.status === "Generating" ? 4000 : false),
  });

  const uploadAndGenerate = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Please choose a photo first");
      const fd = new FormData();
      fd.append("file", file);
      const up = await api.post("/concepts/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const created = await api.post("/concepts", { ...form, uploaded_photo_path: up.data.path });
      return created.data;
    },
    onSuccess: (c) => {
      setConceptId(c.id);
      navigate(`/admin/concepts/${c.id}`);
      toast.success("Generation started — this takes 15-60 seconds");
    },
    onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message),
  });

  const regenerate = useMutation({
    mutationFn: (style) => api.post(`/concepts/${conceptId}/regenerate`, { style }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries(["concept", conceptId]); toast.info("Regenerating render…"); },
  });

  const pickFile = (f) => {
    if (!f) return;
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const beforeUrl = useMemo(
    () => concept?.uploaded_photo_url ? assetUrl(concept.uploaded_photo_url) : previewUrl,
    [concept, previewUrl]);
  const afterUrl = concept?.rendered_image_url ? assetUrl(concept.rendered_image_url) : null;

  /* ---------- Landing / Upload state ---------- */
  if (!conceptId) {
    return (
      <div className="max-w-5xl mx-auto p-4 sm:p-8" data-testid="concept-studio-page">
        <div className="mb-8">
          <div className="section-eyebrow">AI Design Studio</div>
          <h1 className="font-heading font-semibold text-3xl md:text-4xl tracking-tight mt-1 text-slate-900 dark:text-slate-100">Concept & Cost Estimate</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm md:text-base">Upload a photo of a room or exterior. Sitera restyles it with AI, then generates an itemised renovation cost estimate you can review, edit, and save as a project estimate.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Upload card */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
            onClick={() => fileRef.current?.click()}
            className="surface surface-hover p-6 text-center cursor-pointer transition-colors border-dashed"
            data-testid="upload-dropzone">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => pickFile(e.target.files?.[0])}
              className="hidden" data-testid="file-input" />
            {previewUrl ? (
              <>
                <img src={previewUrl} alt="Selected" className="w-full aspect-[4/3] object-cover rounded-lg mb-3" />
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{file?.name}</div>
              </>
            ) : (
              <div className="py-10">
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center text-slate-500 mx-auto mb-3">
                  <Camera size={22} strokeWidth={2.25} />
                </div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">Tap to upload or drag a photo</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">JPEG, PNG, or WEBP — up to 15 MB</div>
              </div>
            )}
          </div>

          {/* Form card */}
          <div className="surface p-6 space-y-5">
            <div>
              <label className="section-eyebrow">Space Type</label>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {SPACE_TYPES.map((s) => (
                  <button key={s.v} type="button" data-testid={`space-${s.v}`}
                    onClick={() => setForm((f) => ({ ...f, space_type: s.v }))}
                    className={`text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      form.space_type === s.v
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}>{s.l}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="section-eyebrow">Design Style</label>
              <select data-testid="style-select" value={form.style}
                onChange={(e) => setForm((f) => ({ ...f, style: e.target.value }))}
                className="mt-2 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40">
                {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="section-eyebrow">Sq. Ft.</label>
                <input type="number" data-testid="sqft-input" value={form.sqft}
                  onChange={(e) => setForm((f) => ({ ...f, sqft: Number(e.target.value) }))}
                  className="mt-2 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
              </div>
              <div>
                <label className="section-eyebrow">Region</label>
                <input type="text" data-testid="region-input" value={form.region}
                  onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                  className="mt-2 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
              </div>
            </div>
          </div>
        </div>

        <button data-testid="generate-btn" onClick={() => uploadAndGenerate.mutate()}
          disabled={!file || uploadAndGenerate.isPending}
          className="mt-6 w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold uppercase tracking-[0.15em] rounded-lg py-3.5 text-xs transition-all tap-scale disabled:opacity-50 disabled:cursor-not-allowed">
          {uploadAndGenerate.isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} strokeWidth={2.25} />}
          {uploadAndGenerate.isPending ? "Uploading…" : "Generate Concept"}
        </button>
      </div>
    );
  }

  /* ---------- Result / Editing state ---------- */
  if (!concept) return <div className="p-8 text-center text-slate-500">Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8" data-testid="concept-result-page">
      <button onClick={() => navigate("/admin/concepts")}
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-amber-600 mb-4">
        <ArrowLeft size={13} /> Back to Studio
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="section-eyebrow">AI Design Studio · Concept #{concept.id}</div>
          <h1 className="font-heading font-semibold text-2xl md:text-3xl tracking-tight mt-1 text-slate-900 dark:text-slate-100">{concept.style} — {SPACE_TYPES.find((s) => s.v === concept.space_type)?.l || concept.space_type}</h1>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Approx {concept.sqft} sq ft · {concept.region}</div>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="concept-actions">
          <select data-testid="regenerate-style-select" defaultValue={concept.style}
            onChange={(e) => regenerate.mutate(e.target.value)}
            disabled={concept.status === "Generating"}
            className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50">
            {STYLES.map((s) => <option key={s} value={s}>Restyle as {s}</option>)}
          </select>
          <button data-testid="regenerate-btn" onClick={() => regenerate.mutate(concept.style)}
            disabled={concept.status === "Generating"}
            className="inline-flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-600 dark:text-slate-300 hover:border-amber-400 hover:text-amber-600 disabled:opacity-50 transition-colors">
            <RefreshCw size={12} /> Regenerate
          </button>
          <a data-testid="export-pdf-btn" href={`${api.defaults.baseURL}/concepts/${concept.id}/pdf`} target="_blank" rel="noreferrer"
            className={`inline-flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-600 dark:text-slate-300 hover:border-amber-400 hover:text-amber-600 transition-colors ${concept.status !== "Completed" ? "pointer-events-none opacity-50" : ""}`}>
            <FileDown size={12} /> Export PDF
          </a>
          <button data-testid="save-concept-btn" onClick={() => toast.success("Concept saved — visible in Studio history")}
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-lg px-3 py-2 text-[10px] uppercase tracking-[0.15em] font-semibold transition-colors">
            <Save size={12} /> Save
          </button>
        </div>
      </div>

      {concept.status === "Generating" && (
        <div className="surface p-10 text-center mb-6" data-testid="generating-state">
          <Loader2 size={28} className="animate-spin text-amber-500 mx-auto mb-3" />
          <div className="font-heading font-semibold text-lg text-slate-900 dark:text-slate-100">Generating your concept…</div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">Restyling the room and calculating costs · usually 15-60 seconds</div>
        </div>
      )}
      {concept.status === "Failed" && (
        <div className="surface p-6 mb-6 border-l-4 border-rose-500" data-testid="failed-state">
          <div className="font-semibold text-rose-600 dark:text-rose-400 text-sm">Generation failed</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{concept.error_message || "Please try again with a different photo."}</div>
        </div>
      )}

      {concept.status === "Completed" && beforeUrl && afterUrl && (
        <div className="mb-6">
          <BeforeAfterSlider before={beforeUrl} after={afterUrl} />
        </div>
      )}

      {concept.lines.length > 0 && <CostLinesEditor concept={concept} onChange={() => refetch()} />}
    </div>
  );
}
