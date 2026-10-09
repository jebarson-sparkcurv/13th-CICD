import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, useGLTF, Bounds, useBounds } from "@react-three/drei";
import * as THREE from "three";
import { Upload, ArrowLeft, Box, Trash2, MapPin, Camera, Layers, RotateCcw } from "lucide-react";
import api, { assetUrl, formatApiErrorDetail } from "../../../api/client";

/* --------------------------------------------------------------------- */
/* Camera presets — position + target relative to scene center.            */
/* --------------------------------------------------------------------- */
const PRESETS = [
  { id: "front", label: "Front",     dir: [0, 0.15, 1],   testId: "cam-front" },
  { id: "rear",  label: "Rear",      dir: [0, 0.15, -1],  testId: "cam-rear" },
  { id: "left",  label: "Left",      dir: [-1, 0.15, 0],  testId: "cam-left" },
  { id: "right", label: "Right",     dir: [1, 0.15, 0],   testId: "cam-right" },
  { id: "top",   label: "Top",       dir: [0, 1, 0.001],  testId: "cam-top" },
  { id: "iso",   label: "Isometric", dir: [1, 0.9, 1],    testId: "cam-iso" },
];

/* --------------------------------------------------------------------- */
/* Model + click-to-annotate                                              */
/* --------------------------------------------------------------------- */
function GLTFModel({ url, wireframe, onSurfaceClick, addingPin }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  useEffect(() => {
    cloned.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        if (c.material) {
          c.material.wireframe = !!wireframe;
        }
      }
    });
  }, [cloned, wireframe]);
  return (
    <primitive
      object={cloned}
      onClick={(e) => {
        if (!addingPin) return;
        e.stopPropagation();
        const p = e.point;
        const n = e.face?.normal || { x: 0, y: 1, z: 0 };
        onSurfaceClick({ x: p.x, y: p.y, z: p.z, nx: n.x, ny: n.y, nz: n.z });
      }}
    />
  );
}

/* --------------------------------------------------------------------- */
/* Fit camera to model bounds once loaded                                  */
/* --------------------------------------------------------------------- */
function AutoFit({ onFit }) {
  const bounds = useBounds();
  useEffect(() => {
    const id = setTimeout(() => {
      bounds.refresh().clip().fit();
      onFit?.(bounds);
    }, 60);
    return () => clearTimeout(id);
  }, []);
  return null;
}

/* --------------------------------------------------------------------- */
/* Smooth camera transitions for presets                                  */
/* --------------------------------------------------------------------- */
function CameraRig({ preset, target, radius, orbitRef, onDone }) {
  const { camera } = useThree();
  const active = useRef(null);
  useEffect(() => {
    if (!preset || !radius) return;
    const p = PRESETS.find((x) => x.id === preset);
    if (!p) return;
    const dir = new THREE.Vector3(...p.dir).normalize();
    const dist = radius * (preset === "top" ? 2.2 : 2.4);
    const end = new THREE.Vector3().copy(target).add(dir.multiplyScalar(dist));
    active.current = {
      from: camera.position.clone(),
      to: end,
      fromT: orbitRef.current?.target.clone() || target.clone(),
      toT: target.clone(),
      t: 0,
    };
    if (orbitRef.current) orbitRef.current.enabled = false;
  }, [preset]);

  useFrame((_, dt) => {
    if (!active.current) return;
    active.current.t = Math.min(1, active.current.t + dt * 1.6);
    const e = 1 - Math.pow(1 - active.current.t, 3); // easeOutCubic
    camera.position.lerpVectors(active.current.from, active.current.to, e);
    if (orbitRef.current) {
      orbitRef.current.target.lerpVectors(active.current.fromT, active.current.toT, e);
      orbitRef.current.update();
    }
    if (active.current.t >= 1) {
      active.current = null;
      if (orbitRef.current) orbitRef.current.enabled = true;
      onDone?.();
    }
  });
  return null;
}

/* --------------------------------------------------------------------- */
/* Pin marker on the model surface                                        */
/* --------------------------------------------------------------------- */
function Pin({ ann, onOpen, isActive }) {
  return (
    <group position={[Number(ann.position_x), Number(ann.position_y), Number(ann.position_z)]}>
      <Html center distanceFactor={8} zIndexRange={[10, 0]}>
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(ann); }}
          data-testid={`pin-${ann.id}`}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap transition-transform ${
            isActive ? "bg-amber-500 text-white scale-110" : "bg-white text-slate-900 ring-1 ring-slate-900/10 hover:bg-amber-50"
          } shadow-md`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-white" : "bg-amber-500"}`} />
          {ann.label}
        </button>
      </Html>
    </group>
  );
}

/* --------------------------------------------------------------------- */
/* Progress overlay                                                       */
/* --------------------------------------------------------------------- */
function LoaderOverlay() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2 text-slate-200">
        <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold">Loading model…</div>
      </div>
    </Html>
  );
}

