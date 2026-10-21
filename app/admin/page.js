
"use client";

import { useCallback, useEffect, useState } from "react";

// ============================================================
// 1. GENERAR LOS PRÓXIMOS 14 DÍAS DE PARTIDAS
// ============================================================

function generateAdminSlots() {
  const slots = [];

  const dayNames = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];

  const schedules = {
    0: ["09:30", "11:00"],
    1: ["18:30", "20:00"],
    2: ["18:30", "20:00"],
    3: ["18:30", "20:00"],
    4: ["18:30", "20:00"],
    5: ["18:30", "20:00"],
    6: ["09:30", "11:00"],
  };

  const today = new Date();

  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    for (const time of schedules[date.getDay()]) {
      const [hours, minutes] = time.split(":").map(Number);

      const slotDate = new Date(date);
      slotDate.setHours(hours, minutes, 0, 0);

      const day = String(slotDate.getDate()).padStart(2, "0");
      const month = String(slotDate.getMonth() + 1).padStart(2, "0");

      slots.push({
        id: slotDate.toISOString(),
        label: `${dayNames[slotDate.getDay()]} ${day}/${month} · ${time}`,
      });
    }
  }

  return slots;
}

// ============================================================
// 2. COMUNICACIÓN CON LA API
// Muestra el detalle del error si una petición falla.
// ============================================================

async function api(action, data = {}) {
  let response;

  try {
    response = await fetch("/api/padel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({
        action,
        ...data,
      }),
    });
  } catch {
    throw new Error(
      "No se puede conectar con /api/padel. Comprueba que el servidor esté iniciado."
    );
  }

  const responseText = await response.text();

  let result = {};

  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = {};
  }

  if (!response.ok) {
    const detail =
      result.error ||
      result.message ||
      (responseText
        ? responseText.slice(0, 300)
        : "La API no ha devuelto detalles.");

    throw new Error(`Error API (${response.status}): ${detail}`);
  }

  return result;
}

