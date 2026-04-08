import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/imposter", emoji: "🕵️", label: "Imposter" },
  { to: "/piccolo", emoji: "🎉", label: "Piccolo" },
  { to: "/quiz", emoji: "🧠", label: "Quiz" },
  { to: "/chess", emoji: "♟️", label: "Schach" },
];

export function Layout() {
  return (
    <div className="app-shell">
      <nav className="top-nav">
        <NavLink to="/" className="top-nav__brand">
          🎮 PlayBox
        </NavLink>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `top-nav__link${isActive ? " top-nav__link--active" : ""}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main className="page-main">
        <div className="page-container">
          <Outlet />
        </div>
      </main>
      <nav className="bottom-nav" aria-label="Spiele-Navigation">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `bottom-nav__item${isActive ? " bottom-nav__item--active" : ""}`
          }
        >
          <span className="bottom-nav__icon">🎮</span>
          <span className="bottom-nav__label">Home</span>
        </NavLink>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `bottom-nav__item${isActive ? " bottom-nav__item--active" : ""}`
            }
          >
            <span className="bottom-nav__icon">{item.emoji}</span>
            <span className="bottom-nav__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

