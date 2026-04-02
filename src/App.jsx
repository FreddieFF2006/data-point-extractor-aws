import { useState, useRef, useCallback, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const getApi = () => localStorage.getItem("dp_api") || "";

// ── Extraction helpers ──
const NR = /(\d+(?:,\d{3})*(?:\.\d+)?)/g;
const YR = new Set(); for (let y = 1900; y < 2060; y++) YR.add(y);
function sk(v, t, x, p) { if (v === 0 || (p > 0 && x[p-1] === "*")) return true; if (!t.includes(",") && /^\d{4}$/.test(t) && YR.has(+t)) return true; if (x.substring(Math.max(0, p-3), p).toUpperCase().includes("FY")) return true; if (p > 0 && /[A-Za-z]/.test(x[p-1]) && /^\d{4,}$/.test(t)) return true; if (/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+$/i.test(x.substring(Math.max(0, p-40), p)) && v <= 31) return true; return false; }
function sn(x, p) { let s = p, e = p; while (s > 0 && !/[.!?\n]/.test(x[s-1])) s--; while (e < x.length && !/[.!?\n]/.test(x[e])) e++; if (e < x.length) e++; return x.substring(s, e).replace(/\s+/g, " ").trim(); }
async function extractPdf(file, cb) { const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; const cs = []; for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i); const tx = (await pg.getTextContent()).items.map(x => x.str).join(" "); let m; NR.lastIndex = 0; while ((m = NR.exec(tx)) !== null) { const t = m[1], c = t.replace(/,/g, ""), p = m.index, v = parseFloat(c); if (!isNaN(v) && !sk(v, t, tx, p)) cs.push({ id: cs.length, page: i, number: t, sentence: sn(tx, p) }); } if (cb) cb(i, pdf.numPages, cs.length); } return { candidates: cs, numPages: pdf.numPages }; }

