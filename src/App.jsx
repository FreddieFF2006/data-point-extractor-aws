import { useState, useRef, useCallback, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const getApi = () => localStorage.getItem("dp_api") || "";

// ── Extraction ──
const NR=/(\d+(?:,\d{3})*(?:\.\d+)?)/g;const YR=new Set();for(let y=1900;y<2060;y++)YR.add(y);
function sk(v,t,x,p){if(v===0||(p>0&&x[p-1]==="*"))return true;if(!t.includes(",")&&/^\d{4}$/.test(t)&&YR.has(+t))return true;if(x.substring(Math.max(0,p-3),p).toUpperCase().includes("FY"))return true;if(p>0&&/[A-Za-z]/.test(x[p-1])&&/^\d{4,}$/.test(t))return true;if(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+$/i.test(x.substring(Math.max(0,p-40),p))&&v<=31)return true;return false;}
function sn(x,p){let s=p,e=p;while(s>0&&!/[.!?\n]/.test(x[s-1]))s--;while(e<x.length&&!/[.!?\n]/.test(x[e]))e++;if(e<x.length)e++;return x.substring(s,e).replace(/\s+/g," ").trim();}
async function extractPdf(file,cb){const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;const cs=[];for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const tx=(await pg.getTextContent()).items.map(x=>x.str).join(" ");let m;NR.lastIndex=0;while((m=NR.exec(tx))!==null){const t=m[1],c=t.replace(/,/g,""),p=m.index,v=parseFloat(c);if(!isNaN(v)&&!sk(v,t,tx,p))cs.push({id:cs.length,page:i,number:t,sentence:sn(tx,p)});}if(cb)cb(i,pdf.numPages,cs.length);}return{candidates:cs,numPages:pdf.numPages};}

