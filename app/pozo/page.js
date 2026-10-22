
"use client";

import { useCallback, useEffect, useState } from "react";

async function api(action, values = {}) {
  const response = await fetch("/api/padel", {
    method: action ? "POST" : "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: action ? { "Content-Type": "application/json" } : undefined,
    body: action ? JSON.stringify({ action, ...values }) : undefined,
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

function formatDate(dateValue) {
  if (!dateValue) return "";
  const date = new Date(`${dateValue}T12:00:00`);
  return date.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(value) {
  return String(value || "").slice(0, 5);
}

export default function PozoPage() {
  const [account, setAccount] = useState(null);
  const [pozo, setPozo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const loadPozo = useCallback(async () => {
    try {
      const result = await api(null);
      setAccount(result.account || null);
      setPozo(result.pozo || null);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPozo();
  }, [loadPozo]);

  async function joinPozo() {
    if (!account) {
      setNotice("Inicia sesión en la página principal para apuntarte al pozo.");
      return;
    }

    if (account.must_change_pin) {
      setNotice("Debes cambiar tu PIN temporal antes de apuntarte.");
      return;
    }

    if (!pozo) return;

    if (busy) return;

    setBusy(true);
    setNotice("");

    try {
      await api("pozo-join", { pozoId: pozo.id });
      await loadPozo();
      setNotice("Te has apuntado al pozo correctamente.");
    } catch (error) {
      setNotice(error.message);
      await loadPozo();
    } finally {
      setBusy(false);
    }
  }

  async function leavePozo(registrationId) {
    if (!account) {
      setNotice("Inicia sesión para desapuntarte.");
      return;
    }

    if (account.must_change_pin) {
      setNotice("Debes cambiar tu PIN temporal antes de continuar.");
      return;
    }

    if (busy) return;

    setBusy(true);
    setNotice("");

    try {
      await api("pozo-leave", { registrationId });
      await loadPozo();
      setNotice("Te has desapuntado del pozo.");
    } catch (error) {
      setNotice(error.message);
      await loadPozo();
    } finally {
      setBusy(false);
    }
  }

  const myRegistration = pozo?.players?.find(
    (player) => player.account_id === account?.id
  );

  const players = pozo?.players || [];
  const titularCount = pozo?.titular_count || 0;
  const reserveCount = Math.max(0, players.length - titularCount);
  const availableTitularPlaces = Math.max(0, titularCount - players.length);
  const isFull = players.length >= 30;
  const canJoin = Boolean(
    account &&
    !account.must_change_pin &&
    pozo &&
    !myRegistration &&
    !isFull
  );

  const buttonStyle = {
    padding: "12px 16px",
    border: "none",
    borderRadius: "9px",
    color: "#FFFFFF",
    fontWeight: 700,
    fontSize: "14px",
    cursor: busy ? "not-allowed" : "pointer",
  };

  return (
    <main
      style={{
        maxWidth: "900px",
        width: "100%",
        boxSizing: "border-box",
        margin: "0 auto",
        padding: "20px",
        minHeight: "100vh",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#1F2937",
        background: "#F8FAFC",
      }}
    >
      <header
        style={{
          padding: "24px",
          marginBottom: "20px",
          borderRadius: "18px",
          background: "linear-gradient(135deg, #064E3B, #16A34A)",
          color: "#FFFFFF",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: "clamp(26px, 5vw, 36px)" }}>
          🎾 El Pozo
        </h1>
        <p style={{ margin: 0 }}>
          Consulta los inscritos y gestiona tu participación.
        </p>
      </header>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
        <button
          type="button"
          onClick={() => { window.location.href = "/"; }}
          style={{ ...buttonStyle, backgroundColor: "#2563EB" }}
        >
          ← Volver a las partidas
        </button>

        <button
          type="button"
          onClick={loadPozo}
          disabled={loading || busy}
          style={{ ...buttonStyle, backgroundColor: "#475569" }}
        >
          ↻ Actualizar
        </button>
      </div>

      {notice && (
        <div
          role="status"
          style={{
            padding: "13px 15px",
            marginBottom: "18px",
            borderRadius: "10px",
            background: "#EFF6FF",
            border: "1px solid #BFDBFE",
            color: "#1D4ED8",
            overflowWrap: "anywhere",
          }}
        >
          {notice}
        </div>
      )}

      {loading ? (
        <p>Cargando información del pozo...</p>
      ) : !account ? (
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>🔐 Inicia sesión</h2>
          <p>Para apuntarte o desapuntarte, primero inicia sesión desde la página principal.</p>
          <button
            type="button"
            onClick={() => { window.location.href = "/"; }}
            style={{ ...buttonStyle, backgroundColor: "#2563EB" }}
          >
            Ir a iniciar sesión
          </button>
        </section>
      ) : account.must_change_pin ? (
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>🔐 Cambia tu PIN</h2>
          <p>Debes cambiar tu PIN temporal en tu perfil antes de participar en el pozo.</p>
          <button
            type="button"
            onClick={() => { window.location.href = "/"; }}
            style={{ ...buttonStyle, backgroundColor: "#2563EB" }}
          >
            Ir a cambiar mi PIN
          </button>
        </section>
      ) : !pozo ? (
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>🎾 No hay ningún pozo activo</h2>
          <p>
            Todavía no se ha creado un pozo o el último ya ha pasado. Cuando el administrador
            cree uno nuevo, aparecerá aquí.
          </p>
        </section>
      ) : (
        <>
          <section style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: "24px" }}>🎾 Pozo de pádel</h2>
              <span style={pillStyle}>
                {players.length}/30 participantes
              </span>
            </div>

            <div style={{ marginTop: "18px", display: "grid", gap: "12px" }}>
              <InfoRow label="📅 Fecha" value={formatDate(pozo.date)} />
              <InfoRow label="🕒 Hora de inicio" value={formatTime(pozo.start_time)} />
              <InfoRow label="⏱️ Duración" value={`${pozo.duration_hours} horas`} />
              <InfoRow label="🎯 Plazas titulares" value={`${titularCount}`} />
              <InfoRow label="👥 Titulares inscritos" value={`${Math.min(players.length, titularCount)} de ${titularCount}`} />
              <InfoRow label="⏳ En lista de reserva" value={`${reserveCount}`} />
              <InfoRow label="🟢 Plazas titulares libres" value={`${availableTitularPlaces}`} />
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "20px" }}>
              {!myRegistration ? (
                <button
                  type="button"
                  onClick={joinPozo}
                  disabled={!canJoin || busy}
                  style={{
                    ...buttonStyle,
                    backgroundColor: isFull ? "#9CA3AF" : "#16A34A",
                    opacity: !canJoin || busy ? 0.65 : 1,
                  }}
                >
                  {busy ? "Procesando..." : isFull ? "Pozo completo" : "＋ Apuntarme al pozo"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => leavePozo(myRegistration.id)}
                  disabled={busy}
                  style={{ ...buttonStyle, backgroundColor: "#DC2626", opacity: busy ? 0.65 : 1 }}
                >
                  {busy ? "Procesando..." : "Desapuntarme del pozo"}
                </button>
              )}
            </div>

            {myRegistration && (
              <p style={{ marginBottom: 0, marginTop: "12px", color: "#166534", fontWeight: 700 }}>
                {players.findIndex((player) => player.id === myRegistration.id) < titularCount
                  ? "✅ Estás inscrito como titular."
                  : "⏳ Estás en la lista de reserva."}
              </p>
            )}

            {!account && (
              <p style={{ color: "#64748B" }}>
                Inicia sesión para apuntarte.
              </p>
            )}
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>👥 Lista de participantes</h2>
            <p style={{ color: "#64748B", marginTop: "-4px" }}>
              El orden de inscripción determina los titulares y la lista de reserva.
              Si un titular se desapunta, la siguiente persona en reserva sube automáticamente.
            </p>

            {players.length === 0 ? (
              <p>Aún no hay jugadores inscritos.</p>
            ) : (
              <div style={{ display: "grid", gap: "9px" }}>
                {players.map((player, index) => {
                  const isTitular = index < titularCount;
                  const isMe = player.account_id === account.id;

                  return (
                    <div
                      key={player.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                        flexWrap: "wrap",
                        padding: "12px",
                        borderRadius: "10px",
                        border: isMe ? "1px solid #2563EB" : "1px solid #E5E7EB",
                        backgroundColor: isMe ? "#EFF6FF" : isTitular ? "#F0FDF4" : "#FFFBEB",
                      }}
                    >
                      <div>
                        <strong>{index + 1}. {player.name}{isMe ? " (Tú)" : ""}</strong>
                        <div style={{ marginTop: "4px", fontSize: "13px", color: isTitular ? "#166534" : "#92400E" }}>
                          {isTitular ? "🎾 Titular" : "⏳ Reserva"}
                        </div>
                      </div>

                      {isMe && (
                        <button
                          type="button"
                          onClick={() => leavePozo(player.id)}
                          disabled={busy}
                          style={{ ...buttonStyle, backgroundColor: "#DC2626", padding: "9px 12px" }}
                        >
                          Desapuntarme
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function InfoRow({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
        paddingBottom: "10px",
        borderBottom: "1px solid #E5E7EB",
      }}
    >
      <span style={{ color: "#64748B" }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const cardStyle = {
  padding: "22px",
  marginBottom: "20px",
  border: "1px solid #E2E8F0",
  borderRadius: "16px",
  backgroundColor: "#FFFFFF",
  boxShadow: "0 4px 14px rgba(15,23,42,0.05)",
  overflowWrap: "anywhere",
};

const pillStyle = {
  padding: "7px 11px",
  borderRadius: "999px",
  backgroundColor: "#DCFCE7",
  color: "#166534",
  fontWeight: 700,
  fontSize: "13px",
};
