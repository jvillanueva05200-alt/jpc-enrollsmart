import React, { useEffect, useState } from "react";

function getInitialTheme() {
  const saved = localStorage.getItem("enrollsmart_theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function Header() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const role = localStorage.getItem("enrollsmart_role");
  const dashboard = role === "admin" ? "/admin" : role === "student" ? "/student" : "/login";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("enrollsmart_theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(value => value === "dark" ? "light" : "dark");
  }

  return <header className="site-header navbar navbar-expand-lg navbar-dark sticky-top">
    <div className="container py-2">
      <a className="navbar-brand d-flex align-items-center gap-2" href="/">
        <img src="/assets/images/john-paul-college-logo.png" alt="John Paul College" className="brand-logo" />
        <span><strong>JPC ENROLLSMART</strong><small className="d-block text-white-50">John Paul College</small></span>
      </a>
      <div className="d-flex align-items-center gap-2 order-lg-3">
        <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
          <i className={`bi ${theme === "dark" ? "bi-sun-fill" : "bi-moon-stars-fill"}`} />
          <span className="d-none d-sm-inline">{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
        <button className="navbar-toggler" type="button" aria-expanded={open} onClick={() => setOpen(v => !v)}><span className="navbar-toggler-icon" /></button>
      </div>
      <nav className={`collapse navbar-collapse ${open ? "show" : ""}`}>
        <div className="navbar-nav ms-auto align-items-lg-center gap-lg-2">
          <a className="nav-link" href="/" onClick={() => setOpen(false)}>Home</a>
          <a className="nav-link" href="/#enrollment" onClick={() => setOpen(false)}>Enrollment</a>
          <a className="nav-link" href="/#programs" onClick={() => setOpen(false)}>Programs</a>
          <a className="nav-link" href="/#features" onClick={() => setOpen(false)}>Features</a>
          <a className="nav-link" href="/#how-it-works" onClick={() => setOpen(false)}>How it works</a>
          <a className="btn btn-primary ms-lg-2 px-4" href={dashboard} onClick={() => setOpen(false)}>{role ? "Dashboard" : "Get Started"}</a>
        </div>
      </nav>
    </div>
  </header>;
}