// ── API ──
const ap=(path,opts)=>fetch(`${getApi()}${path}`,opts);
async function classify(batch){const r=await ap("/classify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({candidates:batch.map(c=>({id:c.id,number:c.number,sentence:c.sentence.substring(0,250)}))})});if(!r.ok)throw new Error(`${r.status}`);return((await r.json()).results||[]).map(x=>({id:x.id,cat:(x.cat||"O").toUpperCase()}));}
async function chatApi(q,sid,dps,hist){const r=await ap("/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:q,sessionId:sid,dataPoints:dps,chatHistory:hist})});if(!r.ok)throw new Error(`${r.status}`);return(await r.json()).answer;}
async function listSessions(){try{const r=await ap("/sessions");return(await r.json()).sessions||[];}catch{return[];}}
async function saveSession(s){try{await ap("/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)});}catch{}}
async function delSession(id){try{await ap(`/sessions?sessionId=${id}`,{method:"DELETE"});}catch{}}

// ── ESG ──
const ESG={E:{name:"Environment",color:"#34d399",dim:"#064e3b"},S:{name:"Social",color:"#60a5fa",dim:"#1e3a5f"},G:{name:"Governance",color:"#a78bfa",dim:"#4c1d95"},O:{name:"Other",color:"#737373",dim:"#333"}};

// ── SVG Icons (clean, 20x20) ──
const Icon = ({ d, size = 20, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const PlusIcon = (p) => <Icon {...p} d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>} />;
const SearchIcon = (p) => <Icon {...p} d={<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>} />;
const ChatIcon = (p) => <Icon {...p} d={<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>} />;
const SidebarIcon = (p) => <Icon {...p} d={<><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></>} />;
const TrashIcon = (p) => <Icon {...p} d={<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>} size={14} />;
const SettingsIcon = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>} size={16} />;
const SendIcon = (p) => <Icon {...p} d={<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>} />;

// ── Pie ──
function PieChart({cc,total}){
  if(!total)return null;
  const ks=["E","S","G","O"],cx=60,cy=60,r=52,ir=32;let a=-Math.PI/2;
  const arcs=ks.map(k=>{const p=cc[k]/total,sw=p*Math.PI*2,st=a;a+=sw;
    if(p<0.003)return{k,d:""};const lg=sw>Math.PI?1:0;
    return{k,d:`M${cx+r*Math.cos(st)},${cy+r*Math.sin(st)} A${r},${r} 0 ${lg} 1 ${cx+r*Math.cos(a)},${cy+r*Math.sin(a)} L${cx+ir*Math.cos(a)},${cy+ir*Math.sin(a)} A${ir},${ir} 0 ${lg} 0 ${cx+ir*Math.cos(st)},${cy+ir*Math.sin(st)} Z`};});
  return<div style={{display:"flex",alignItems:"center",gap:20}}>
    <svg width={120} height={120} viewBox="0 0 120 120">{arcs.map(a=>a.d&&<path key={a.k} d={a.d} fill={ESG[a.k].color} opacity={0.75} stroke="#111" strokeWidth={1.5}/>)}<text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="15" fontWeight="600" fontFamily="system-ui">{total}</text></svg>
    <div style={{display:"flex",flexDirection:"column",gap:4}}>{ks.map(k=><div key={k} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
      <div style={{width:8,height:8,borderRadius:2,background:ESG[k].color}}/><span style={{width:80,color:"#aaa"}}>{ESG[k].name}</span>
      <span style={{fontWeight:600,color:"#fff",width:28,textAlign:"right"}}>{cc[k]}</span><span style={{color:"#555",fontSize:11}}>{((cc[k]/total)*100).toFixed(0)}%</span></div>)}</div></div>;
}

// ── Excel ──
function exportXls(dps,cc,total,fname){const e=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");const cn={E:"Environment",S:"Social",G:"Governance",O:"Other"};const sorted=[...dps].sort((a,b)=>a.page-b.page);let x=`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Size="11" ss:Color="#FFFFFF" ss:FontName="Calibri"/><Interior ss:Color="#1a1a2e" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="t"><Font ss:FontName="Calibri" ss:Size="10"/><Alignment ss:WrapText="1" ss:Vertical="Top"/></Style><Style ss:ID="c"><Font ss:FontName="Calibri" ss:Size="10"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="cE"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#059669"/><Interior ss:Color="#D1FAE5" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="cS"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#2563EB"/><Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="cG"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#7C3AED"/><Interior ss:Color="#EDE9FE" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="cO"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#6B7280"/><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="sv"><Font ss:Bold="1" ss:Size="12" ss:Color="#4F46E5" ss:FontName="Calibri"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="pct"><Font ss:Size="11" ss:FontName="Calibri"/><NumberFormat ss:Format="0.0%"/><Alignment ss:Horizontal="Center"/></Style></Styles>`;const sh=(nm,d,hc)=>{let s=`<Worksheet ss:Name="${e(nm)}"><Table><Column ss:Width="35"/><Column ss:Width="50"/><Column ss:Width="110"/>${hc?'<Column ss:Width="90"/>':""}<Column ss:Width="650"/><Row><Cell ss:StyleID="h"><Data ss:Type="String">#</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Page</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Data Point</Data></Cell>${hc?'<Cell ss:StyleID="h"><Data ss:Type="String">Category</Data></Cell>':""}<Cell ss:StyleID="h"><Data ss:Type="String">Sentence</Data></Cell></Row>`;d.forEach((dp,i)=>{s+=`<Row><Cell ss:StyleID="c"><Data ss:Type="Number">${i+1}</Data></Cell><Cell ss:StyleID="c"><Data ss:Type="Number">${dp.page}</Data></Cell><Cell ss:StyleID="t"><Data ss:Type="String">${e(dp.number)}</Data></Cell>${hc?`<Cell ss:StyleID="c${dp.cat}"><Data ss:Type="String">${cn[dp.cat]||"Other"}</Data></Cell>`:""}<Cell ss:StyleID="t"><Data ss:Type="String">${e((dp.sentence||"").substring(0,500))}</Data></Cell></Row>`;});s+=`</Table><AutoFilter x:Range="R1C1:R${d.length+1}C${hc?5:4}" xmlns="urn:schemas-microsoft-com:office:excel"/></Worksheet>`;return s;};x+=sh("All Data Points",sorted,true);x+=`<Worksheet ss:Name="Summary"><Table><Column ss:Width="160"/><Column ss:Width="80"/><Column ss:Width="80"/><Row><Cell ss:StyleID="h"><Data ss:Type="String">Category</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Count</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">%</Data></Cell></Row>`;["E","S","G","O"].forEach(k=>{x+=`<Row><Cell ss:StyleID="c${k}"><Data ss:Type="String">${cn[k]}</Data></Cell><Cell ss:StyleID="sv"><Data ss:Type="Number">${cc[k]}</Data></Cell><Cell ss:StyleID="pct"><Data ss:Type="Number">${total?cc[k]/total:0}</Data></Cell></Row>`;});x+=`</Table></Worksheet>`;["E","S","G","O"].forEach(k=>{x+=sh(cn[k],sorted.filter(d=>d.cat===k),false);});x+=`</Workbook>`;return x;}

// ── Icon Button ──
function IBtn({ icon, onClick, active, tooltip, size = 36 }) {
  return <button onClick={onClick} title={tooltip} style={{ width: size, height: size, borderRadius: 8, border: "none", background: active ? "#1e1e1e" : "transparent", color: active ? "#fafafa" : "#666", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}
    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "#1a1a1a"; e.currentTarget.style.color = "#aaa"; } }}
    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#666"; } }}>
    {icon}
  </button>;
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
  const [panel, setPanel] = useState("none"); // none | sessions | search
  const [sideExpanded, setSideExpanded] = useState(false);
  const [sessSearch, setSessSearch] = useState("");
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, thinking]);
  const refresh = useCallback(async () => { if (getApi()) setSessions(await listSessions()); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const saveSetup = () => { localStorage.setItem("dp_api", apiUrl); setSetup(false); refresh(); };

  const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const newSession = async (name) => {
    const id = makeId();
    const sess = { sessionId: id, name: name || "New session", fileName: "", createdAt: new Date().toISOString(), dataPoints: [], dataPointCount: 0, chatHistory: [], chatCount: 0, catCounts: {}, totalPages: 0 };
    setSessions(prev => [sess, ...prev]);
    setSid(id); setDps([]); setMsgs([]); setStatus("idle"); setFname(""); setFile(null); setPages(0); setTab("chat");
    setPanel("none"); setSideExpanded(false);
    await saveSession(sess);
    return id;
  };

  const openSession = async (id) => {
    setSid(id); setPanel("none"); setSideExpanded(false);
    try {
      const all = await listSessions(); setSessions(all);
      const s = all.find(x => x.sessionId === id);
      if (s) { setFname(s.fileName || ""); setPages(s.totalPages || 0); setDps(s.dataPoints || []); setMsgs(s.chatHistory || []); setStatus(s.dataPoints?.length ? "done" : "idle"); setTab("chat"); }
    } catch {}
  };

  const removeSession = async (id) => {
    if (sid === id) { setSid(null); setDps([]); setMsgs([]); setStatus("idle"); setFname(""); }
    setSessions(p => p.filter(x => x.sessionId !== id));
    await delSession(id);
  };

  const persist = useCallback(async () => {
    if (!sid || !getApi() || dps.length === 0) return;
    const stillExists = sessions.some(s => s.sessionId === sid);
    if (!stillExists) return;
    const cc = { E: 0, S: 0, G: 0, O: 0 }; dps.forEach(d => { cc[d.cat] = (cc[d.cat] || 0) + 1; });
    await saveSession({ sessionId: sid, name: fname || "Untitled", fileName: fname, createdAt: new Date().toISOString(), dataPoints: dps, dataPointCount: dps.length, chatHistory: msgs, chatCount: msgs.length, catCounts: cc, totalPages: pages });
    setSessions(prev => prev.map(s => s.sessionId === sid ? { ...s, fileName: fname, dataPointCount: dps.length, chatCount: msgs.length } : s));
  }, [sid, dps, msgs, fname, pages, sessions]);
  useEffect(() => { const t = setTimeout(persist, 3000); return () => clearTimeout(t); }, [persist]);

  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    let id = sid;
    if (!id) id = await newSession(f.name);
    else { setSessions(p => p.map(s => s.sessionId === id ? { ...s, name: f.name, fileName: f.name } : s)); }
    setFname(f.name); setFile(f); setDps([]); setStatus("idle");
    setMsgs([{ role: "system", content: `${f.name} loaded (${(f.size / 1024 / 1024).toFixed(1)} MB). Click Run to extract data points.` }]);
    setTab("chat");
  };

  const run = async () => {
    if (!file || !getApi()) return;
    setStatus("extracting");
    setMsgs(h => [...h, { role: "system", content: "Extracting text from PDF..." }]);
    try {
      const { candidates: cs, numPages } = await extractPdf(file, (pg, tot, n) => { setProg(`${pg}/${tot} pages`); });
      setPages(numPages);
      setMsgs(h => [...h, { role: "system", content: `${cs.length} candidates in ${numPages} pages. Running AI classification...` }]);
      setStatus("classifying");
      const dm = new Map(); const bs = 100; const PARALLEL = 5;
      const batches = []; for (let i = 0; i < cs.length; i += bs) batches.push(cs.slice(i, i + bs));
      let done = 0;
      for (let w = 0; w < batches.length; w += PARALLEL) {
        const wave = batches.slice(w, w + PARALLEL);
        const results = await Promise.all(wave.map(async b => { try { return await classify(b); } catch { await new Promise(r => setTimeout(r, 3000)); try { return await classify(b); } catch { return []; } } }));
        results.forEach(res => res.forEach(({ id, cat }) => dm.set(id, cat)));
        done += wave.length; setProg(`${done}/${batches.length} batches`);
      }
      const result = cs.filter(c => dm.has(c.id)).map(c => ({ ...c, cat: dm.get(c.id) })).sort((a, b) => a.page - b.page);
      setDps(result); setStatus("done"); setProg("");
      const cc = { E: 0, S: 0, G: 0, O: 0 }; result.forEach(d => { cc[d.cat] = (cc[d.cat] || 0) + 1; });
      setMsgs(h => [...h, { role: "system", content: `Done \u2014 ${result.length} data points extracted.\n\nE: ${cc.E}  \u00b7  S: ${cc.S}  \u00b7  G: ${cc.G}  \u00b7  O: ${cc.O}\n\nAsk me anything about the results.` }]);
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
  const filteredSessions = sessSearch ? sessions.filter(s => (s.fileName || s.name || "").toLowerCase().includes(sessSearch.toLowerCase())) : sessions;
  const dl = (c, n, t) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([c], { type: t })); a.download = n; a.click(); };

  const F = "'Inter', -apple-system, system-ui, sans-serif";
  const B = { p: "#09090b", s: "#111113", el: "#161618", bd: "#202024", hv: "#1c1c20" };
  const T = { p: "#fafafa", s: "#a0a0a8", m: "#5c5c66", d: "#38383f" };

  // Toggle sessions panel
  const togglePanel = (p) => {
    if (panel === p) { setPanel("none"); setSideExpanded(false); }
    else { setPanel(p); setSideExpanded(true); }
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: B.p, fontFamily: F, color: T.p, overflow: "hidden" }}>

      {/* ── Icon Rail (always visible) ── */}
      <div style={{ width: 52, minWidth: 52, background: B.p, borderRight: `1px solid ${B.bd}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0", gap: 4, flexShrink: 0 }}>
        <IBtn icon={<PlusIcon />} onClick={() => newSession()} tooltip="New session" />
        <IBtn icon={<SearchIcon />} onClick={() => togglePanel("search")} active={panel === "search"} tooltip="Search sessions" />
        <IBtn icon={<ChatIcon />} onClick={() => togglePanel("sessions")} active={panel === "sessions"} tooltip="All sessions" />
        <div style={{ flex: 1 }} />
        <IBtn icon={<SettingsIcon />} onClick={() => setSetup(!setup)} active={setup} tooltip="Settings" size={32} />
      </div>

      {/* ── Slide-out Panel ── */}
      <div style={{ width: sideExpanded ? 280 : 0, minWidth: sideExpanded ? 280 : 0, background: B.s, borderRight: sideExpanded ? `1px solid ${B.bd}` : "none", transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)", overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* Search panel */}
        {panel === "search" && <>
          <div style={{ padding: "14px 14px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: B.el, borderRadius: 8, padding: "8px 12px", border: `1px solid ${B.bd}` }}>
              <SearchIcon size={16} color={T.m} />
              <input value={sessSearch} onChange={e => setSessSearch(e.target.value)} placeholder="Search sessions..." autoFocus
                style={{ flex: 1, background: "transparent", border: "none", color: T.p, fontSize: 13, outline: "none", fontFamily: F }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
            {filteredSessions.length === 0 && <div style={{ padding: 20, color: T.d, fontSize: 12, textAlign: "center" }}>No matches</div>}
            {filteredSessions.map(s => (
              <div key={s.sessionId} onClick={() => openSession(s.sessionId)}
                style={{ padding: "10px 10px", margin: "1px 0", borderRadius: 8, cursor: "pointer", background: sid === s.sessionId ? B.el : "transparent", transition: "background 0.1s" }}
                onMouseEnter={e => { if (sid !== s.sessionId) e.currentTarget.style.background = B.hv; }}
                onMouseLeave={e => { if (sid !== s.sessionId) e.currentTarget.style.background = "transparent"; }}>
                <div style={{ fontSize: 13, fontWeight: sid === s.sessionId ? 500 : 400, color: sid === s.sessionId ? T.p : T.s, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.fileName || s.name || "Untitled"}</div>
                <div style={{ fontSize: 11, color: T.d, marginTop: 3 }}>{s.dataPointCount || 0} points</div>
              </div>
            ))}
          </div>
        </>}

        {/* Sessions panel */}
        {panel === "sessions" && <>
          <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${B.bd}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.s }}>All sessions</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
            {sessions.length === 0 && <div style={{ padding: 20, color: T.d, fontSize: 12, textAlign: "center" }}>No sessions yet</div>}
            {sessions.map(s => (
              <div key={s.sessionId} onClick={() => openSession(s.sessionId)}
                style={{ padding: "10px 10px", margin: "1px 0", borderRadius: 8, cursor: "pointer", background: sid === s.sessionId ? B.el : "transparent", transition: "background 0.1s" }}
                onMouseEnter={e => { if (sid !== s.sessionId) e.currentTarget.style.background = B.hv; }}
                onMouseLeave={e => { if (sid !== s.sessionId) e.currentTarget.style.background = "transparent"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: sid === s.sessionId ? 500 : 400, color: sid === s.sessionId ? T.p : T.s, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.fileName || s.name || "Untitled"}</div>
                    <div style={{ fontSize: 11, color: T.d, marginTop: 3 }}>{s.dataPointCount || 0} points{s.chatCount ? ` \u00b7 ${s.chatCount} msgs` : ""}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); removeSession(s.sessionId); }}
                    style={{ background: "none", border: "none", color: T.d, cursor: "pointer", padding: 4, borderRadius: 4, marginLeft: 4, flexShrink: 0 }}
                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={e => e.currentTarget.style.color = T.d}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>}
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ height: 48, borderBottom: `1px solid ${B.bd}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em", color: T.p, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fname || "Data Point Extractor"}</div>
          {(status === "extracting" || status === "classifying") && <span style={{ fontSize: 12, color: T.m, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{prog}</span>}
          {status === "done" && total > 0 && <span style={{ fontSize: 12, color: ESG.E.color, fontWeight: 500, flexShrink: 0 }}>{total} data points</span>}
        </div>

        {/* Setup */}
        {setup && <div style={{ padding: "10px 16px", borderBottom: `1px solid ${B.bd}`, display: "flex", gap: 8, alignItems: "center", background: B.s }}>
          <span style={{ fontSize: 12, color: T.m, whiteSpace: "nowrap" }}>API URL</span>
          <input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://xxxxx.execute-api.ap-northeast-1.amazonaws.com"
            style={{ flex: 1, background: B.el, border: `1px solid ${B.bd}`, borderRadius: 6, padding: "7px 10px", color: T.p, fontSize: 12, outline: "none", fontFamily: "monospace" }} />
          <button onClick={saveSetup} style={{ padding: "7px 16px", borderRadius: 6, border: "none", background: T.p, color: B.p, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: F }}>Save</button>
        </div>}

        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", borderBottom: `1px solid ${B.bd}`, flexShrink: 0 }}>
          {[["chat", "Chat"], ["data", "Data"], ["overview", "Overview"]].map(([k, l]) =>
            <button key={k} onClick={() => setTab(k)} style={{ padding: "11px 14px", border: "none", borderBottom: tab === k ? "2px solid #fafafa" : "2px solid transparent", background: "transparent", color: tab === k ? T.p : T.d, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: F, transition: "color 0.1s" }}>{l}{k === "data" && total > 0 ? ` (${total})` : ""}</button>)}
          <div style={{ flex: 1 }} />
          <label style={{ cursor: "pointer" }}><input type="file" accept=".pdf" onChange={onFile} style={{ display: "none" }} />
            <span style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${B.bd}`, color: T.s, fontSize: 12, fontWeight: 500, fontFamily: F }}>Upload PDF</span></label>
          {file && status === "idle" && <button onClick={run} style={{ marginLeft: 8, padding: "5px 14px", borderRadius: 6, border: "none", background: T.p, color: B.p, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Run</button>}
          {total > 0 && <>
            <button onClick={() => dl(exportXls(dps, cc, total, fname), `${fname.replace(/\.[^.]+$/, "")}_DataPoints.xls`, "application/vnd.ms-excel")} style={{ marginLeft: 8, padding: "5px 8px", borderRadius: 5, border: `1px solid ${B.bd}`, background: "transparent", color: T.d, fontSize: 11, cursor: "pointer", fontFamily: F }}>Excel</button>
            <button onClick={() => { const rows = ["#,Page,Number,Category,Sentence", ...dps.map((d, i) => `${i + 1},${d.page},"${d.number}",${ESG[d.cat]?.name || "Other"},"${(d.sentence || "").replace(/"/g, '""')}"`)]; dl(rows.join("\n"), `${fname.replace(/\.[^.]+$/, "")}_DataPoints.csv`, "text/csv"); }} style={{ marginLeft: 4, padding: "5px 8px", borderRadius: 5, border: `1px solid ${B.bd}`, background: "transparent", color: T.d, fontSize: 11, cursor: "pointer", fontFamily: F }}>CSV</button>
          </>}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

          {tab === "chat" && <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              {msgs.length === 0 && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: B.el, border: `1px solid ${B.bd}`, display: "flex", alignItems: "center", justifyContent: "center" }}><ChatIcon size={24} color={T.d} /></div>
                <div style={{ fontSize: 16, fontWeight: 600, color: T.m }}>Data Point Extractor</div>
                <div style={{ fontSize: 13, color: T.d, maxWidth: 400, textAlign: "center", lineHeight: 1.6 }}>Upload a sustainability report or annual filing to extract and classify data points, then ask questions about the results.</div>
              </div>}
              {msgs.map((m, i) => {
                const u = m.role === "user", sy = m.role === "system";
                return <div key={i} style={{ display: "flex", justifyContent: u ? "flex-end" : "flex-start", padding: "5px 0", maxWidth: 700 }}>
                  {!u && <div style={{ width: 28, height: 28, borderRadius: 8, background: sy ? "transparent" : B.el, border: sy ? "none" : `1px solid ${B.bd}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: sy ? T.d : "#818cf8", fontWeight: 600, flexShrink: 0, marginRight: 10, marginTop: 2 }}>{sy ? "" : "AI"}</div>}
                  <div style={{ maxWidth: "75%", padding: sy ? "4px 0" : "10px 16px", borderRadius: u ? "16px 16px 4px 16px" : sy ? 0 : "4px 16px 16px 16px", background: u ? "#2563eb" : sy ? "transparent" : B.el, border: sy ? "none" : u ? "none" : `1px solid ${B.bd}`, color: sy ? T.d : u ? "#fff" : T.s, fontSize: sy ? 12 : 14, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{m.content}</div>
                </div>;
              })}
              {thinking && <div style={{ display: "flex", padding: "5px 0" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: B.el, border: `1px solid ${B.bd}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#818cf8", fontWeight: 600, flexShrink: 0, marginRight: 10 }}>AI</div>
                <div style={{ padding: "10px 16px", borderRadius: "4px 16px 16px 16px", background: B.el, border: `1px solid ${B.bd}`, color: T.d }}><span className="pulse">Thinking...</span></div>
              </div>}
              <div ref={endRef} />
            </div>
            <div style={{ padding: "12px 24px 16px", borderTop: `1px solid ${B.bd}`, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 8, maxWidth: 700, margin: "0 auto" }}>
                <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={total > 0 ? "Ask about the data points..." : "Extract data points first..."}
                  disabled={total === 0}
                  style={{ flex: 1, background: B.el, border: `1px solid ${B.bd}`, borderRadius: 12, padding: "12px 16px", color: T.p, fontSize: 14, outline: "none", fontFamily: F, transition: "border-color 0.15s" }}
                  onFocus={e => e.target.style.borderColor = T.d} onBlur={e => e.target.style.borderColor = B.bd} />
                <button onClick={send} disabled={!input.trim() || thinking || total === 0}
                  style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: input.trim() && total > 0 ? T.p : B.el, color: input.trim() && total > 0 ? B.p : T.d, display: "flex", alignItems: "center", justifyContent: "center", cursor: input.trim() && total > 0 ? "pointer" : "default", transition: "all 0.15s", flexShrink: 0 }}>
                  <SendIcon size={18} />
                </button>
              </div>
            </div>
          </div>}

          {tab === "data" && <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
            {total === 0 ? <div style={{ textAlign: "center", padding: 60, color: T.d, fontSize: 13 }}>No data points extracted yet</div> : <>
              <div style={{ display: "flex", gap: 4, marginBottom: 10, alignItems: "center" }}>
                {["ALL", "E", "S", "G", "O"].map(c => <button key={c} onClick={() => setCatF(c)} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: F, background: catF === c ? B.el : "transparent", border: `1px solid ${catF === c ? T.d : B.bd}`, color: catF === c ? (c === "ALL" ? T.p : ESG[c]?.color) : T.d, transition: "all 0.1s" }}>{c === "ALL" ? "All" : ESG[c].name}{c !== "ALL" ? ` ${cc[c]}` : ""}</button>)}
                <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ marginLeft: "auto", background: B.el, border: `1px solid ${B.bd}`, borderRadius: 6, padding: "4px 10px", color: T.s, fontSize: 12, width: 150, outline: "none", fontFamily: F }} />
              </div>
              <div style={{ border: `1px solid ${B.bd}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "40px 48px 100px 80px 1fr", padding: "8px 14px", borderBottom: `1px solid ${B.bd}`, fontSize: 10, fontWeight: 600, color: T.d, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <div>#</div><div>Page</div><div>Value</div><div>Category</div><div>Context</div></div>
                <div style={{ maxHeight: "calc(100vh - 230px)", overflowY: "auto" }}>
                  {filtered.map((d, i) => <div key={d.id} style={{ display: "grid", gridTemplateColumns: "40px 48px 100px 80px 1fr", padding: "6px 14px", borderBottom: `1px solid ${B.bd}08`, fontSize: 12, background: i % 2 ? B.s : "transparent", alignItems: "center" }}>
                    <div style={{ color: T.d }}>{i + 1}</div><div style={{ color: T.s, fontWeight: 500 }}>{d.page}</div>
                    <div style={{ color: T.p, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{d.number}</div>
                    <div><span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: ESG[d.cat]?.dim, color: ESG[d.cat]?.color }}>{ESG[d.cat]?.name}</span></div>
                    <div style={{ color: T.m, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 11 }}>{d.sentence}</div>
                  </div>)}
                </div>
              </div>
            </>}
          </div>}

          {tab === "overview" && <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
            {total === 0 ? <div style={{ textAlign: "center", padding: 60, color: T.d, fontSize: 13 }}>No data yet</div> :
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 680 }}>
              <div style={{ background: B.s, border: `1px solid ${B.bd}`, borderRadius: 12, padding: "20px 24px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.d, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Distribution</div>
                <PieChart cc={cc} total={total} />
              </div>
              <div style={{ background: B.s, border: `1px solid ${B.bd}`, borderRadius: 12, padding: "20px 24px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.d, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Stats</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[{ l: "Data points", v: total, c: T.p }, { l: "Pages", v: pages, c: ESG.E.color }, { l: "Messages", v: msgs.filter(m => m.role !== "system").length, c: "#818cf8" }, { l: "Sessions", v: sessions.length, c: ESG.G.color }].map(({ l, v, c }) =>
                    <div key={l} style={{ background: B.el, borderRadius: 8, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: T.d, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: c, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                    </div>)}
                </div>
              </div>
            </div>}
          </div>}
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}.pulse{animation:pulse 1.5s infinite}`}</style>
    </div>
  );
}
