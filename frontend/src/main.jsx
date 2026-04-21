import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "highlight.js/styles/github-dark.css";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { RouterProvider } from "./contexts/RouterContext.jsx";
import { AppProvider } from "./contexts/AppContext.jsx";
import { ClassProvider } from "./contexts/ClassContext.jsx";

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AppProvider>
      <RouterProvider>
        <AuthProvider>
          <ClassProvider>
            <App />
          </ClassProvider>
        </AuthProvider>
      </RouterProvider>
    </AppProvider>
  </React.StrictMode>
);
