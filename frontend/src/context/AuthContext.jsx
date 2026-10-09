import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    api.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => setUser(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) { /* ignore */ }
    setUser(false);
  };

  const canWrite = user && (user.role === "Admin" || user.role === "SuperAdmin" || user.role === "SiteEngineer");

  return (
    <AuthContext.Provider value={{ user, login, logout, canWrite,
        isAdmin: user?.role === "Admin",
        isSuperAdmin: user?.role === "SuperAdmin",
        tenantId: user?.tenant_id ?? null }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
