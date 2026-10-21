
"use client";

import { useCallback, useEffect, useState } from "react";

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

function generateSlots() {
  const slots = [];
  const names = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
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
        label: `${names[slotDate.getDay()]} ${day}/${month} · ${time}`,
      });
    }
  }

  return slots;
}

const buttonStyle = {
  padding: "10px 13px",
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

export default function AdminEliminarPage() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [slots, setSlots] = useState([]);
  const [players, setPlayers] = useState([]);
  const [deletingId, setDeletingId] = useState("");
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);

  const loadPlayers = useCallback(async () => {
    const response = await fetch("/api/padel", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });

    const text = await response.text();
    let result = {};
    try { result = text ? JSON.parse(text) : {}; } catch {}

    if (!response.ok) {
      throw new Error(result.error || `Error al cargar las partidas (${response.status}).`);
    }

    setPlayers(result.players || []);
  }, []);

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
        setSlots(generateSlots());
        await loadPlayers();
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
  }, [loadPlayers]);

  useEffect(() => {
    if (!authenticated) return;

    const interval = setInterval(() => {
      loadPlayers().catch((error) => {
        console.error("Error actualizando inscripciones:", error);
      });
    }, 15000);

    return () => clearInterval(interval);
  }, [authenticated, loadPlayers]);

  async function deletePlayer(player, slotLabel) {
    if (deletingId) return;

    const confirmed = window.confirm(
      `¿Quieres eliminar a ${player.name} de la partida ${slotLabel}?\n\n` +
      "Solo se eliminará esta inscripción. La cuenta del jugador se conservará."
    );

    if (!confirmed) return;

    setDeletingId(String(player.id));
    setNotice("");
    setIsError(false);

    try {
      await api("admin-delete-player", {
        id: player.id,
        day: player.day,
      });

      await loadPlayers();

      setNotice(`✅ ${player.name} ha sido eliminado de la partida ${slotLabel}.`);
      setIsError(false);
    } catch (error) {
      setNotice(error.message);
      setIsError(true);

      try {
        await loadPlayers();
      } catch (refreshError) {
        console.error("No se ha podido actualizar la lista:", refreshError);
      }
    } finally {
      setDeletingId("");
    }
  }

  if (checking) {
    return <main style={{ maxWidth: 850, margin: "40px auto", padding: 20, fontFamily: "Arial,sans-serif" }}>Comprobando sesión…</main>;
  }

  if (!authenticated) {
    return (
      <main style={{ maxWidth: 850, margin: "40px auto", padding: 20, fontFamily: "Arial,sans-serif" }}>
        <h1>Acceso de administrador necesario</h1>
        <p>Inicia sesión desde el menú del administrador para continuar.</p>
        <a href="/admin" style={{ ...buttonStyle, background: "#475569" }}>← Volver al inicio del administrador</a>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 850, margin: "28px auto", padding: "0 16px 40px", fontFamily: "Arial,sans-serif", color: "#0F172A" }}>
      <a href="/admin" style={{ ...buttonStyle, background: "#475569", marginBottom: 20 }}>
        ← Volver al inicio del administrador
      </a>

      <h1 style={{ fontSize: 28 }}>🗑️ Eliminar jugadores</h1>
      <p style={{ color: "#64748B", lineHeight: 1.5 }}>
        Elimina una inscripción sin borrar la cuenta del jugador. La lista se actualiza automáticamente cada 15 segundos.
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

      {slots.map((slot) => {
        const slotPlayers = players.filter((player) =>
          player.day &&
          new Date(player.day).getTime() === new Date(slot.id).getTime()
        );

        const reserved = slotPlayers.some((player) => player.reserved === true);

        return (
          <section key={slot.id} style={{
            background: "white",
            border: "1px solid #E2E8F0",
            borderRadius: 12,
            padding: 16,
            marginBottom: 14,
            boxShadow: "0 2px 8px rgba(15,23,42,.04)",
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}>
              <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>{slot.label}</h2>
              <strong style={{
                color: slotPlayers.length >= 4 ? "#B91C1C" : "#047857",
                fontSize: 14,
              }}>
                {slotPlayers.length}/4 jugadores
              </strong>
            </div>

            {reserved && (
              <p style={{ color: "#92400E", fontSize: 13 }}>
                🔒 La pista figura como reservada.
              </p>
            )}

            {slotPlayers.length === 0 ? (
              <p style={{ color: "#94A3B8", marginBottom: 0 }}>
                No hay jugadores apuntados.
              </p>
            ) : (
              slotPlayers.map((player) => {
                const isDeleting = deletingId === String(player.id);

                return (
                  <div key={player.id} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    padding: "11px 0",
                    borderTop: "1px solid #F1F5F9",
                  }}>
                    <div>
                      <strong>{player.name}</strong>
                      {player.reserved && (
                        <div style={{ color: "#92400E", fontSize: 12, marginTop: 3 }}>
                          Reserva marcada
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => deletePlayer(player, slot.label)}
                      disabled={!!deletingId}
                      style={{
                        ...buttonStyle,
                        background: "#DC2626",
                        opacity: deletingId ? 0.65 : 1,
                        cursor: deletingId ? "wait" : "pointer",
                      }}
                    >
                      {isDeleting ? "Eliminando…" : "🗑️ Eliminar"}
                    </button>
                  </div>
                );
              })
            )}
          </section>
        );
      })}
    </main>
  );
}