// ============================================================
// 3. PANEL DE ADMINISTRACIÓN
// ============================================================

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [password, setPassword] = useState("");

  const [accounts, setAccounts] = useState([]);
  const [slots, setSlots] = useState([]);

  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");

  const [inviteName, setInviteName] = useState("");
  const [inviteResult, setInviteResult] = useState(null);

  const [resetName, setResetName] = useState("");
  const [resetResult, setResetResult] = useState(null);

  // ==========================================================
  // MENSAJES
  // ==========================================================

  const showNotice = (message, isError = false) => {
    setNotice(message);
    setError(isError);
  };

  // ==========================================================
  // CARGAR CUENTAS DE JUGADORES
  // ==========================================================

  const loadAccounts = useCallback(async () => {
    const result = await api("admin-list-accounts");
    const loadedAccounts = result.accounts || [];

    setAccounts(loadedAccounts);

    setSelectedAccount(
      (current) => current || loadedAccounts[0]?.id || ""
    );

    setResetName(
      (current) => current || loadedAccounts[0]?.name || ""
    );
  }, []);

  // ==========================================================
  // INICIALIZACIÓN
  // La fecha se calcula dentro de useEffect.
  // ==========================================================

  useEffect(() => {
    let cancelled = false;

    setSlots(generateAdminSlots());

    async function initialize() {
      try {
        const result = await api("admin-status");

        if (cancelled) return;

        const isAuthenticated = result.authenticated === true;
        setAuthenticated(isAuthenticated);

        if (isAuthenticated) {
          await loadAccounts();
        }
      } catch (e) {
        if (!cancelled) {
          setAuthenticated(false);
          showNotice(e.message, true);
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [loadAccounts]);

  // ==========================================================
  // INICIAR SESIÓN
  // ==========================================================

  async function login(event) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    showNotice("");

    try {
      await api("admin-login", { password });

      setPassword("");
      setAuthenticated(true);

      await loadAccounts();

      showNotice("Sesión de administrador iniciada.");
    } catch (e) {
      showNotice(e.message || "Error desconocido al iniciar sesión.", true);
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // CERRAR SESIÓN
  // ==========================================================

  async function logout() {
    if (busy) return;

    setBusy(true);

    try {
      await api("admin-logout");

      setAuthenticated(false);
      setAccounts([]);
      setSelectedAccount("");
      setSelectedSlot("");
      setInviteResult(null);
      setResetResult(null);

      showNotice("Has cerrado la sesión de administrador.");
    } catch (e) {
      showNotice(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // APUNTAR JUGADOR A UNA PARTIDA
  // ==========================================================

  async function adminJoin(event) {
    event.preventDefault();

    if (!selectedAccount || !selectedSlot || busy) {
      showNotice("Selecciona un jugador y un horario.", true);
      return;
    }

    setBusy(true);
    showNotice("");

    try {
      const result = await api("admin-join", {
        accountId: selectedAccount,
        day: selectedSlot,
      });

      const account = accounts.find(
        (item) => item.id === selectedAccount
      );

      showNotice(
        `✅ ${result.name || account?.name || "El jugador"} se ha apuntado correctamente.`
      );
    } catch (e) {
      showNotice(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // CREAR INVITACIÓN
  // ==========================================================

  async function createInvite(event) {
    event.preventDefault();

    if (busy) return;

    const cleanName = inviteName.trim();

    if (cleanName.length < 2 || cleanName.length > 60) {
      showNotice("El nombre debe tener entre 2 y 60 caracteres.", true);
      return;
    }

    setBusy(true);
    setInviteResult(null);
    showNotice("");

    try {
      const result = await api("create-invite", {
        name: cleanName,
      });

      setInviteResult(result);
      setInviteName("");

      showNotice(`Invitación creada para ${result.name}.`);
    } catch (e) {
      showNotice(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // RESTABLECER PIN
  // ==========================================================

  async function resetPin(event) {
    event.preventDefault();

    if (busy || !resetName) return;

    setBusy(true);
    setResetResult(null);
    showNotice("");

    try {
      const result = await api("admin-reset-pin", {
        name: resetName,
      });

      setResetResult(result);

      showNotice(`PIN temporal generado para ${result.name}.`);
    } catch (e) {
      showNotice(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // ESTILOS
  // ==========================================================

  const inputStyle = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: "12px",
    margin: "7px 0 14px",
    border: "1px solid #CBD5E1",
    borderRadius: "9px",
    fontSize: "15px",
    background: "white",
    color: "#0F172A",
  };

  const buttonStyle = {
    padding: "12px 16px",
    border: 0,
    borderRadius: "9px",
    color: "white",
    fontWeight: 700,
    fontSize: "14px",
    cursor: busy ? "wait" : "pointer",
  };

  const panelStyle = {
    background: "white",
    border: "1px solid #E2E8F0",
    borderRadius: "14px",
    padding: "20px",
    marginBottom: "18px",
    boxShadow: "0 2px 8px rgba(15,23,42,.04)",
  };

  // ==========================================================
  // PANTALLA DE CARGA
  // ==========================================================

  if (checking) {
    return (
      <main
        style={{
          maxWidth: 850,
          margin: "40px auto",
          padding: 20,
          fontFamily: "Arial,sans-serif",
        }}
      >
        Cargando panel de administración…
      </main>
    );
  }

  // ==========================================================
  // INTERFAZ
  // ==========================================================

  return (
    <main
      style={{
        maxWidth: 850,
        margin: "28px auto",
        padding: "0 16px 40px",
        fontFamily: "Arial,sans-serif",
        color: "#0F172A",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: 28 }}>
            🎾 Administración de pádel
          </h1>

          <p style={{ margin: 0, color: "#64748B" }}>
            Gestiona las inscripciones y las cuentas de jugadores.
          </p>
        </div>

        {authenticated && (
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            style={{
              ...buttonStyle,
              background: "#374151",
            }}
          >
            Cerrar sesión
          </button>
        )}
      </header>

      {notice && (
        <div
          role="status"
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            marginBottom: 18,
            background: error ? "#FEF2F2" : "#ECFDF5",
            color: error ? "#991B1B" : "#065F46",
            border: `1px solid ${
              error ? "#FECACA" : "#A7F3D0"
            }`,
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
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
              onChange={(e) => setPassword(e.target.value)}
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
          {/* APUNTAR JUGADOR A UNA PARTIDA */}
          <section
            style={{
              ...panelStyle,
              borderColor: "#99F6E4",
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              ➕ Apuntar un jugador a una partida
            </h2>

            <p style={{ color: "#475569", lineHeight: 1.5 }}>
              Elige un jugador con cuenta activa y un horario.
              No necesitas conocer su PIN. La API debe comprobar
              el límite de cuatro plazas y evitar duplicados.
            </p>

            <form onSubmit={adminJoin}>
              <label htmlFor="player-select">Jugador</label>

              <select
                id="player-select"
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                required
                style={inputStyle}
              >
                <option value="">Selecciona un jugador…</option>

                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>

              <label htmlFor="slot-select">Día y horario</label>

              <select
                id="slot-select"
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
                required
                style={inputStyle}
              >
                <option value="">Selecciona una partida…</option>

                {slots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.label}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={busy || !accounts.length || !slots.length}
                style={{
                  ...buttonStyle,
                  background: "#0F766E",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? "Apuntando…" : "Apuntar jugador"}
              </button>

              {!accounts.length && (
                <p style={{ color: "#B45309" }}>
                  No hay cuentas activas disponibles.
                </p>
              )}
            </form>
          </section>

          {/* CREAR INVITACIÓN */}
          <section style={panelStyle}>
            <h2 style={{ marginTop: 0 }}>
              ✉️ Crear invitación para un jugador nuevo
            </h2>

            <form onSubmit={createInvite}>
              <label htmlFor="invite-name">Nombre del jugador</label>

              <input
                id="invite-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                minLength={2}
                maxLength={60}
                required
                style={inputStyle}
              />

              <button
                type="submit"
                disabled={busy}
                style={{
                  ...buttonStyle,
                  background: "#2563EB",
                }}
              >
                {busy ? "Creando…" : "Crear invitación"}
              </button>
            </form>

            {inviteResult && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 9,
                  background: "#EFF6FF",
                  overflowWrap: "anywhere",
                }}
              >
                <strong>
                  Invitación para {inviteResult.name}
                </strong>

                <p style={{ marginBottom: 6 }}>
                  Código de invitación:
                </p>

                <code>{inviteResult.code}</code>

                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard?.writeText(inviteResult.code)
                    }
                    style={{
                      ...buttonStyle,
                      background: "#1D4ED8",
                    }}
                  >
                    Copiar código
                  </button>
                </div>

                <p style={{ fontSize: 12, color: "#475569" }}>
                  Comparte este código con el jugador para que registre su cuenta.
                </p>
              </div>
            )}
          </section>

          {/* RESTABLECER PIN */}
          <section style={panelStyle}>
            <h2 style={{ marginTop: 0 }}>
              🔑 Restablecer PIN de un jugador
            </h2>

            <form onSubmit={resetPin}>
              <label htmlFor="reset-player">Jugador</label>

              <select
                id="reset-player"
                value={resetName}
                onChange={(e) => setResetName(e.target.value)}
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

              <button
                type="submit"
                disabled={busy || !accounts.length}
                style={{
                  ...buttonStyle,
                  background: "#7C3AED",
                }}
              >
                {busy ? "Generando…" : "Generar PIN temporal"}
              </button>
            </form>

            {resetResult && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 9,
                  background: "#FFFBEB",
                  border: "1px solid #FDE68A",
                }}
              >
                <strong>
                  PIN temporal de {resetResult.name}
                </strong>

                <p
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    letterSpacing: 2,
                    margin: "8px 0",
                  }}
                >
                  {resetResult.temporaryPin}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard?.writeText(
                      resetResult.temporaryPin
                    )
                  }
                  style={{
                    ...buttonStyle,
                    background: "#92400E",
                  }}
                >
                  Copiar PIN
                </button>

                <p style={{ fontSize: 12, color: "#78350F" }}>
                  El jugador deberá cambiarlo al iniciar sesión.
                  Este PIN solo se muestra aquí una vez.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