// ── API ──
const api = (path, opts) => fetch(`${getApi()}${path}`, opts);
async function classify(batch) { const r = await api("/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidates: batch.map(c => ({ id: c.id, number: c.number, sentence: c.sentence.substring(0, 250) })) }) }); if (!r.ok) throw new Error(`${r.status}`); return ((await r.json()).results || []).map(x => ({ id: x.id, cat: (x.cat || "O").toUpperCase() })); }
async function chatApi(q, sid, dps, hist) { const r = await api("/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, sessionId: sid, dataPoints: dps, chatHistory: hist }) }); if (!r.ok) throw new Error(`${r.status}`); return (await r.json()).answer; }
async function listSessions() { try { const r = await api("/sessions"); return (await r.json()).sessions || []; } catch { return []; } }
async function saveSession(s) { try { await api("/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }); } catch {} }
async function delSession(id) { try { await api(`/sessions?sessionId=${id}`, { method: "DELETE" }); } catch {} }

// ── ESG config ──
const ESG = {
  E: { name: "Environment", color: "#34d399", dim: "#064e3b" },
  S: { name: "Social", color: "#60a5fa", dim: "#1e3a5f" },
  G: { name: "Governance", color: "#a78bfa", dim: "#4c1d95" },
  O: { name: "Other", color: "#737373", dim: "#333" },
};

// ── Pie chart ──
function PieChart({ cc, total }) {
  if (!total) return null;
  const keys = ["E", "S", "G", "O"], cx = 60, cy = 60, r = 52, ir = 32;
  let angle = -Math.PI / 2;
  const arcs = keys.map(k => {
    const pct = cc[k] / total, sweep = pct * Math.PI * 2, start = angle;
    angle += sweep;
    if (pct < 0.003) return { k, d: "" };
    const lg = sweep > Math.PI ? 1 : 0;
    return { k, d: `M${cx+r*Math.cos(start)},${cy+r*Math.sin(start)} A${r},${r} 0 ${lg} 1 ${cx+r*Math.cos(angle)},${cy+r*Math.sin(angle)} L${cx+ir*Math.cos(angle)},${cy+ir*Math.sin(angle)} A${ir},${ir} 0 ${lg} 0 ${cx+ir*Math.cos(start)},${cy+ir*Math.sin(start)} Z` };
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width={120} height={120} viewBox="0 0 120 120">
        {arcs.map(a => a.d && <path key={a.k} d={a.d} fill={ESG[a.k].color} opacity={0.75} stroke="#111" strokeWidth={1.5} />)}
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="15" fontWeight="600" fontFamily="system-ui">{total}</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {keys.map(k => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: ESG[k].color }} />
            <span style={{ width: 80, color: "#aaa" }}>{ESG[k].name}</span>
            <span style={{ fontWeight: 600, color: "#fff", width: 28, textAlign: "right" }}>{cc[k]}</span>
            <span style={{ color: "#555", fontSize: 11 }}>{((cc[k] / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Excel export ──
function exportXls(dps, cc, total, fname) {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const cn = { E: "Environment", S: "Social", G: "Governance", O: "Other" };
  const sorted = [...dps].sort((a, b) => a.page - b.page);
  let x = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Size="11" ss:Color="#FFFFFF" ss:FontName="Calibri"/><Interior ss:Color="#1a1a2e" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="t"><Font ss:FontName="Calibri" ss:Size="10"/><Alignment ss:WrapText="1" ss:Vertical="Top"/></Style><Style ss:ID="c"><Font ss:FontName="Calibri" ss:Size="10"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="cE"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#059669"/><Interior ss:Color="#D1FAE5" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="cS"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#2563EB"/><Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="cG"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#7C3AED"/><Interior ss:Color="#EDE9FE" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="cO"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#6B7280"/><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="sv"><Font ss:Bold="1" ss:Size="12" ss:Color="#4F46E5" ss:FontName="Calibri"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="pct"><Font ss:Size="11" ss:FontName="Calibri"/><NumberFormat ss:Format="0.0%"/><Alignment ss:Horizontal="Center"/></Style></Styles>`;
  const sheet = (name, data, hasCat) => { let s = `<Worksheet ss:Name="${esc(name)}"><Table><Column ss:Width="35"/><Column ss:Width="50"/><Column ss:Width="110"/>${hasCat ? '<Column ss:Width="90"/>' : ""}<Column ss:Width="650"/><Row><Cell ss:StyleID="h"><Data ss:Type="String">#</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Page</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Data Point</Data></Cell>${hasCat ? '<Cell ss:StyleID="h"><Data ss:Type="String">Category</Data></Cell>' : ""}<Cell ss:StyleID="h"><Data ss:Type="String">Sentence</Data></Cell></Row>`; data.forEach((d, i) => { s += `<Row><Cell ss:StyleID="c"><Data ss:Type="Number">${i + 1}</Data></Cell><Cell ss:StyleID="c"><Data ss:Type="Number">${d.page}</Data></Cell><Cell ss:StyleID="t"><Data ss:Type="String">${esc(d.number)}</Data></Cell>${hasCat ? `<Cell ss:StyleID="c${d.cat}"><Data ss:Type="String">${cn[d.cat] || "Other"}</Data></Cell>` : ""}<Cell ss:StyleID="t"><Data ss:Type="String">${esc((d.sentence || "").substring(0, 500))}</Data></Cell></Row>`; }); s += `</Table><AutoFilter x:Range="R1C1:R${data.length + 1}C${hasCat ? 5 : 4}" xmlns="urn:schemas-microsoft-com:office:excel"/></Worksheet>`; return s; };
  x += sheet("All Data Points", sorted, true);
  x += `<Worksheet ss:Name="Summary"><Table><Column ss:Width="160"/><Column ss:Width="80"/><Column ss:Width="80"/><Row><Cell ss:StyleID="h"><Data ss:Type="String">Category</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Count</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">%</Data></Cell></Row>`;
  ["E", "S", "G", "O"].forEach(k => { x += `<Row><Cell ss:StyleID="c${k}"><Data ss:Type="String">${cn[k]}</Data></Cell><Cell ss:StyleID="sv"><Data ss:Type="Number">${cc[k]}</Data></Cell><Cell ss:StyleID="pct"><Data ss:Type="Number">${total ? cc[k] / total : 0}</Data></Cell></Row>`; });
  x += `</Table></Worksheet>`;
  ["E", "S", "G", "O"].forEach(k => { x += sheet(cn[k], sorted.filter(d => d.cat === k), false); });
  x += `</Workbook>`; return x;
}

// ── Main ──
export default function App() {
  const [apiUrl, setApiUrl] = useState(getApi());
  const [setup, setSetup] = useState(!getApi());
  const [sessions, setSessions] = useState([]);
  const [sid, setSid] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | extracting | classifying | done | error
  const [dps, setDps] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [prog, setProg] = useState("");
  const [pages, setPages] = useState(0);
  const [fname, setFname] = useState("");
  const [file, setFile] = useState(null);
  const [search, setSearch] = useState("");
  const [catF, setCatF] = useState("ALL");
  const [tab, setTab] = useState("chat");
  const [sideOpen, setSideOpen] = useState(true);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, thinking]);

  // Load sessions on mount
  const refresh = useCallback(async () => { if (getApi()) setSessions(await listSessions()); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const saveSetup = () => { localStorage.setItem("dp_api", apiUrl); setSetup(false); refresh(); };

  // ── Session management ──
  const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const newSession = async (name) => {
    const id = makeId();
    const sess = { sessionId: id, name: name || "New session", fileName: "", createdAt: new Date().toISOString(), dataPoints: [], dataPointCount: 0, chatHistory: [], chatCount: 0, catCounts: {}, totalPages: 0 };
    // Immediately add to sidebar
    setSessions(prev => [sess, ...prev]);
    setSid(id);
    setDps([]); setMsgs([]); setStatus("idle"); setFname(""); setFile(null); setPages(0); setTab("chat");
    // Save to DynamoDB in background
    await saveSession(sess);
    return id;
  };

  const openSession = async (id) => {
    setSid(id);
    try {
      const all = await listSessions();
      setSessions(all);
      const s = all.find(x => x.sessionId === id);
      if (s) { setFname(s.fileName || ""); setPages(s.totalPages || 0); setDps(s.dataPoints || []); setMsgs(s.chatHistory || []); setStatus(s.dataPoints?.length ? "done" : "idle"); setTab("chat"); }
    } catch {}
  };

  const removeSession = async (id) => {
    if (sid === id) { setSid(null); setDps([]); setMsgs([]); setStatus("idle"); setFname(""); }
    setSessions(p => p.filter(x => x.sessionId !== id));
    await delSession(id);
  };

  // Auto-save to DynamoDB
  const persist = useCallback(async () => {
    if (!sid || !getApi() || dps.length === 0) return;
    // Don't save if session was deleted from sidebar
    const stillExists = sessions.some(s => s.sessionId === sid);
    if (!stillExists) return;
    const cc = { E: 0, S: 0, G: 0, O: 0 }; dps.forEach(d => { cc[d.cat] = (cc[d.cat] || 0) + 1; });
    const sess = { sessionId: sid, name: fname || "Untitled", fileName: fname, createdAt: new Date().toISOString(), dataPoints: dps, dataPointCount: dps.length, chatHistory: msgs, chatCount: msgs.length, catCounts: cc, totalPages: pages };
    await saveSession(sess);
    setSessions(prev => prev.map(s => s.sessionId === sid ? { ...s, fileName: fname, dataPointCount: dps.length, chatCount: msgs.length } : s));
  }, [sid, dps, msgs, fname, pages, sessions]);
  useEffect(() => { const t = setTimeout(persist, 3000); return () => clearTimeout(t); }, [persist]);

  // ── File handling ──
  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    let id = sid;
    if (!id) id = await newSession(f.name);
    else { setSessions(p => p.map(s => s.sessionId === id ? { ...s, name: f.name, fileName: f.name } : s)); }
    setFname(f.name); setFile(f); setDps([]); setStatus("idle");
    setMsgs([{ role: "system", content: `${f.name} loaded (${(f.size / 1024 / 1024).toFixed(1)} MB). Click Run to extract data points.` }]);
    setTab("chat");
  };

  // ── Extraction pipeline ──
  const run = async () => {
    if (!file || !getApi()) return;
    setStatus("extracting");
    setMsgs(h => [...h, { role: "system", content: "Extracting text from PDF..." }]);
    try {
      const { candidates: cs, numPages } = await extractPdf(file, (pg, tot, n) => { setProg(`${pg}/${tot} pages`); });
      setPages(numPages);
      setMsgs(h => [...h, { role: "system", content: `${cs.length} candidates found in ${numPages} pages. Running AI classification...` }]);
      setStatus("classifying");
      const dm = new Map();
      const bs = 100; // bigger batches
      const PARALLEL = 5; // concurrent requests
      const batches = [];
      for (let i = 0; i < cs.length; i += bs) batches.push(cs.slice(i, i + bs));
      const tb = batches.length;
      let done = 0;

      // Process batches in parallel waves
      for (let w = 0; w < tb; w += PARALLEL) {
        const wave = batches.slice(w, w + PARALLEL);
        const promises = wave.map(async (batch) => {
          try {
            return await classify(batch);
          } catch (err) {
            // Retry once
            await new Promise(r => setTimeout(r, 3000));
            try { return await classify(batch); } catch { return []; }
          }
        });
        const results = await Promise.all(promises);
        results.forEach(res => res.forEach(({ id, cat }) => dm.set(id, cat)));
        done += wave.length;
        setProg(`${done}/${tb} batches`);
      }
      const result = cs.filter(c => dm.has(c.id)).map(c => ({ ...c, cat: dm.get(c.id) })).sort((a, b) => a.page - b.page);
      setDps(result); setStatus("done"); setProg("");
      const cc = { E: 0, S: 0, G: 0, O: 0 }; result.forEach(d => { cc[d.cat] = (cc[d.cat] || 0) + 1; });
      setMsgs(h => [...h, { role: "system", content: `Extraction complete \u2014 ${result.length} data points found.\n\nEnvironment: ${cc.E}  \u00b7  Social: ${cc.S}  \u00b7  Governance: ${cc.G}  \u00b7  Other: ${cc.O}\n\nAsk me anything about the results.` }]);
    } catch (err) { setStatus("error"); setMsgs(h => [...h, { role: "system", content: `Error: ${err.message}` }]); }
  };

  // ── Chat ──
  const send = async () => {
    if (!input.trim() || thinking || !dps.length) return;
    const q = input.trim(); setInput("");
    setMsgs(h => [...h, { role: "user", content: q }]);
    setThinking(true);
    try {
      const ans = await chatApi(q, sid, dps, msgs.filter(m => m.role !== "system"));
      setMsgs(h => [...h, { role: "assistant", content: ans }]);
    } catch (err) { setMsgs(h => [...h, { role: "assistant", content: `Error: ${err.message}` }]); }
    setThinking(false);
  };

  // ── Derived ──
  const cc = { E: 0, S: 0, G: 0, O: 0 }; dps.forEach(d => { cc[d.cat] = (cc[d.cat] || 0) + 1; });
  const total = dps.length;
  const filtered = dps.filter(d => {
    if (catF !== "ALL" && d.cat !== catF) return false;
    if (search) { const q = search.toLowerCase(); return d.number.includes(search) || (d.sentence || "").toLowerCase().includes(q) || String(d.page).includes(search); }
    return true;
  });
  const dl = (content, name, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); };

  // ── Styles ──
  const font = "'Inter', 'SF Pro Display', -apple-system, system-ui, sans-serif";
  const bg = { primary: "#0a0a0a", secondary: "#111", elevated: "#161616", border: "#1e1e1e", hover: "#1a1a1a" };
  const txt = { primary: "#fafafa", secondary: "#a1a1a1", muted: "#666", dim: "#404040" };

  return (
    <div style={{ display: "flex", height: "100vh", background: bg.primary, fontFamily: font, color: txt.primary, overflow: "hidden" }}>

      {/* ── Sidebar ── */}
      <div style={{ width: sideOpen ? 260 : 0, minWidth: sideOpen ? 260 : 0, background: bg.primary, borderRight: `1px solid ${bg.border}`, transition: "width 0.2s cubic-bezier(0.4,0,0.2,1)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* New session button */}
        <div style={{ padding: "14px 14px 10px" }}>
          <button onClick={() => newSession()} style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: `1px solid ${bg.border}`, background: bg.elevated, color: txt.secondary, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: font, letterSpacing: "-0.01em", transition: "all 0.15s" }}
            onMouseEnter={e => { e.target.style.background = bg.hover; e.target.style.color = txt.primary; }}
            onMouseLeave={e => { e.target.style.background = bg.elevated; e.target.style.color = txt.secondary; }}>
            New session
          </button>
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
          {sessions.map(s => (
            <div key={s.sessionId} onClick={() => openSession(s.sessionId)}
              style={{ padding: "10px 10px", margin: "1px 0", borderRadius: 8, cursor: "pointer", background: sid === s.sessionId ? bg.elevated : "transparent", transition: "background 0.1s" }}
              onMouseEnter={e => { if (sid !== s.sessionId) e.currentTarget.style.background = bg.hover; }}
              onMouseLeave={e => { if (sid !== s.sessionId) e.currentTarget.style.background = "transparent"; }}>
              <div style={{ fontSize: 13, fontWeight: sid === s.sessionId ? 500 : 400, color: sid === s.sessionId ? txt.primary : txt.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.01em" }}>
                {s.fileName || s.name || "Untitled"}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <span style={{ fontSize: 11, color: txt.dim }}>{s.dataPointCount || 0} points{s.chatCount ? ` \u00b7 ${s.chatCount} msgs` : ""}</span>
                <button onClick={e => { e.stopPropagation(); removeSession(s.sessionId); }}
                  style={{ background: "none", border: "none", color: txt.dim, fontSize: 11, cursor: "pointer", padding: "2px 4px", borderRadius: 4 }}
                  onMouseEnter={e => e.target.style.color = "#ef4444"}
                  onMouseLeave={e => e.target.style.color = txt.dim}>Delete</button>
              </div>
            </div>
          ))}
          {sessions.length === 0 && <div style={{ padding: "20px 14px", color: txt.dim, fontSize: 12, textAlign: "center" }}>No sessions yet</div>}
        </div>

        {/* Settings */}
        <div style={{ padding: "8px 14px", borderTop: `1px solid ${bg.border}` }}>
          <button onClick={() => setSetup(!setup)} style={{ background: "none", border: "none", color: txt.dim, fontSize: 11, cursor: "pointer", fontFamily: font }}>{setup ? "Hide" : "Settings"}</button>
        </div>
      </div>

      {/* ── Main panel ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ height: 52, borderBottom: `1px solid ${bg.border}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0 }}>
          <button onClick={() => setSideOpen(p => !p)} style={{ background: "none", border: "none", color: txt.muted, cursor: "pointer", fontSize: 18, padding: "2px 4px", lineHeight: 1 }}>&#9776;</button>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em", color: txt.primary }}>{fname || "Data Point Extractor"}</div>
          <div style={{ flex: 1 }} />
          {(status === "extracting" || status === "classifying") && <span style={{ fontSize: 12, color: txt.muted, fontVariantNumeric: "tabular-nums" }}>{prog}</span>}
          {status === "done" && total > 0 && <span style={{ fontSize: 12, color: ESG.E.color, fontWeight: 500 }}>{total} data points</span>}
        </div>

        {/* Setup bar */}
        {setup && (
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${bg.border}`, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: txt.muted }}>API</span>
            <input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://xxxxx.execute-api.ap-northeast-1.amazonaws.com"
              style={{ flex: 1, background: bg.elevated, border: `1px solid ${bg.border}`, borderRadius: 6, padding: "7px 10px", color: txt.primary, fontSize: 12, outline: "none", fontFamily: "monospace" }} />
            <button onClick={saveSetup} style={{ padding: "7px 16px", borderRadius: 6, border: "none", background: txt.primary, color: bg.primary, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: font }}>Save</button>
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", borderBottom: `1px solid ${bg.border}`, flexShrink: 0 }}>
          {[["chat", "Chat"], ["data", "Data"], ["overview", "Overview"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: "12px 16px", border: "none", borderBottom: tab === k ? `2px solid ${txt.primary}` : "2px solid transparent", background: "transparent", color: tab === k ? txt.primary : txt.dim, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: font, letterSpacing: "-0.01em", transition: "color 0.15s" }}>
              {l}{k === "data" && total > 0 ? ` (${total})` : ""}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <label style={{ cursor: "pointer" }}>
            <input type="file" accept=".pdf" onChange={onFile} style={{ display: "none" }} />
            <span style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${bg.border}`, color: txt.secondary, fontSize: 12, fontWeight: 500, fontFamily: font }}
              onMouseEnter={e => e.target.style.borderColor = txt.dim}
              onMouseLeave={e => e.target.style.borderColor = bg.border}>Upload PDF</span>
          </label>
          {file && status === "idle" && (
            <button onClick={run} style={{ marginLeft: 8, padding: "6px 16px", borderRadius: 6, border: "none", background: txt.primary, color: bg.primary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Run</button>
          )}
          {total > 0 && <>
            <button onClick={() => dl(exportXls(dps, cc, total, fname), `${fname.replace(/\.[^.]+$/, "")}_DataPoints.xls`, "application/vnd.ms-excel")}
              style={{ marginLeft: 8, padding: "6px 10px", borderRadius: 5, border: `1px solid ${bg.border}`, background: "transparent", color: txt.dim, fontSize: 11, cursor: "pointer", fontFamily: font }}>Excel</button>
            <button onClick={() => { const rows = ["#,Page,Number,Category,Sentence", ...dps.map((d, i) => `${i + 1},${d.page},"${d.number}",${ESG[d.cat]?.name || "Other"},"${(d.sentence || "").replace(/"/g, '""')}"`)]; dl(rows.join("\n"), `${fname.replace(/\.[^.]+$/, "")}_DataPoints.csv`, "text/csv"); }}
              style={{ marginLeft: 4, padding: "6px 10px", borderRadius: 5, border: `1px solid ${bg.border}`, background: "transparent", color: txt.dim, fontSize: 11, cursor: "pointer", fontFamily: font }}>CSV</button>
          </>}
        </div>

        {/* ── Content area ── */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

          {/* Chat tab */}
          {tab === "chat" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
                {msgs.length === 0 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 32, color: txt.dim, fontWeight: 300 }}>&#9670;</div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: txt.muted }}>Data Point Extractor</div>
                    <div style={{ fontSize: 13, color: txt.dim, maxWidth: 360, textAlign: "center", lineHeight: 1.5 }}>Upload a sustainability report or annual filing to extract and classify data points, then ask questions about the results.</div>
                  </div>
                )}
                {msgs.map((m, i) => {
                  const isUser = m.role === "user";
                  const isSys = m.role === "system";
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", padding: "6px 0" }}>
                      {!isUser && (
                        <div style={{ width: 28, height: 28, borderRadius: 14, background: isSys ? bg.elevated : bg.secondary, border: `1px solid ${bg.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: isSys ? txt.dim : "#818cf8", fontWeight: 600, flexShrink: 0, marginRight: 10, marginTop: 2 }}>
                          {isSys ? "i" : "AI"}
                        </div>
                      )}
                      <div style={{ maxWidth: "70%", padding: isSys ? "6px 0" : "10px 16px", borderRadius: isUser ? "16px 16px 4px 16px" : isSys ? "0" : "16px 16px 16px 4px", background: isUser ? "#2563eb" : isSys ? "transparent" : bg.elevated, border: isSys ? "none" : isUser ? "none" : `1px solid ${bg.border}`, color: isSys ? txt.dim : isUser ? "#fff" : txt.secondary, fontSize: isSys ? 12 : 14, lineHeight: 1.6, whiteSpace: "pre-wrap", letterSpacing: "-0.01em" }}>
                        {m.content}
                      </div>
                    </div>
                  );
                })}
                {thinking && (
                  <div style={{ display: "flex", padding: "6px 0" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 14, background: bg.secondary, border: `1px solid ${bg.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#818cf8", fontWeight: 600, flexShrink: 0, marginRight: 10 }}>AI</div>
                    <div style={{ padding: "10px 16px", borderRadius: "16px 16px 16px 4px", background: bg.elevated, border: `1px solid ${bg.border}`, color: txt.dim, fontSize: 14 }}>
                      <span style={{ animation: "pulse 1.5s infinite", display: "inline-block" }}>Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
              {/* Input */}
              <div style={{ padding: "12px 24px 16px", borderTop: `1px solid ${bg.border}`, flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 8, maxWidth: 700, margin: "0 auto" }}>
                  <input value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder={total > 0 ? "Ask about the extracted data points..." : "Extract data points first..."}
                    disabled={total === 0}
                    style={{ flex: 1, background: bg.elevated, border: `1px solid ${bg.border}`, borderRadius: 10, padding: "12px 16px", color: txt.primary, fontSize: 14, outline: "none", fontFamily: font, letterSpacing: "-0.01em", transition: "border-color 0.15s" }}
                    onFocus={e => e.target.style.borderColor = txt.dim}
                    onBlur={e => e.target.style.borderColor = bg.border} />
                  <button onClick={send} disabled={!input.trim() || thinking || total === 0}
                    style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: input.trim() && total > 0 ? txt.primary : bg.elevated, color: input.trim() && total > 0 ? bg.primary : txt.dim, fontWeight: 600, fontSize: 14, cursor: input.trim() && total > 0 ? "pointer" : "default", fontFamily: font, transition: "all 0.15s" }}>
                    &#8593;
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Data tab */}
          {tab === "data" && (
            <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
              {total === 0 ? <div style={{ textAlign: "center", padding: 60, color: txt.dim, fontSize: 13 }}>No data points extracted yet</div> : <>
                <div style={{ display: "flex", gap: 4, marginBottom: 10, alignItems: "center" }}>
                  {["ALL", "E", "S", "G", "O"].map(c => {
                    const active = catF === c;
                    return <button key={c} onClick={() => setCatF(c)}
                      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: font, background: active ? bg.elevated : "transparent", border: `1px solid ${active ? txt.dim : bg.border}`, color: active ? (c === "ALL" ? txt.primary : ESG[c]?.color) : txt.dim, transition: "all 0.1s" }}>
                      {c === "ALL" ? "All" : ESG[c].name}{c !== "ALL" ? ` ${cc[c]}` : ""}
                    </button>;
                  })}
                  <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                    style={{ marginLeft: "auto", background: bg.elevated, border: `1px solid ${bg.border}`, borderRadius: 6, padding: "4px 10px", color: txt.secondary, fontSize: 12, width: 150, outline: "none", fontFamily: font }} />
                </div>
                <div style={{ border: `1px solid ${bg.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "40px 48px 100px 80px 1fr", padding: "8px 14px", borderBottom: `1px solid ${bg.border}`, fontSize: 10, fontWeight: 600, color: txt.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    <div>#</div><div>Page</div><div>Value</div><div>Category</div><div>Context</div>
                  </div>
                  <div style={{ maxHeight: "calc(100vh - 230px)", overflowY: "auto" }}>
                    {filtered.map((d, i) => (
                      <div key={d.id} style={{ display: "grid", gridTemplateColumns: "40px 48px 100px 80px 1fr", padding: "6px 14px", borderBottom: `1px solid ${bg.border}08`, fontSize: 12, background: i % 2 ? bg.secondary : "transparent", alignItems: "center" }}>
                        <div style={{ color: txt.dim }}>{i + 1}</div>
                        <div style={{ color: txt.secondary, fontWeight: 500 }}>{d.page}</div>
                        <div style={{ color: txt.primary, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{d.number}</div>
                        <div><span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: ESG[d.cat]?.dim, color: ESG[d.cat]?.color, letterSpacing: "0.02em" }}>{ESG[d.cat]?.name}</span></div>
                        <div style={{ color: txt.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 11 }}>{d.sentence}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>}
            </div>
          )}

          {/* Overview tab */}
          {tab === "overview" && (
            <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
              {total === 0 ? <div style={{ textAlign: "center", padding: 60, color: txt.dim, fontSize: 13 }}>No data yet</div> : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 680 }}>
                  <div style={{ background: bg.secondary, border: `1px solid ${bg.border}`, borderRadius: 12, padding: "20px 24px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: txt.dim, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Distribution</div>
                    <PieChart cc={cc} total={total} />
                  </div>
                  <div style={{ background: bg.secondary, border: `1px solid ${bg.border}`, borderRadius: 12, padding: "20px 24px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: txt.dim, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Stats</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {[{ l: "Data points", v: total, c: txt.primary }, { l: "Pages", v: pages, c: ESG.E.color }, { l: "Chat messages", v: msgs.filter(m => m.role !== "system").length, c: "#818cf8" }, { l: "Sessions", v: sessions.length, c: ESG.G.color }].map(({ l, v, c }) => (
                        <div key={l} style={{ background: bg.elevated, borderRadius: 8, padding: "12px 14px" }}>
                          <div style={{ fontSize: 10, color: txt.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: c, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
