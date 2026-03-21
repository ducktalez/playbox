import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./core/Layout";
import { Home } from "./core/Home";

// Lazy load game modules
const ImposterGame = React.lazy(() => import("./games/imposter/ImposterGame"));
const PiccoloGame = React.lazy(() => import("./games/piccolo/PiccoloGame"));
const QuizGame = React.lazy(() => import("./games/quiz/QuizGame"));
const ChessGame = React.lazy(() => import("./games/chess/ChessGame"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route
            path="imposter/*"
            element={
              <React.Suspense fallback={<div>Loading...</div>}>
                <ImposterGame />
              </React.Suspense>
            }
          />
          <Route
            path="piccolo/*"
            element={
              <React.Suspense fallback={<div>Loading...</div>}>
                <PiccoloGame />
              </React.Suspense>
            }
          />
          <Route
            path="quiz/*"
            element={
              <React.Suspense fallback={<div>Loading...</div>}>
                <QuizGame />
              </React.Suspense>
            }
          />
          <Route
            path="chess/*"
            element={
              <React.Suspense fallback={<div>Loading...</div>}>
                <ChessGame />
              </React.Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

