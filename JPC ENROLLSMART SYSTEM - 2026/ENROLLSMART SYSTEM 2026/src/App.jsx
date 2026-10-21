import React, { useEffect, useMemo, useState } from "react";
import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx";
import StudentsTable from "./components/StudentsTable.jsx";
import Login from "./pages/Login.jsx";
import StudentDashboard from "./pages/StudentDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";

const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

const PROGRAMS = [
  { name: "Engineering", image: "engineering.png", description: "Build a strong foundation in engineering concepts, problem-solving and technical practice." },
  { name: "Architecture", image: "architecture.png", description: "Explore design, planning, visualization and the creative process behind the built environment." },
  { name: "BS Custom Administration", image: "custom-administration.png", description: "Develop knowledge and skills for customs administration, trade processes and professional practice." },
  { name: "Civil Engineering", image: "civil-engineering.png", description: "Learn the principles behind structures, infrastructure, construction and sustainable development." },
  { name: "Computer Science", image: "computer-science.png", description: "Develop computational thinking, programming skills and foundations for software and technology careers." },
  { name: "Information Technology", image: "information-technology.png", description: "Learn practical computing, systems, networking, databases and modern information technologies." },
  { name: "Computer Engineering", image: "computer-engineering.png", description: "Explore the intersection of hardware, software, embedded systems and computer technologies." },
  { name: "Business Administration", image: "business-administration.png", description: "Build business, management, entrepreneurship and organizational skills for the modern workplace." },
  { name: "Accountancy", image: "accountancy.png", description: "Develop foundational knowledge in accounting, financial reporting and business decision-making." },
];

function useRevealAndParallax() {
  useEffect(() => {
    const items = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add("revealed");
    }), { threshold: 0.12 });
    items.forEach(item => observer.observe(item));
    const onScroll = () => document.documentElement.style.setProperty("--parallax-y", `${Math.min(window.scrollY * 0.12, 70)}px`);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { observer.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
}

