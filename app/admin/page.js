
"use client";

import { useEffect, useState } from "react";

async function api(action, data = {}) {
  const response = await fetch("/api/padel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ action, ...data }),
  });

  const text = await response.text();
  let result = {};

  try {
    result = text ? JSON.parse(text) : {};
  } catch {}

  if (!response.ok) {
    throw new Error(
      result.error ||
      result.message ||
      `Error API (${response.status})`
    );
  }

  return result;
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api("admin-status")
      .then((result) => {
        if (!cancelled) {
          setAuthenticated(result.authenticated === true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setNotice(error.message);
          setIsError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");

    try {
      await api("admin-login", { password });
      setPassword("");
      setAuthenticated(true);
      setNotice("Sesión de administrador iniciada.");
      setIsError(false);
    } catch (error) {
      setNotice(error.message);
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;

    setBusy(true);

    try {
      await api("admin-logout");
      setAuthenticated(false);
      setNotice("Has cerrado la sesión.");
      setIsError(false);
    } catch (error) {
      setNotice(error.message);
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  const buttonStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    boxSizing: "border-box",
    padding: "17px",
    borderRadius: 12,
    color: "white",
    textDecoration: "none",
    fontSize: 17,
    fontWeight: 700,
    border: 0,
    cursor: "pointer",
    textAlign: "center",
  };

  const panelStyle = {
    background: "white",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: 22,
    marginBottom: 16,
    boxShadow: "0 2px 8px rgba(15,23,42,.04)",
  };

  const inputStyle = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: 12,
    margin: "8px 0 16px",
    border: "1px solid #CBD5E1",
    borderRadius: 9,
    fontSize: 16,
    background: "white",
    color: "#0F172A",
  };

  if (checking) {
    return (
      <main
        style={{
          maxWidth: 700,
          margin: "40px auto",
          padding: 20,
          fontFamily: "Arial,sans-serif",
        }}
      >
        Comprobando la sesión de administrador…
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 700,
        margin: "28px auto",
        padding: "0 16px 40px",
        fontFamily: "Arial,sans-serif",
        color: "#0F172A",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>
          🎾 Administración de pádel
        </h1>

        <p style={{ color: "#64748B", margin: 0 }}>
          Selecciona qué gestión quieres realizar.
        </p>
      </header>

      {notice && (
        <div
          role="status"
          style={{
            padding: 12,
            borderRadius: 9,
            marginBottom: 16,
            background: isError ? "#FEF2F2" : "#ECFDF5",
            color: isError ? "#991B1B" : "#065F46",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {notice}
        </div>
      )}

      {!authenticated ? (
        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>
            🔐 Acceso de administrador
          </h2>

          <form onSubmit={login}>
            <label htmlFor="admin-password">
              Contraseña de administrador
            </label>

            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              required
              style={inputStyle}
            />

            <button
              type="submit"
              disabled={busy}
              style={{
                ...buttonStyle,
                background: "#0F766E",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section style={panelStyle}>
            <h2 style={{ marginTop: 0 }}>
              🎾 Gestión de pozos
            </h2>

            <p style={{ color: "#64748B", lineHeight: 1.5 }}>
              Crear pozos, establecer horarios y duración,
              elegir el número de titulares y gestionar
              participantes y reservas.
            </p>

            <a
              href="/admin/pozos"
              style={{
                ...buttonStyle,
                background: "#7C3AED",
              }}
            >
              🎾 Gestionar pozo
            </a>
          </section>

          <section style={panelStyle}>
            <h2 style={{ marginTop: 0 }}>
              Gestionar partidas
            </h2>

            <p style={{ color: "#64748B", lineHeight: 1.5 }}>
              Apunta jugadores o elimina inscripciones desde
              pantallas separadas.
            </p>

            <a
              href="/admin/apuntar"
              style={{
                ...buttonStyle,
                background: "#0F766E",
                marginBottom: 12,
              }}
            >
              ➕ Apuntar jugadores
            </a>

            <a
              href="/admin/eliminar"
              style={{
                ...buttonStyle,
                background: "#DC2626",
              }}
            >
              🗑️ Eliminar jugadores
            </a>
          </section>

          <section style={panelStyle}>
            <h2 style={{ marginTop: 0 }}>
              Gestión de cuentas
            </h2>

            <p style={{ color: "#64748B", lineHeight: 1.5 }}>
              Crear invitaciones para nuevos jugadores y
              restablecer PIN.
            </p>

            <a
              href="/admin/opciones"
              style={{
                ...buttonStyle,
                background: "#4F46E5",
              }}
            >
              ⚙️ Invitaciones y PIN
            </a>
          </section>

          <button
            type="button"
            onClick={logout}
            disabled={busy}
            style={{
              ...buttonStyle,
              background: "#374151",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </>
      )}
    </main>
  );
}