/* --------------------------------------------------------------------- */
/* Main page                                                              */
/* --------------------------------------------------------------------- */
export default function Model3DViewerPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const orbitRef = useRef(null);
  const targetRef = useRef(new THREE.Vector3());
  const radiusRef = useRef(1);

  const [preset, setPreset] = useState(null);
  const [wireframe, setWireframe] = useState(false);
  const [addingPin, setAddingPin] = useState(false);
  const [activePin, setActivePin] = useState(null);
  const [pendingSurface, setPendingSurface] = useState(null);
  const [pinLabel, setPinLabel] = useState("");
  const fileRef = useRef(null);

  // On mobile, tuck defaults for perf
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const { data: models = [] } = useQuery({
    queryKey: ["models3d", projectId],
    queryFn: () => api.get(`/projects/${projectId}/models3d`).then((r) => r.data),
  });
  const active = models.find((m) => m.is_active) || models[0];

  const upload = useMutation({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", file.name);
      return api.post(`/projects/${projectId}/models3d`, fd,
        { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => { qc.invalidateQueries(["models3d", projectId]); toast.success("Model uploaded"); },
    onError: (e) => toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Upload failed"),
  });

  const addPin = useMutation({
    mutationFn: (body) => api.post(`/models3d/${active.id}/annotations`, body).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries(["models3d", projectId]); setPendingSurface(null); setPinLabel(""); setAddingPin(false); toast.success("Pin added"); },
  });
  const deletePin = useMutation({
    mutationFn: (aid) => api.delete(`/models3d/${active.id}/annotations/${aid}`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries(["models3d", projectId]); toast.success("Pin removed"); },
  });

  const modelUrl = active ? assetUrl(active.file_url) : null;
  useEffect(() => () => { if (modelUrl) useGLTF.clear(modelUrl); }, [modelUrl]);

  const focusPin = (pin) => {
    setActivePin(pin.id);
    if (!orbitRef.current) return;
    const p = new THREE.Vector3(Number(pin.position_x), Number(pin.position_y), Number(pin.position_z));
    orbitRef.current.target.copy(p);
    orbitRef.current.update();
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-8" data-testid="model3d-page">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <button onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-amber-600">
          <ArrowLeft size={13} /> Back
        </button>
        <div className="text-right">
          <div className="section-eyebrow">Project #{projectId}</div>
          <h1 className="font-heading font-semibold text-2xl md:text-3xl tracking-tight text-slate-900 dark:text-slate-100">3D Drawing Viewer</h1>
        </div>
      </div>

      {!active ? (
        /* Empty state — upload */
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) upload.mutate(f); }}
          onClick={() => fileRef.current?.click()}
          className="surface surface-hover p-12 text-center cursor-pointer border-dashed" data-testid="model-empty">
          <input ref={fileRef} type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
            className="hidden" data-testid="model-file-input" />
          <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center text-slate-500 mx-auto mb-3">
            <Box size={22} strokeWidth={2.25} />
          </div>
          <div className="font-semibold text-slate-900 dark:text-slate-100">Upload a 3D model</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">GLB or GLTF — up to 100 MB. Camera presets, pin annotations, and free orbit will appear once the model loads.</div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_320px] gap-5" data-testid="model-viewer-grid">
          {/* Viewport */}
          <div className="relative surface overflow-hidden aspect-[16/10] bg-slate-950" data-testid="model-viewport">
            <Canvas shadows dpr={isMobile ? [1, 1.4] : [1, 2]}
              camera={{ position: [3, 3, 3], fov: 50 }}
              gl={{ antialias: !isMobile }}
              onCreated={({ camera }) => camera.lookAt(0, 0, 0)}>
              {/* Three-point lighting */}
              <ambientLight intensity={0.55} />
              <directionalLight position={[5, 8, 4]} intensity={1.1} castShadow />
              <directionalLight position={[-5, 4, -3]} intensity={0.5} />
              <directionalLight position={[0, -3, -6]} intensity={0.3} />

              <Suspense fallback={<LoaderOverlay />}>
                <Bounds>
                  <group>
                    <GLTFModel url={modelUrl} wireframe={wireframe}
                      addingPin={addingPin}
                      onSurfaceClick={(pt) => setPendingSurface(pt)} />
                    {(active.annotations || []).map((a) => (
                      <Pin key={a.id} ann={a}
                        isActive={activePin === a.id}
                        onOpen={(p) => focusPin(p)} />
                    ))}
                  </group>
                  <AutoFit onFit={(b) => {
                    const box = new THREE.Box3().setFromObject(b.getSize ? b : orbitRef.current.object.parent);
                    const size = box.getSize(new THREE.Vector3());
                    const center = box.getCenter(new THREE.Vector3());
                    targetRef.current.copy(center);
                    radiusRef.current = Math.max(size.x, size.y, size.z) / 2 || 1;
                  }} />
                </Bounds>
              </Suspense>

              <CameraRig preset={preset} target={targetRef.current}
                radius={radiusRef.current} orbitRef={orbitRef}
                onDone={() => setPreset(null)} />

              <OrbitControls ref={orbitRef} makeDefault
                enableDamping dampingFactor={0.08}
                minDistance={0.5} maxDistance={200} />
            </Canvas>

            {/* Preset toolbar — bottom */}
            <div className="absolute bottom-0 inset-x-0 p-3 flex items-center justify-center gap-1.5 flex-wrap bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-transparent">
              {PRESETS.map((p) => (
                <button key={p.id} data-testid={p.testId}
                  onClick={() => setPreset(p.id)}
                  className="px-3 py-1.5 rounded-md text-[10px] uppercase tracking-[0.15em] font-semibold bg-slate-900/80 text-slate-300 hover:bg-amber-500 hover:text-white transition-colors backdrop-blur-sm">
                  {p.label}
                </button>
              ))}
              <button data-testid="cam-reset" onClick={() => setPreset("iso")} title="Free orbit"
                className="px-3 py-1.5 rounded-md text-[10px] uppercase tracking-[0.15em] font-semibold bg-slate-900/80 text-slate-300 hover:bg-slate-800 transition-colors backdrop-blur-sm inline-flex items-center gap-1.5">
                <RotateCcw size={11} /> Free
              </button>
            </div>

            {/* Top-right toggles */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <button data-testid="wireframe-toggle" onClick={() => setWireframe((w) => !w)}
                title={wireframe ? "Solid mode" : "Wireframe mode"}
                className={`p-2 rounded-lg backdrop-blur-sm border transition-colors ${
                  wireframe
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-slate-900/70 text-slate-300 border-slate-700 hover:bg-slate-800"
                }`}>
                <Layers size={14} strokeWidth={2.25} />
              </button>
              <button data-testid="add-pin-toggle" onClick={() => setAddingPin((a) => !a)}
                title={addingPin ? "Cancel adding pin" : "Add pin (then click a point on the model)"}
                className={`p-2 rounded-lg backdrop-blur-sm border transition-colors ${
                  addingPin
                    ? "bg-amber-500 text-white border-amber-500 ring-2 ring-amber-500/40"
                    : "bg-slate-900/70 text-slate-300 border-slate-700 hover:bg-slate-800"
                }`}>
                <MapPin size={14} strokeWidth={2.25} />
              </button>
              <label className="p-2 rounded-lg backdrop-blur-sm border bg-slate-900/70 text-slate-300 border-slate-700 hover:bg-slate-800 cursor-pointer transition-colors" title="Upload new version">
                <input type="file" accept=".glb,.gltf" className="hidden" data-testid="reupload-input"
                  onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
                <Upload size={14} strokeWidth={2.25} />
              </label>
            </div>

            {/* Adding-pin banner */}
            {addingPin && (
              <div className="absolute top-3 left-3 chip chip-warning" data-testid="adding-pin-banner">
                Click a point on the model to drop a pin
              </div>
            )}
          </div>

          {/* Annotations sidebar */}
          <aside className="surface p-4" data-testid="annotations-panel">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="section-eyebrow">Pin Annotations</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{(active.annotations || []).length} pin(s) · v{active.version}</div>
              </div>
            </div>
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {(active.annotations || []).length === 0 && (
                <div className="text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-4 text-center">
                  Click the <MapPin size={11} className="inline -mt-0.5" /> icon on the viewport, then click a point on the model to drop your first pin.
                </div>
              )}
              {(active.annotations || []).map((a) => (
                <div key={a.id} data-testid={`pin-row-${a.id}`}
                  className={`group border rounded-lg p-2.5 transition-colors cursor-pointer ${
                    activePin === a.id
                      ? "border-amber-400/60 bg-amber-500/5"
                      : "border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-500/40"
                  }`}
                  onClick={() => focusPin(a)}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{a.label}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deletePin.mutate(a.id); }}
                      title="Remove pin" className="p-1 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 size={13} strokeWidth={2.25} />
                    </button>
                  </div>
                  {a.note && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{a.note}</div>}
                  <div className="text-[9px] uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 font-mono mt-1.5 tabular-nums">
                    {Number(a.position_x).toFixed(2)}, {Number(a.position_y).toFixed(2)}, {Number(a.position_z).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

      {/* Add-pin modal */}
      {pendingSurface && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" data-testid="pin-modal">
          <div className="surface p-5 w-full max-w-md">
            <div className="section-eyebrow mb-2">New Pin</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-3 font-mono tabular-nums">
              Coord: {pendingSurface.x.toFixed(2)}, {pendingSurface.y.toFixed(2)}, {pendingSurface.z.toFixed(2)}
            </div>
            <input type="text" data-testid="pin-label-input" autoFocus value={pinLabel}
              onChange={(e) => setPinLabel(e.target.value)}
              placeholder="e.g. Issue here, Structural concern…"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setPendingSurface(null); setPinLabel(""); }}
                className="px-3 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                Cancel
              </button>
              <button data-testid="pin-save-btn"
                onClick={() => addPin.mutate({
                  position_x: pendingSurface.x, position_y: pendingSurface.y, position_z: pendingSurface.z,
                  normal_x: pendingSurface.nx, normal_y: pendingSurface.ny, normal_z: pendingSurface.nz,
                  label: pinLabel.trim() || "Pin",
                })}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-[11px] uppercase tracking-[0.15em] font-semibold">
                Save Pin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
