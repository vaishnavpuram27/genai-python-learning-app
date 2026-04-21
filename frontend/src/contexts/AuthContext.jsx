import { createContext, useContext, useEffect, useState } from "react";
import { API_BASE, AUTH_TOKEN_KEY } from "../utils/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [viewRole, setViewRole] = useState("student");
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const apiUser = data?.data?.user;
        if (apiUser) {
          setUser(apiUser);
          setViewRole(apiUser.role);
        } else {
          localStorage.removeItem(AUTH_TOKEN_KEY);
        }
      })
      .catch(() => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
      });
  }, []);

  // Keep viewRole in sync when user changes
  useEffect(() => {
    if (!user) return;
    setViewRole(user.role === "teacher" ? "teacher" : "student");
  }, [user]);

  const isTeacher = user?.role === "teacher";
  const isTeacherView = viewRole === "teacher";

  return (
    <AuthContext.Provider value={{
      user, setUser,
      viewRole, setViewRole,
      userMenuOpen, setUserMenuOpen,
      isTeacher,
      isTeacherView,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
