import { render, screen } from "@testing-library/react";
import { vi, beforeEach, afterEach } from "vitest";
import App from "./App";

// Stub localStorage so no stored token is visible during tests
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

// Prevent real network calls; auth /me check returns 401 in test env
beforeEach(() => {
  vi.stubGlobal("localStorage", localStorageMock);
  localStorageMock.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ success: false, message: "Unauthorized" }),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App — unauthenticated state", () => {
  it("renders without crashing", () => {
    render(<App />);
  });

  it("shows the login page when no auth token is stored", async () => {
    render(<App />);
    // The login hero section always contains this tagline
    expect(screen.getByText(/Python Learning Studio/i)).toBeInTheDocument();
  });

  it("shows a login form with name and password fields", () => {
    render(<App />);
    expect(screen.getByPlaceholderText("Alex Kim")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("........")).toBeInTheDocument();
  });

  it("shows an Enter Workspace submit button by default", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /enter workspace/i })).toBeInTheDocument();
  });
});

// ─── Utility function tests (pure, no DOM needed) ──────────────────────────

describe("stripMachineBlocks (inferred behaviour)", () => {
  // Test by rendering nothing — just verifying the app module loads cleanly
  it("app module exports a default React component", async () => {
    const mod = await import("./App");
    expect(typeof mod.default).toBe("function");
  });
});
