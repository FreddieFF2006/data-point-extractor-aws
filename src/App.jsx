import { useState, useRef, useCallback, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const getApi = () => localStorage.getItem("dp_api") || "";

// ── Core logic (extraction + API) ──
const NR=/(\d+(?:,\d{3})*(?:\.\d+)?)/g;const YR=new Set();for(let y=1900;y<2060;y++)YR.add(y);
function sk(v,t,x,p){if(v===0||(p>0&&x[p-1]==="*"))return true;if(!t.includes(",")&&/^\d{4}$/.test(t)&&YR.has(+t))return true;if(x.substring(Math.max(0,p-3),p).toUpperCase().includes("FY"))return true;if(p>0&&/[A-Za-z]/.test(x[p-1])&&/^\d{4,}$/.test(t))return true;if(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+$/i.test(x.substring(Math.max(0,p-40),p))&&v<=31)return true;return false;}
function sn(x,p){let s=p,e=p;while(s>0&&!/[.!?\n]/.test(x[s-1]))s--;while(e<x.length&&!/[.!?\n]/.test(x[e]))e++;if(e<x.length)e++;return x.substring(s,e).replace(/\s+/g," ").trim();}
async function extractPdf(file,cb){const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;const cs=[];for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const tx=(await pg.getTextContent()).items.map(x=>x.str).join(" ");let m;NR.lastIndex=0;while((m=NR.exec(tx))!==null){const t=m[1],c=t.replace(/,/g,""),p=m.index,v=parseFloat(c);if(!isNaN(v)&&!sk(v,t,tx,p))cs.push({id:cs.length,page:i,number:t,sentence:sn(tx,p)});}if(cb)cb(i,pdf.numPages,cs.length);}return{candidates:cs,numPages:pdf.numPages};}
const ap=(path,opts)=>fetch(`${getApi()}${path}`,opts);
async function classify(batch){const r=await ap("/classify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({candidates:batch.map(c=>({id:c.id,number:c.number,sentence:c.sentence.substring(0,250)}))})});if(!r.ok)throw new Error(`${r.status}`);return((await r.json()).results||[]).map(x=>({id:x.id,cat:(x.cat||"O").toUpperCase()}));}
async function chatApi(q,sid,dps,hist){const r=await ap("/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:q,sessionId:sid,dataPoints:dps,chatHistory:hist})});if(!r.ok)throw new Error(`${r.status}`);return(await r.json()).answer;}
async function listSessions(){try{const r=await ap("/sessions");return(await r.json()).sessions||[];}catch{return[];}}
async function saveSessionApi(s){try{await ap("/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)});}catch{}}
async function delSession(id){try{await ap(`/sessions?sessionId=${id}`,{method:"DELETE"});}catch{}}

// ── Design tokens ──
const ESG = {
  E: { name: "Environment", color: "#4ade80", dim: "#14532d", accent: "#22c55e" },
  S: { name: "Social", color: "#60a5fa", dim: "#1e3a5f", accent: "#3b82f6" },
  G: { name: "Governance", color: "#c084fc", dim: "#3b0764", accent: "#a855f7" },
  O: { name: "Other", color: "#a3a3a3", dim: "#262626", accent: "#737373" },
};

// ── Icons ──
const I = ({ children: d, size = 18, stroke = "currentColor", fill = "none", sw = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const IconPlus = (p) => <I {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></I>;
const IconSearch = (p) => <I {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></I>;
const IconChat = (p) => <I {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></I>;
const IconTrash = (p) => <I size={14} {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></I>;
const IconSettings = (p) => <I size={16} {...p}><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m-9-11h2m18 0h2m-3.3-6.7l-1.4 1.4M6.7 17.3l-1.4 1.4m0-13.4l1.4 1.4m10.6 10.6l1.4 1.4"/></I>;
const IconSend = (p) => <I {...p}><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></I>;
const IconFile = (p) => <I size={16} {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></I>;

// ── Pie (reusable at any size) ──
function MiniPie({ cc, total, size = 44 }) {
  if (!total) return null;
  const cx = size/2, cy = size/2, r = size/2 - 2, ir = r * 0.55;
  let a = -Math.PI / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#222" strokeWidth={1} />
      {["E","S","G","O"].map(k => {
        const p = cc[k] / total, sw = p * Math.PI * 2, st = a; a += sw;
        if (p < 0.003) return null;
        const lg = sw > Math.PI ? 1 : 0;
        const d = `M${cx+r*Math.cos(st)},${cy+r*Math.sin(st)} A${r},${r} 0 ${lg} 1 ${cx+r*Math.cos(a)},${cy+r*Math.sin(a)} L${cx+ir*Math.cos(a)},${cy+ir*Math.sin(a)} A${ir},${ir} 0 ${lg} 0 ${cx+ir*Math.cos(st)},${cy+ir*Math.sin(st)} Z`;
        return <path key={k} d={d} fill={ESG[k].color} opacity={0.85} />;
      })}
    </svg>
  );
}

function PieChart({ cc, total }) {
  if (!total) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <MiniPie cc={cc} total={total} size={110} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {["E","S","G","O"].map(k => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: ESG[k].color }} />
            <span style={{ width: 85, fontSize: 13, color: "#b0b0b0", letterSpacing: "-0.01em" }}>{ESG[k].name}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", width: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{cc[k]}</span>
            <span style={{ fontSize: 12, color: "#555", width: 38 }}>{((cc[k]/total)*100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Excel ──
function exportXls(dps,cc,total,fname){const e=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");const cn={E:"Environment",S:"Social",G:"Governance",O:"Other"};const sorted=[...dps].sort((a,b)=>a.page-b.page);let x=`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Size="11" ss:Color="#FFFFFF" ss:FontName="Calibri"/><Interior ss:Color="#1a1a2e" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="t"><Font ss:FontName="Calibri" ss:Size="10"/><Alignment ss:WrapText="1" ss:Vertical="Top"/></Style><Style ss:ID="c"><Font ss:FontName="Calibri" ss:Size="10"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="cE"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#059669"/><Interior ss:Color="#D1FAE5" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="cS"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#2563EB"/><Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="cG"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#7C3AED"/><Interior ss:Color="#EDE9FE" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="cO"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#6B7280"/><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="sv"><Font ss:Bold="1" ss:Size="12" ss:Color="#4F46E5" ss:FontName="Calibri"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="pct"><Font ss:Size="11" ss:FontName="Calibri"/><NumberFormat ss:Format="0.0%"/><Alignment ss:Horizontal="Center"/></Style></Styles>`;const sh=(nm,d,hc)=>{let s=`<Worksheet ss:Name="${e(nm)}"><Table><Column ss:Width="35"/><Column ss:Width="50"/><Column ss:Width="110"/>${hc?'<Column ss:Width="90"/>':""}<Column ss:Width="650"/><Row><Cell ss:StyleID="h"><Data ss:Type="String">#</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Page</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Data Point</Data></Cell>${hc?'<Cell ss:StyleID="h"><Data ss:Type="String">Category</Data></Cell>':""}<Cell ss:StyleID="h"><Data ss:Type="String">Sentence</Data></Cell></Row>`;d.forEach((dp,i)=>{s+=`<Row><Cell ss:StyleID="c"><Data ss:Type="Number">${i+1}</Data></Cell><Cell ss:StyleID="c"><Data ss:Type="Number">${dp.page}</Data></Cell><Cell ss:StyleID="t"><Data ss:Type="String">${e(dp.number)}</Data></Cell>${hc?`<Cell ss:StyleID="c${dp.cat}"><Data ss:Type="String">${cn[dp.cat]||"Other"}</Data></Cell>`:""}<Cell ss:StyleID="t"><Data ss:Type="String">${e((dp.sentence||"").substring(0,500))}</Data></Cell></Row>`;});s+=`</Table><AutoFilter x:Range="R1C1:R${d.length+1}C${hc?5:4}" xmlns="urn:schemas-microsoft-com:office:excel"/></Worksheet>`;return s;};x+=sh("All Data Points",sorted,true);x+=`<Worksheet ss:Name="Summary"><Table><Column ss:Width="160"/><Column ss:Width="80"/><Column ss:Width="80"/><Row><Cell ss:StyleID="h"><Data ss:Type="String">Category</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Count</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">%</Data></Cell></Row>`;["E","S","G","O"].forEach(k=>{x+=`<Row><Cell ss:StyleID="c${k}"><Data ss:Type="String">${cn[k]}</Data></Cell><Cell ss:StyleID="sv"><Data ss:Type="Number">${cc[k]}</Data></Cell><Cell ss:StyleID="pct"><Data ss:Type="Number">${total?cc[k]/total:0}</Data></Cell></Row>`;});x+=`</Table></Worksheet>`;["E","S","G","O"].forEach(k=>{x+=sh(cn[k],sorted.filter(d=>d.cat===k),false);});x+=`</Workbook>`;return x;}

// ── Sidebar button ──
function NavBtn({ icon, onClick, active, tip }) {
  return (
    <button onClick={onClick} title={tip}
      style={{ width: 40, height: 40, borderRadius: 10, border: "none", background: active ? "rgba(255,255,255,0.08)" : "transparent", color: active ? "#e5e5e5" : "#505058", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.2s" }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
      {icon}
    </button>
  );
}

// ── App ──
export default function App() {
  const [apiUrl, setApiUrl] = useState(getApi());
  const [setup, setSetup] = useState(!getApi());
  const [sessions, setSessions] = useState([]);
  const [sid, setSid] = useState(null);
  const [status, setStatus] = useState("idle");
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
  const [panel, setPanel] = useState("none");
  const [sideOpen, setSideOpen] = useState(false);
  const [sessSearch, setSessSearch] = useState("");
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, thinking]);
  const refresh = useCallback(async () => { if (getApi()) setSessions(await listSessions()); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const saveSetup = () => { localStorage.setItem("dp_api", apiUrl); setSetup(false); refresh(); };

  const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const newSession = async (name) => {
    const id = makeId();
    const sess = { sessionId: id, name: name || "New session", fileName: "", createdAt: new Date().toISOString(), dataPoints: [], dataPointCount: 0, chatHistory: [], chatCount: 0, catCounts: {}, totalPages: 0 };
    setSessions(prev => [sess, ...prev]);
    setSid(id); setDps([]); setMsgs([]); setStatus("idle"); setFname(""); setFile(null); setPages(0); setTab("chat"); setPanel("none"); setSideOpen(false);
    await saveSessionApi(sess); return id;
  };
  const openSession = async (id) => {
    setSid(id); setPanel("none"); setSideOpen(false);
    const all = await listSessions(); setSessions(all);
    const s = all.find(x => x.sessionId === id);
    if (s) { setFname(s.fileName || ""); setPages(s.totalPages || 0); setDps(s.dataPoints || []); setMsgs(s.chatHistory || []); setStatus(s.dataPoints?.length ? "done" : "idle"); setTab("chat"); }
  };
  const removeSession = async (id) => {
    if (sid === id) { setSid(null); setDps([]); setMsgs([]); setStatus("idle"); setFname(""); }
    setSessions(p => p.filter(x => x.sessionId !== id)); await delSession(id);
  };
  const persist = useCallback(async () => {
    if (!sid || !getApi() || dps.length === 0) return;
    if (!sessions.some(s => s.sessionId === sid)) return;
    const cc2 = { E: 0, S: 0, G: 0, O: 0 }; dps.forEach(d => { cc2[d.cat] = (cc2[d.cat] || 0) + 1; });
    await saveSessionApi({ sessionId: sid, name: fname || "Untitled", fileName: fname, createdAt: new Date().toISOString(), dataPoints: dps, dataPointCount: dps.length, chatHistory: msgs, chatCount: msgs.length, catCounts: cc2, totalPages: pages });
    setSessions(prev => prev.map(s => s.sessionId === sid ? { ...s, fileName: fname, dataPointCount: dps.length, chatCount: msgs.length } : s));
  }, [sid, dps, msgs, fname, pages, sessions]);
  useEffect(() => { const t = setTimeout(persist, 3000); return () => clearTimeout(t); }, [persist]);

  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    let id = sid; if (!id) id = await newSession(f.name);
    else setSessions(p => p.map(s => s.sessionId === id ? { ...s, name: f.name, fileName: f.name } : s));
    setFname(f.name); setFile(f); setDps([]); setStatus("idle");
    setMsgs([{ role: "system", content: `Loaded ${f.name} (${(f.size/1024/1024).toFixed(1)} MB)` }]); setTab("chat");
  };

  const run = async () => {
    if (!file || !getApi()) return; setStatus("extracting");
    setMsgs(h => [...h, { role: "system", content: "Extracting text..." }]);
    try {
      const { candidates: cs, numPages } = await extractPdf(file, (pg, tot) => setProg(`${pg}/${tot}`));
      setPages(numPages);
      setMsgs(h => [...h, { role: "system", content: `${cs.length} candidates found. Classifying...` }]);
      setStatus("classifying");
      const dm = new Map(); const bs = 100; const PL = 5;
      const batches = []; for (let i = 0; i < cs.length; i += bs) batches.push(cs.slice(i, i + bs));
      let done = 0;
      for (let w = 0; w < batches.length; w += PL) {
        const wave = batches.slice(w, w + PL);
        const results = await Promise.all(wave.map(async b => { try { return await classify(b); } catch { await new Promise(r => setTimeout(r, 3000)); try { return await classify(b); } catch { return []; } } }));
        results.forEach(res => res.forEach(({ id, cat }) => dm.set(id, cat)));
        done += wave.length; setProg(`${done}/${batches.length}`);
        setDps(cs.filter(c => dm.has(c.id)).map(c => ({ ...c, cat: dm.get(c.id) })).sort((a, b) => a.page - b.page));
      }
      const result = cs.filter(c => dm.has(c.id)).map(c => ({ ...c, cat: dm.get(c.id) })).sort((a, b) => a.page - b.page);
      setDps(result); setStatus("done"); setProg("");
      const cc2 = { E: 0, S: 0, G: 0, O: 0 }; result.forEach(d => { cc2[d.cat] = (cc2[d.cat] || 0) + 1; });
      setMsgs(h => [...h, { role: "system", content: `${result.length} data points found \u2014 E:${cc2.E} S:${cc2.S} G:${cc2.G} O:${cc2.O}` }]);
    } catch (err) { setStatus("error"); setMsgs(h => [...h, { role: "system", content: `Error: ${err.message}` }]); }
  };

  const send = async () => {
    if (!input.trim() || thinking || !dps.length) return;
    const q = input.trim(); setInput("");
    setMsgs(h => [...h, { role: "user", content: q }]); setThinking(true);
    try { const ans = await chatApi(q, sid, dps, msgs.filter(m => m.role !== "system")); setMsgs(h => [...h, { role: "assistant", content: ans }]); }
    catch (err) { setMsgs(h => [...h, { role: "assistant", content: `Error: ${err.message}` }]); }
    setThinking(false);
  };

  const cc = { E: 0, S: 0, G: 0, O: 0 }; dps.forEach(d => { cc[d.cat] = (cc[d.cat] || 0) + 1; }); const total = dps.length;
  const filtered = dps.filter(d => { if (catF !== "ALL" && d.cat !== catF) return false; if (search) { const q = search.toLowerCase(); return d.number.includes(search) || (d.sentence || "").toLowerCase().includes(q) || String(d.page).includes(search); } return true; });
  const fSess = sessSearch ? sessions.filter(s => (s.fileName || s.name || "").toLowerCase().includes(sessSearch.toLowerCase())) : sessions;
  const dl = (c, n, t) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([c], { type: t })); a.download = n; a.click(); };
  const togglePanel = (p) => { if (panel === p) { setPanel("none"); setSideOpen(false); } else { setPanel(p); setSideOpen(true); } };

  const running = status === "extracting" || status === "classifying";

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0d0d0d", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif", color: "#ececec", overflow: "hidden", letterSpacing: "-0.011em" }}>

      {/* ─ Icon Rail ─ */}
      <div style={{ width: 56, minWidth: 56, background: "#0d0d0d", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: 2, flexShrink: 0, borderRight: "1px solid #1a1a1c" }}>
        <NavBtn icon={<IconPlus />} onClick={() => newSession()} tip="New" />
        <div style={{ height: 8 }} />
        <NavBtn icon={<IconSearch />} onClick={() => togglePanel("search")} active={panel === "search"} tip="Search" />
        <NavBtn icon={<IconChat />} onClick={() => togglePanel("sessions")} active={panel === "sessions"} tip="Sessions" />
        <div style={{ flex: 1 }} />
        <NavBtn icon={<IconSettings />} onClick={() => setSetup(!setup)} active={setup} tip="Settings" />
        <div style={{ height: 10 }} />
      </div>

      {/* ─ Slide Panel ─ */}
      <div style={{ width: sideOpen ? 280 : 0, background: "#111113", borderRight: sideOpen ? "1px solid #1a1a1c" : "none", transition: "width 0.25s cubic-bezier(0.16,1,0.3,1)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {panel === "search" && <>
          <div style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1a1a1c", borderRadius: 10, padding: "9px 12px" }}>
              <IconSearch size={15} stroke="#555" />
              <input value={sessSearch} onChange={e => setSessSearch(e.target.value)} placeholder="Search sessions..." autoFocus
                style={{ flex: 1, background: "transparent", border: "none", color: "#e5e5e5", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
            {fSess.map(s => <SessItem key={s.sessionId} s={s} active={sid === s.sessionId} onClick={() => openSession(s.sessionId)} onDelete={() => removeSession(s.sessionId)} />)}
            {fSess.length === 0 && <div style={{ padding: 24, color: "#333", fontSize: 13, textAlign: "center" }}>No results</div>}
          </div>
        </>}
        {panel === "sessions" && <>
          <div style={{ padding: "16px 16px 12px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sessions</div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
            {sessions.map(s => <SessItem key={s.sessionId} s={s} active={sid === s.sessionId} onClick={() => openSession(s.sessionId)} onDelete={() => removeSession(s.sessionId)} />)}
            {sessions.length === 0 && <div style={{ padding: 24, color: "#333", fontSize: 13, textAlign: "center" }}>No sessions yet</div>}
          </div>
        </>}
      </div>

      {/* ─ Main ─ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#0d0d0d" }}>

        {/* Setup */}
        {setup && <div style={{ padding: "10px 20px", borderBottom: "1px solid #1a1a1c", display: "flex", gap: 8, alignItems: "center", background: "#111113" }}>
          <span style={{ fontSize: 12, color: "#555" }}>API</span>
          <input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://xxxxx.execute-api.ap-northeast-1.amazonaws.com"
            style={{ flex: 1, background: "#1a1a1c", border: "1px solid #252528", borderRadius: 8, padding: "8px 12px", color: "#e5e5e5", fontSize: 12, outline: "none", fontFamily: "monospace" }} />
          <button onClick={saveSetup} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#e5e5e5", color: "#0d0d0d", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Save</button>
        </div>}

        {/* Tab bar + actions */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 20px", borderBottom: "1px solid #1a1a1c", flexShrink: 0, height: 44 }}>
          {[["chat","Chat"],["data","Data"],["overview","Overview"]].map(([k,l]) =>
            <button key={k} onClick={() => setTab(k)} style={{ padding: "0 14px", height: 44, border: "none", borderBottom: tab === k ? "2px solid #e5e5e5" : "2px solid transparent", background: "transparent", color: tab === k ? "#e5e5e5" : "#444", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s" }}>{l}{k === "data" && total > 0 ? ` (${total})` : ""}</button>)}
          <div style={{ flex: 1 }} />
          <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 7, border: "1px solid #252528", color: "#888", fontSize: 12, fontWeight: 500 }}>
            <IconFile /><span>Upload</span><input type="file" accept=".pdf" onChange={onFile} style={{ display: "none" }} />
          </label>
          {file && status === "idle" && <button onClick={run} style={{ marginLeft: 8, padding: "5px 16px", borderRadius: 7, border: "none", background: "#e5e5e5", color: "#0d0d0d", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Run</button>}
          {total > 0 && <>
            <button onClick={() => dl(exportXls(dps,cc,total,fname), `${fname.replace(/\.[^.]+$/,"")}_DataPoints.xls`, "application/vnd.ms-excel")} style={{ marginLeft: 8, padding: "5px 10px", borderRadius: 6, border: "1px solid #252528", background: "transparent", color: "#555", fontSize: 11, cursor: "pointer" }}>Excel</button>
            <button onClick={() => { const rows = ["#,Page,Number,Category,Sentence", ...dps.map((d,i) => `${i+1},${d.page},"${d.number}",${ESG[d.cat]?.name||"Other"},"${(d.sentence||"").replace(/"/g,'""')}"`)]; dl(rows.join("\n"), `${fname.replace(/\.[^.]+$/,"")}_DataPoints.csv`, "text/csv"); }} style={{ marginLeft: 4, padding: "5px 10px", borderRadius: 6, border: "1px solid #252528", background: "transparent", color: "#555", fontSize: 11, cursor: "pointer" }}>CSV</button>
          </>}
        </div>

        {/* Live stats */}
        {total > 0 && (running || status === "done") && (
          <div style={{ padding: "10px 20px", borderBottom: "1px solid #1a1a1c", display: "flex", alignItems: "center", gap: 16, background: "#111113" }}>
            <MiniPie cc={cc} total={total} size={36} />
            {["E","S","G","O"].map(k => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: ESG[k].color }} />
                <span style={{ fontSize: 12, color: "#666" }}>{ESG[k].name}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: ESG[k].color, fontVariantNumeric: "tabular-nums" }}>{cc[k]}</span>
              </div>
            ))}
            <div style={{ flex: 1 }} />
            {running && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 80, height: 3, background: "#1a1a1c", borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", background: "#555", borderRadius: 2, animation: "shimmer 1.5s infinite" }} /></div>
              <span style={{ fontSize: 11, color: "#555", fontVariantNumeric: "tabular-nums" }}>{prog}</span>
            </div>}
            {status === "done" && <span style={{ fontSize: 12, color: "#4ade80" }}>Complete</span>}
          </div>
        )}

        {/* ─ Content ─ */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

          {/* Chat */}
          {tab === "chat" && <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px" }}>
              {msgs.length === 0 && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: "#161618", display: "flex", alignItems: "center", justifyContent: "center" }}><IconChat size={22} stroke="#444" /></div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#555", letterSpacing: "-0.02em" }}>Data Point Extractor</div>
                <div style={{ fontSize: 14, color: "#333", maxWidth: 420, textAlign: "center", lineHeight: 1.7 }}>Upload a sustainability report or annual filing to extract data points, then ask questions about the results.</div>
              </div>}
              {msgs.map((m, i) => {
                const u = m.role === "user", sy = m.role === "system";
                return (
                  <div key={i} style={{ display: "flex", justifyContent: u ? "flex-end" : "flex-start", marginBottom: 6, maxWidth: 720 }}>
                    {!u && !sy && <div style={{ width: 30, height: 30, borderRadius: 8, background: "#1a1a1c", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 10, marginTop: 2, flexShrink: 0 }}><span style={{ fontSize: 10, fontWeight: 700, color: "#666" }}>AI</span></div>}
                    <div style={{
                      maxWidth: u ? "70%" : sy ? "100%" : "85%",
                      padding: sy ? "3px 0" : "11px 16px",
                      borderRadius: u ? "18px 18px 4px 18px" : sy ? 0 : "4px 18px 18px 18px",
                      background: u ? "#2563eb" : sy ? "transparent" : "#161618",
                      color: sy ? "#444" : u ? "#f0f6ff" : "#c8c8cc",
                      fontSize: sy ? 12 : 14, lineHeight: 1.7, whiteSpace: "pre-wrap",
                    }}>{m.content}</div>
                  </div>
                );
              })}
              {thinking && <div style={{ display: "flex", marginBottom: 6 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "#1a1a1c", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 10, flexShrink: 0 }}><span style={{ fontSize: 10, fontWeight: 700, color: "#666" }}>AI</span></div>
                <div style={{ padding: "11px 16px", borderRadius: "4px 18px 18px 18px", background: "#161618", color: "#555" }}>
                  <span className="dots">Thinking</span>
                </div>
              </div>}
              <div ref={endRef} />
            </div>
            <div style={{ padding: "14px 24px 18px", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 8, maxWidth: 720 }}>
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}}
                  placeholder={total > 0 ? "Ask about the data points..." : "Extract data points first..."}
                  disabled={total === 0}
                  style={{ flex: 1, background: "#161618", border: "1px solid #252528", borderRadius: 14, padding: "13px 18px", color: "#e5e5e5", fontSize: 14, outline: "none", fontFamily: "inherit", transition: "border-color 0.2s" }}
                  onFocus={e => e.target.style.borderColor = "#404048"} onBlur={e => e.target.style.borderColor = "#252528"} />
                <button onClick={send} disabled={!input.trim() || thinking || total === 0}
                  style={{ width: 46, height: 46, borderRadius: 14, border: "none", background: input.trim() && total > 0 ? "#e5e5e5" : "#1a1a1c", color: input.trim() && total > 0 ? "#0d0d0d" : "#444", display: "flex", alignItems: "center", justifyContent: "center", cursor: input.trim() && total > 0 ? "pointer" : "default", transition: "all 0.2s", flexShrink: 0 }}>
                  <IconSend size={17} />
                </button>
              </div>
            </div>
          </div>}

          {/* Data */}
          {tab === "data" && <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
            {total === 0 ? <div style={{ textAlign: "center", padding: 60, color: "#333", fontSize: 14 }}>No data points yet</div> : <>
              <div style={{ display: "flex", gap: 4, marginBottom: 12, alignItems: "center" }}>
                {["ALL","E","S","G","O"].map(c => <button key={c} onClick={() => setCatF(c)} style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", background: catF === c ? "#1a1a1c" : "transparent", border: `1px solid ${catF === c ? "#333" : "#1a1a1c"}`, color: catF === c ? (c === "ALL" ? "#e5e5e5" : ESG[c]?.color) : "#444", transition: "all 0.15s" }}>{c === "ALL" ? "All" : ESG[c].name}{c !== "ALL" ? ` ${cc[c]}` : ""}</button>)}
                <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ marginLeft: "auto", background: "#161618", border: "1px solid #252528", borderRadius: 8, padding: "5px 12px", color: "#b0b0b0", fontSize: 12, width: 160, outline: "none", fontFamily: "inherit" }} />
              </div>
              <div style={{ border: "1px solid #1a1a1c", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "40px 50px 100px 82px 1fr", padding: "9px 16px", background: "#111113", borderBottom: "1px solid #1a1a1c", fontSize: 10, fontWeight: 600, color: "#444", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <div>#</div><div>Page</div><div>Value</div><div>Category</div><div>Context</div></div>
                <div style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
                  {filtered.map((d, i) => <div key={d.id} style={{ display: "grid", gridTemplateColumns: "40px 50px 100px 82px 1fr", padding: "7px 16px", borderBottom: "1px solid #14141608", fontSize: 13, background: i % 2 ? "#111113" : "transparent", alignItems: "center" }}>
                    <div style={{ color: "#333", fontSize: 12 }}>{i + 1}</div>
                    <div style={{ color: "#888", fontWeight: 500 }}>{d.page}</div>
                    <div style={{ color: "#e5e5e5", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{d.number}</div>
                    <div><span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: ESG[d.cat]?.dim, color: ESG[d.cat]?.color }}>{ESG[d.cat]?.name}</span></div>
                    <div style={{ color: "#555", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 12 }}>{d.sentence}</div>
                  </div>)}
                </div>
              </div>
            </>}
          </div>}

          {/* Overview */}
          {tab === "overview" && <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
            {total === 0 ? <div style={{ textAlign: "center", padding: 60, color: "#333", fontSize: 14 }}>No data yet</div> :
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 700 }}>
              <div style={{ background: "#111113", border: "1px solid #1a1a1c", borderRadius: 14, padding: "24px 28px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#444", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.06em" }}>Distribution</div>
                <PieChart cc={cc} total={total} />
              </div>
              <div style={{ background: "#111113", border: "1px solid #1a1a1c", borderRadius: 14, padding: "24px 28px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#444", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.06em" }}>Summary</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[{ l: "Data points", v: total, c: "#e5e5e5" },{ l: "Pages", v: pages, c: "#4ade80" },{ l: "Messages", v: msgs.filter(m => m.role !== "system").length, c: "#818cf8" },{ l: "Sessions", v: sessions.length, c: "#c084fc" }].map(({ l, v, c }) =>
                    <div key={l} style={{ background: "#161618", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: c, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                    </div>)}
                </div>
              </div>
            </div>}
          </div>}
        </div>
      </div>

      <style>{`
        @keyframes shimmer { 0% { width: 20%; opacity: 0.5 } 50% { width: 80%; opacity: 1 } 100% { width: 20%; opacity: 0.5 } }
        @keyframes dotPulse { 0% { content: "Thinking" } 25% { content: "Thinking." } 50% { content: "Thinking.." } 75% { content: "Thinking..." } }
        .dots::after { content: "..."; animation: dotAnim 1.2s steps(3) infinite; }
        @keyframes dotAnim { 0% { content: "" } 33% { content: "." } 66% { content: ".." } 100% { content: "..." } }
      `}</style>
    </div>
  );
}

// ── Session list item ──
function SessItem({ s, active, onClick, onDelete }) {
  return (
    <div onClick={onClick}
      style={{ padding: "10px 12px", margin: "2px 0", borderRadius: 10, cursor: "pointer", background: active ? "rgba(255,255,255,0.06)" : "transparent", transition: "background 0.15s" }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: active ? 500 : 400, color: active ? "#e5e5e5" : "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.fileName || s.name || "Untitled"}</div>
          <div style={{ fontSize: 11, color: "#333", marginTop: 4 }}>{s.dataPointCount || 0} points{s.chatCount ? ` \u00b7 ${s.chatCount} msgs` : ""}</div>
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ background: "none", border: "none", color: "#2a2a2a", cursor: "pointer", padding: 4, borderRadius: 6, marginLeft: 4, flexShrink: 0, transition: "color 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
          onMouseLeave={e => e.currentTarget.style.color = "#2a2a2a"}>
          <IconTrash />
        </button>
      </div>
    </div>
  );
}