function getCountdown(target) {
  if (!target) return null;
  const diff = Math.max(0, new Date(target).getTime() - Date.now());
  return {
    total: diff,
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

function EnrollmentAnnouncement() {
  const [data, setData] = useState({ deadline: "", dates: [], timeSlots: [] });
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(`${API}/api/enrollment-info`, { cache: "no-store" })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Unable to load enrollment schedule.")))
      .then(value => active && setData(value))
      .catch(() => active && setData({ deadline: "", dates: [], timeSlots: [] }));
    const refresh = window.setInterval(() => {
      fetch(`${API}/api/enrollment-info`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(value => value && active && setData(value)).catch(() => {});
    }, 60000);
    return () => { active = false; window.clearInterval(refresh); };
  }, []);

  const activeSchedules = useMemo(() => {
    const now = Date.now();
    return (data.dates || []).filter(item => item.status === "Announced" && (!item.deadline || new Date(`${item.deadline}T23:59:59`).getTime() >= now))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [data]);

  const deadline = activeSchedules.map(item => item.deadline || data.deadline).filter(Boolean).sort()[0] || "";
  const countdownTarget = deadline ? `${deadline}T23:59:59` : "";

  useEffect(() => {
    const tick = () => setCountdown(getCountdown(countdownTarget));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [countdownTarget]);

  const nextDate = activeSchedules[0]?.date || "";
  const totalCapacity = activeSchedules.reduce((sum, item) => sum + Number(item.maxSlots || 0), 0);
  const totalBooked = activeSchedules.reduce((sum, item) => sum + Number(item.booked || 0), 0);
  const hasOpenEnrollment = activeSchedules.length > 0;

  return <section className="enrollment-announcement py-5" id="enrollment">
    <div className="container py-lg-3">
      <div className="announcement-shell reveal">
        <div className="announcement-main p-4 p-lg-5">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            <span className={`status-pill ${hasOpenEnrollment ? "open" : "closed"}`}><span className="status-dot" />{hasOpenEnrollment ? "ENROLLMENT OPEN" : "ENROLLMENT CLOSED"}</span>
            <span className="small text-secondary">Official enrollment announcement</span>
          </div>
          <div className="section-label">Enrollment announcement</div>
          <h2 className="display-6 fw-bold mt-2 mb-3">Plan your enrollment before the deadline.</h2>
          {hasOpenEnrollment ? <>
            <p className="text-secondary lead mb-4">Enrollment appointments are currently available. Choose an announced date and time slot after signing in.</p>
            <div className="row g-3">
              <div className="col-sm-6 col-lg-4"><div className="announcement-stat"><small>Next enrollment date</small><strong>{formatDate(nextDate)}</strong></div></div>
              <div className="col-sm-6 col-lg-4"><div className="announcement-stat"><small>Deadline</small><strong>{formatDate(deadline)}</strong></div></div>
              <div className="col-sm-6 col-lg-4"><div className="announcement-stat"><small>Remaining slots</small><strong>{Math.max(0, totalCapacity - totalBooked)}</strong></div></div>
            </div>
          </> : <p className="text-secondary lead mb-0">There is no active enrollment schedule at the moment. Please check again when the school publishes the next announcement.</p>}
        </div>
        <div className="countdown-panel p-4 p-lg-5">
          <div className="small text-white-50 text-uppercase fw-bold letter-spaced">Time remaining</div>
          {hasOpenEnrollment && countdown ? <div className="countdown-grid mt-3">
            {[[countdown.days, "Days"], [countdown.hours, "Hours"], [countdown.minutes, "Minutes"], [countdown.seconds, "Seconds"]].map(([value, label]) => <div className="countdown-unit" key={label}><strong>{String(value).padStart(2, "0")}</strong><span>{label}</span></div>)}
          </div> : <div className="closed-message mt-4"><i className="bi bi-calendar-x fs-1" /><strong className="mt-3">No active schedule</strong><span>Watch this space for the next enrollment announcement.</span></div>}
          <a href="/login" className="btn btn-light btn-lg w-100 mt-4 fw-bold">{hasOpenEnrollment ? "Book Enrollment Appointment" : "Student Login"} <i className="bi bi-arrow-right ms-1" /></a>
        </div>
      </div>
    </div>
  </section>;
}

function ProgramsSection() {
  const [selected, setSelected] = useState(null);
  return <section className="programs-section py-5" id="programs">
    <div className="container py-lg-5">
      <div className="row align-items-end mb-5 reveal">
        <div className="col-lg-8"><div className="section-label">Programs offered</div><h2 className="section-title display-5 mt-2">Find the program that fits your future.</h2><p className="text-secondary lead mt-3 mb-0">Explore the programs and courses offered through John Paul College.</p></div>
        <div className="col-lg-3 ms-auto text-lg-end mt-4 mt-lg-0"><a href="/login" className="btn btn-outline-primary">Enroll in a Program <i className="bi bi-arrow-right ms-1" /></a></div>
      </div>
      <div className="row g-4">
        {PROGRAMS.map((program, index) => <div className="col-md-6 col-lg-4 reveal" key={program.name} style={{ transitionDelay: `${Math.min(index * 35, 220)}ms` }}>
          <article className="program-card h-100">
            <div className="program-logo-wrap"><img src={`/assets/images/programs/${program.image}`} alt={`${program.name} logo`} className="program-logo" /></div>
            <div className="p-4 pt-2 d-flex flex-column h-100"><span className="program-index">PROGRAM {String(index + 1).padStart(2, "0")}</span><h3 className="h4 fw-bold mt-2">{program.name}</h3><p className="text-secondary mb-4">{program.description}</p><button className="btn btn-sm btn-outline-primary align-self-start mt-auto" onClick={() => setSelected(program)}>View Program <i className="bi bi-arrow-up-right ms-1" /></button></div>
          </article>
        </div>)}
      </div>
    </div>
    {selected && <div className="program-modal-backdrop" onClick={() => setSelected(null)}><div className="program-modal" onClick={event => event.stopPropagation()}><button className="program-modal-close" onClick={() => setSelected(null)} aria-label="Close"><i className="bi bi-x-lg" /></button><div className="program-modal-logo"><img src={`/assets/images/programs/${selected.image}`} alt="" /></div><div className="section-label">Program profile</div><h2 className="h2 fw-bold mt-2">{selected.name}</h2><p className="text-secondary lead">{selected.description}</p><div className="program-profile-list"><div><i className="bi bi-mortarboard-fill" /><span>College program</span></div><div><i className="bi bi-person-check-fill" /><span>Enrollment appointments available through EnrollSmart</span></div><div><i className="bi bi-calendar2-check-fill" /><span>Choose an announced enrollment schedule after signing in</span></div></div><a href="/login" className="btn btn-primary btn-lg w-100 mt-4">Enroll Now <i className="bi bi-arrow-right ms-1" /></a></div></div>}
  </section>;
}

function EnrollNowSection() {
  return <section className="enroll-now-section py-5"><div className="container py-lg-5"><div className="enroll-now-card reveal"><div className="enroll-now-glow" /><div className="position-relative z-1 text-center px-4 py-5 py-lg-6"><div className="section-label text-warning">Your next chapter starts here</div><h2 className="display-4 fw-bold text-white mt-3">ENROLL NOW</h2><blockquote className="enroll-quote my-4"><span>“The Future Starts today,</span><span>Not Tomorrow.”</span>– Pope John Paul II</blockquote><a href="/login" className="btn btn-warning btn-lg px-5 fw-bold">Start Your Enrollment <i className="bi bi-arrow-right ms-1" /></a></div></div></div></section>;
}

function Home() {
  useRevealAndParallax();
  const features = [
    ["bi-calendar2-check", "Appointment Booking", "Choose an available enrollment date and time slot without the long queue."],
    ["bi-clock-history", "Schedule Tracking", "Keep your appointment details, status and notifications in one place."],
    ["bi-shield-check", "Secure Access", "Use Firebase authentication with protected student and administrator areas."],
    ["bi-bar-chart-line", "Admin Control", "Manage schedules, capacity, student records and enrollment status."],
    ["bi-file-earmark-spreadsheet", "CSV Export", "Export enrollment records for administrative reporting and records."],
    ["bi-phone", "PWA Ready", "Install EnrollSmart on supported devices and access its app-like experience."]
  ];

  return <>
    <Header />
    <main>
      <section className="hero text-white">
        <div className="hero-grid" />
        <div className="container py-5"><div className="row align-items-center g-5"><div className="col-lg-7 hero-copy">
          <span className="hero-badge float-in"><i className="bi bi-mortarboard-fill" /> SMART ENROLLMENT SYSTEM</span>
          <h1 className="hero-title fw-bold mt-4 float-in">A smarter way to start your <span className="text-warning">college journey.</span></h1>
          <p className="lead text-white-50 mt-4 mb-4 float-in">Book your enrollment appointment, explore available programs, choose an announced schedule, and monitor your progress with JPC ENROLLSMART.</p>
          <div className="d-flex flex-wrap gap-3 float-in"><a className="btn btn-primary btn-lg px-4" href="/login">Enroll Now <i className="bi bi-arrow-right ms-1" /></a><a className="btn btn-outline-light btn-lg px-4" href="#programs">Explore Programs</a></div>
          <div className="d-flex flex-wrap gap-4 mt-5 small text-white-50"><span><i className="bi bi-check-circle-fill text-warning me-2" />Easy booking</span><span><i className="bi bi-check-circle-fill text-warning me-2" />Real-time availability</span><span><i className="bi bi-check-circle-fill text-warning me-2" />Mobile friendly</span></div>
        </div><div className="col-lg-5"><div className="hero-card p-4 p-lg-5 text-dark">
          <div className="d-flex align-items-center gap-3 mb-4"><img src="/assets/images/john-paul-college-logo.png" alt="JPC" width="62" height="62" /><div><div className="fw-bold">John Paul College</div><small className="text-secondary">Roxas, Oriental Mindoro</small></div></div>
          <h2 className="h3 fw-bold">Your enrollment, organized.</h2><p className="text-secondary">Log in using Google or your mobile number. New students can start without an existing Student ID.</p>
          <div className="row g-3 mt-2"><div className="col-4"><div className="bg-light rounded-4 p-3 text-center"><strong className="d-block fs-4">01</strong><small>Login</small></div></div><div className="col-4"><div className="bg-light rounded-4 p-3 text-center"><strong className="d-block fs-4">02</strong><small>Schedule</small></div></div><div className="col-4"><div className="bg-light rounded-4 p-3 text-center"><strong className="d-block fs-4">03</strong><small>Book</small></div></div></div>
        </div></div></div></div>
      </section>

      <EnrollmentAnnouncement />
      <ProgramsSection />

      <section className="home-section py-5" id="features"><div className="container py-lg-5"><div className="row align-items-end mb-5 reveal"><div className="col-lg-7"><div className="section-label">Built for enrollment</div><h2 className="section-title display-6 mt-2">Everything students and staff need in one system.</h2></div><div className="col-lg-4 ms-auto"><p className="text-secondary mb-0">A clean, responsive workflow designed around appointment-based enrollment.</p></div></div><div className="row g-4">{features.map(([icon, title, text]) => <div className="col-md-6 col-lg-4 reveal" key={title}><article className="feature-card h-100 p-4"><div className="feature-icon mb-4"><i className={`bi ${icon}`} /></div><h3 className="h5 fw-bold">{title}</h3><p className="text-secondary mb-0">{text}</p></article></div>)}</div></div></section>

      <section className="stats-band py-5" id="how-it-works"><div className="container py-lg-4"><div className="row g-4 align-items-center"><div className="col-lg-5 text-white reveal"><div className="section-label text-warning">Simple workflow</div><h2 className="display-6 fw-bold mt-2">From account to appointment in a few steps.</h2><p className="text-white-50">Administrators publish schedules and students select only the dates and slots that are still available.</p></div><div className="col-lg-7"><div className="row g-3"><div className="col-sm-4 reveal"><div className="stat-card p-4 h-100"><small className="text-white-50">01</small><h3 className="h5 mt-3">Authenticate</h3><p className="small text-white-50 mb-0">Google or mobile number.</p></div></div><div className="col-sm-4 reveal"><div className="stat-card p-4 h-100"><small className="text-white-50">02</small><h3 className="h5 mt-3">Choose</h3><p className="small text-white-50 mb-0">Pick an announced schedule.</p></div></div><div className="col-sm-4 reveal"><div className="stat-card p-4 h-100"><small className="text-white-50">03</small><h3 className="h5 mt-3">Confirm</h3><p className="small text-white-50 mb-0">Receive your appointment number and QR code.</p></div></div></div></div></div></div></section>

      <section className="home-section py-5"><div className="container py-lg-4"><div className="row align-items-center g-5"><div className="col-lg-6 reveal"><div className="p-5 rounded-5 cta-panel"><img src="/assets/images/enrollsmart-logo.png" alt="EnrollSmart" className="img-fluid mb-4" style={{maxWidth:160}} /><h2 className="text-white fw-bold">Ready for your enrollment appointment?</h2><p className="text-white-50">Create or access your student account and check the schedules published by the school.</p><a href="/login" className="btn btn-primary px-4">Get Started</a></div></div><div className="col-lg-6 reveal"><div className="section-label">For students</div><h2 className="section-title display-6 mt-2">No existing Student ID? That is okay.</h2><p className="text-secondary lead">New students can authenticate first. EnrollSmart can assign the required Student ID format after account creation.</p><div className="d-flex gap-3 align-items-start mt-4"><i className="bi bi-google fs-4 text-danger" /><div><strong>Google authentication</strong><div className="text-secondary small">Fast Firebase-based sign in.</div></div></div><div className="d-flex gap-3 align-items-start mt-3"><i className="bi bi-phone fs-4 text-danger" /><div><strong>Mobile authentication</strong><div className="text-secondary small">Verify your Philippine mobile number through Firebase.</div></div></div></div></div></div></section>
      <EnrollNowSection />
    </main>
    <Footer />
  </>;
}

function App() { const [path, setPath] = useState(window.location.pathname); useEffect(() => { const onPop = () => setPath(window.location.pathname); window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []); if (path === "/login" || path === "/login.html") return <Login />; if (path === "/student" || path === "/student.html") return <StudentDashboard />; if (path === "/admin" || path === "/admin.html") return <AdminDashboard />; if (path === "/admin/students") return <StudentsTable />; if (path === "/admin/login" || path === "/admin-login.html") return <Login />; return <Home />; }
export default App;