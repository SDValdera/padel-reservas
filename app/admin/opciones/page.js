
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

  try { result = text ? JSON.parse(text) : {}; } catch {}

  if (!response.ok) {
    throw new Error(result.error || result.message || `Error API (${response.status})`);
  }

  return result;
}

const buttonStyle = {
  padding: "12px 16px",
  border: 0,
  borderRadius: 9,
  color: "white",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
  textAlign: "center",
};

const inputStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: 12,
  margin: "8px 0 16px",
  border: "1px solid #CBD5E1",
  borderRadius: 9,
  fontSize: 15,
  background: "white",
  color: "#0F172A",
};

export default function AdminOpcionesPage() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);

  const [inviteName, setInviteName] = useState("");
  const [inviteResult, setInviteResult] = useState(null);
  const [resetName, setResetName] = useState("");
  const [resetResult, setResetResult] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const status = await api("admin-status");
        if (cancelled) return;

        if (status.authenticated !== true) {
          setAuthenticated(false);
          return;
        }

        setAuthenticated(true);

        const result = await api("admin-list-accounts");
        if (cancelled) return;

        const loadedAccounts = result.accounts || [];
        setAccounts(loadedAccounts);
        setResetName(loadedAccounts[0]?.name || "");
      } catch (error) {
        if (!cancelled) {
          setNotice(error.message);
          setIsError(true);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    initialize();
    return () => { cancelled = true; };
  }, []);

  async function createInvite(event) {
    event.preventDefault();
    if (busy) return;

    const name = inviteName.trim();

    if (name.length < 2 || name.length > 60) {
      setNotice("El nombre debe tener entre 2 y 60 caracteres.");
      setIsError(true);
      return;
    }

    setBusy(true);
    setNotice("");
    setInviteResult(null);

    try {
      const result = await api("create-invite", { name });
      setInviteResult(result);
      setInviteName("");
      setNotice(`Invitación creada para ${result.name}.`);
      setIsError(false);
    } catch (error) {
      setNotice(error.message);
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function resetPin(event) {
    event.preventDefault();
    if (busy || !resetName) return;

    setBusy(true);
    setNotice("");
    setResetResult(null);

    try {
      const result = await api("admin-reset-pin", { name: resetName });
      setResetResult(result);
      setNotice(`PIN temporal generado para ${result.name}.`);
      setIsError(false);
    } catch (error) {
      setNotice(error.message);
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function copyText(value, label) {
    try {
      await navigator.clipboard.writeText(String(value));
      setNotice(`${label} copiado al portapapeles.`);
      setIsError(false);
    } catch {
      setNotice("No se ha podido copiar automáticamente. Selecciona y copia el texto manualmente.");
      setIsError(true);
    }
  }

  if (checking) {
    return (
      <main style={{ maxWidth: 700, margin: "40px auto", padding: 20, fontFamily: "Arial,sans-serif" }}>
        Comprobando sesión…
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main style={{ maxWidth: 700, margin: "40px auto", padding: 20, fontFamily: "Arial,sans-serif" }}>
        <h1>Acceso de administrador necesario</h1>
        <p>Inicia sesión desde el menú del administrador para continuar.</p>
        <a href="/admin" style={{ ...buttonStyle, background: "#475569" }}>
          ← Volver al inicio del administrador
        </a>
      </main>
    );
  }

  return (
    <main style={{
      maxWidth: 700,
      margin: "28px auto",
      padding: "0 16px 40px",
      fontFamily: "Arial,sans-serif",
      color: "#0F172A",
    }}>
      <a href="/admin" style={{ ...buttonStyle, background: "#475569", marginBottom: 20 }}>
        ← Volver al inicio del administrador
      </a>

      <h1 style={{ fontSize: 28 }}>⚙️ Invitaciones y PIN</h1>
      <p style={{ color: "#64748B", lineHeight: 1.5 }}>
        Administra las cuentas sin mezclar estas operaciones con las inscripciones.
      </p>

      {notice && (
        <div role="status" style={{
          padding: 12,
          borderRadius: 9,
          marginBottom: 16,
          background: isError ? "#FEF2F2" : "#ECFDF5",
          color: isError ? "#991B1B" : "#065F46",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}>
          {notice}
        </div>
      )}

      <section style={{
        background: "white",
        border: "1px solid #DBEAFE",
        borderRadius: 14,
        padding: 20,
        marginBottom: 18,
      }}>
        <h2 style={{ marginTop: 0 }}>✉️ Crear invitación</h2>
        <p style={{ color: "#64748B", lineHeight: 1.5 }}>
          Genera un código para que un jugador nuevo pueda registrar su cuenta.
        </p>

        <form onSubmit={createInvite}>
          <label htmlFor="invite-name">Nombre del jugador</label>
          <input
            id="invite-name"
            value={inviteName}
            onChange={(event) => setInviteName(event.target.value)}
            minLength={2}
            maxLength={60}
            required
            style={inputStyle}
          />

          <button type="submit" disabled={busy} style={{
            ...buttonStyle,
            background: "#2563EB",
            opacity: busy ? 0.7 : 1,
          }}>
            {busy ? "Creando…" : "Crear invitación"}
          </button>
        </form>

        {inviteResult && (
          <div style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 10,
            background: "#EFF6FF",
            overflowWrap: "anywhere",
          }}>
            <strong>Invitación para {inviteResult.name}</strong>
            <p>Código de invitación:</p>
            <code style={{ overflowWrap: "anywhere" }}>{inviteResult.code}</code>
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => copyText(inviteResult.code, "Código")}
                style={{ ...buttonStyle, background: "#1D4ED8" }}
              >
                Copiar código
              </button>
            </div>
            <p style={{ color: "#475569", fontSize: 12 }}>
              Comparte el código con el jugador para que pueda registrar su cuenta.
            </p>
          </div>
        )}
      </section>

      <section style={{
        background: "white",
        border: "1px solid #DDD6FE",
        borderRadius: 14,
        padding: 20,
      }}>
        <h2 style={{ marginTop: 0 }}>🔑 Restablecer PIN</h2>
        <p style={{ color: "#64748B", lineHeight: 1.5 }}>
          Genera un PIN temporal para una cuenta existente. El jugador tendrá que cambiarlo al entrar.
        </p>

        <form onSubmit={resetPin}>
          <label htmlFor="reset-player">Jugador</label>
          <select
            id="reset-player"
            value={resetName}
            onChange={(event) => setResetName(event.target.value)}
            required
            style={inputStyle}
          >
            <option value="">Selecciona un jugador…</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.name}>
                {account.name}
              </option>
            ))}
          </select>

          <button type="submit" disabled={busy || !accounts.length} style={{
            ...buttonStyle,
            background: "#7C3AED",
            opacity: busy ? 0.7 : 1,
          }}>
            {busy ? "Generando…" : "Generar PIN temporal"}
          </button>
        </form>

        {resetResult && (
          <div style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 10,
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
          }}>
            <strong>PIN temporal de {resetResult.name}</strong>
            <p style={{
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: 2,
              margin: "10px 0",
            }}>
              {resetResult.temporaryPin}
            </p>

            <button
              type="button"
              onClick={() => copyText(resetResult.temporaryPin, "PIN")}
              style={{ ...buttonStyle, background: "#92400E" }}
            >
              Copiar PIN
            </button>

            <p style={{ color: "#78350F", fontSize: 12 }}>
              Guarda el PIN y comunícaselo al jugador de forma segura. Esta pantalla lo muestra tras generarlo.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
