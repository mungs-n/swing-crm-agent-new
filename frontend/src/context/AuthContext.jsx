import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { api } from "../api";

const AuthContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8600";
const STORAGE_KEY = "athlepa_crm_token";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // {token, company_id, company_name, dataset_source}
  const [onboarding, setOnboarding] = useState(null); // 가입 직후에만 채워짐 {api_key, webhook_secret}
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) {
      setChecking(false);
      return;
    }
    fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setSession)
      .catch(() => localStorage.removeItem(STORAGE_KEY))
      .finally(() => setChecking(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "로그인에 실패했어요.");
    }
    const data = await res.json();
    api.clearCache();
    localStorage.setItem(STORAGE_KEY, data.token);
    setSession(data);
  }, []);

  const signup = useCallback(async (companyName, email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: companyName, email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "가입에 실패했어요.");
    }
    const data = await res.json();
    api.clearCache();
    localStorage.setItem(STORAGE_KEY, data.token);
    setSession(data);
    setOnboarding({ api_key: data.api_key, webhook_secret: data.webhook_secret });
  }, []);

  const logout = useCallback(() => {
    const token = localStorage.getItem(STORAGE_KEY);
    if (token) {
      fetch(`${API_BASE}/api/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
    api.clearCache();
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const dismissOnboarding = useCallback(() => setOnboarding(null), []);

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem(STORAGE_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const value = { session, checking, onboarding, login, signup, logout, dismissOnboarding, authHeaders };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
