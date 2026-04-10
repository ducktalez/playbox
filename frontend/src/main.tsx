import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import { Layout } from "./core/Layout";
import { Home } from "./core/Home";
import { NotFound } from "./core/NotFound";
import { syncAllOfflineData } from "./core/offlineManager";
import { I18nProvider } from "./core/i18n";

// Sync offline bundles on app start (non-blocking, best-effort)
syncAllOfflineData().catch(() => {});

const Fallback = () => (
  <div style={{ color: "var(--text-muted)", padding: "2rem" }}>…</div>
);

// Lazy load game modules
const ImposterGame = React.lazy(() => import("./games/imposter/ImposterGame"));
const PiccoloGame = React.lazy(() => import("./games/piccolo/PiccoloGame"));
const QuizGame = React.lazy(() => import("./games/quiz/QuizGame"));
const ChessGame = React.lazy(() => import("./games/chess/ChessGame"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route
              path="imposter/*"
              element={
                <React.Suspense fallback={<Fallback />}>
                  <ImposterGame />
                </React.Suspense>
              }
            />
            <Route
              path="piccolo/*"
              element={
                <React.Suspense fallback={<Fallback />}>
                  <PiccoloGame />
                </React.Suspense>
              }
            />
            <Route
              path="quiz/*"
              element={
                <React.Suspense fallback={<Fallback />}>
                  <QuizGame />
                </React.Suspense>
              }
            />
            <Route
              path="chess/*"
              element={
                <React.Suspense fallback={<Fallback />}>
                  <ChessGame />
                </React.Suspense>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>
);
