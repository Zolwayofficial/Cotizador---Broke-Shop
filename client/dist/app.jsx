const { useState, useRef, useEffect, useCallback } = React;

const API = window.location.origin;

// ══════════════════════════════════════════════════════
// BROKE SHOP — BRAND COLORS
// ══════════════════════════════════════════════════════
const C = {
  // Core brand
  orange: "#F7931E",
  orangeLight: "#FFAD4D",
  orangeDark: "#D47A0A",
  orangeGlow: "rgba(247,147,30,0.15)",
  orangeGlow2: "rgba(247,147,30,0.08)",

  // Backgrounds
  bg: "#0a0a0a",
  surface: "#141414",
  surface2: "#1c1c1c",
  surface3: "#242424",

  // Borders
  border: "#2a2a2a",
  borderHover: "#3a3a3a",

  // Greens/Reds for data
  green: "#34d399",
  red: "#f87171",
  amber: "#fbbf24",

  // Text
  white: "#f5f5f5",
  text: "#d4d4d4",
  muted: "#737373",
  dim: "#525252",
};

const FONT = "'Outfit', 'Manrope', system-ui, sans-serif";

// ══════════════════════════════════════════════════════
// BROKE SHOP LOGO — SVG recreation
// ══════════════════════════════════════════════════════
function Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Box */}
      <rect x="4" y="8" width="30" height="30" rx="4" stroke={C.orange} strokeWidth="3" fill="none" />
      {/* Price tag */}
      <path d="M28 8L34 2L36 4L30 10" stroke={C.orange} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="33" cy="5" r="1.5" fill={C.orange} />
      {/* Arrow */}
      <path d="M16 32L32 16" stroke={C.orange} strokeWidth="3" strokeLinecap="round" />
      <path d="M22 16H32V26" stroke={C.orange} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ══════════════════════════════════════════════════════
