import { useState, useRef, useCallback, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

// ─── CONFIG ──────────────────────────────────────────────────
const API_BASE = localStorage.getItem("dp_api_base") || "";

const SYS = `You are a strict, consistent classifier of numerical data points in corporate reports. Apply the SAME rules every time.
A DATA POINT MEASURES something: KPI, target, count, %, monetary, environmental metric, ratio.
ALWAYS include: percentages, counts of people/sites/countries, monetary amounts, environmental measurements, ratios, share/shareholder counts.
NEVER include: years (1900-2059), dates, page numbers, ISO standards, Scope/Class/SDG labels, product models, footnotes, GRI/SASB codes, addresses, bullet numbering, raw datasheet tables.
Categories: E=Environment, S=Social, G=Governance, O=Other.
Return ONLY JSON: [{"id":1,"cat":"E"},...]  No markdown. No explanation.`;

// ─── EXTRACTION ──────────────────────────────────────────────
const NR = /(\d+(?:,\d{3})*(?:\.\d+)?)/g;
const YRS = new Set(); for (let y = 1900; y < 2060; y++) YRS.add(y);
function skip(v,t,tx,p) {
  if (v===0||(p>0&&tx[p-1]==="*")) return true;
  if (!t.includes(",")&&/^\d{4}$/.test(t)&&YRS.has(+t)) return true;
  if (tx.substring(Math.max(0,p-3),p).toUpperCase().includes("FY")) return true;
  if (p>0&&/[A-Za-z]/.test(tx[p-1])&&/^\d{4,}$/.test(t)) return true;
  if (/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+$/i.test(tx.substring(Math.max(0,p-40),p))&&v<=31) return true;
  return false;
}
function sent(tx,p) {
  let s=p,e=p;
  while(s>0&&!/[.!?\n]/.test(tx[s-1]))s--;
  while(e<tx.length&&!/[.!?\n]/.test(tx[e]))e++;
  if(e<tx.length)e++;
  return tx.substring(s,e).replace(/\s+/g," ").trim();
}
async function extractPdf(file,onP) {
  const pdf = await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
  const cs=[];
  for(let i=1;i<=pdf.numPages;i++){
    const pg=await pdf.getPage(i);
    const tx=(await pg.getTextContent()).items.map(x=>x.str).join(" ");
    let m;NR.lastIndex=0;
    while((m=NR.exec(tx))!==null){
      const t=m[1],c=t.replace(/,/g,""),p=m.index,v=parseFloat(c);
      if(!isNaN(v)&&!skip(v,t,tx,p))cs.push({id:cs.length,page:i,number:t,numberClean:c,sentence:sent(tx,p)});
    }
    if(onP)onP({page:i,total:pdf.numPages,n:cs.length});
  }
  return {candidates:cs,numPages:pdf.numPages};
}

// ─── API CALLS ───────────────────────────────────────────────
async function apiClassify(batch,base) {
  const r=await fetch(`${base}/classify`,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({candidates:batch.map(c=>({id:c.id,number:c.number,sentence:c.sentence.substring(0,250)}))})});
  if(!r.ok)throw new Error(`API ${r.status}: ${(await r.text()).substring(0,200)}`);
  const d=await r.json();
  return(d.results||[]).map(x=>({id:x.id,cat:(x.cat||"O").toUpperCase()}));
}
async function apiChat(question,sessionId,dataPoints,chatHistory,base) {
  const r=await fetch(`${base}/chat`,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({question,sessionId,dataPoints,chatHistory})});
  if(!r.ok)throw new Error(`API ${r.status}: ${(await r.text()).substring(0,200)}`);
  return(await r.json()).answer;
}
async function apiListSessions(base) {
  const r=await fetch(`${base}/sessions`);
  if(!r.ok)return[];
  return(await r.json()).sessions||[];
}
async function apiSaveSession(session,base) {
  await fetch(`${base}/sessions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(session)});
}
async function apiDeleteSession(id,base) {
  await fetch(`${base}/sessions?sessionId=${id}`,{method:"DELETE"});
}

// ─── COMPONENTS ──────────────────────────────────────────────
const C={E:{l:"Environment",c:"#34d399",bg:"#052e16",bd:"#064e3b",r:"#10b981"},S:{l:"Social",c:"#60a5fa",bg:"#172554",bd:"#1e3a5f",r:"#3b82f6"},G:{l:"Governance",c:"#c084fc",bg:"#2e1065",bd:"#4c1d95",r:"#a855f7"},O:{l:"Other",c:"#a1a1aa",bg:"#1c1c1e",bd:"#3f3f46",r:"#71717a"}};
const Badge=({cat})=>{const m=C[cat]||C.O;return<span style={{padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:700,background:m.bg,color:m.c,border:`1px solid ${m.bd}`}}>{m.l}</span>;};

function Pie({cc,tot}){
  const ks=["E","S","G","O"],sz=160,cx=80,cy=80,r=64,ir=38;
  let a=-Math.PI/2;
  const sl=ks.map(k=>{const p=tot>0?cc[k]/tot:0,an=p*2*Math.PI,sa=a;a+=an;const la=an>Math.PI?1:0;
    const d=p>0.001?`M${cx+r*Math.cos(sa)},${cy+r*Math.sin(sa)} A${r},${r} 0 ${la} 1 ${cx+r*Math.cos(a)},${cy+r*Math.sin(a)} L${cx+ir*Math.cos(a)},${cy+ir*Math.sin(a)} A${ir},${ir} 0 ${la} 0 ${cx+ir*Math.cos(sa)},${cy+ir*Math.sin(sa)} Z`:"";
    return{k,d,color:C[k].r};});
  return(<div style={{display:"flex",alignItems:"center",gap:20,padding:"8px 0"}}>
    <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
      {sl.map(s=>s.d&&<path key={s.k} d={s.d} fill={s.color} opacity={0.85} stroke="#09090b" strokeWidth={2}/>)}
      <text x={cx} y={cy-4} textAnchor="middle" fill="#e4e4e7" fontSize="18" fontWeight="700" fontFamily="sans-serif">{tot}</text>
      <text x={cx} y={cy+12} textAnchor="middle" fill="#52525b" fontSize="8" fontFamily="sans-serif">TOTAL</text>
    </svg>
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {ks.map(k=>{const pct=tot>0?((cc[k]/tot)*100).toFixed(1):"0.0";
        return<div key={k} style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:10,height:10,borderRadius:2,background:C[k].r,flexShrink:0}}/>
          <div style={{width:75,fontSize:11,fontWeight:600,color:C[k].c}}>{C[k].l}</div>
          <div style={{fontSize:16,fontWeight:700,color:"#e4e4e7",width:36,textAlign:"right"}}>{cc[k]}</div>
          <div style={{fontSize:11,color:"#52525b",width:42}}>{pct}%</div>
          <div style={{width:80,height:6,background:"#1f1f23",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",background:C[k].r,width:`${pct}%`,borderRadius:3}}/></div>
        </div>;})}
    </div>
  </div>);
}

// ─── CHAT MESSAGE ────────────────────────────────────────────
function ChatMsg({role,content,isSystem}) {
  const isUser = role === "user";
  return (
    <div style={{display:"flex",gap:10,padding:"10px 0",alignItems:"flex-start",flexDirection:isUser?"row-reverse":"row"}}>
      <div style={{width:28,height:28,borderRadius:14,background:isUser?"#4f46e5":isSystem?"#065f46":"#27272a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>
        {isUser?"U":isSystem?"S":"AI"}
      </div>
      <div style={{maxWidth:"80%",padding:"8px 14px",borderRadius:12,background:isUser?"#1e1b4b":isSystem?"#052e16":"#18181b",color:isUser?"#c7d2fe":isSystem?"#6ee7b7":"#d4d4d8",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",border:`1px solid ${isUser?"#312e81":isSystem?"#064e3b":"#27272a"}`}}>
        {content}
      </div>
    </div>
  );
}

// ─── EXCEL EXPORT ────────────────────────────────────────────
function makeExcel(dps,cc,tot,fn){
  const e=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const cl={E:"Environment",S:"Social",G:"Governance",O:"Other"};
  const sorted=[...dps].sort((a,b)=>a.page-b.page);
  let x=`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Size="11" ss:Color="#FFFFFF" ss:FontName="Arial"/><Interior ss:Color="#003366" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>
<Style ss:ID="t"><Font ss:FontName="Arial" ss:Size="10"/><Alignment ss:WrapText="1" ss:Vertical="Top"/></Style>
<Style ss:ID="c"><Font ss:FontName="Arial" ss:Size="10"/><Alignment ss:Horizontal="Center"/></Style>
<Style ss:ID="cE"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#059669"/><Interior ss:Color="#D1FAE5" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>
<Style ss:ID="cS"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#2563EB"/><Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>
<Style ss:ID="cG"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#7C3AED"/><Interior ss:Color="#EDE9FE" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>
<Style ss:ID="cO"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#6B7280"/><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>
<Style ss:ID="ti"><Font ss:Bold="1" ss:Size="14" ss:FontName="Arial"/></Style>
<Style ss:ID="sv"><Font ss:Bold="1" ss:Size="12" ss:FontName="Arial" ss:Color="#4F46E5"/><Alignment ss:Horizontal="Center"/></Style>
<Style ss:ID="pct"><Font ss:Size="11" ss:FontName="Arial"/><NumberFormat ss:Format="0.0%"/><Alignment ss:Horizontal="Center"/></Style></Styles>`;
  const sheet=(name,data,hasCat)=>{let s=`<Worksheet ss:Name="${e(name)}"><Table><Column ss:Width="35"/><Column ss:Width="50"/><Column ss:Width="110"/>${hasCat?'<Column ss:Width="90"/>':""}<Column ss:Width="650"/>
<Row><Cell ss:StyleID="h"><Data ss:Type="String">#</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Page</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Data Point</Data></Cell>${hasCat?'<Cell ss:StyleID="h"><Data ss:Type="String">Category</Data></Cell>':""}<Cell ss:StyleID="h"><Data ss:Type="String">Sentence</Data></Cell></Row>`;
    data.forEach((d,i)=>{s+=`<Row><Cell ss:StyleID="c"><Data ss:Type="Number">${i+1}</Data></Cell><Cell ss:StyleID="c"><Data ss:Type="Number">${d.page}</Data></Cell><Cell ss:StyleID="t"><Data ss:Type="String">${e(d.number)}</Data></Cell>${hasCat?`<Cell ss:StyleID="c${d.cat}"><Data ss:Type="String">${cl[d.cat]||"Other"}</Data></Cell>`:""}<Cell ss:StyleID="t"><Data ss:Type="String">${e((d.sentence||"").substring(0,500))}</Data></Cell></Row>`;});
    s+=`</Table><AutoFilter x:Range="R1C1:R${data.length+1}C${hasCat?5:4}" xmlns="urn:schemas-microsoft-com:office:excel"/></Worksheet>`;return s;};
  x+=sheet("All Data Points",sorted,true);
  x+=`<Worksheet ss:Name="Summary"><Table><Column ss:Width="180"/><Column ss:Width="80"/><Column ss:Width="80"/>
<Row><Cell ss:StyleID="ti"><Data ss:Type="String">Summary - ${e(fn)}</Data></Cell></Row><Row/>
<Row><Cell ss:StyleID="h"><Data ss:Type="String">Category</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Count</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">%</Data></Cell></Row>`;
  ["E","S","G","O"].forEach(k=>{x+=`<Row><Cell ss:StyleID="c${k}"><Data ss:Type="String">${cl[k]}</Data></Cell><Cell ss:StyleID="sv"><Data ss:Type="Number">${cc[k]}</Data></Cell><Cell ss:StyleID="pct"><Data ss:Type="Number">${tot?cc[k]/tot:0}</Data></Cell></Row>`;});
  x+=`<Row/><Row><Cell ss:StyleID="ti"><Data ss:Type="String">Total</Data></Cell><Cell ss:StyleID="sv"><Data ss:Type="Number">${tot}</Data></Cell></Row></Table></Worksheet>`;
  ["E","S","G","O"].forEach(k=>{x+=sheet(cl[k],sorted.filter(d=>d.cat===k),false);});
  x+=`</Workbook>`;return x;
}

