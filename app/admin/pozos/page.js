
"use client";

import { useCallback, useEffect, useState } from "react";

async function api(action, values = {}) {
  const response = await fetch("/api/padel", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...values }),
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("El servidor no ha devuelto una respuesta válida.");
  }

  if (!response.ok) {
    throw new Error(result.error || result.message || "No se ha podido completar la operación.");
  }

  return result;
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(value) {
  return String(value || "").slice(0, 5);
}

export default function AdminPozosPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [pozos, setPozos] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const [date, setDate] = useState(todayString());
  const [startTime, setStartTime] = useState("18:00");
  const [duration, setDuration] = useState("1.5");
  const [titularCount, setTitularCount] = useState("4");

  const loadData = useCallback(async () => {
    try {
      const result = await api("admin-pozo-data");
      setPozos(result.pozos || []);
      setAccounts(result.accounts || []);
      setAuthenticated(true);
    } catch (error) {
      setAuthenticated(false);
      setPozos([]);
      setAccounts([]);
      if (error.message && !/autoriz|sesión|sesion|admin/i.test(error.message)) {
        setNotice(error.message);
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const result = await api("admin-status");
        if (cancelled) return;

        if (result.authenticated || result.isAdmin || result.admin) {
          await loadData();
        } else {
          setAuthenticated(false);
          setChecking(false);
        }
      } catch {
        if (!cancelled) {
          setAuthenticated(false);
          setChecking(false);
        }
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [loadData]);

  async function login(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setNotice("");

    try {
      await api("admin-login", { password });
      setPassword("");
      setAuthenticated(true);
      await loadData();
      setNotice("Sesión de administrador iniciada.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
      setChecking(false);
    }
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    setNotice("");

    try {
      await api("admin-logout");
      setAuthenticated(false);
      setPozos([]);
      setAccounts([]);
      setNotice("Sesión cerrada.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function createPozo(event) {
    event.preventDefault();
    if (busy) return;

    if (!date || date < todayString()) {
      setNotice("Selecciona hoy o una fecha futura.");
      return;
    }

    if (!startTime || startTime < "08:00") {
      setNotice("La hora de inicio no puede ser anterior a las 08:00.");
      return;
    }

    const durationNumber = Number(duration);
    const titularNumber = Number(titularCount);

    if (
      durationNumber < 0.5 ||
      durationNumber > 6 ||
      durationNumber * 2 !== Math.trunc(durationNumber * 2)
    ) {
      setNotice("La duración debe estar entre 0,5 y 6 horas, en intervalos de 30 minutos.");
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      await api("admin-create-pozo", {
        date,
        start_time: startTime,
        duration_hours: durationNumber,
        titular_count: titularNumber,
      });

      setNotice("Pozo creado correctamente.");
      await loadData();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function addPlayer(pozoId, accountId) {
    if (!accountId || busy) return;

    setBusy(true);
    setNotice("");

    try {
      await api("admin-pozo-join", { pozoId, accountId });
      setNotice("Jugador añadido al pozo.");
      await loadData();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePlayer(registrationId) {
    if (busy || !window.confirm("¿Quieres quitar a este jugador del pozo?")) return;

    setBusy(true);
    setNotice("");

    try {
      await api("admin-pozo-leave", { registrationId });
      setNotice("Inscripción eliminada. Si había reservas, el orden se ha actualizado.");
      await loadData();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePozo(pozoId) {
    if (
      busy ||
      !window.confirm("¿Seguro que quieres eliminar este pozo y todas sus inscripciones?")
    ) return;

    setBusy(true);
    setNotice("");

    try {
      await api("admin-delete-pozo", { pozoId });
      setNotice("Pozo eliminado.");
      await loadData();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  const buttonStyle = {
    padding: "11px 14px",
    border: "none",
    borderRadius: "9px",
    color: "#FFFFFF",
    fontWeight: 700,
    fontSize: "14px",
    cursor: busy ? "not-allowed" : "pointer",
  };

  const inputStyle = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: "11px",
    marginTop: "6px",
    border: "1px solid #CBD5E1",
    borderRadius: "9px",
    fontSize: "15px",
    backgroundColor: "#FFFFFF",
  };

  if (checking) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>Comprobando sesión de administrador...</section>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main style={pageStyle}>
        <section style={{ ...cardStyle, maxWidth: "440px", margin: "30px auto" }}>
          <h1 style={{ marginTop: 0 }}>🔐 Administración de pozos</h1>
          <p style={{ color: "#64748B" }}>
            Inicia sesión con la contraseña de administrador.
          </p>

          {notice && <Notice message={notice} />}

          <form onSubmit={login}>
            <label htmlFor="admin-password">Contraseña de administrador</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={inputStyle}
            />

            <button
              type="submit"
              disabled={busy}
              style={{
                ...buttonStyle,
                width: "100%",
                marginTop: "14px",
                backgroundColor: "#2563EB",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { window.location.href = "/admin"; }}
            style={{
              ...buttonStyle,
              width: "100%",
              marginTop: "10px",
              backgroundColor: "#475569",
            }}
          >
            ← Volver al panel de administración
          </button>
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: "clamp(25px, 5vw, 34px)" }}>
          🎾 Administración de pozos
        </h1>
        <p style={{ marginBottom: 0 }}>
          Crea los pozos y gestiona titulares y reservas.
        </p>
      </header>

      {notice && <Notice message={notice} />}

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
        <button
          type="button"
          onClick={() => { window.location.href = "/admin"; }}
          style={{ ...buttonStyle, backgroundColor: "#475569" }}
        >
          ← Panel de administración
        </button>

        <button
          type="button"
          onClick={loadData}
          disabled={busy}
          style={{ ...buttonStyle, backgroundColor: "#2563EB" }}
        >
          ↻ Actualizar
        </button>

        <button
          type="button"
          onClick={logout}
          disabled={busy}
          style={{ ...buttonStyle, backgroundColor: "#374151" }}
        >
          Cerrar sesión
        </button>
      </div>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>＋ Crear un pozo</h2>

        <form onSubmit={createPozo}>
          <div style={formGridStyle}>
            <div>
              <label htmlFor="pozo-date">Fecha</label>
              <input
                id="pozo-date"
                type="date"
                min={todayString()}
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label htmlFor="pozo-time">Hora de inicio (desde las 08:00)</label>
              <input
                id="pozo-time"
                type="time"
                min="08:00"
                required
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label htmlFor="pozo-duration">Duración</label>
              <select
                id="pozo-duration"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                style={inputStyle}
              >
                {Array.from({ length: 12 }, (_, index) => {
                  const value = (index + 1) * 0.5;
                  return (
                    <option key={value} value={String(value)}>
                      {value.toLocaleString("es-ES")} {value === 1 ? "hora" : "horas"}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label htmlFor="pozo-titulares">Número de titulares</label>
              <select
                id="pozo-titulares"
                value={titularCount}
                onChange={(event) => setTitularCount(event.target.value)}
                style={inputStyle}
              >
                {[4, 8, 12, 16, 20, 24, 28].map((count) => (
                  <option key={count} value={String(count)}>
                    {count} titulares
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p style={{ color: "#64748B", fontSize: "13px", lineHeight: 1.5 }}>
            Se admiten hasta 30 participantes. Los inscritos que superen el número de titulares
            quedarán en reserva y podrán subir automáticamente si se libera una plaza.
          </p>

          <button
            type="submit"
            disabled={busy}
            style={{
              ...buttonStyle,
              backgroundColor: "#16A34A",
              marginTop: "8px",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Guardando..." : "＋ Crear pozo"}
          </button>
        </form>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>📋 Pozos activos y futuros</h2>

        {pozos.length === 0 ? (
          <p>No hay pozos activos o futuros. Puedes crear uno arriba.</p>
        ) : (
          <div style={{ display: "grid", gap: "18px" }}>
            {pozos.map((pozo) => {
              const players = pozo.players || [];
              const selectedIds = players.map((player) => player.account_id);
              const eligibleAccounts = accounts.filter(
                (account) => !selectedIds.includes(account.id)
              );

              return (
                <article
                  key={pozo.id}
                  style={{
                    border: "1px solid #CBD5E1",
                    borderRadius: "14px",
                    padding: "17px",
                    backgroundColor: "#FFFFFF",
                    overflowWrap: "anywhere",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div>
                      <h3 style={{ margin: "0 0 8px" }}>🎾 {formatDate(pozo.date)}</h3>
                      <div style={{ color: "#475569", lineHeight: 1.7 }}>
                        <div>🕒 Inicio: <strong>{formatTime(pozo.start_time)}</strong></div>
                        <div>⏱️ Duración: <strong>{pozo.duration_hours} horas</strong></div>
                        <div>🎯 Titulares: <strong>{pozo.titular_count}</strong></div>
                        <div>👥 Inscritos: <strong>{players.length}/30</strong></div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => deletePozo(pozo.id)}
                      disabled={busy}
                      style={{ ...buttonStyle, backgroundColor: "#DC2626", alignSelf: "flex-start" }}
                    >
                      Eliminar pozo
                    </button>
                  </div>

                  <div style={{ marginTop: "16px" }}>
                    <label htmlFor={`add-player-${pozo.id}`}>Añadir jugador manualmente</label>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
                      <select
                        id={`add-player-${pozo.id}`}
                        defaultValue=""
                        disabled={busy || players.length >= 30 || eligibleAccounts.length === 0}
                        style={{ ...inputStyle, flex: "1 1 220px", marginTop: 0 }}
                      >
                        <option value="">
                          {eligibleAccounts.length ? "Selecciona un jugador" : "No hay jugadores disponibles"}
                        </option>
                        {eligibleAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        disabled={busy || players.length >= 30 || eligibleAccounts.length === 0}
                        onClick={(event) => {
                          const select = event.currentTarget.parentElement.querySelector("select");
                          const accountId = select?.value;
                          if (accountId) {
                            addPlayer(pozo.id, accountId);
                            select.value = "";
                          } else {
                            setNotice("Selecciona un jugador.");
                          }
                        }}
                        style={{ ...buttonStyle, backgroundColor: "#0F766E" }}
                      >
                        Añadir
                      </button>
                    </div>
                  </div>

                  <h4 style={{ marginBottom: "10px", marginTop: "20px" }}>Participantes</h4>

                  {players.length === 0 ? (
                    <p style={{ color: "#64748B" }}>Todavía no hay inscritos.</p>
                  ) : (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {players.map((player, index) => {
                        const titular = index < pozo.titular_count;

                        return (
                          <div
                            key={player.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                              gap: "10px",
                              padding: "10px 12px",
                              borderRadius: "9px",
                              backgroundColor: titular ? "#F0FDF4" : "#FFFBEB",
                              border: titular ? "1px solid #BBF7D0" : "1px solid #FDE68A",
                            }}
                          >
                            <div>
                              <strong>{index + 1}. {player.name}</strong>
                              <div style={{ fontSize: "13px", marginTop: "3px", color: titular ? "#166534" : "#92400E" }}>
                                {titular ? "🎾 Titular" : "⏳ Reserva"}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => removePlayer(player.id)}
                              disabled={busy}
                              style={{ ...buttonStyle, padding: "8px 11px", backgroundColor: "#DC2626" }}
                            >
                              Quitar
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Notice({ message }) {
  return (
    <div
      role="status"
      style={{
        padding: "13px 15px",
        marginBottom: "18px",
        borderRadius: "10px",
        backgroundColor: "#EFF6FF",
        border: "1px solid #BFDBFE",
        color: "#1D4ED8",
        overflowWrap: "anywhere",
      }}
    >
      {message}
    </div>
  );
}

const pageStyle = {
  maxWidth: "1100px",
  width: "100%",
  boxSizing: "border-box",
  margin: "0 auto",
  padding: "20px",
  minHeight: "100vh",
  fontFamily: "Arial, Helvetica, sans-serif",
  color: "#1F2937",
  backgroundColor: "#F8FAFC",
};

const headerStyle = {
  padding: "24px",
  marginBottom: "20px",
  borderRadius: "16px",
  background: "linear-gradient(135deg, #0F172A, #334155)",
  color: "#FFFFFF",
};

const cardStyle = {
  padding: "22px",
  marginBottom: "20px",
  border: "1px solid #E2E8F0",
  borderRadius: "16px",
  backgroundColor: "#FFFFFF",
  boxShadow: "0 4px 14px rgba(15,23,42,0.05)",
  overflowWrap: "anywhere",
};

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};
