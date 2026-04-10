import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "./i18n";
import { coreTranslations } from "./translations";

export function Layout() {
  const { t, lang, setLang } = useTranslation(coreTranslations);

  const navItems = [
    { to: "/imposter", emoji: "🕵️", labelKey: "nav.imposter" },
    { to: "/piccolo", emoji: "🎉", labelKey: "nav.piccolo" },
    { to: "/quiz", emoji: "🧠", labelKey: "nav.quiz" },
    { to: "/chess", emoji: "♟️", labelKey: "nav.chess" },
  ];

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
            {t(item.labelKey)}
          </NavLink>
        ))}
        <button
          type="button"
          className="lang-toggle"
          onClick={() => setLang(lang === "de" ? "en" : "de")}
          aria-label={lang === "de" ? "Switch to English" : "Auf Deutsch wechseln"}
        >
          {lang === "de" ? "EN" : "DE"}
        </button>
      </nav>
      <main className="page-main">
        <div className="page-container">
          <Outlet />
        </div>
      </main>
      <nav className="bottom-nav" aria-label={t("nav.ariaLabel")}>
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `bottom-nav__item${isActive ? " bottom-nav__item--active" : ""}`
          }
        >
          <span className="bottom-nav__icon">🎮</span>
          <span className="bottom-nav__label">{t("nav.home")}</span>
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
            <span className="bottom-nav__label">{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
