import React, { useEffect, useRef, useState } from "react";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { GoogleAuthProvider, RecaptchaVerifier, signInWithPhoneNumber, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase.js";

const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

async function finishFirebaseLogin(user, profile = {}) {
  const idToken = await user.getIdToken(true);
  const response = await fetch(`${API}/api/auth/firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, studentId: profile.studentId || "", name: profile.name || user.displayName || "" })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Authentication failed.");
  localStorage.setItem("enrollsmart_token", data.token);
  localStorage.setItem("enrollsmart_role", data.type);
  if (data.type === "admin") {
    localStorage.removeItem("enrollsmart_student_id");
    window.location.href = "/admin";
    return;
  }
  localStorage.setItem("enrollsmart_student_id", data.id || "");
  localStorage.setItem("enrollsmart_student_name", data.name || user.displayName || "");
  window.location.href = "/student";
}

function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10 0 19.1-7.2 19.1-20 0-1.3-.2-2.4-.5-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.2 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z"/><path fill="#4CAF50" d="M24 44c5.1 0 9.8-1.9 13.3-5.1l-6.1-5.1C29.6 35.2 26.9 36 24 36c-5.2 0-9.7-3.5-11.3-8.2l-6.5 5C9.6 39.5 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.2 5.7-6.1 7.3l6.1 5.1C38.9 37.2 43 31.2 43 24c0-1.3-.2-2.4-.5-3.5z"/></svg>;
}

export default function Login() {
  const [method, setMethod] = useState("google");
  const [studentId, setStudentId] = useState(localStorage.getItem("enrollsmart_student_id") || "");
  const [fullName, setFullName] = useState(localStorage.getItem("enrollsmart_student_name") || "");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const recaptcha = useRef(null);

  useEffect(() => () => { if (window.__enrollsmartRecaptcha) { window.__enrollsmartRecaptcha.clear(); window.__enrollsmartRecaptcha = null; } }, []);

  function profileValid() {
    if (!fullName.trim() || fullName.trim().length < 2) { setMessage("Please enter your full name."); return false; }
    if (studentId.trim() && !/^\d{2}-\d-\d{4}$/.test(studentId.trim())) { setMessage("Student ID must look like 26-1-0001."); return false; }
    return true;
  }

  async function googleLogin() {
    setMessage("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      await finishFirebaseLogin(result.user, { studentId: studentId.trim(), name: fullName.trim() });
    } catch (error) { setMessage(firebaseMessage(error)); }
    finally { setLoading(false); }
  }

  function normalizePhone(value) {
    const digits = value.replace(/\D/g, "");
    if (digits.startsWith("09") && digits.length === 11) return `+63${digits.slice(1)}`;
    if (digits.startsWith("63") && digits.length === 12) return `+${digits}`;
    if (digits.startsWith("9") && digits.length === 10) return `+63${digits}`;
    return value.startsWith("+") ? `+${digits}` : value;
  }

  async function sendCode(event) {
    event.preventDefault(); setMessage("");
    if (!profileValid()) return;
    setLoading(true);
    try {
      const formatted = normalizePhone(phone);
      if (!/^\+639\d{9}$/.test(formatted)) throw new Error("Enter a valid Philippine mobile number, e.g. 09171234567.");
      if (!window.__enrollsmartRecaptcha) {
        if (!recaptcha.current) throw new Error("reCAPTCHA is not ready. Refresh the page and try again.");
        window.__enrollsmartRecaptcha = new RecaptchaVerifier(auth, recaptcha.current, { size: "normal" });
      }
      const result = await signInWithPhoneNumber(auth, formatted, window.__enrollsmartRecaptcha);
      setConfirmation(result); setMessage("Verification code sent. If you are using a Firebase test number, no SMS will be sent—use the code you configured in Firebase.");
    } catch (error) { setMessage(firebaseMessage(error)); if (window.__enrollsmartRecaptcha) { window.__enrollsmartRecaptcha.clear(); window.__enrollsmartRecaptcha = null; } }
    finally { setLoading(false); }
  }

  async function verifyCode(event) {
    event.preventDefault(); if (!confirmation) return; setMessage(""); setLoading(true);
    try { const result = await confirmation.confirm(code.trim()); await finishFirebaseLogin(result.user, { studentId: studentId.trim(), name: fullName.trim() }); }
    catch (error) { setMessage(firebaseMessage(error)); }
    finally { setLoading(false); }
  }

  return <><Header /><main className="auth-page min-vh-100 py-5"><div className="container py-lg-4"><div className="login-layout mx-auto"><section className="login-intro"><div className="login-glow" /><span className="hero-badge"><i className="bi bi-shield-check" /> STUDENT & ADMIN PORTAL</span><img src="/assets/images/john-paul-college-logo.png" alt="John Paul College" className="login-campus-logo" /><h1 className="display-5 fw-bold mt-4">Welcome to<br /><span>JPC EnrollSmart.</span></h1><p className="lead mt-3">Sign in securely with your Google account to access your authorized JPC EnrollSmart portal.</p><div className="login-points"><div><i className="bi bi-shield-check" /><span>Secure Firebase authentication</span></div><div><i className="bi bi-calendar2-check" /><span>Fast enrollment appointment booking</span></div><div><i className="bi bi-phone" /><span>Google authentication for students and administrators</span></div></div></section>
      <section className="card auth-card login-panel border-0"><div className="card-body p-4 p-lg-5"><div className="text-center mb-4"><img src="/assets/images/enrollsmart-logo.png" alt="JPC ENROLLSMART" className="auth-logo mb-3" /><h2 className="h3 fw-bold mb-2">Sign in to EnrollSmart</h2><p className="text-secondary mb-0">Continue with your Google account. Your authorized role determines which dashboard opens.</p></div>
        {message && <div className={`alert ${message.toLowerCase().includes("sent") ? "alert-success" : "alert-danger"}`}>{message}</div>}
        <div className="profile-fields mb-4"><div className="row g-3"><div className="col-md-6"><label className="form-label"><i className="bi bi-person-vcard me-1" /> Student ID Number <span className="text-secondary fw-normal">(optional)</span></label><input className="form-control form-control-lg" value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="26-1-0001" autoComplete="off" disabled={loading || !!confirmation} /></div><div className="col-md-6"><label className="form-label"><i className="bi bi-person me-1" /> Full Name <span className="text-secondary fw-normal">(optional for Google sign-in)</span></label><input className="form-control form-control-lg" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Juan Dela Cruz" autoComplete="name" required disabled={loading || !!confirmation} /></div></div></div>
        {method === "google" ? <><button className="google-login-btn" onClick={googleLogin} disabled={loading}><GoogleMark /><span>{loading ? "Connecting to Google..." : "Continue with Google"}</span></button><p className="text-secondary small text-center mt-3 mb-0">Your Google account is verified by Firebase. You can complete your student profile after signing in.</p><button type="button" className="btn btn-link w-100 mt-2" onClick={() => { setMethod("phone"); setMessage(""); }}>Use mobile verification instead</button></> : <><button type="button" className="btn btn-link w-100 mb-2" onClick={() => { setMethod("google"); setConfirmation(null); setMessage(""); }}>Use Google sign-in</button>{!confirmation ? <form onSubmit={sendCode}><label className="form-label">Mobile Number</label><input className="form-control form-control-lg" value={phone} onChange={e => setPhone(e.target.value)} placeholder="09171234567" inputMode="tel" autoComplete="tel" required disabled={loading} /><div id="recaptcha-container" ref={recaptcha} className="mt-3" /><button className="btn btn-primary w-100 mt-3 py-3 fw-semibold" disabled={loading}>{loading ? "Preparing verification..." : "Send Verification Code"}</button></form> : <form onSubmit={verifyCode} className="phone-step"><label className="form-label">Verification Code</label><input className="form-control form-control-lg" value={code} onChange={e => setCode(e.target.value)} placeholder="123456" inputMode="numeric" maxLength={6} required disabled={loading} /><button className="btn btn-primary w-100 mt-3 py-3 fw-semibold" disabled={loading}>{loading ? "Verifying..." : "Verify and Continue"}</button><button type="button" className="btn btn-link w-100 mt-2" onClick={() => { setConfirmation(null); setCode(""); setMessage(""); }}>Use another number</button></form>}</>}
        <div className="text-center mt-4"><a href="/">Home</a></div>
      </div></section></div></div></main><Footer /></>;
}

function firebaseMessage(error) {
  const messages = {
    "auth/popup-closed-by-user": "Isinara ang Google Login window bago matapos.",
    "auth/popup-blocked": "Na-block ng browser ang Google Login popup.",
    "auth/unauthorized-domain": "Hindi authorized ang domain na ito sa Firebase Authentication.",
    "auth/operation-not-allowed": "Hindi naka-enable ang authentication method na ito sa Firebase.",
    "auth/invalid-phone-number": "Invalid mobile number. Use a complete Philippine mobile number.",
    "auth/too-many-requests": "Masyadong maraming attempts. Subukan muli mamaya.",
    "auth/invalid-verification-code": "Mali ang verification code.",
    "auth/quota-exceeded": "Naabot ang Firebase SMS quota. Para sa actual SMS, tingnan ang Firebase billing/SMS requirements.",
    "auth/captcha-check-failed": "Hindi na-verify ang reCAPTCHA. I-refresh ang page at subukan muli.",
    "auth/network-request-failed": "Network error. Siguraduhing gumagana ang internet connection."
  };
  return messages[error.code] || error.message || "Authentication failed.";
}
