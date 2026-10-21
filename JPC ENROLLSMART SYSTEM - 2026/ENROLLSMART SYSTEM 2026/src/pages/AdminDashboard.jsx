import React, { useCallback, useEffect, useState } from "react";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";

const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const EMPTY_STUDENT = { id: "", name: "", email: "", gender: "", address: "", dept: "", level: "", date: "", time: "", phone: "" };
const EMPTY_SCHEDULE = { date: "", maxSlots: 100, perSlotMax: "", deadline: "", status: "Announced" };

async function request(path, options = {}) {
  const token = localStorage.getItem("enrollsmart_token");
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
  return data;
}

export default function AdminDashboard() {
  const [students, setStudents] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState("checking");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [studentModal, setStudentModal] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editingDate, setEditingDate] = useState(null);
  const [studentForm, setStudentForm] = useState(EMPTY_STUDENT);
  const [qrResult, setQrResult] = useState(null); const [qrCode, setQrCode] = useState(""); const [qrBusy, setQrBusy] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE);
  const token = localStorage.getItem("enrollsmart_token");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [studentData, analyticsData, dateData] = await Promise.all([
        request("/api/students"),
        request("/api/analytics"),
        request("/api/dates")
      ]);
      setStudents(studentData.students || []);
      setAnalytics(analyticsData);
      setDates(dateData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    async function verifyAdminSession() {
      if (!token) {
        if (active) setAuthStatus("denied");
        return;
      }
      try {
        const session = await request("/api/auth/session");
        if (!active) return;
        if (session.type !== "admin") {
          localStorage.removeItem("enrollsmart_token");
          localStorage.removeItem("enrollsmart_role");
          localStorage.removeItem("enrollsmart_student_id");
          localStorage.removeItem("enrollsmart_student_name");
          setAuthStatus("denied");
          return;
        }
        setAuthStatus("authorized");
      } catch {
        if (!active) return;
        localStorage.removeItem("enrollsmart_token");
        localStorage.removeItem("enrollsmart_role");
        localStorage.removeItem("enrollsmart_student_id");
        localStorage.removeItem("enrollsmart_student_name");
        setAuthStatus("denied");
      }
    }
    verifyAdminSession();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (authStatus === "authorized") load();
  }, [load, authStatus]);

  function logout() {
    localStorage.removeItem("enrollsmart_token");
    localStorage.removeItem("enrollsmart_role");
    localStorage.removeItem("enrollsmart_student_id");
    localStorage.removeItem("enrollsmart_student_name");
    window.location.replace("/login");
  }

  function openStudent(student = null) {
    setEditingStudent(student?.id || null);
    setStudentForm(student ? { ...EMPTY_STUDENT, ...student } : { ...EMPTY_STUDENT });
    setStudentModal(true);
    setError("");
    setMessage("");
  }

  function openSchedule(date = null) {
    setEditingDate(date?.date || null);
    setScheduleForm(date ? {
      ...EMPTY_SCHEDULE,
      date: date.date,
      maxSlots: date.maxSlots,
      perSlotMax: date.perSlotMax || "",
      deadline: date.deadline || "",
      status: date.status || "Unannounced"
    } : { ...EMPTY_SCHEDULE });
    setScheduleModal(true);
    setError("");
    setMessage("");
  }

  function changeStudent(event) {
    setStudentForm(prev => ({ ...prev, [event.target.name]: event.target.value }));
  }

  function changeSchedule(event) {
    setScheduleForm(prev => ({ ...prev, [event.target.name]: event.target.value }));
  }

  async function saveStudent(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body = { ...studentForm };
      if (editingStudent) delete body.id;
      await request(editingStudent ? `/api/students/${encodeURIComponent(editingStudent)}` : "/api/students", {
        method: editingStudent ? "PUT" : "POST",
        body: JSON.stringify(body)
      });
      setStudentModal(false);
      setMessage(editingStudent ? "Student updated successfully." : "Student added successfully.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveSchedule(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body = {
        date: scheduleForm.date,
        maxSlots: Number(scheduleForm.maxSlots),
        perSlotMax: scheduleForm.perSlotMax ? Number(scheduleForm.perSlotMax) : undefined,
        deadline: scheduleForm.deadline || undefined,
        status: scheduleForm.status
      };
      await request(editingDate ? `/api/dates/${encodeURIComponent(editingDate)}` : "/api/dates", {
        method: editingDate ? "PUT" : "POST",
        body: JSON.stringify(body)
      });
      setScheduleModal(false);
      setMessage(editingDate ? "Enrollment schedule updated." : "Enrollment schedule created.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleDate(date) {
    try {
      await request(`/api/dates/${encodeURIComponent(date.date)}/toggle`, { method: "PUT" });
      setMessage(`Schedule ${date.status === "Announced" ? "closed" : "opened"}.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeDate(date) {
    if (!window.confirm(`Delete enrollment schedule ${date.date}?`)) return;
    try {
      await request(`/api/dates/${encodeURIComponent(date.date)}`, { method: "DELETE" });
      setMessage("Enrollment schedule deleted.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeStudent(student) {
    if (!window.confirm(`Delete ${student.name || student.id}?`)) return;
    try {
      await request(`/api/students/${encodeURIComponent(student.id)}`, { method: "DELETE" });
      setMessage("Student deleted successfully.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeStatus(student, status) {
    try {
      await request(`/api/students/${encodeURIComponent(student.id)}`, { method: "PUT", body: JSON.stringify({ status }) });
      setMessage("Status updated.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function exportCsv() {
    try {
      const response = await fetch(`${API}/api/export/csv`, { headers: { Authorization: `Bearer ${localStorage.getItem("enrollsmart_token")}` } });
      if (!response.ok) throw new Error("Export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "JPC-ENROLLSMART-Masterlist.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  if (authStatus !== "authorized") return <>
    <Header />
    <main className="container py-5">
      <div className={`alert ${authStatus === "checking" ? "alert-info" : "alert-warning"}`} role="status">
        {authStatus === "checking" ? "Verifying administrator access..." : <>Administrator access is required to view this page. <a href="/login">Continue to sign in</a>.</>}
      </div>
    </main>
    <Footer />
  </>;



  async function verifyQR(code = qrCode, checkIn = false) {
    const raw = String(code || "").trim();
    const verificationId = raw.includes("|") ? raw.split("|").pop() : raw;
    if (!verificationId) return setError("Enter or scan an appointment QR code.");
    setQrBusy(true); setError(""); setQrResult(null);
    try { const result = await request("/api/appointments/verify", { method: "POST", body: JSON.stringify({ verificationId, checkIn }) }); setQrResult(result); if (checkIn) await load(); } catch (err) { setError(err.message); } finally { setQrBusy(false); }
  }

  async function scanWithCamera() {
    if (!("BarcodeDetector" in window)) return setError("QR camera scanning is not supported by this browser. Use the manual QR value or a QR scanner app.");
    try { const detector = new BarcodeDetector({ formats: ["qr_code"] }); const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); const video = document.createElement("video"); video.srcObject = stream; video.setAttribute("playsinline", "true"); await video.play();
      const modal = document.createElement("div"); modal.className = "qr-camera-overlay"; modal.innerHTML = '<div class="qr-camera-box"><div class="fw-bold mb-2">Scan Appointment QR</div><video class="qr-camera-video" autoplay playsinline></video><button type="button" class="btn btn-outline-secondary btn-sm mt-3">Cancel</button></div>'; document.body.appendChild(modal); const view = modal.querySelector("video"); view.srcObject = stream;
      const cancel = () => { stream.getTracks().forEach(t => t.stop()); modal.remove(); }; modal.querySelector("button").onclick = cancel;
      const loop = async () => { if (!document.body.contains(modal)) return; try { const codes = await detector.detect(view); if (codes[0]?.rawValue) { const value = codes[0].rawValue; cancel(); setQrCode(value); await verifyQR(value); return; } } catch {} requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    } catch (err) { setError(err.message || "Unable to access the camera."); }
  }
  return <>
    <Header />
    <main className="dashboard-shell py-5 min-vh-100">
      <div className="container">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
          <div><div className="section-label">Administration</div><h1 className="h2 fw-bold mb-1">Enrollment Dashboard</h1><p className="text-secondary mb-0">Schedules, appointments and student records</p></div>
          <div className="d-flex gap-2"><button className="btn btn-primary" onClick={() => openStudent()}>Add Student</button><button className="btn btn-outline-danger" onClick={logout}>Logout</button></div>
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        <div className="row g-4 mb-4">
          <Stat title="Students" value={analytics?.total ?? students.length} icon="bi-people" />
          <Stat title="Pending" value={analytics?.pending ?? 0} icon="bi-hourglass-split" />
          <Stat title="Enrolled" value={analytics?.enrolled ?? 0} icon="bi-check2-circle" />
          <Stat title="Schedules" value={dates.length} icon="bi-calendar2-week" />
        </div>

        <section className="dashboard-card p-4 mb-4">
          <div className="d-flex flex-column flex-lg-row justify-content-between gap-3 mb-4">
            <div><div className="section-label">Appointment control</div><h2 className="h4 fw-bold mb-1">Enrollment Schedule</h2><p className="text-secondary mb-0">Publish dates, capacity, deadline and time-slot availability.</p></div>
            <button className="btn btn-primary" onClick={() => openSchedule()}>Add Schedule</button>
          </div>
          {loading ? <Loading /> : <div className="row g-3">
            {dates.map(date => <div className="col-md-6 col-xl-4" key={date.date}>
              <div className="schedule-card p-4 h-100">
                <div className="d-flex justify-content-between align-items-start"><div><small className="text-secondary">Enrollment date</small><h3 className="h5 fw-bold mt-1">{date.date}</h3></div><span className={`badge ${date.status === "Announced" ? "text-bg-success" : "text-bg-secondary"}`}>{date.status}</span></div>
                <div className="row g-2 mt-2"><div className="col-6"><div className="bg-light rounded-3 p-2"><small className="text-secondary">Capacity</small><strong className="d-block">{date.maxSlots}</strong></div></div><div className="col-6"><div className="bg-light rounded-3 p-2"><small className="text-secondary">Available</small><strong className="d-block">{date.available}</strong></div></div></div>
                <div className="small text-secondary mt-3">Booked: {date.booked}{date.deadline ? ` • Deadline: ${date.deadline}` : ""}</div>
                <div className="d-flex flex-wrap gap-2 mt-3"><button className="btn btn-sm btn-outline-primary" onClick={() => openSchedule(date)}>Edit</button><button className="btn btn-sm btn-outline-secondary" onClick={() => toggleDate(date)}>{date.status === "Announced" ? "Close" : "Open"}</button><button className="btn btn-sm btn-outline-danger" onClick={() => removeDate(date)}>Delete</button></div>
              </div>
            </div>)}
            {dates.length === 0 && <div className="col-12 text-center text-secondary py-5">No enrollment schedules yet. Create one to allow student appointments.</div>}
          </div>}
        </section>

        <section className="dashboard-card p-4 mb-4 qr-admin-card">
          <div className="d-flex flex-column flex-lg-row justify-content-between gap-3">
            <div><div className="section-label">Appointment verification</div><h2 className="h4 fw-bold mb-1">Scan Appointment QR</h2><p className="text-secondary mb-0">Verify a student's appointment and optionally mark the arrival as checked in.</p></div>
            <button className="btn btn-primary" onClick={scanWithCamera}><i className="bi bi-camera me-1" />Scan with Camera</button>
          </div>
          <div className="input-group mt-4"><input className="form-control" value={qrCode} onChange={e => setQrCode(e.target.value)} placeholder="Paste QR value / verification ID" /><button className="btn btn-outline-primary" onClick={() => verifyQR()} disabled={qrBusy}>{qrBusy ? "Checking..." : "Verify"}</button></div>
          {qrResult?.student && <div className="qr-result mt-4 p-4 rounded-4"><div className="d-flex justify-content-between gap-3 align-items-start"><div><span className="badge text-bg-success mb-2">VALID APPOINTMENT</span><h3 className="h5 fw-bold mb-1">{qrResult.student.name}</h3><div className="small text-secondary">{qrResult.student.appointmentNo} • {qrResult.student.id}</div></div><i className="bi bi-qr-code-scan fs-2 text-success" /></div><div className="row g-3 mt-1"><Info label="Date" value={qrResult.student.date} /><Info label="Time" value={qrResult.student.time} /><Info label="Program" value={qrResult.student.dept} /><Info label="Status" value={qrResult.student.status} /></div><div className="d-flex flex-wrap gap-2 mt-3">{qrResult.student.checkedInAt ? <span className="badge text-bg-success p-2"><i className="bi bi-check-circle me-1" />Already checked in</span> : <button className="btn btn-success" onClick={() => verifyQR(qrCode, true)} disabled={qrBusy}><i className="bi bi-person-check me-1" />Mark Checked In</button>}</div></div>}
        </section>

        <section className="dashboard-card p-4">
          <div className="d-flex flex-column flex-md-row justify-content-between gap-2 mb-3"><div><div className="section-label">Student records</div><h2 className="h4 fw-bold mb-1">Student List</h2><small className="text-secondary">Create, read, update and delete records.</small></div><button className="btn btn-outline-secondary btn-sm" onClick={exportCsv}>Export CSV</button></div>
          {loading ? <Loading /> : <div className="table-responsive"><table className="table table-hover align-middle"><thead className="table-dark"><tr><th>No.</th><th>Student ID</th><th>Name</th><th>Contact</th><th>Program</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            {students.map((student, index) => <tr key={student.id}><td>{index + 1}</td><td><strong>{student.id}</strong></td><td>{student.name}</td><td><div>{student.email || "—"}</div><small className="text-secondary">{student.phone || ""}</small></td><td>{student.dept || "—"}</td><td>{student.date || "—"}</td><td><select className="form-select form-select-sm" value={student.status || "Pending"} onChange={e => changeStatus(student, e.target.value)}><option>Pending</option><option>Enrolled</option><option>Completed</option><option>Cancelled</option></select></td><td><div className="d-flex gap-1"><button className="btn btn-sm btn-outline-primary" onClick={() => openStudent(student)}>Edit</button><button className="btn btn-sm btn-outline-danger" onClick={() => removeStudent(student)}>Delete</button></div></td></tr>)}
            {students.length === 0 && <tr><td colSpan="8" className="text-center text-secondary py-5">No student records found.</td></tr>}
          </tbody></table></div>}
        </section>
      </div>
    </main>

    <Modal open={studentModal} title={editingStudent ? "Edit Student" : "Add Student"} close={() => setStudentModal(false)}>
      <form onSubmit={saveStudent}>
        <div className="row g-3">
          <Field label="Student ID" name="id" value={studentForm.id} onChange={changeStudent} disabled={Boolean(editingStudent)} required={!editingStudent} placeholder="26-1-0001" />
          <Field label="Full Name" name="name" value={studentForm.name} onChange={changeStudent} required />
          <Field label="Email" name="email" value={studentForm.email} onChange={changeStudent} type="email" />
          <Field label="Phone" name="phone" value={studentForm.phone} onChange={changeStudent} />
          <Field label="Program / Department" name="dept" value={studentForm.dept} onChange={changeStudent} required />
          <Field label="Level" name="level" value={studentForm.level} onChange={changeStudent} />
          <Field label="Gender" name="gender" value={studentForm.gender} onChange={changeStudent} />
          <Field label="Address" name="address" value={studentForm.address} onChange={changeStudent} col="col-12" />
          {editingStudent && <><Field label="Enrollment Date" name="date" value={studentForm.date} onChange={changeStudent} type="date" /><Field label="Time" name="time" value={studentForm.time} onChange={changeStudent} /></>}
        </div>
        <div className="modal-footer px-0 pb-0 mt-4"><button type="button" className="btn btn-secondary" onClick={() => setStudentModal(false)}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : editingStudent ? "Update Student" : "Add Student"}</button></div>
      </form>
    </Modal>

    <Modal open={scheduleModal} title={editingDate ? "Edit Enrollment Schedule" : "Add Enrollment Schedule"} close={() => setScheduleModal(false)}>
      <form onSubmit={saveSchedule}>
        <div className="row g-3">
          <Field label="Enrollment Date" name="date" value={scheduleForm.date} onChange={changeSchedule} type="date" required />
          <Field label="Maximum Slots" name="maxSlots" value={scheduleForm.maxSlots} onChange={changeSchedule} type="number" min="1" required />
          <Field label="Maximum Per Time Slot" name="perSlotMax" value={scheduleForm.perSlotMax} onChange={changeSchedule} type="number" min="1" placeholder="Auto" />
          <Field label="Enrollment Deadline" name="deadline" value={scheduleForm.deadline} onChange={changeSchedule} type="date" />
          <div className="col-md-6"><label className="form-label">Status</label><select className="form-select" name="status" value={scheduleForm.status} onChange={changeSchedule}><option value="Announced">Announced / Open</option><option value="Unannounced">Unannounced / Closed</option></select></div>
        </div>
        <div className="alert alert-light border mt-4 mb-0"><i className="bi bi-info-circle me-2" />Students can only book announced schedules with available capacity.</div>
        <div className="modal-footer px-0 pb-0 mt-4"><button type="button" className="btn btn-secondary" onClick={() => setScheduleModal(false)}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : editingDate ? "Update Schedule" : "Create Schedule"}</button></div>
      </form>
    </Modal>
    <Footer />
  </>;
}

function Info({ label, value }) { return <div className="col-sm-6"><div className="bg-light rounded-3 p-3"><small className="text-secondary">{label}</small><strong className="d-block mt-1">{value || "—"}</strong></div></div>; }
function Loading() { return <div className="text-center py-4"><div className="spinner-border text-primary" /></div>; }
function Modal({ open, title, close, children }) { if (!open) return null; return <><div className="modal fade show d-block" tabIndex="-1"><div className="modal-dialog modal-lg modal-dialog-scrollable"><div className="modal-content border-0 shadow-lg"><div className="modal-header"><h5 className="modal-title fw-bold">{title}</h5><button type="button" className="btn-close" onClick={close} /></div><div className="modal-body">{children}</div></div></div></div><div className="modal-backdrop fade show" onClick={close} /></>; }
function Field({ label, name, value, onChange, type = "text", required = false, disabled = false, col = "col-md-6", placeholder = "" }) { return <div className={col}><label className="form-label">{label}</label><input className="form-control" name={name} type={type} value={value ?? ""} onChange={onChange} required={required} disabled={disabled} placeholder={placeholder} /></div>; }
function Stat({ title, value, icon }) { return <div className="col-sm-6 col-xl-3"><div className="dashboard-card p-4 h-100"><div className="d-flex justify-content-between"><small className="text-secondary">{title}</small><i className={`bi ${icon} text-primary fs-5`} /></div><div className="display-6 fw-bold mt-2">{value}</div></div></div>; }