// SVG ICON SYSTEM
// ══════════════════════════════════════════════════════
const Icon = ({ name, size = 20, color = "currentColor" }) => {
  const d = {
    ship: <><path d="M3 17h1l2-7h12l2 7h1" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round"/><path d="M6 10V6a2 2 0 012-2h3V2h2v2h3a2 2 0 012 2v4" strokeWidth="1.5" stroke={color} fill="none"/><path d="M2 20c1.5-1 3-1.5 5-1.5s3.5.5 5 1.5c1.5-1 3-1.5 5-1.5s3.5.5 5 1.5" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round"/></>,
    package: <><path d="M12 3l9 4.5v9L12 21l-9-4.5v-9L12 3z" strokeWidth="1.5" stroke={color} fill="none" strokeLinejoin="round"/><path d="M12 12l9-4.5M12 12v9M12 12L3 7.5" strokeWidth="1.5" stroke={color} fill="none" opacity="0.4"/></>,
    document: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" strokeWidth="1.5" stroke={color} fill="none"/><path d="M14 2v6h6M8 13h8M8 17h5" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" strokeWidth="1.5" stroke={color} fill="none"/><path d="M15.5 15.5L21 21" strokeWidth="1.5" stroke={color} strokeLinecap="round"/></>,
    shield: <><path d="M12 2l8 4v5c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" strokeWidth="1.5" stroke={color} fill="none"/><path d="M9 12l2 2 4-4" strokeWidth="1.8" stroke={color} fill="none" strokeLinecap="round" strokeLinejoin="round"/></>,
    calculator: <><rect x="4" y="2" width="16" height="20" rx="2" strokeWidth="1.5" stroke={color} fill="none"/><path d="M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round"/></>,
    building: <><path d="M3 21h18M5 21V7l7-4 7 4v14" strokeWidth="1.5" stroke={color} fill="none" strokeLinejoin="round"/><path d="M9 21v-4h6v4M9 9h.01M15 9h.01M9 13h.01M15 13h.01" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round"/></>,
    alert: <><path d="M12 2L2 20h20L12 2z" strokeWidth="1.5" stroke={color} fill="none" strokeLinejoin="round"/><path d="M12 9v4M12 16h.01" strokeWidth="1.8" stroke={color} fill="none" strokeLinecap="round"/></>,
    send: <><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeWidth="1.5" stroke={color} fill="none" strokeLinejoin="round"/></>,
    attach: <><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.41 17.4a2 2 0 01-2.83-2.83l8.49-8.48" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round"/></>,
    trending: <><path d="M23 6l-9.5 9.5-5-5L1 18" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round" strokeLinejoin="round"/><path d="M17 6h6v6" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round" strokeLinejoin="round"/></>,
    x: <><path d="M18 6L6 18M6 6l12 12" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round"/></>,
    globe: <><circle cx="12" cy="12" r="10" strokeWidth="1.5" stroke={color} fill="none"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" strokeWidth="1.5" stroke={color} fill="none"/></>,
    refresh: <><path d="M1 4v6h6M23 20v-6h-6" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round" strokeLinejoin="round"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round" strokeLinejoin="round"/></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" strokeWidth="1.5" stroke={color} fill="none"/><path d="M7 11V7a5 5 0 0110 0v4" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round"/></>,
    drawback: <><circle cx="12" cy="12" r="9" strokeWidth="1.5" stroke={color} fill="none"/><path d="M12 8v8m-3-3l3 3 3-3" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round" strokeLinejoin="round"/></>,
    regime: <><path d="M4 21V5a2 2 0 012-2h12a2 2 0 012 2v16" strokeWidth="1.5" stroke={color} fill="none"/><path d="M12 3v4l2-1 2 1V3" strokeWidth="1.5" stroke={color} fill="none" strokeLinejoin="round"/><path d="M4 21h16M8 10h8M8 14h5" strokeWidth="1.5" stroke={color} fill="none" strokeLinecap="round"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">{d[name]||null}</svg>;
};

// ══════════════════════════════════════════════════════
// QUICK ACTIONS
// ══════════════════════════════════════════════════════
const ACTIONS = [
  { icon:"package",  label:"Cotizar importación",  prompt:"Quiero cotizar una importación. ¿Qué necesitas saber?" },
  { icon:"document", label:"Subir cotización",      prompt:"Tengo una cotización de mi proveedor. ¿Puedo subirla?" },
  { icon:"search",   label:"Buscar partida HS",     prompt:"Necesito encontrar el código HS de mi producto." },
  { icon:"building", label:"Verificar permisos",    prompt:"¿Qué permisos necesito para importar?" },
  { icon:"drawback", label:"Calcular Drawback",     prompt:"Quiero saber si puedo cobrar Drawback." },
  { icon:"regime",   label:"Elegir régimen",         prompt:"¿Qué régimen aduanero me conviene?" },
];

const SYS = `Eres el asistente de importación de Broke Shop. Experto en comercio exterior peruano. Respondes en español, profesional pero cercano. Si el usuario describe un producto con precio/cantidad/país, clasifícalo y calcula tributos. Si sube archivo, extrae datos. Si pregunta sobre permisos, verifica. Siempre alerta sobre riesgos. Sé conciso.`;

// ══════════════════════════════════════════════════════
// MESSAGE
// ══════════════════════════════════════════════════════
function Message({ msg }) {
  const isUser = msg.role === "user";
  if (msg.role === "system") return null;
  return (
    <div style={{ display:"flex", gap:12, justifyContent:isUser?"flex-end":"flex-start", marginBottom:20, animation:"msgIn 0.35s cubic-bezier(0.16,1,0.3,1)" }}>
      {!isUser && <div style={{ width:36, height:36, borderRadius:10, background:C.orange, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}>
        <Logo size={22} />
      </div>}
      <div style={{
        maxWidth:isUser?"72%":"82%", padding:"14px 18px", fontSize:14, lineHeight:1.7, color:C.text, wordBreak:"break-word",
        borderRadius:isUser?"18px 18px 4px 18px":"18px 18px 18px 4px",
        background:isUser?C.orange:C.surface2,
        color:isUser?"#000":C.text,
        border:isUser?"none":`1px solid ${C.border}`,
      }}>
        {msg.file && <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"rgba(255,255,255,0.06)", borderRadius:10, marginBottom:10, fontSize:12 }}>
          <Icon name="document" size={16} color={C.muted} />
          <span style={{color:C.muted}}>{msg.file.name}</span>
          <span style={{color:C.dim, fontSize:11}}>({(msg.file.size/1024).toFixed(0)}KB)</span>
        </div>}
        {msg.loading ? <Typing /> : <Fmt text={msg.content} isUser={isUser} />}
        {msg.results && <Results data={msg.results} />}
      </div>
    </div>
  );
}