// ─── MAIN APP ────────────────────────────────────────────────
export default function App(){
  const [apiBase,setApiBase]=useState(API_BASE);
  const [showConfig,setShowConfig]=useState(!API_BASE);
  const [sessions,setSessions]=useState([]);
  const [activeId,setActiveId]=useState(null);
  const [status,setStatus]=useState("idle");
  const [candidates,setCandidates]=useState([]);
  const [dataPoints,setDataPoints]=useState([]);
  const [chatHistory,setChatHistory]=useState([]);
  const [chatInput,setChatInput]=useState("");
  const [chatLoading,setChatLoading]=useState(false);
  const [progress,setProgress]=useState({s:"",p:0,d:""});
  const [totalPages,setTotalPages]=useState(0);
  const [fileName,setFileName]=useState("");
  const [fileObj,setFileObj]=useState(null);
  const [search,setSearch]=useState("");
  const [catFilter,setCatFilter]=useState("ALL");
  const [batchSize,setBatchSize]=useState(80);
  const [tab,setTab]=useState("chat"); // chat | data | chart
  const [sideOpen,setSideOpen]=useState(true);
  const chatRef=useRef(null);
  const inputRef=useRef(null);

  useEffect(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},[chatHistory,chatLoading]);

  // Load sessions from API
  useEffect(()=>{if(apiBase)apiListSessions(apiBase).then(setSessions).catch(()=>{});},[apiBase]);

  const saveConfig=()=>{localStorage.setItem("dp_api_base",apiBase);setShowConfig(false);};

  // Load session
  const loadSession=async(id)=>{
    setActiveId(id);
    try{
      const r=await fetch(`${apiBase}/sessions?sessionId=${id}`);
      // The GET returns all sessions, find this one
      const all=await apiListSessions(apiBase);
      // Need to get full session - list only has summary
      // For full data, we save everything in the session
      const found=all.find(s=>s.sessionId===id);
      if(found){
        setFileName(found.fileName||"");
        setTotalPages(found.totalPages||0);
        setDataPoints(found.dataPoints||[]);
        setChatHistory(found.chatHistory||[]);
        setCandidates([]);
        setStatus(found.dataPoints?.length>0?"done":"idle");
        setTab(found.chatHistory?.length>0?"chat":"data");
      }
    }catch(e){console.error(e);}
  };

  // Save session to DynamoDB
  const saveSession=useCallback(async()=>{
    if(!activeId||!apiBase||dataPoints.length===0)return;
    const cc={E:0,S:0,G:0,O:0};dataPoints.forEach(d=>{cc[d.cat]=(cc[d.cat]||0)+1;});
    await apiSaveSession({sessionId:activeId,name:fileName,fileName,createdAt:new Date().toISOString(),
      dataPoints,dataPointCount:dataPoints.length,chatHistory,catCounts:cc,totalPages}
    ,apiBase).catch(()=>{});
  },[activeId,apiBase,dataPoints,chatHistory,fileName,totalPages]);

  // Auto-save
  useEffect(()=>{const t=setTimeout(saveSession,2000);return()=>clearTimeout(t);},[saveSession]);

  const newSession=()=>{
    const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    setActiveId(id);setCandidates([]);setDataPoints([]);setChatHistory([]);
    setStatus("idle");setFileName("");setFileObj(null);setTotalPages(0);setTab("chat");
  };

  const deleteSession=async(id)=>{
    await apiDeleteSession(id,apiBase).catch(()=>{});
    setSessions(s=>s.filter(x=>x.sessionId!==id));
    if(activeId===id){setActiveId(null);setDataPoints([]);setChatHistory([]);setStatus("idle");}
  };

  const handleFile=(e)=>{
    const f=e.target.files?.[0];if(!f)return;
    if(!activeId)newSession();
    setFileName(f.name);setFileObj(f);setCandidates([]);setDataPoints([]);
    setProgress({s:"",p:0,d:""});
    setChatHistory([{role:"system",content:`File loaded: ${f.name} (${(f.size/1024/1024).toFixed(1)} MB)`}]);
    setTab("chat");
  };

  const run=async()=>{
    if(!fileObj||!apiBase)return;
    if(!activeId)newSession();
    setStatus("stage1");
    setChatHistory(h=>[...h,{role:"system",content:"Stage 1: Extracting text from PDF..."}]);
    try{
      const{candidates:cs,numPages}=await extractPdf(fileObj,({page,total,n})=>{
        setProgress({s:"Extracting",p:Math.round((page/total)*100),d:`Page ${page}/${total}`});});
      setCandidates(cs);setTotalPages(numPages);
      setChatHistory(h=>[...h,{role:"system",content:`Found ${cs.length} candidate numbers across ${numPages} pages. Starting AI classification...`}]);
      setStatus("stage2");
      const dpMap=new Map();const tb=Math.ceil(cs.length/batchSize);
      for(let i=0;i<cs.length;i+=batchSize){
        const b=cs.slice(i,i+batchSize),bn=Math.floor(i/batchSize)+1;
        setProgress({s:"Classifying",p:Math.round((bn/tb)*100),d:`Batch ${bn}/${tb}`});
        try{
          const res=await apiClassify(b,apiBase);
          res.forEach(({id,cat})=>dpMap.set(id,cat));
        }catch(err){
          setChatHistory(h=>[...h,{role:"system",content:`Batch ${bn} error: ${err.message}`}]);
          if(err.message.includes("429")){await new Promise(r=>setTimeout(r,10000));
            try{const res=await apiClassify(b,apiBase);res.forEach(({id,cat})=>dpMap.set(id,cat));}catch(e2){}}
        }
        await new Promise(r=>setTimeout(r,500));
      }
      const dps=cs.filter(c=>dpMap.has(c.id)).map(c=>({...c,cat:dpMap.get(c.id)})).sort((a,b)=>a.page-b.page);
      setDataPoints(dps);setStatus("done");
      const cc={E:0,S:0,G:0,O:0};dps.forEach(d=>{cc[d.cat]=(cc[d.cat]||0)+1;});
      setChatHistory(h=>[...h,{role:"system",content:`Extraction complete! Found ${dps.length} data points:\n  Environment: ${cc.E}\n  Social: ${cc.S}\n  Governance: ${cc.G}\n  Other: ${cc.O}\n\nYou can now ask me questions about the results.`}]);
      // Refresh sessions list
      apiListSessions(apiBase).then(setSessions).catch(()=>{});
    }catch(err){setStatus("error");setChatHistory(h=>[...h,{role:"system",content:`Error: ${err.message}`}]);}
  };

  // Chat
  const sendChat=async()=>{
    if(!chatInput.trim()||chatLoading)return;
    const q=chatInput.trim();setChatInput("");
    setChatHistory(h=>[...h,{role:"user",content:q}]);
    setChatLoading(true);
    try{
      const answer=await apiChat(q,activeId,dataPoints,chatHistory.filter(m=>m.role!=="system"),apiBase);
      setChatHistory(h=>[...h,{role:"assistant",content:answer}]);
    }catch(err){
      setChatHistory(h=>[...h,{role:"assistant",content:`Error: ${err.message}`}]);
    }
    setChatLoading(false);
  };

  // Derived
  const cc={E:0,S:0,G:0,O:0};dataPoints.forEach(d=>{cc[d.cat]=(cc[d.cat]||0)+1;});
  const tot=dataPoints.length;
  const filt=dataPoints.filter(d=>{
    if(catFilter!=="ALL"&&d.cat!==catFilter)return false;
    if(search){const q=search.toLowerCase();return d.number.includes(search)||d.sentence.toLowerCase().includes(q)||String(d.page).includes(search);}
    return true;});

  const exportExcel=()=>{const x=makeExcel(dataPoints,cc,tot,fileName);const b=new Blob([x],{type:"application/vnd.ms-excel"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`${fileName.replace(/\.[^.]+$/,"")}_DataPoints.xls`;a.click();};
  const exportCSV=()=>{const rows=["#,Page,Number,Category,Sentence",...dataPoints.map((d,i)=>`${i+1},${d.page},"${d.number}",${C[d.cat]?.l||"Other"},"${(d.sentence||"").replace(/"/g,'""')}"`)];const b=new Blob([rows.join("\n")],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`${fileName.replace(/\.[^.]+$/,"")}_DataPoints.csv`;a.click();};

  const sm={idle:["Ready","#27272a","#a1a1aa"],stage1:["Extracting...","#422006","#fbbf24"],stage2:["Classifying...","#1e1b4b","#818cf8"],done:["Complete","#052e16","#34d399"],error:["Error","#2a1515","#f87171"]};
  const[sL,sB,sF]=sm[status]||sm.idle;

  // ─── RENDER ────────────────────────────────────────────────
  return(
    <div style={{display:"flex",height:"100vh",background:"#09090b",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#e4e4e7",overflow:"hidden"}}>

      {/* SIDEBAR */}
      <div style={{width:sideOpen?240:0,minWidth:sideOpen?240:0,background:"#0c0c10",borderRight:"1px solid #1f1f23",transition:"all 0.2s",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"14px 12px 10px",borderBottom:"1px solid #1f1f23",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,fontWeight:700,color:"#818cf8"}}>Sessions</span>
          <button onClick={newSession} style={{background:"#4f46e5",border:"none",color:"#fff",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>+ New</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"6px 0"}}>
          {sessions.length===0&&<div style={{padding:"16px 12px",color:"#3f3f46",fontSize:11,textAlign:"center"}}>No sessions yet</div>}
          {sessions.map(s=>(
            <div key={s.sessionId} onClick={()=>loadSession(s.sessionId)} style={{padding:"8px 12px",cursor:"pointer",borderLeft:activeId===s.sessionId?"3px solid #4f46e5":"3px solid transparent",background:activeId===s.sessionId?"#18181b":"transparent"}}>
              <div style={{fontSize:11,fontWeight:activeId===s.sessionId?600:400,color:activeId===s.sessionId?"#e4e4e7":"#71717a",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {s.fileName||s.name||"Untitled"}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
                <span style={{fontSize:9,color:"#3f3f46"}}>{s.dataPointCount||0} pts</span>
                <button onClick={(e)=>{e.stopPropagation();deleteSession(s.sessionId);}} style={{background:"none",border:"none",color:"#52525b",fontSize:9,cursor:"pointer"}}>Delete</button>
              </div>
            </div>
          ))}
        </div>
        {/* Config */}
        <div style={{padding:"8px 12px",borderTop:"1px solid #1f1f23"}}>
          <button onClick={()=>setShowConfig(!showConfig)} style={{background:"none",border:"none",color:"#52525b",fontSize:10,cursor:"pointer",textDecoration:"underline"}}>{showConfig?"Hide config":"Settings"}</button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#0c0a1d,#1a103a,#0c0a1d)",borderBottom:"1px solid #1e1b3a",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>setSideOpen(p=>!p)} style={{background:"none",border:"1px solid #27272a",borderRadius:5,color:"#71717a",padding:"3px 7px",cursor:"pointer",fontSize:13}}>&#9776;</button>
            <div>
              <h1 style={{fontSize:16,fontWeight:700,margin:0}}><span style={{color:"#818cf8"}}>&#9670;</span> Data Point Extractor</h1>
              <p style={{fontSize:10,color:"#52525b",margin:0}}>{fileName||"Upload a PDF to start"}</p>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {status==="stage1"||status==="stage2"?<div style={{fontSize:11,color:"#818cf8"}}>{progress.s} {progress.p}% - {progress.d}</div>:null}
            <span style={{background:sB,color:sF,padding:"3px 10px",borderRadius:99,fontSize:10,fontWeight:600}}>{sL}</span>
          </div>
        </div>

        {/* Config panel */}
        {showConfig&&(
          <div style={{background:"#18181b",borderBottom:"1px solid #27272a",padding:"12px 16px"}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:11,color:"#52525b",whiteSpace:"nowrap"}}>API URL:</span>
              <input type="text" value={apiBase} onChange={e=>setApiBase(e.target.value)} placeholder="https://xxxxx.execute-api.ap-northeast-1.amazonaws.com"
                style={{flex:1,background:"#0f0f14",border:"1px solid #27272a",borderRadius:6,padding:"6px 10px",color:"#e4e4e7",fontSize:11,outline:"none",fontFamily:"monospace"}}/>
              <button onClick={saveConfig} style={{padding:"6px 14px",borderRadius:6,border:"none",background:"#4f46e5",color:"#fff",fontWeight:600,fontSize:11,cursor:"pointer"}}>Save</button>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div style={{display:"flex",borderBottom:"1px solid #1f1f23",padding:"0 16px",background:"#0f0f14",flexShrink:0}}>
          {[["chat","Chat"],["data","Data Points"],["chart","Charts"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{padding:"8px 16px",border:"none",borderBottom:tab===k?"2px solid #4f46e5":"2px solid transparent",background:"transparent",color:tab===k?"#e4e4e7":"#52525b",fontSize:12,fontWeight:600,cursor:"pointer"}}>{l}{k==="data"&&tot>0?` (${tot})`:""}</button>
          ))}
          <div style={{flex:1}}/>
          <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"8px 0"}}>
            <input type="file" accept=".pdf" onChange={handleFile} style={{display:"none"}}/>
            <span style={{padding:"4px 12px",borderRadius:6,background:"#1e1b4b",border:"1px solid #4f46e5",color:"#c7d2fe",fontSize:11,fontWeight:600}}>Upload PDF</span>
          </label>
          {fileObj&&status==="idle"&&<button onClick={run} style={{marginLeft:6,padding:"4px 12px",borderRadius:6,border:"none",background:"linear-gradient(135deg,#4f46e5,#7c3aed)",color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer",alignSelf:"center"}}>Run Extraction</button>}
          {tot>0&&<>
            <button onClick={exportExcel} style={{marginLeft:6,padding:"4px 8px",borderRadius:5,border:"1px solid #27272a",background:"transparent",color:"#71717a",fontSize:10,cursor:"pointer",alignSelf:"center"}}>Excel</button>
            <button onClick={exportCSV} style={{marginLeft:4,padding:"4px 8px",borderRadius:5,border:"1px solid #27272a",background:"transparent",color:"#71717a",fontSize:10,cursor:"pointer",alignSelf:"center"}}>CSV</button>
          </>}
        </div>

        {/* Content area */}
        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>

          {/* CHAT TAB */}
          {tab==="chat"&&(
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div ref={chatRef} style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
                {chatHistory.length===0&&(
                  <div style={{textAlign:"center",padding:"60px 20px",color:"#3f3f46"}}>
                    <div style={{fontSize:36,marginBottom:12}}>&#9670;</div>
                    <div style={{fontSize:14,fontWeight:600,color:"#52525b",marginBottom:6}}>Data Point Extractor</div>
                    <div style={{fontSize:12}}>Upload a PDF and run extraction, then ask questions about the results.</div>
                  </div>
                )}
                {chatHistory.map((m,i)=><ChatMsg key={i} role={m.role} content={m.content} isSystem={m.role==="system"}/>)}
                {chatLoading&&<ChatMsg role="assistant" content="Thinking..." isSystem={false}/>}
              </div>
              <div style={{padding:"10px 16px",borderTop:"1px solid #1f1f23",display:"flex",gap:8,background:"#0f0f14",flexShrink:0}}>
                <input ref={inputRef} type="text" value={chatInput} onChange={e=>setChatInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}}
                  placeholder={tot>0?"Ask about the data points...":"Upload a PDF first..."}
                  disabled={tot===0}
                  style={{flex:1,background:"#18181b",border:"1px solid #27272a",borderRadius:8,padding:"10px 14px",color:"#e4e4e7",fontSize:13,outline:"none"}}/>
                <button onClick={sendChat} disabled={!chatInput.trim()||chatLoading||tot===0}
                  style={{padding:"10px 18px",borderRadius:8,border:"none",background:chatInput.trim()&&tot>0?"#4f46e5":"#27272a",color:chatInput.trim()&&tot>0?"#fff":"#52525b",fontWeight:600,fontSize:13,cursor:chatInput.trim()&&tot>0?"pointer":"not-allowed"}}>Send</button>
              </div>
            </div>
          )}

          {/* DATA TAB */}
          {tab==="data"&&(
            <div style={{flex:1,overflow:"auto",padding:"12px 16px"}}>
              {tot===0?<div style={{textAlign:"center",padding:40,color:"#3f3f46",fontSize:13}}>No data points yet. Upload and extract a PDF first.</div>:(
                <>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
                    <div style={{display:"flex",gap:4}}>
                      {["ALL","E","S","G","O"].map(c=>{const m=c==="ALL"?{c:"#818cf8",bg:"#1e1b4b",bd:"#4f46e5"}:C[c];const a=catFilter===c;
                        return<button key={c} onClick={()=>setCatFilter(c)} style={{padding:"3px 8px",borderRadius:5,fontSize:10,fontWeight:600,cursor:"pointer",background:a?m.bg:"transparent",border:`1px solid ${a?(m.bd||m.c):"#27272a"}`,color:a?m.c:"#52525b"}}>{c==="ALL"?"All":C[c].l}{c!=="ALL"?` ${cc[c]}`:""}</button>;})}
                    </div>
                    <input type="text" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{background:"#0f0f14",border:"1px solid #27272a",borderRadius:5,padding:"3px 8px",color:"#a1a1aa",fontSize:11,width:140,outline:"none"}}/>
                  </div>
                  <div style={{background:"#18181b",border:"1px solid #1f1f23",borderRadius:8,overflow:"hidden"}}>
                    <div style={{display:"grid",gridTemplateColumns:"36px 44px 95px 78px 1fr",padding:"6px 12px",background:"#111114",borderBottom:"1px solid #1f1f23",fontSize:9,fontWeight:600,color:"#52525b",textTransform:"uppercase"}}>
                      <div>#</div><div>Page</div><div>Number</div><div>Cat</div><div>Sentence</div>
                    </div>
                    <div style={{maxHeight:"calc(100vh - 260px)",overflowY:"auto"}}>
                      {filt.map((d,i)=>(
                        <div key={d.id} style={{display:"grid",gridTemplateColumns:"36px 44px 95px 78px 1fr",padding:"5px 12px",borderBottom:"1px solid #141418",fontSize:11,background:i%2?"#0f0f14":"transparent",alignItems:"center"}}>
                          <div style={{color:"#3f3f46"}}>{i+1}</div>
                          <div style={{color:"#818cf8",fontWeight:600}}>{d.page}</div>
                          <div style={{color:"#e4e4e7",fontWeight:500}}>{d.number}</div>
                          <div><Badge cat={d.cat}/></div>
                          <div style={{color:"#71717a",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontSize:10}}>{d.sentence}</div>
                        </div>))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* CHART TAB */}
          {tab==="chart"&&(
            <div style={{flex:1,overflow:"auto",padding:"16px"}}>
              {tot===0?<div style={{textAlign:"center",padding:40,color:"#3f3f46",fontSize:13}}>No data yet.</div>:(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div style={{background:"#18181b",border:"1px solid #1f1f23",borderRadius:10,padding:"16px 20px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#71717a",marginBottom:4,textTransform:"uppercase"}}>ESG distribution</div>
                    <Pie cc={cc} tot={tot}/>
                  </div>
                  <div style={{background:"#18181b",border:"1px solid #1f1f23",borderRadius:10,padding:"16px 20px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#71717a",marginBottom:8,textTransform:"uppercase"}}>Summary</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {[{l:"Total",v:tot,c:"#818cf8"},{l:"Pages",v:totalPages,c:"#34d399"},{l:"Candidates",v:candidates.length||"--",c:"#a1a1aa"},{l:"Chat messages",v:chatHistory.filter(m=>m.role!=="system").length,c:"#fbbf24"}].map(({l,v,c})=>(
                        <div key={l} style={{background:"#0f0f14",borderRadius:8,padding:"10px 12px"}}>
                          <div style={{fontSize:9,color:"#52525b",textTransform:"uppercase"}}>{l}</div>
                          <div style={{fontSize:20,fontWeight:700,color:c,marginTop:2}}>{v}</div>
                        </div>))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
