import { NavLink, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="app-shell">
      <nav className="top-nav">
        <NavLink to="/" className="top-nav__brand">
          🎮 PlayBox
        </NavLink>
        <NavLink to="/imposter" className={({ isActive }) => `top-nav__link${isActive ? " top-nav__link--active" : ""}`}>
          Imposter
        </NavLink>
        <NavLink to="/piccolo" className={({ isActive }) => `top-nav__link${isActive ? " top-nav__link--active" : ""}`}>
          Piccolo
        </NavLink>
        <NavLink to="/quiz" className={({ isActive }) => `top-nav__link${isActive ? " top-nav__link--active" : ""}`}>
          Quiz
        </NavLink>
        <NavLink to="/chess" className={({ isActive }) => `top-nav__link${isActive ? " top-nav__link--active" : ""}`}>
          Chess
        </NavLink>
      </nav>
      <main className="page-main">
        <div className="page-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