function Fmt({ text, isUser }) {
  if (!text) return null;
  const wh = isUser ? "#000" : C.white;
  return <div>{text.split("\n").map((line, i) => {
    if (line.startsWith("###")) return <div key={i} style={{fontWeight:700,fontSize:15,marginTop:14,marginBottom:4,color:wh}}>{line.replace(/^###\s*/,"")}</div>;
    if (line.startsWith("##")) return <div key={i} style={{fontWeight:700,fontSize:16,marginTop:16,marginBottom:6,color:wh}}>{line.replace(/^##\s*/,"")}</div>;
    if (line.startsWith("- ")||line.startsWith("• ")) return <div key={i} style={{paddingLeft:18,position:"relative",marginBottom:3}}><span style={{position:"absolute",left:6,color:C.orange}}>›</span>{line.replace(/^[-•]\s*/,"")}</div>;
    if (line.trim()==="") return <div key={i} style={{height:10}} />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return <div key={i} style={{marginBottom:3}}>{parts.map((p,j)=>p.startsWith("**")?<strong key={j} style={{color:wh,fontWeight:600}}>{p.replace(/\*\*/g,"")}</strong>:<span key={j}>{p}</span>)}</div>;
  })}</div>;
}

// ══════════════════════════════════════════════════════
// RESULT CARDS
// ══════════════════════════════════════════════════════
function Results({ data }) {
  if (!data) return null;
  return <div style={{marginTop:14}}>
    {data.totales && <div style={{background:C.bg,borderRadius:14,padding:18,border:`1px solid ${C.border}`,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><Icon name="calculator" size={16} color={C.orange} /><span style={{fontSize:13,color:C.muted,fontWeight:500}}>Resumen de costos</span></div>
        {data.modo && <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:C.orangeGlow,color:C.orange,fontWeight:600,letterSpacing:0.5,textTransform:"uppercase"}}>{data.modo}</span>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Num label="FOB" val={data.totales.fob} />
        <Num label="CIF" val={data.totales.cif} accent />
        <Num label="Ad Valorem" val={data.totales.adValorem} />
        <Num label="IGV + IPM" val={(data.totales.igv||0)+(data.totales.ipm||0)} />
        {data.totales.antidumping>0&&<Num label="Antidumping" val={data.totales.antidumping} red />}
        {data.totales.percepcion>0&&<Num label="Percepción" val={data.totales.percepcion} />}
      </div>
      <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
        <span style={{fontSize:13,color:C.muted}}>Total a desembolsar</span>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:26,fontWeight:800,color:C.green,letterSpacing:"-0.02em"}}>${(data.totales.totalReal||data.totales.totalLanded||0).toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          {data.totales.totalPEN&&<div style={{fontSize:13,color:C.muted,marginTop:2}}>S/ {data.totales.totalPEN.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>}
        </div>
      </div>
      {data.totales.margenVenta&&<div style={{marginTop:10,padding:"10px 14px",background:"rgba(52,211,153,0.08)",borderRadius:10,border:"1px solid rgba(52,211,153,0.15)",display:"flex",alignItems:"center",gap:8}}>
        <Icon name="trending" size={16} color={C.green} />
        <span style={{fontSize:12,color:C.text}}>Precio venta ({data.totales.margenVenta.margen}% margen): <strong style={{color:C.white}}>${data.totales.margenVenta.ventaConIGV?.toFixed(2)} c/u</strong></span>
      </div>}
    </div>}

    {data.alertas?.filter(a=>a.nivel!=="info").length>0&&<div style={{marginBottom:14}}>
      {data.alertas.filter(a=>a.nivel!=="info").map((a,i)=><div key={i} style={{
        padding:"11px 14px",borderRadius:10,marginBottom:8,fontSize:12.5,lineHeight:1.6,display:"flex",alignItems:"flex-start",gap:10,
        background:a.nivel==="critico"?"rgba(248,113,113,0.08)":"rgba(247,147,30,0.08)",
        border:`1px solid ${a.nivel==="critico"?"rgba(248,113,113,0.2)":"rgba(247,147,30,0.2)"}`,
      }}>
        <Icon name={a.nivel==="critico"?"shield":"alert"} size={16} color={a.nivel==="critico"?C.red:C.orange} style={{flexShrink:0,marginTop:2}} />
        <span style={{color:C.text}}>{a.mensaje}</span>
      </div>)}
    </div>}

    {data.items?.length>0&&data.items[0]?.tributos&&<div style={{background:C.bg,borderRadius:14,padding:14,border:`1px solid ${C.border}`,fontSize:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,color:C.muted}}><Icon name="package" size={15} color={C.muted} /><span style={{fontWeight:500}}>Detalle por item</span></div>
      {data.items.map((it,i)=><div key={i} style={{padding:"10px 0",borderBottom:i<data.items.length-1?`1px solid ${C.border}`:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{color:C.white,fontWeight:600,fontSize:13}}>{it.desc||`Item ${i+1}`}</span>
          <span style={{color:C.green,fontWeight:700,fontSize:14}}>${it.tributos?.totalLanded?.toFixed(2)}</span>
        </div>
        <div style={{color:C.dim,fontSize:11,display:"flex",gap:12,flexWrap:"wrap"}}>
          {it.hs&&<span>HS: <span style={{color:C.muted}}>{it.hsFormatted||it.hs}</span></span>}
          {it.qty&&<span>Qty: <span style={{color:C.muted}}>{it.qty}</span></span>}
          {it.tributos?.cpu&&<span>CPU: <span style={{color:C.muted}}>${it.tributos.cpu.toFixed(2)}</span></span>}
          {it.confianza&&<span style={{color:it.confianza>80?C.green:C.amber}}>Conf: {it.confianza}%</span>}
        </div>
      </div>)}
    </div>}

    {data.totales?.sensibilidadTC&&<div style={{background:C.bg,borderRadius:14,padding:14,marginTop:14,border:`1px solid ${C.border}`,fontSize:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,color:C.muted}}><Icon name="trending" size={15} color={C.muted} /><span style={{fontWeight:500}}>Sensibilidad tipo de cambio</span></div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {data.totales.sensibilidadTC.map((s,i)=><div key={i} style={{
          padding:"6px 12px",borderRadius:8,fontSize:11,textAlign:"center",minWidth:70,
          background:s.dif>0?"rgba(248,113,113,0.08)":s.dif<0?"rgba(52,211,153,0.08)":"rgba(255,255,255,0.04)",
          border:`1px solid ${s.dif>0?"rgba(248,113,113,0.15)":s.dif<0?"rgba(52,211,153,0.15)":"rgba(255,255,255,0.06)"}`,
        }}>
          <div style={{fontWeight:700,color:s.dif>0?C.red:s.dif<0?C.green:C.muted}}>{s.variacion}</div>
          <div style={{color:C.text,marginTop:2}}>S/{s.totalPEN?.toLocaleString()}</div>
        </div>)}
      </div>
    </div>}
  </div>;
}

function Num({ label, val, accent, red }) {
  return <div style={{padding:"10px 14px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:`1px solid ${C.border}`}}>
    <div style={{fontSize:11,color:C.dim,marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:0.5}}>{label}</div>
    <div style={{fontSize:16,fontWeight:700,color:red?C.red:accent?C.orange:C.text}}>${(val||0).toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
  </div>;
}

function Typing() {
  return <div style={{display:"flex",gap:5,padding:"6px 0"}}>
    {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:C.orange,opacity:0.6,animation:`pulse 1.2s ${i*0.2}s ease-in-out infinite`}} />)}
  </div>;
}

// ══════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════
function App() {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null);
  const chatRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { fetch(`${API}/api/health`).then(r=>r.json()).then(setStatus).catch(()=>setStatus({error:true})); }, []);
  useEffect(() => { if(chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [msgs]);

  const send = useCallback(async (text, f) => {
    if (!text?.trim() && !f) return;
    const userMsg = { role:"user", content:text||(f?f.name:""), file:f?{name:f.name,size:f.size}:null };
    setMsgs(p => [...p, userMsg, {role:"assistant",loading:true}]);
    setInput(""); setFile(null); setLoading(true);
    try {
      let result;
      if (f) {
        const form = new FormData();
        form.append("file", f);
        if (text) form.append("texto", text);
        result = await (await fetch(`${API}/api/agente/extraer`,{method:"POST",body:form})).json();
      } else { result = await processMsg(text, msgs); }
      setMsgs(p => [...p.slice(0,-1), {role:"assistant", content:result.message||result.resumen||fmtR(result), results:result.exito!==undefined?result:null}]);
    } catch(e) { setMsgs(p => [...p.slice(0,-1), {role:"assistant", content:`Error: ${e.message}`}]); }
    setLoading(false);
    setTimeout(()=>inputRef.current?.focus(),100);
  }, [msgs]);

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:C.bg,color:C.text,fontFamily:FONT}}
         onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files[0])setFile(e.dataTransfer.files[0]);}}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.bg};overflow:hidden}
        @keyframes msgIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.1)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(247,147,30,0.1)}50%{box-shadow:0 0 35px rgba(247,147,30,0.25)}}
        input::placeholder{color:${C.dim}}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:${C.borderHover}}
      `}</style>

      {/* ══ HEADER ══ */}
      <div style={{padding:"12px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,background:"rgba(10,10,10,0.9)",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <img src="/logo.png" alt="Broke Shop" style={{height:36,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />
          <div>
            <div style={{fontWeight:800,fontSize:17,color:C.orange,letterSpacing:"-0.01em"}}>Broke Shop</div>
            <div style={{fontSize:11,color:C.dim,display:"flex",alignItems:"center",gap:6}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:status?.nandina?.count?C.green:status?.error?C.red:"#555"}} />
              {status?.nandina?.count?`${status.nandina.count.toLocaleString()} partidas`:(status?.error?"Offline":"Conectando...")}
              <span style={{color:C.dim}}>·</span>
              <span>Cotizador de Importación</span>
            </div>
          </div>
        </div>
        <button onClick={()=>setMsgs([])} style={{padding:"7px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontSize:12,fontFamily:FONT,fontWeight:500,display:"flex",alignItems:"center",gap:6,transition:"all 0.2s"}}
                onMouseOver={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.color=C.orange}}
                onMouseOut={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted}}>
          <Icon name="refresh" size={14} />Nuevo
        </button>
      </div>

      {/* ══ CHAT ══ */}
      <div ref={chatRef} style={{flex:1,overflow:"auto",padding:"24px 24px 0"}}>
        {msgs.length===0 ? (
          <div style={{maxWidth:640,margin:"40px auto",textAlign:"center"}}>
            <img src="/logo.png" alt="" style={{height:64,marginBottom:20,filter:"drop-shadow(0 4px 20px rgba(247,147,30,0.3))"}} onError={e=>{e.target.style.display="none"}} />
            <div style={{fontSize:28,fontWeight:800,color:C.orange,letterSpacing:"-0.03em",marginBottom:6}}>Broke Shop</div>
            <div style={{fontSize:22,fontWeight:700,color:C.white,marginBottom:8}}>Cotizador de Importación</div>
            <div style={{fontSize:14,color:C.muted,marginBottom:36,lineHeight:1.7,maxWidth:460,margin:"0 auto 36px"}}>
              Describe tu producto, sube la cotización de tu proveedor, o pregúntame lo que necesites.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,textAlign:"left"}}>
              {ACTIONS.map((a,i)=>(
                <button key={i} onClick={()=>send(a.prompt)} style={{
                  padding:"18px 16px",borderRadius:14,border:`1px solid ${C.border}`,background:C.surface,
                  cursor:"pointer",fontSize:13,fontFamily:FONT,color:C.text,textAlign:"left",
                  transition:"all 0.25s ease",animation:`fadeUp 0.4s ${i*0.06}s both`,
                }}
                onMouseOver={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.background=C.surface2;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 25px rgba(0,0,0,0.4)"}}
                onMouseOut={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.surface;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"}}>
                  <div style={{width:36,height:36,borderRadius:10,background:C.orangeGlow,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10}}>
                    <Icon name={a.icon} size={18} color={C.orange} />
                  </div>
                  <div style={{fontWeight:600,color:C.white}}>{a.label}</div>
                </button>
              ))}
            </div>
            <div style={{marginTop:40,display:"flex",justifyContent:"center",gap:24,fontSize:11,color:C.dim}}>
              <span style={{display:"flex",alignItems:"center",gap:4}}><Icon name="shield" size={12} color={C.dim} />OFAC/ONU</span>
              <span style={{display:"flex",alignItems:"center",gap:4}}><Icon name="globe" size={12} color={C.dim} />11 Incoterms</span>
              <span style={{display:"flex",alignItems:"center",gap:4}}><Icon name="lock" size={12} color={C.dim} />Seguro</span>
            </div>
          </div>
        ) : msgs.map((m,i)=><Message key={i} msg={m} />)}
        <div style={{height:24}} />
      </div>

      {/* ══ FILE PREVIEW ══ */}
      {file&&<div style={{padding:"10px 24px",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10,background:C.surface}}>
        <Icon name="document" size={16} color={C.orange} />
        <span style={{fontSize:12,color:C.text,flex:1}}>{file.name} <span style={{color:C.dim}}>({(file.size/1024).toFixed(0)}KB)</span></span>
        <button onClick={()=>setFile(null)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}>
          <Icon name="x" size={14} color={C.muted} />
        </button>
      </div>}

      {/* ══ INPUT ══ */}
      <form onSubmit={e=>{e.preventDefault();send(input,file)}} style={{padding:"14px 24px 18px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,flexShrink:0,background:"rgba(10,10,10,0.95)",backdropFilter:"blur(12px)"}}>
        <input type="file" ref={fileRef} onChange={e=>{if(e.target.files[0])setFile(e.target.files[0])}} accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.txt" style={{display:"none"}} />
        <button type="button" onClick={()=>fileRef.current?.click()} style={{
          width:44,height:44,borderRadius:12,border:`1px solid ${C.border}`,background:C.surface,
          cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.2s",
        }} onMouseOver={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.background=C.surface2}}
           onMouseOut={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.surface}}
           title="Subir archivo">
          <Icon name="attach" size={18} color={C.muted} />
        </button>
        <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} disabled={loading}
          placeholder={file?"Contexto sobre el archivo (opcional)...":"Describe tu producto o pregunta..."}
          style={{flex:1,padding:"11px 18px",borderRadius:12,border:`1px solid ${C.border}`,background:C.surface,color:C.text,fontSize:14,fontFamily:FONT,outline:"none",transition:"border 0.2s"}}
          onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border} />
        <button type="submit" disabled={loading||(!input.trim()&&!file)} style={{
          width:44,height:44,borderRadius:12,border:"none",
          background:(input.trim()||file)?C.orange:C.surface2,
          cursor:(input.trim()||file)?"pointer":"default",
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.2s",
          boxShadow:(input.trim()||file)?"0 4px 15px rgba(247,147,30,0.3)":"none",
        }}>
          <Icon name="send" size={18} color={(input.trim()||file)?"#000":C.dim} />
        </button>
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// MESSAGE PROCESSOR
// ══════════════════════════════════════════════════════
async function processMsg(text) {
  const lo = text.toLowerCase();
  const J = "application/json";

  if (lo.includes("drawback")) {
    const nums = text.match(/\$?([\d,]+)/g);
    if (nums?.length>=1) {
      try {
        const fob=parseFloat(nums[0].replace(/[$,]/g,"")); const ins=nums[1]?parseFloat(nums[1].replace(/[$,]/g,"")):fob*0.3;
        const r=await(await fetch(`${API}/api/regimenes/drawback`,{method:"POST",headers:{"Content-Type":J},body:JSON.stringify({fobExportacion:fob,insumosImportados:ins})})).json();
        return {message:`${r.mensaje}\n\n**Detalle:**\n- FOB exportación: $${fob.toLocaleString()}\n- Insumos: $${ins.toLocaleString()} (${r.insumosPctFOB}%)\n- Tasa: ${r.tasaDrawback}%\n- **Restitución: $${r.montoRestitucion?.toLocaleString()}**`};
      } catch(e) { return {message:`Error calculando Drawback: ${e.message}`}; }
    }
    return {message:"Para calcular Drawback necesito:\n- **FOB de exportación**\n- **Valor de insumos importados**\n\nEj: \"Exporto $50,000 y usé $15,000 en insumos\""};
  }

  if (lo.includes("régimen")||lo.includes("regimen")||lo.includes("temporal")||lo.includes("reimport"))
    return {message:"¿Cuál es tu situación?\n\n- **Temporal** → ¿Cuántos meses?\n- **Transformar** insumos → exportar producto\n- **Devolución** de algo que exportaste\n- **Reparar** un equipo en el exterior\n- **Compra normal** → Importación Definitiva"};

  if (lo.includes("permiso")||lo.includes("restricci")||lo.includes("vuce")||lo.includes("digesa")||lo.includes("senasa")||lo.includes("mtc")) {
    const m=text.match(/\d{4}[\.\s]?\d{2}[\.\s]?\d{2}[\.\s]?\d{2}/)||text.match(/\d{4,10}/);
    if (m) {
      try {
        const hs=m[0].replace(/[\.\s]/g,"");
        const d=await(await fetch(`${API}/api/permisos/${hs}`)).json();
        if (d.restringida) { let msg=`**Partida ${hs} — MERCANCÍA RESTRINGIDA**\n\n`; d.permisos.forEach(p=>{msg+=`**${p.entidad}** — ${p.nombre}\nTrámite: ${p.tramite}\nWeb: ${p.web}\nVUCE: ${p.vuce?"Sí":"Presencial"}\n\n`;}); return {message:msg}; }
        return {message:`**Partida ${hs}** — Sin restricciones. Puede importarse libremente.`};
      } catch(e) { return {message:`Error consultando permisos: ${e.message}`}; }
    }
    return {message:"Dame la **partida arancelaria** (ej: 8517120000) o describe el **producto** y verifico."};
  }

  if (lo.includes("partida")||lo.includes("código hs")||lo.includes("codigo hs")||lo.includes("clasific")||lo.includes("buscar hs")) {
    const desc=text.replace(/partida|código hs|codigo hs|clasific|buscar hs|de|del|para|un|una/gi,"").trim();
    if (desc.length>2) {
      try {
        const d=await(await fetch(`${API}/api/nandina/search?q=${encodeURIComponent(desc)}`)).json();
        if (d.length>0) { let msg=`Resultados para "${desc}":\n\n`; d.slice(0,8).forEach(h=>{const p=h.p;msg+=`**${p.slice(0,4)}.${p.slice(4,6)}.${p.slice(6,8)}.${p.slice(8)}** — ${h.d}\nAV: ${h.a}% · IGV: ${h.g}%${h.i>0?` · ISC: ${h.i}%`:""}\n\n`;}); return {message:msg}; }
        return {message:`Sin resultados para "${desc}". Intenta otra descripción.`};
      } catch(e) { return {message:`Error buscando partidas: ${e.message}`}; }
    }
  }

  const hasPrice=text.match(/\$\s?[\d,.]+|\d+\s?(usd|dolar)/i);
  const hasProduct=text.length>15&&(hasPrice||text.match(/\d+\s*(unidad|pcs|pieza|caja|kg)/i)||text.match(/china|usa|japón|corea|alemania|brasil|méxico|italia|españa|india/i));
  if (hasProduct) {
    try {
      const d=await(await fetch(`${API}/api/agente`,{method:"POST",headers:{"Content-Type":J},body:JSON.stringify({contenido:text,tipo:"text",soloExtraer:false})})).json();
      if (d.exito) return {message:`**Cotización procesada**\n\n${d.items?.length||0} item(s) · Total: **$${(d.totales?.totalReal||0).toLocaleString("en",{minimumFractionDigits:2})}**${d.alertas?.length>0?`\n${d.alertas.length} alerta(s)`:""}`, ...d};
      return {message:d.error||"No pude procesar. Dame más detalles."};
    } catch(e) { return {message:`Error: ${e.message}`}; }
  }

  try {
    const d=await(await fetch(`${API}/api/ai/classify`,{method:"POST",headers:{"Content-Type":J},body:JSON.stringify({messages:[{role:"user",content:SYS+"\n\nUsuario: "+text}],provider:"groq"})})).json();
    return {message:d.text||"¿Puedes reformular tu pregunta?"};
  } catch { return {message:"Servidor no responde. Verifica que esté corriendo."}; }
}

function fmtR(d) { return d.error?d.error:d.mensaje||d.message||"Procesado."; }

// Mount
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
