import { Outlet, Link } from "react-router-dom";

export function Layout() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <nav
        style={{
          padding: "1rem 1.5rem",
          background: "var(--bg-surface)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          gap: "1.5rem",
          alignItems: "center",
          flexWrap: "wrap",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Link to="/" style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: "bold", fontSize: "1.2rem" }}>
          🎮 PlayBox
        </Link>
        <Link to="/imposter" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Imposter</Link>
        <Link to="/piccolo"  style={{ color: "var(--text-muted)", textDecoration: "none" }}>Piccolo</Link>
        <Link to="/quiz"     style={{ color: "var(--text-muted)", textDecoration: "none" }}>Quiz</Link>
        <Link to="/chess"    style={{ color: "var(--text-muted)", textDecoration: "none" }}>Chess</Link>
      </nav>
      <main style={{ flex: 1, padding: "2rem", background: "var(--bg-base)" }}>
        <Outlet />
      </main>
    </div>
  );
}

