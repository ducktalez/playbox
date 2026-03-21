import { Outlet, Link } from "react-router-dom";

export function Layout() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav
        style={{
          padding: "1rem",
          background: "#1a1a2e",
          color: "#fff",
          display: "flex",
          gap: "1.5rem",
          alignItems: "center",
        }}
      >
        <Link to="/" style={{ color: "#fff", textDecoration: "none", fontWeight: "bold", fontSize: "1.2rem" }}>
          🎮 PlayBox
        </Link>
        <Link to="/imposter" style={{ color: "#e0e0e0", textDecoration: "none" }}>
          Imposter
        </Link>
        <Link to="/piccolo" style={{ color: "#e0e0e0", textDecoration: "none" }}>
          Piccolo
        </Link>
        <Link to="/quiz" style={{ color: "#e0e0e0", textDecoration: "none" }}>
          Quiz
        </Link>
        <Link to="/chess" style={{ color: "#e0e0e0", textDecoration: "none" }}>
          Chess
        </Link>
      </nav>
      <main style={{ flex: 1, padding: "2rem" }}>
        <Outlet />
      </main>
    </div>
  );
}

