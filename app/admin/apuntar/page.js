
"use client";

import { useEffect, useState } from "react";

function api(action, data = {}) {
  return fetch("/api/padel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ action, ...data }),
  }).then(async (response) => {
    const text = await response.text();
    let result = {};
    try { result = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) throw new Error(result.error || result.message || `Error API (${response.status})`);
    return result;
  });
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

export default function AdminApuntarPage() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [slots, setSlots] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);

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

        const result = await api("admin-list-accounts");
        if (cancelled) return;

        const loaded = result.accounts || [];
        setAccounts(loaded);
        setAccountId(loaded[0]?.id || "");
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

  async function submit(event) {
    event.preventDefault();
    if (busy || !accountId || !slotId) return;

    setBusy(true);
    setNotice("");

    try {
      const result = await api("admin-join", {
        accountId,
        day: slotId,
      });

      setNotice(`✅ ${result.name || "El jugador"} se ha apuntado correctamente.`);
      setIsError(false);
    } catch (error) {
      setNotice(error.message);
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return <main style={{ maxWidth: 700, margin: "40px auto", padding: 20, fontFamily: "Arial,sans-serif" }}>Comprobando sesión…</main>;
  }

  if (!authenticated) {
    return (
      <main style={{ maxWidth: 700, margin: "40px auto", padding: 20, fontFamily: "Arial,sans-serif" }}>
        <h1>Acceso de administrador necesario</h1>
        <p>Inicia sesión desde el menú del administrador para continuar.</p>
        <a href="/admin" style={{ ...buttonStyle, background: "#0F766E" }}>← Volver al inicio del administrador</a>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 700, margin: "28px auto", padding: "0 16px 40px", fontFamily: "Arial,sans-serif", color: "#0F172A" }}>
      <a href="/admin" style={{ ...buttonStyle, background: "#475569", marginBottom: 20 }}>
        ← Volver al inicio del administrador
      </a>

      <section style={{ background: "white", border: "1px solid #99F6E4", borderRadius: 14, padding: 22 }}>
        <h1 style={{ marginTop: 0 }}>➕ Apuntar jugadores</h1>
        <p style={{ color: "#64748B", lineHeight: 1.5 }}>
          Selecciona una cuenta activa y el horario al que quieres apuntarla.
        </p>

        {notice && (
          <div role="status" style={{ padding: 12, borderRadius: 9, marginBottom: 16, background: isError ? "#FEF2F2" : "#ECFDF5", color: isError ? "#991B1B" : "#065F46", whiteSpace: "pre-wrap" }}>
            {notice}
          </div>
        )}

        <form onSubmit={submit}>
          <label htmlFor="account">Jugador</label>
          <select id="account" value={accountId} onChange={(e) => setAccountId(e.target.value)} required style={inputStyle}>
            <option value="">Selecciona un jugador…</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>

          <label htmlFor="slot">Día y horario</label>
          <select id="slot" value={slotId} onChange={(e) => setSlotId(e.target.value)} required style={inputStyle}>
            <option value="">Selecciona una partida…</option>
            {slots.map((slot) => (
              <option key={slot.id} value={slot.id}>{slot.label}</option>
            ))}
          </select>

          <button type="submit" disabled={busy || !accounts.length} style={{ ...buttonStyle, background: "#0F766E", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Apuntando…" : "Apuntar jugador"}
          </button>

          {!accounts.length && <p style={{ color: "#B45309" }}>No hay cuentas activas disponibles.</p>}
        </form>
      </section>
    </main>
  );
}
