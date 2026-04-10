import { Link } from "react-router-dom";
import { useTranslation } from "./i18n";
import { coreTranslations } from "./translations";

export function NotFound() {
  const { t } = useTranslation(coreTranslations);
  return (
    <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
      <h1 style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>404</h1>
      <p className="muted-text" style={{ marginBottom: "1.5rem" }}>
        {t("notFound.message")}
      </p>
      <Link to="/" className="button button--primary" style={{ display: "inline-block", padding: "0.75rem 1.5rem" }}>
        {t("notFound.backHome")}
      </Link>
    </div>
  );
}
