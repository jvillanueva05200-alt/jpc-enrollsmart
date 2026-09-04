
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

const CONFIG_KEY = 'jpc_config_v2'
const BOOK_KEY = 'jpc_bookings_v2'

const defaultConfig = {
  startDate: null,
  deadline: null,
  announcedDates: [],
  adminUser: 'admin',
  adminPass: 'admin123'
}

const programs = [
  'Kindergarten','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6',
  'Grade 7','Grade 8','Grade 9','Grade 10',
  'Grade 11 - STEM','Grade 11 - ABM','Grade 11 - HUMSS','Grade 11 - GAS',
  'Grade 12 - STEM','Grade 12 - ABM','Grade 12 - HUMSS','Grade 12 - GAS',
  'BS Information Technology','BS Computer Science','BS Business Administration',
  'BS Accountancy','BS Elementary Education','BS Secondary Education',
  'BS Criminology','BS Hospitality Management','BS Tourism Management',
  'BS Psychology','BS Nursing'
]

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback }
  catch { return fallback }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)) }
function fmtDate(s) {
  if (!s) return '—'
  return new Date(`${s}T00:00:00`).toLocaleDateString('en-US', {weekday:'short', month:'long', day:'numeric', year:'numeric'})
}
function fmtDateTime(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-US', {month:'long', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit'})
}
function to12(time) {
  const [h0,m] = time.split(':').map(Number)
  const ap = h0 >= 12 ? 'PM' : 'AM'
  const h = h0 % 12 || 12
  return `${h}:${String(m).padStart(2,'0')} ${ap}`
}
function slots(start='08:00', end='17:00', dur=60, cap=15) {
  const out=[]
  let cur = Number(start.slice(0,2))*60+Number(start.slice(3))
  const stop = Number(end.slice(0,2))*60+Number(end.slice(3))
  while(cur + dur <= stop) {
    const nxt=cur+dur
    const t1=`${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`
    const t2=`${String(Math.floor(nxt/60)).padStart(2,'0')}:${String(nxt%60).padStart(2,'0')}`
    out.push({time:`${t1}-${t2}`, capacity:Number(cap)})
    cur=nxt
  }
  return out
}
function refCode(bookings) {
  let ref
  do ref = `JPC-${new Date().getFullYear()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`
  while(bookings.some(b=>b.ref===ref))
  return ref
}
function qrImageUrl(text, size=170) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(text)}`
}
function qrPayload(b) {
  return `JPC ENROLLSMART\nREF: ${b.ref}\n${b.name}\n${b.sid} | ${b.course}\n${fmtDate(b.date)} | ${to12(b.time.split('-')[0])}-${to12(b.time.split('-')[1])}\nStatus: ${b.status}`
}
function QrCode({value, size=170, label='SCAN AT ENROLLMENT'}) {
  const [broken, setBroken] = useState(false)
  return <div className="qr-wrap">
    {!broken
      ? <img className="qr-img" src={qrImageUrl(value, size)} width={size} height={size} alt="Booking QR code" loading="lazy" onError={()=>setBroken(true)}/>
      : <div className="qr-fallback"><Icon name="info" size={16}/><span>QR needs an internet connection to load. Your reference code still works without it.</span></div>}
    {!broken && <small className="qr-label">{label}</small>}
  </div>
}
function Icon({name, size=20}) {
  const paths = {
    home:'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9 21v-6h6v6',
    eye:'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    calendar:'M6 2v4M18 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2Z',
    check:'m5 12 4 4L19 6',
    shield:'M12 3 20 6v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z',
    users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    clock:'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    arrow:'M5 12h14M13 6l6 6-6 6',
    search:'m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z',
    download:'M12 3v12M7 10l5 5 5-5M4 21h16',
    trash:'M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3',
    logout:'M10 17l5-5-5-5M15 12H3M21 3v18',
    info:'M12 17v-5M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    lock:'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5V11Z',
    menu:'M4 6h16M4 12h16M4 18h16',
    x:'M6 6l12 12M18 6 6 18',
    edit:'m4 20 4.5-1L19 8.5a2.1 2.1 0 0 0-3-3L5.5 16 4 20ZM14.5 7.5l3 3',
    file:'M6 2h9l5 5v15H6V2Z M15 2v5h5',
    wallet:'M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v3h-4.5a3.5 3.5 0 0 0 0 7H20v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z M16.2 12.5h.01',
    sparkle:'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
    bolt:'M13 2 4 14h6l-1 8 9-12h-6l1-8Z',
    print:'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6v-7Z'
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.info}/></svg>
}

function peso(n) {
  return `₱${Number(n||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`
}
function pay(b) {
  return (b && b.payment) || {assessed:0, paid:0, mode:'', orNumber:'', history:[]}
}
function paymentStatus(b) {
  const p=pay(b)
  if(!p.assessed) return 'Unassessed'
  if(p.paid<=0) return 'Unpaid'
  if(p.paid<p.assessed) return 'Partial'
  return 'Paid'
}
function Reveal({children, delay=0, className=''}) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(()=>{
    const el = ref.current
    if(!el) return
    const io = new IntersectionObserver(entries=>{
      entries.forEach(e=>{ if(e.isIntersecting){ setVisible(true); io.unobserve(el) } })
    },{threshold:0.15})
    io.observe(el)
    return ()=>io.disconnect()
  },[])
  return <div ref={ref} className={`reveal ${visible?'reveal-in':''} ${className}`} style={{transitionDelay:`${delay}ms`}}>{children}</div>
}
function App() {
  const [page,setPage] = useState('landing')
  const [config,setConfig] = useState(()=>load(CONFIG_KEY,defaultConfig))
  const [bookings,setBookings] = useState(()=>load(BOOK_KEY,[]))
  const [toast,setToast] = useState(null)
  const [installPrompt,setInstallPrompt] = useState(null)

  useEffect(()=>save(CONFIG_KEY,config),[config])
  useEffect(()=>save(BOOK_KEY,bookings),[bookings])
  useEffect(()=>{
    const handler=e=>{e.preventDefault();setInstallPrompt(e)}
    window.addEventListener('beforeinstallprompt',handler)
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{})
    return ()=>window.removeEventListener('beforeinstallprompt',handler)
  },[])
  useEffect(()=>{ if(toast){const t=setTimeout(()=>setToast(null),3000);return()=>clearTimeout(t)} },[toast])

  const notify=(message,type='success')=>setToast({message,type})

  const navigate = p => setPage(p)

  return <>
    {page==='landing' && <Landing onStart={()=>navigate('login')} onStudent={()=>navigate('student')} onInstall={installPrompt ? async()=>{await installPrompt.prompt();setInstallPrompt(null)}:null}/>}
    {page==='login' && <Login config={config} onBack={()=>navigate('landing')} onSuccess={()=>navigate('admin')} notify={notify}/>}
    {page==='student' && <Student config={config} setConfig={setConfig} bookings={bookings} setBookings={setBookings} onBack={()=>navigate('landing')} notify={notify}/>}
    {page==='admin' && <Admin config={config} setConfig={setConfig} bookings={bookings} setBookings={setBookings} onLogout={()=>navigate('landing')} notify={notify}/>}
    {toast && <div className={`toastx ${toast.type}`}><span>{toast.message}</span><button onClick={()=>setToast(null)}><Icon name="x" size={16}/></button></div>}
  </>
}

function Brand({compact=false}) {
  return <div className={`brand ${compact?'compact':''}`}><div className="brand-mark"><span>J</span><i><Icon name="check" size={18}/></i></div><div><strong>JPC <em>EnrollSmart</em></strong>{!compact&&<small>JOHN PAUL COLLEGE</small>}</div></div>
}

function Landing({onStart,onStudent,onInstall}) {
  return <div className="landing">
    <nav className="topnav container">
      <Brand/>
      <div className="navlinks">
        <a href="#features">Features</a><a href="#process">How it works</a>
        <button className="btn-outline" onClick={onStart}><Icon name="shield" size={17}/> Admin Portal</button>
      </div>
    </nav>
    <main>
      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse"></span> Enrollment made simpler</div>
          <h1>Skip the line.<br/><span>Secure your slot.</span></h1>
          <p>JPC EnrollSmart gives students a fast, organized and convenient way to book enrollment appointments, track fees, and check their schedule.</p>
          <div className="hero-actions">
            <button className="btn-primary btn-lg" onClick={onStudent}>Book an Appointment <Icon name="arrow" size={19}/></button>
            <button className="btn-ghost" onClick={()=>document.querySelector('#features')?.scrollIntoView({behavior:'smooth'})}>Explore system</button>
            {onInstall && <button className="install-btn" onClick={onInstall}>Install PWA</button>}
          </div>
          <div className="trust"><span><Icon name="shield" size={17}/> Local & private</span><span><Icon name="clock" size={17}/> Faster processing</span><span><Icon name="check" size={17}/> Easy to use</span></div>
        </div>
        <div className="hero-visual">
          <div className="orb orb1"></div><div className="orb orb2"></div>
          <div className="mock-window">
            <div className="mock-top"><div><i></i><i></i><i></i></div><span>JPC EnrollSmart</span><b>● Online</b></div>
            <div className="mock-body">
              <div className="mock-welcome"><div><small>GOOD DAY, STUDENT</small><h3>Your enrollment journey starts here.</h3></div><div className="mock-avatar">JP</div></div>
              <div className="mock-stats"><div><span><Icon name="calendar" size={18}/></span><b>Choose date</b><small>Pick an announced schedule</small></div><div><span><Icon name="clock" size={18}/></span><b>Select time</b><small>Reserve an available slot</small></div></div>
              <div className="mock-card"><div className="mock-line"></div><div className="mock-line short"></div><div className="mock-line tiny"></div><div className="mock-button"></div></div>
            </div>
          </div>
          <div className="float-card"><span className="success-icon"><Icon name="check" size={18}/></span><div><b>Slot secured!</b><small>JPC-2026-7F3KA</small></div></div>
          <div className="float-card float-card2"><span className="success-icon pay-icon"><Icon name="wallet" size={18}/></span><div><b>Payment tracked</b><small>Balance ₱0.00</small></div></div>
        </div>
      </section>

      <section id="features" className="section container">
        <Reveal><div className="section-heading"><span><Icon name="sparkle" size={13}/> WHY ENROLLSMART</span><h2>Everything you need for a smoother enrollment.</h2><p>Designed around the student experience, with smart tools for administrators.</p></div></Reveal>
        <div className="feature-grid">
          <Reveal delay={0}><Feature icon="calendar" title="Easy Appointment Booking" text="Choose an official date and available time slot in just a few steps."/></Reveal>
          <Reveal delay={60}><Feature icon="check" title="Instant Reference Code" text="Receive a unique booking reference and QR code you can present during enrollment."/></Reveal>
          <Reveal delay={120}><Feature icon="wallet" title="Smart Payment Tracking" text="Assessment fees, payments and balances are tracked per student and reflected on the printable form."/></Reveal>
          <Reveal delay={0}><Feature icon="search" title="Check Booking Status" text="Search your appointment using your Student ID or name."/></Reveal>
          <Reveal delay={60}><Feature icon="shield" title="Admin Monitoring" text="Manage schedules, capacities, bookings and payments in one dashboard."/></Reveal>
          <Reveal delay={120}><Feature icon="clock" title="Works Offline" text="The PWA caches the application shell for use even without an internet connection."/></Reveal>
        </div>
      </section>

      <section id="process" className="process">
        <div className="container"><Reveal><div className="section-heading light"><span><Icon name="bolt" size={13}/> HOW IT WORKS</span><h2>Three simple steps.</h2></div></Reveal>
          <div className="steps"><Reveal delay={0}><Step n="01" title="Check the schedule" text="View the dates and slots announced by the school."/></Reveal><Reveal delay={100}><Step n="02" title="Book your appointment" text="Enter your student details and reserve a slot."/></Reveal><Reveal delay={200}><Step n="03" title="Show your reference" text="Keep your reference code and QR, then settle any balance on schedule."/></Reveal></div>
        </div>
      </section>
    </main>
    <footer className="footer container"><Brand compact/><span>© 2026 John Paul College · JPC EnrollSmart</span><button onClick={onStart}>Admin Login</button></footer>
  </div>
}
function Feature({icon,title,text}){return <article className="feature"><div className="feature-icon"><Icon name={icon}/></div><h3>{title}</h3><p>{text}</p></article>}
function Step({n,title,text}){return <article className="step"><span>{n}</span><h3>{title}</h3><p>{text}</p></article>}

function Login({config,onBack,onSuccess,notify}) {
  const [u,setU]=useState(''),[p,setP]=useState(''),[show,setShow]=useState(false)
  const submit=e=>{e.preventDefault(); if(u.trim()===config.adminUser && p===config.adminPass) onSuccess(); else notify('Incorrect administrator username or password.','danger')}
  return <div className="auth-page"><div className="auth-side"><div className="auth-side-inner"><Brand/><div><span className="eyebrow">ADMINISTRATOR PORTAL</span><h1>Keep every enrollment day <span>organized.</span></h1><p>Manage schedules, capacity and student appointments from one clean workspace.</p></div><div className="auth-points"><span><Icon name="check"/> Schedule management</span><span><Icon name="check"/> Booking monitoring</span><span><Icon name="check"/> CSV export</span></div></div></div>
    <div className="auth-form-wrap"><button className="back-link" onClick={onBack}>← Back to home</button><form className="auth-card" onSubmit={submit}><div className="mobile-brand"><Brand compact/></div><div className="auth-icon"><Icon name="lock" size={23}/></div><h2>Welcome back</h2><p>Sign in to the administrator dashboard.</p>
      <label>Username<input value={u} onChange={e=>setU(e.target.value)} placeholder="Enter username" autoComplete="username" required/></label>
      <label>Password<div className="password"><input type={show?'text':'password'} value={p} onChange={e=>setP(e.target.value)} placeholder="Enter password" autoComplete="current-password" required/><button type="button" onClick={()=>setShow(!show)}>{show?'Hide':'Show'}</button></div></label>
      <button className="btn-primary full" type="submit">Sign in <Icon name="arrow" size={18}/></button>
      <div className="demo-note"><Icon name="info" size={16}/><span>Demo default: <b>admin</b> / <b>admin123</b>. Change credentials inside the dashboard.</span></div>
    </form></div>
  </div>
}

function Student({config,setConfig,bookings,setBookings,onBack,notify}) {
  const [tab,setTab]=useState('book'),[form,setForm]=useState({name:'',sid:'',course:'',date:'',time:'',contact:''}),[query,setQuery]=useState(''),[result,setResult]=useState([]),[confirm,setConfirm]=useState(null)
  const upcoming=useMemo(()=>[...config.announcedDates].filter(d=>d.date>=new Date().toISOString().slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date)),[config.announcedDates])
  const dateEntry=upcoming.find(d=>d.date===form.date)
  const available=(dateEntry?.slots||[]).map(s=>({...s,left:s.capacity-bookings.filter(b=>b.date===form.date&&b.time===s.time&&b.status!=='Cancelled').length}))
  const deadline= config.deadline ? new Date(config.deadline)-new Date() : null
  const submit=e=>{
    e.preventDefault()
    if(!Object.values(form).every(Boolean)){notify('Please complete all required fields.','danger');return}
    if(bookings.some(b=>b.sid.toLowerCase()===form.sid.toLowerCase()&&b.status==='Booked')){notify('This Student ID already has an active booking.','danger');return}
    const slot=available.find(s=>s.time===form.time)
    if(!slot||slot.left<=0){notify('That time slot is already full. Please choose another.','danger');return}
    const b={id:Date.now(),ref:refCode(bookings),...form,status:'Booked',payment:{assessed:0,paid:0,mode:'',orNumber:'',history:[]},createdAt:new Date().toISOString()}
    setBookings([...bookings,b]);setConfirm(b);setForm({name:'',sid:'',course:'',date:'',time:'',contact:''});notify('Appointment booked successfully.')
  }
  const check=()=>setResult(bookings.filter(b=>b.sid.toLowerCase()===query.trim().toLowerCase()||b.name.toLowerCase().includes(query.trim().toLowerCase())))
  return <div className="app-page">
    <header className="appbar"><div className="container appbar-inner"><button className="brand-button" onClick={onBack}><Brand compact/></button><div className="appbar-actions"><span className="online-pill"><i></i> System ready</span><button className="btn-outline" onClick={onBack}>Home</button></div></div></header>
    <main className="container student-main"><div className="student-head"><div><span className="eyebrow">STUDENT SERVICES</span><h1>Enrollment Appointment</h1><p>Book your schedule, keep your reference, and arrive prepared.</p></div><div className="deadline-card"><span>Enrollment deadline</span><b>{config.deadline?fmtDateTime(config.deadline):'Awaiting announcement'}</b>{deadline!==null&&deadline>0&&<small>{Math.floor(deadline/86400000)} days remaining</small>}</div></div>
      <div className="student-tabs"><button className={tab==='book'?'active':''} onClick={()=>setTab('book')}><Icon name="calendar"/> Book appointment</button><button className={tab==='status'?'active':''} onClick={()=>setTab('status')}><Icon name="search"/> Check status</button></div>
      {tab==='book'?<div className="student-grid"><form className="panel" onSubmit={submit}><div className="panel-head"><div><h2>Reserve your slot</h2><p>Use your official student information.</p></div><span className="step-badge">1—3</span></div>
        <div className="form-grid"><label>Full name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Last Name, First Name M.I." required/></label><label>Student ID<input value={form.sid} onChange={e=>setForm({...form,sid:e.target.value})} placeholder="e.g. 2026-00123" required/></label>
        <label className="wide">Level / Course<select value={form.course} onChange={e=>setForm({...form,course:e.target.value})} required><option value="">Select level or course</option>{programs.map(p=><option key={p}>{p}</option>)}</select></label>
        <label>Enrollment date<select value={form.date} onChange={e=>setForm({...form,date:e.target.value,time:''})} required><option value="">Select announced date</option>{upcoming.map(d=><option key={d.date} value={d.date}>{fmtDate(d.date)}</option>)}</select></label>
        <label>Time slot<select value={form.time} onChange={e=>setForm({...form,time:e.target.value})} disabled={!form.date} required><option value="">Select time slot</option>{available.map(s=>{const [a,b]=s.time.split('-');return <option key={s.time} value={s.time} disabled={s.left<=0}>{to12(a)} – {to12(b)} · {s.left>0?`${s.left} left`:'FULL'}</option>})}</select></label>
        <label className="wide">Contact number<input value={form.contact} onChange={e=>setForm({...form,contact:e.target.value})} placeholder="09XX XXX XXXX" required/></label></div>
        {upcoming.length===0&&<div className="empty-note"><Icon name="info"/><span>No enrollment dates have been announced yet. Please check again after the official schedule is posted.</span></div>}
        <button className="btn-primary full mt" type="submit" disabled={!upcoming.length}>Secure my appointment <Icon name="arrow" size={18}/></button>
      </form>
      <aside className="side-stack"><div className="panel info-panel"><h3><Icon name="info"/> Before you book</h3><ul><li>Only announced dates are available.</li><li>One active appointment per Student ID.</li><li>Bring your reference code on enrollment day.</li><li>Arrive a few minutes before your schedule.</li></ul></div><div className="panel schedule-panel"><div className="mini-title">ANNOUNCED DATES</div>{upcoming.length?upcoming.slice(0,4).map(d=><div className="schedule-row" key={d.date}><span><b>{new Date(`${d.date}T00:00:00`).getDate()}</b><small>{new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US',{month:'short'})}</small></span><div><b>{d.slots.length} time slots</b><small>{d.slots.reduce((a,s)=>a+s.capacity,0)} total capacity</small></div></div>):<p className="muted">No dates yet.</p>}</div></aside></div>
      :<div className="panel status-panel"><div className="panel-head"><div><h2>Check your booking</h2><p>Search by Student ID or full name.</p></div></div><div className="searchbar"><Icon name="search"/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&check()} placeholder="Enter Student ID or name"/><button className="btn-primary" onClick={check}>Search</button></div><div className="results">{query&&!result.length?<div className="empty-note"><Icon name="info"/><span>No booking found. Please check your Student ID or name.</span></div>:result.map(b=><BookingCard key={b.id} b={b}/>)}</div></div>}
    </main>
    {confirm&&<ConfirmModal b={confirm} onClose={()=>setConfirm(null)}/>}
  </div>
}

function BookingCard({b}){
  const [a,c]=b.time.split('-')
  const [showQr,setShowQr]=useState(false)
  const [showForm,setShowForm]=useState(false)
  const p=pay(b)
  return <div className="booking-result-wrap">
    <div className="booking-result"><div className="ref-box">{b.ref}</div><div><h3>{b.name}</h3><p>{b.sid} · {b.course}</p><div className="result-meta"><span><Icon name="calendar" size={16}/>{fmtDate(b.date)}</span><span><Icon name="clock" size={16}/>{to12(a)} – {to12(c)}</span></div></div><div className="booking-result-side"><span className={`status ${b.status.toLowerCase()}`}>{b.status}</span>{p.assessed>0&&<span className={`status ${paymentStatus(b).toLowerCase()}`}>{paymentStatus(b)} · {peso(p.assessed-p.paid)} due</span>}<div className="booking-result-links"><button type="button" className="text-btn qr-toggle" onClick={()=>setShowQr(!showQr)}>{showQr?'Hide QR':'Show QR'}</button><button type="button" className="text-btn qr-toggle" onClick={()=>setShowForm(true)}>Print Form</button></div></div></div>
    {showQr && <div className="qr-inline"><QrCode value={qrPayload(b)} size={150}/></div>}
    {showForm && <EnrollmentFormPrintable b={b} onClose={()=>setShowForm(false)}/>}
  </div>
}
function ConfirmModal({b,onClose}){
  const [view,setView]=useState('confirm')
  const p=pay(b)
  if(view==='form') return <EnrollmentFormPrintable b={b} onClose={()=>setView('confirm')}/>
  return <div className="modal-backdrop"><div className="confirm"><button className="modal-close no-print" onClick={onClose}><Icon name="x"/></button><div className="confirm-check"><Icon name="check" size={30}/></div><span className="eyebrow">APPOINTMENT CONFIRMED</span><h2>Your slot is secured.</h2><p>Keep this reference code and present it during enrollment.</p><div className="ref-big">{b.ref}</div><QrCode value={qrPayload(b)}/><div className="confirm-grid"><div><small>STUDENT</small><b>{b.name}</b></div><div><small>SCHEDULE</small><b>{fmtDate(b.date)}</b></div><div><small>TIME</small><b>{to12(b.time.split('-')[0])} – {to12(b.time.split('-')[1])}</b></div><div><small>COURSE</small><b>{b.course}</b></div>{p.assessed>0&&<><div><small>ASSESSED FEE</small><b>{peso(p.assessed)}</b></div><div><small>BALANCE</small><b>{peso(p.assessed-p.paid)}</b></div></>}</div><div className="confirm-actions no-print"><button className="btn-outline" onClick={()=>window.print()}><Icon name="print" size={17}/> Print</button><button className="btn-outline" onClick={()=>setView('form')}><Icon name="file" size={17}/> Enrollment Form</button><button className="btn-primary" onClick={onClose}>Done</button></div></div></div>
}
function EnrollmentFormPrintable({b,onClose}){
  const requirements=['Form 137 / Form 138 (Report Card)','Certificate of Good Moral Character','PSA Birth Certificate (photocopy)','2x2 ID Photo (2 copies)','Certificate of Transfer, if transferee','Medical / Health Certificate']
  const feeItems=['Tuition Fee','Miscellaneous Fee','Laboratory Fee','Other Fees']
  const p=pay(b)
  return <div className="modal-backdrop"><div className="enroll-form">
    <button className="modal-close no-print" onClick={onClose}><Icon name="x"/></button>
    <div className="ef-header">
      <Brand compact/>
      <div className="ef-title"><span className="eyebrow">ENROLLMENT / ASSESSMENT FORM</span><small>School Year {new Date().getFullYear()}–{new Date().getFullYear()+1}</small></div>
      <div className="ef-ref"><small>REFERENCE NO.</small><b>{b?b.ref:'— (walk-in) —'}</b></div>
    </div>
    {b && <div className="ef-qr"><QrCode value={qrPayload(b)} size={110} label="OFFICIAL REFERENCE"/></div>}
    <div className="ef-section"><div className="ef-section-title">I. Student Information</div><div className="ef-grid">
      <div className="ef-field wide"><small>Full Name (Last, First, M.I.)</small><span>{b?.name||'\u00A0'}</span></div>
      <div className="ef-field"><small>Student ID</small><span>{b?.sid||'\u00A0'}</span></div>
      <div className="ef-field"><small>Level / Course</small><span>{b?.course||'\u00A0'}</span></div>
      <div className="ef-field"><small>Contact Number</small><span>{b?.contact||'\u00A0'}</span></div>
      <div className="ef-field"><small>Date of Birth</small><span>&nbsp;</span></div>
      <div className="ef-field wide"><small>Address</small><span>&nbsp;</span></div>
      <div className="ef-field"><small>Parent / Guardian Name</small><span>&nbsp;</span></div>
      <div className="ef-field"><small>Guardian Contact No.</small><span>&nbsp;</span></div>
    </div></div>
    <div className="ef-section"><div className="ef-section-title">II. Enrollment Schedule</div><div className="ef-grid">
      <div className="ef-field"><small>Enrollment Date</small><span>{b?fmtDate(b.date):'\u00A0'}</span></div>
      <div className="ef-field"><small>Time Slot</small><span>{b?`${to12(b.time.split('-')[0])} – ${to12(b.time.split('-')[1])}`:'\u00A0'}</span></div>
    </div></div>
    <div className="ef-section"><div className="ef-section-title">III. Requirements Checklist</div><div className="ef-checklist">{requirements.map(r=><label key={r}><span className="ef-check"></span>{r}</label>)}</div></div>
    <div className="ef-section"><div className="ef-section-title">IV. Assessment <small>(for Registrar / Cashier use)</small></div>
      <table className="ef-table"><thead><tr><th>Fee Item</th><th>Amount</th></tr></thead><tbody>{feeItems.map(f=><tr key={f}><td>{f}</td><td></td></tr>)}<tr className="ef-total"><td>Total Assessment</td><td>{p.assessed>0?peso(p.assessed):''}</td></tr>{p.assessed>0&&<><tr><td>Amount Paid ({p.mode||'—'})</td><td>{peso(p.paid)}</td></tr><tr className="ef-total"><td>Balance Due</td><td>{peso(p.assessed-p.paid)}</td></tr></>}</tbody></table>
    </div>
    <div className="ef-signatures">
      <div><span className="ef-sig-line"></span><small>Applicant / Parent Signature</small></div>
      <div><span className="ef-sig-line"></span><small>Registrar / Evaluator</small></div>
      <div><span className="ef-sig-line"></span><small>Cashier</small></div>
    </div>
    <p className="ef-footnote">Generated via JPC EnrollSmart. Please bring this form, together with the requirements listed above, on your scheduled enrollment date.</p>
    <div className="confirm-actions no-print"><button className="btn-outline" onClick={onClose}>Close</button><button className="btn-primary" onClick={()=>window.print()}><Icon name="print" size={17}/> Print Form</button></div>
  </div></div>
}

function Admin({config,setConfig,bookings,setBookings,onLogout,notify}) {
  const [tab,setTab]=useState('overview'),[search,setSearch]=useState(''),[newDate,setNewDate]=useState({date:'',start:'08:00',end:'17:00',duration:60,capacity:15}),[newPass,setNewPass]=useState(''),[preview,setPreview]=useState(null),[blankForm,setBlankForm]=useState(false),[payModal,setPayModal]=useState(null)
  const active=bookings.filter(b=>b.status==='Booked').length
  const completed=bookings.filter(b=>b.status==='Completed').length
  const cancelled=bookings.filter(b=>b.status==='Cancelled').length
  const totalAssessed=bookings.reduce((s,b)=>s+pay(b).assessed,0)
  const totalCollected=bookings.reduce((s,b)=>s+pay(b).paid,0)
  const filtered=bookings.filter(b=>!search||b.name.toLowerCase().includes(search.toLowerCase())||b.sid.toLowerCase().includes(search.toLowerCase())||b.ref.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  const saveSchedule=e=>{e.preventDefault();notify('Enrollment schedule updated.')}
  const addDate=e=>{e.preventDefault();if(!newDate.date){notify('Select a date first.','danger');return};const generated=slots(newDate.start,newDate.end,Number(newDate.duration),Number(newDate.capacity));if(!generated.length){notify('Please check start/end time.','danger');return};const next=config.announcedDates.filter(d=>d.date!==newDate.date);next.push({date:newDate.date,slots:generated});next.sort((a,b)=>a.date.localeCompare(b.date));setConfig({...config,announcedDates:next});notify('Announced date saved.')}
  const removeDate=date=>{if(!confirm('Remove this announced date?'))return;setConfig({...config,announcedDates:config.announcedDates.filter(d=>d.date!==date)});notify('Date removed.')}
  const status=(id,s)=>{setBookings(bookings.map(b=>b.id===id?{...b,status:s}:b));notify(`Booking marked ${s}.`)}
  const del=id=>{if(!confirm('Delete this booking permanently?'))return;setBookings(bookings.filter(b=>b.id!==id));notify('Booking deleted.')}
  const exportCSV=()=>{if(!bookings.length){notify('No bookings to export.','danger');return};const head=['Ref','Name','Student ID','Course','Date','Time','Contact','Status'];const rows=bookings.map(b=>[b.ref,b.name,b.sid,b.course,b.date,b.time,b.contact,b.status]);const csv=[head,...rows].map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='jpc_enrollsmart_bookings.csv';a.click()}
  const saveCreds=e=>{e.preventDefault();const user=e.currentTarget.user.value.trim();if(!user||!newPass){notify('Enter both username and new password.','danger');return}setConfig({...config,adminUser:user,adminPass:newPass});setNewPass('');notify('Admin credentials updated.')}
  const savePayment=(id,payment)=>{setBookings(bookings.map(x=>x.id===id?{...x,payment}:x));notify('Payment recorded.')}
  return <div className="admin-shell">
    <aside className="admin-side"><div className="side-top"><Brand compact/><span className="admin-label">ADMIN CONSOLE</span></div><nav>{[['overview','home','Overview'],['bookings','users','Bookings'],['payments','wallet','Payments'],['schedule','calendar','Schedule'],['settings','shield','Settings']].map(([k,i,t])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}><Icon name={i}/>{t}</button>)}</nav><div className="side-bottom"><div className="admin-user"><span>AD</span><div><b>Administrator</b><small>System manager</small></div></div><button onClick={onLogout}><Icon name="logout"/> Sign out</button></div></aside>
    <main className="admin-main"><header className="admin-top"><button className="mobile-menu"><Icon name="menu"/></button><div><span className="eyebrow">JPC ENROLLSMART</span><h1>{tab==='overview'?'Dashboard':tab[0].toUpperCase()+tab.slice(1)}</h1></div><div className="top-actions"><span className="online-pill"><i></i> Local data</span><button className="btn-outline" onClick={exportCSV}><Icon name="download" size={17}/> Export CSV</button></div></header>
      {tab==='overview'&&<div className="admin-content"><div className="stat-grid"><Stat title="Total bookings" value={bookings.length} icon="users"/><Stat title="Active" value={active} icon="calendar"/><Stat title="Completed" value={completed} icon="check"/><Stat title="Cancelled" value={cancelled} icon="x"/></div><div className="admin-two"><div className="panel"><div className="panel-head"><div><h2>Recent bookings</h2><p>Latest appointment activity.</p></div><button className="text-btn" onClick={()=>setTab('bookings')}>View all →</button></div><BookingTable rows={filtered.slice(0,6)} status={status} del={del} view={setPreview}/></div><div className="panel"><div className="panel-head"><div><h2>Enrollment status</h2><p>Current schedule configuration.</p></div></div><div className="progress-box"><div><span>Announced dates</span><b>{config.announcedDates.length}</b></div>{config.announcedDates.slice(0,5).map(d=><div className="date-meter" key={d.date}><span>{fmtDate(d.date)}</span><small>{d.slots.length} slots</small></div>)}{!config.announcedDates.length&&<p className="muted">No schedule announced.</p>}</div></div></div></div>}
      {tab==='bookings'&&<div className="admin-content"><div className="panel"><div className="panel-head"><div><h2>All student bookings</h2><p>Search, update status or remove records.</p></div></div><div className="toolbar"><div className="searchbar"><Icon name="search"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, Student ID or reference"/></div><button className="btn-outline" onClick={()=>setBlankForm(true)}><Icon name="file" size={17}/> Blank Form</button><button className="btn-primary" onClick={exportCSV}><Icon name="download" size={17}/> Export</button></div><BookingTable rows={filtered} status={status} del={del} view={setPreview}/></div></div>}
      {tab==='payments'&&<div className="admin-content"><div className="stat-grid"><Stat title="Total Assessed" value={peso(totalAssessed)} icon="wallet"/><Stat title="Total Collected" value={peso(totalCollected)} icon="check"/><Stat title="Outstanding Balance" value={peso(totalAssessed-totalCollected)} icon="clock"/></div><div className="panel"><div className="panel-head"><div><h2>Student payments</h2><p>Assess fees and record payments per booking.</p></div></div><div className="toolbar"><div className="searchbar"><Icon name="search"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, Student ID or reference"/></div></div><div className="table-wrap"><table><thead><tr><th>Reference</th><th>Student</th><th>Assessed</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>{filtered.length?filtered.map(b=>{const p=pay(b);return <tr key={b.id}><td><b className="ref-cell">{b.ref}</b></td><td><b>{b.name}</b><small>{b.sid}</small></td><td>{p.assessed?peso(p.assessed):'—'}</td><td>{p.paid?peso(p.paid):'—'}</td><td>{p.assessed?peso(p.assessed-p.paid):'—'}</td><td><span className={`status ${paymentStatus(b).toLowerCase()}`}>{paymentStatus(b)}</span></td><td className="actions"><button title="Record payment" onClick={()=>setPayModal(b)}><Icon name="wallet" size={16}/></button></td></tr>}):<tr><td colSpan="7" className="empty-table">No bookings found.</td></tr>}</tbody></table></div></div></div>}
      {tab==='schedule'&&<div className="admin-content"><div className="admin-two"><form className="panel" onSubmit={addDate}><div className="panel-head"><div><h2>Add / update date</h2><p>Generate time slots automatically.</p></div></div><div className="form-grid"><label className="wide">Enrollment date<input type="date" value={newDate.date} onChange={e=>setNewDate({...newDate,date:e.target.value})}/></label><label>Start time<input type="time" value={newDate.start} onChange={e=>setNewDate({...newDate,start:e.target.value})}/></label><label>End time<input type="time" value={newDate.end} onChange={e=>setNewDate({...newDate,end:e.target.value})}/></label><label>Slot duration<select value={newDate.duration} onChange={e=>setNewDate({...newDate,duration:e.target.value})}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="90">90 minutes</option></select></label><label>Capacity / slot<input type="number" min="1" value={newDate.capacity} onChange={e=>setNewDate({...newDate,capacity:e.target.value})}/></label></div><button className="btn-primary full mt">Save announced date <Icon name="check" size={18}/></button></form><div className="panel"><div className="panel-head"><div><h2>Announced dates</h2><p>Published schedules and capacity.</p></div></div>{config.announcedDates.map(d=><div className="admin-date" key={d.date}><div><b>{fmtDate(d.date)}</b><small>{d.slots.length} slots · {d.slots.reduce((a,s)=>a+s.capacity,0)} capacity</small></div><button className="icon-danger" onClick={()=>removeDate(d.date)}><Icon name="trash" size={17}/></button><div className="slot-wrap">{d.slots.map(s=><span key={s.time}>{to12(s.time.split('-')[0])}–{to12(s.time.split('-')[1])} · {bookings.filter(b=>b.date===d.date&&b.time===s.time&&b.status!=='Cancelled').length}/{s.capacity}</span>)}</div></div>)}{!config.announcedDates.length&&<p className="muted">No dates announced.</p>}</div></div></div>}
      {tab==='settings'&&<div className="admin-content"><div className="admin-two"><form className="panel" onSubmit={saveSchedule}><div className="panel-head"><div><h2>Enrollment settings</h2><p>Control the public schedule information.</p></div></div><label>Start date<input type="date" value={config.startDate||''} onChange={e=>setConfig({...config,startDate:e.target.value||null})}/></label><label>Booking deadline<input type="datetime-local" value={config.deadline||''} onChange={e=>setConfig({...config,deadline:e.target.value||null})}/></label><button className="btn-primary full mt">Save settings</button></form><form className="panel" onSubmit={saveCreds}><div className="panel-head"><div><h2>Administrator account</h2><p>Change the demo credentials stored on this device.</p></div></div><label>Username<input name="user" defaultValue={config.adminUser}/></label><label>New password<input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="Enter a new password"/></label><button className="btn-primary full mt">Update credentials</button><div className="warning-note"><Icon name="shield" size={17}/><span>This is a frontend/localStorage demo. For production, move authentication and data storage to a secure server.</span></div></form></div></div>}
    </main>
    {preview&&<ConfirmModal b={preview} onClose={()=>setPreview(null)}/>}
    {blankForm&&<EnrollmentFormPrintable b={null} onClose={()=>setBlankForm(false)}/>}
    {payModal&&<PaymentModal b={payModal} onSave={p=>{savePayment(payModal.id,p);setPayModal(null)}} onClose={()=>setPayModal(null)}/>}
  </div>
}
function PaymentModal({b,onSave,onClose}){
  const p=pay(b)
  const [assessed,setAssessed]=useState(p.assessed||'')
  const [amount,setAmount]=useState('')
  const [mode,setMode]=useState(p.mode||'Cash')
  const [orNumber,setOrNumber]=useState('')
  const newAssessed=Number(assessed)||0
  const addAmount=Number(amount)||0
  const newPaid=p.paid+addAmount
  const submit=e=>{
    e.preventDefault()
    const history=addAmount>0?[...p.history,{amount:addAmount,mode,orNumber,date:new Date().toISOString()}]:p.history
    onSave({assessed:newAssessed,paid:newPaid,mode,orNumber,history})
  }
  return <div className="modal-backdrop"><div className="confirm pay-modal"><button className="modal-close" onClick={onClose}><Icon name="x"/></button>
    <div className="confirm-check"><Icon name="wallet" size={26}/></div>
    <span className="eyebrow">RECORD PAYMENT</span><h2>{b.name}</h2><p>{b.ref} · {b.sid}</p>
    <form onSubmit={submit} className="form-grid pay-form">
      <label>Total Assessment (₱)<input type="number" min="0" step="0.01" value={assessed} onChange={e=>setAssessed(e.target.value)} placeholder="0.00"/></label>
      <label>Add Payment (₱)<input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/></label>
      <label>Payment Mode<select value={mode} onChange={e=>setMode(e.target.value)}><option>Cash</option><option>GCash</option><option>Maya</option><option>Bank Transfer</option><option>Other</option></select></label>
      <label>OR / Reference No.<input value={orNumber} onChange={e=>setOrNumber(e.target.value)} placeholder="e.g. OR-00123"/></label>
      <div className="wide pay-summary"><div><small>Already Paid</small><b>{peso(p.paid)}</b></div><div><small>After This Payment</small><b>{peso(newPaid)}</b></div><div><small>New Balance</small><b>{peso(newAssessed-newPaid)}</b></div></div>
      {p.history.length>0&&<div className="wide pay-history"><div className="mini-title">PAYMENT HISTORY</div>{p.history.slice().reverse().map((h,i)=><div key={i} className="pay-history-row"><span>{peso(h.amount)} · {h.mode}</span><small>{h.orNumber||'—'} · {new Date(h.date).toLocaleDateString()}</small></div>)}</div>}
      <button className="btn-primary full mt wide" type="submit">Save Payment <Icon name="check" size={18}/></button>
    </form>
  </div></div>
}
function Stat({title,value,icon}){return <div className="stat-card"><div className="stat-icon"><Icon name={icon}/></div><span>{title}</span><b>{value}</b></div>}
function BookingTable({rows,status,del,view}){return <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Student</th><th>Schedule</th><th>Status</th><th></th></tr></thead><tbody>{rows.length?rows.map(b=><tr key={b.id}><td><b className="ref-cell">{b.ref}</b><small>{b.sid}</small></td><td><b>{b.name}</b><small>{b.course}</small></td><td><b>{fmtDate(b.date)}</b><small>{to12(b.time.split('-')[0])} – {to12(b.time.split('-')[1])}</small></td><td><span className={`status ${b.status.toLowerCase()}`}>{b.status}</span></td><td className="actions">{view&&<button title="View / Print QR" onClick={()=>view(b)}><Icon name="eye" size={16}/></button>}{b.status==='Booked'&&<button title="Complete" onClick={()=>status(b.id,'Completed')}><Icon name="check" size={16}/></button>}{b.status!=='Cancelled'&&<button title="Cancel" onClick={()=>status(b.id,'Cancelled')}><Icon name="x" size={16}/></button>}<button title="Delete" onClick={()=>del(b.id)}><Icon name="trash" size={16}/></button></td></tr>):<tr><td colSpan="5" className="empty-table">No bookings found.</td></tr>}</tbody></table></div>}

function AppEntry(){return <App/>}
createRoot(document.getElementById('root')).render(<AppEntry/>)
