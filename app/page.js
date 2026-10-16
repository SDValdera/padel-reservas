
"use client";

import { useCallback, useEffect, useState } from "react";

// ============================================================
// 1. GENERAR LOS HORARIOS DE LOS PRÓXIMOS 14 DÍAS
// ============================================================

function generateSlots() {
  const thisWeek = [];
  const nextWeek = [];

  const dayNames = [
    "Domingo", "Lunes", "Martes", "Miércoles",
    "Jueves", "Viernes", "Sábado",
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

    const dayOfWeek = date.getDay();

    const formattedDate =
      String(date.getDate()).padStart(2, "0") +
      "/" +
      String(date.getMonth() + 1).padStart(2, "0");

    for (const hour of schedules[dayOfWeek]) {
      const [hours, minutes] = hour.split(":").map(Number);

      const slotDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        hours,
        minutes,
        0,
        0
      );

      const slot = {
        id: slotDate.toISOString(),
        label: `${dayNames[dayOfWeek]} ${formattedDate} - ${hour}`,
      };

      if (i < 7) {
        thisWeek.push(slot);
      } else {
        nextWeek.push(slot);
      }
    }
  }

  return { thisWeek, nextWeek };
}

function sameDay(first, second) {
  if (!first || !second) return false;

  return (
    new Date(first).getTime() ===
    new Date(second).getTime()
  );
}

// ============================================================
// 2. COMPONENTE PRINCIPAL
// ============================================================

export default function Home() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [authMode, setAuthMode] = useState("login");

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [account, setAccount] = useState(null);
  const [players, setPlayers] = useState([]);
  const [slots, setSlots] = useState({
    thisWeek: [],
    nextWeek: [],
  });

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const { thisWeek, nextWeek } = slots;

  // ==========================================================
  // 3. COMUNICACIÓN CON LA API
  // ==========================================================

  async function apiRequest(action, values = {}) {
    const options = {
      cache: "no-store",
      credentials: "same-origin",
    };

    if (action) {
      options.method = "POST";
      options.headers = {
        "Content-Type": "application/json",
      };

      options.body = JSON.stringify({
        action,
        ...values,
      });
    } else {
      options.method = "GET";
    }

    const response = await fetch("/api/padel", options);

    let result;

    try {
      result = await response.json();
    } catch {
      throw new Error(
        "El servidor no ha devuelto una respuesta válida."
      );
    }

    if (!response.ok) {
      throw new Error(
        result.error ||
          result.message ||
          "No se ha podido completar la operación."
      );
    }

    return result;
  }

  // ==========================================================
  // 4. CARGAR JUGADORES Y SESIÓN
  // ==========================================================

  const loadPlayers = useCallback(async () => {
    try {
      const result = await apiRequest(null);

      setPlayers(result.players || []);
      setAccount(result.account || null);
    } catch (error) {
      console.error("Error cargando las partidas:", error);
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ==========================================================
  // 5. REGISTRO E INICIO DE SESIÓN
  // ==========================================================

  async function handleAuth(event) {
    event.preventDefault();

    if (busy) return;

    const cleanName = name.trim();

    if (cleanName.length < 2 || cleanName.length > 60) {
      setNotice("Introduce un nombre válido.");
      return;
    }

    if (!/^\d{8,12}$/.test(pin)) {
      setNotice("El PIN debe tener entre 8 y 12 dígitos.");
      return;
    }

    if (authMode === "register" && !inviteCode.trim()) {
      setNotice("Introduce tu código de invitación.");
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      if (authMode === "register") {
        await apiRequest("register", {
          name: cleanName,
          code: inviteCode.trim(),
          pin,
        });

        setNotice("Registro completado correctamente.");
      } else {
        await apiRequest("login", {
          name: cleanName,
          pin,
        });

        setNotice("Has iniciado sesión correctamente.");
      }

      setPin("");
      setInviteCode("");

      await loadPlayers();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // 6. CERRAR SESIÓN
  // ==========================================================

  async function logout() {
    if (busy) return;

    setBusy(true);
    setNotice("");

    try {
      await apiRequest("logout");

      setAccount(null);
      setPin("");
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");

      setNotice("Sesión cerrada.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
      await loadPlayers();
    }
  }

  // ==========================================================
  // 7. CAMBIAR EL PIN
  // ==========================================================

  async function changePlayerPin(event) {
    event.preventDefault();

    if (busy) return;

    if (!/^\d{8,12}$/.test(currentPin)) {
      setNotice("Introduce tu PIN actual.");
      return;
    }

    if (!/^\d{8,12}$/.test(newPin)) {
      setNotice("El nuevo PIN debe tener entre 8 y 12 dígitos.");
      return;
    }

    if (newPin !== confirmPin) {
      setNotice("Los dos PIN nuevos no coinciden.");
      return;
    }

    if (currentPin === newPin) {
      setNotice("El nuevo PIN debe ser diferente del actual.");
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      await apiRequest("change-pin", {
        currentPin,
        newPin,
        confirmPin,
      });

      setAccount(null);
      setName("");
      setPin("");
      setInviteCode("");
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setAuthMode("login");

      setNotice(
        "PIN cambiado correctamente. Inicia sesión con tu nuevo PIN."
      );
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
      await loadPlayers();
    }
  }

  // ==========================================================
  // 8. APUNTARSE A UNA PARTIDA
  // ==========================================================

  async function join(day) {
    if (!account) {
      setNotice("Inicia sesión para apuntarte.");
      return;
    }

    if (account.must_change_pin) {
      setNotice(
        "Debes cambiar tu PIN temporal antes de continuar."
      );
      return;
    }

    if (busy) return;

    const playersForDay = players.filter((player) =>
      sameDay(player.day, day)
    );

    if (playersForDay.length >= 4) {
      setNotice("La partida está completa.");
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      await apiRequest("join", { day });

      await loadPlayers();

      setNotice("Te has apuntado a la partida.");
    } catch (error) {
      setNotice(error.message);
      await loadPlayers();
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // 9. COMPROBAR PROPIETARIO DE UNA INSCRIPCIÓN
  // ==========================================================

  function canLeave(player) {
    return Boolean(
      account &&
        player?.name &&
        account.name &&
        player.name.trim().toLowerCase() ===
          account.name.trim().toLowerCase()
    );
  }

  // ==========================================================
  // 10. DESAPUNTARSE
  // ==========================================================

  async function leave(id) {
    if (!account) {
      setNotice("Inicia sesión para desapuntarte.");
      return;
    }

    if (account.must_change_pin) {
      setNotice(
        "Debes cambiar tu PIN temporal antes de continuar."
      );
      return;
    }

    if (busy) return;

    // Localizar la inscripción seleccionada.
    const player = players.find(
      (item) => String(item.id) === String(id)
    );

    if (!player) {
      setNotice("No se ha encontrado esa inscripción.");
      return;
    }

    // Validar que la inscripción pertenece al usuario.
    if (!canLeave(player)) {
      setNotice(
        "Solo puedes desapuntar tu propia inscripción."
      );
      return;
    }

    // No bloquear la operación por estar la pista completa
    // ni por el estado reservado de la inscripción.
    setBusy(true);
    setNotice("");

    try {
      await apiRequest("leave", {
        id: player.id,
        day: player.day,
      });

      await loadPlayers();

      setNotice(
        "Te has desapuntado de la partida correctamente."
      );
    } catch (error) {
      console.error("Error al desapuntarse:", error);

      setNotice(
        error.message ||
          "No se ha podido eliminar tu inscripción."
      );

      await loadPlayers();
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // 11. ABRIR RESASPORTS SEGÚN EL DISPOSITIVO
  // ==========================================================

  function openResasports() {
    const bookingUrl =
      "https://centro.resasports.com/login";

    const packageName = "com.Nubapp.LesJoueurs";

    const playStoreUrl =
      "https://play.google.com/store/apps/details?id=" +
      packageName;

    const userAgent = navigator.userAgent || "";
    const isAndroid = /Android/i.test(userAgent);
    const isIPhone = /iPhone|iPod/i.test(userAgent);

    const isIPad =
      /iPad/i.test(userAgent) ||
      (navigator.platform === "MacIntel" &&
        navigator.maxTouchPoints > 1);

    if (isAndroid) {
      const intentUrl =
        "intent://#Intent;" +
        "package=" + packageName + ";" +
        "scheme=resasports;" +
        "S.browser_fallback_url=" +
        encodeURIComponent(playStoreUrl) +
        ";end";

      window.location.href = intentUrl;
      return;
    }

    if (isIPhone || isIPad) {
      let appOpened = false;
      let fallbackTimer;

      const handleVisibilityChange = () => {
        if (document.hidden) {
          appOpened = true;
          window.clearTimeout(fallbackTimer);

          document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange
          );
        }
      };

      document.addEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      window.location.href = "resasports://";

      fallbackTimer = window.setTimeout(() => {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );

        if (!appOpened && !document.hidden) {
          window.location.href = bookingUrl;
        }
      }, 1800);

      return;
    }

    window.open(
      bookingUrl,
      "_blank",
      "noopener,noreferrer"
    );
  }

  // ==========================================================
  // 12. MARCAR RESERVA
  // ==========================================================

  async function markReserved(id) {
    if (!account) {
      setNotice("Inicia sesión para continuar.");
      return;
    }

    if (account.must_change_pin) {
      setNotice(
        "Debes cambiar tu PIN temporal antes de continuar."
      );
      return;
    }

    if (busy) return;

    const responsible = players.find(
      (player) => String(player.id) === String(id)
    );

    if (!responsible) {
      setNotice("No se ha encontrado al responsable.");
      return;
    }

    const playersForDay = players
      .filter((player) => sameDay(player.day, responsible.day))
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
      );

    if (
      playersForDay.length !== 4 ||
      String(playersForDay[3].id) !== String(id)
    ) {
      setNotice("Solo el cuarto jugador puede reservar.");
      return;
    }

    if (!canLeave(responsible)) {
      setNotice("Solo el responsable puede reservar.");
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      await apiRequest("reserve", {
        id,
        day: responsible.day,
      });

      await loadPlayers();

      setNotice(
        "Marcada en la web. Comprueba y completa la reserva en ResaSports."
      );

      // Abre ResaSports, pero no confirma la reserva en esa app.
      openResasports();
    } catch (error) {
      setNotice(error.message);
      await loadPlayers();
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // 13. CARGA INICIAL
  // ==========================================================

  useEffect(() => {
    setSlots(generateSlots());
    loadPlayers();
  }, [loadPlayers]);

  // ==========================================================
  // 14. ESTILOS COMUNES
  // ==========================================================

  const buttonStyle = {
    padding: "11px 16px",
    minHeight: "42px",
    borderRadius: "9px",
    border: "none",
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: "14px",
    cursor: busy ? "not-allowed" : "pointer",
    transition: "opacity 0.2s ease",
  };

  const inputStyle = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: "12px",
    margin: "6px 0 15px",
    border: "1px solid #CBD5E1",
    borderRadius: "9px",
    fontSize: "16px",
    backgroundColor: "#FFFFFF",
  };

  // ==========================================================
  // 15. MOSTRAR UNA PARTIDA
  // ==========================================================

  function renderSlot(slot) {
    const playersForDay = players
      .filter((player) => sameDay(player.day, slot.id))
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
      );

    const responsible =
      playersForDay.length === 4
        ? playersForDay[3]
        : null;

    const reserved = responsible?.reserved === true;

    const isResponsible =
      responsible && canLeave(responsible);

    const isFull = playersForDay.length >= 4;

    const pinChangeRequired =
      account?.must_change_pin === true;

    return (
      <article
        key={slot.id}
        style={{
          border: isFull
            ? "1px solid #FECACA"
            : "1px solid #D1FAE5",
          borderRadius: "16px",
          padding: "18px",
          marginBottom: "16px",
          backgroundColor: "#FFFFFF",
          boxShadow: "0 4px 12px rgba(15,23,42,0.07)",
          overflowWrap: "anywhere",
          boxSizing: "border-box",
        }}
      >
        <h3
          style={{
            margin: "0 0 14px",
            paddingBottom: "12px",
            borderBottom: "1px solid #E5E7EB",
            color: "#111827",
            fontSize: "18px",
            lineHeight: 1.4,
          }}
        >
          🎾 {slot.label}
        </h3>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 11px",
            marginBottom: "14px",
            borderRadius: "999px",
            backgroundColor: isFull ? "#FEE2E2" : "#DCFCE7",
            color: isFull ? "#991B1B" : "#166534",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          {isFull ? "🔒" : "👥"}
          {playersForDay.length}/4 jugadores
          {!isFull &&
            ` · ${4 - playersForDay.length} ${
              4 - playersForDay.length === 1
                ? "plaza libre"
                : "plazas libres"
            }`}
        </div>

        {/* Botón para apuntarse. */}
        <div>
          <button
            onClick={() => join(slot.id)}
            disabled={
              isFull || busy || !account || pinChangeRequired
            }
            title={
              !account
                ? "Inicia sesión para apuntarte"
                : pinChangeRequired
                  ? "Primero debes cambiar el PIN"
                  : ""
            }
            style={{
              ...buttonStyle,
              backgroundColor: isFull ? "#9CA3AF" : "#16A34A",
              opacity:
                busy || !account || pinChangeRequired ? 0.7 : 1,
            }}
          >
            {isFull
              ? "Partida completa"
              : !account
                ? "Inicia sesión para apuntarte"
                : pinChangeRequired
                  ? "Cambia primero tu PIN"
                  : "＋ Me apunto"}
          </button>
        </div>

        {/* Lista de jugadores con nombres en negrita. */}
        <div
          style={{
            marginTop: "16px",
            display: "grid",
            gap: "8px",
          }}
        >
          {playersForDay.map((player, index) => {
            const isResponsiblePlayer = index === 3;

            return (
              <div
                key={player.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "10px",
                  padding: "11px",
                  borderRadius: "10px",
                  backgroundColor: isResponsiblePlayer
                    ? "#FEF3C7"
                    : "#F9FAFB",
                  border: isResponsiblePlayer
                    ? "1px solid #F59E0B"
                    : "1px solid #E5E7EB",
                  boxSizing: "border-box",
                }}
              >
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: "16px",
                    color: isResponsiblePlayer
                      ? "#92400E"
                      : "#111827",
                  }}
                >
                  {player.name}
                  {isResponsiblePlayer
                    ? " 👑 Responsable"
                    : ""}
                </span>

                {/* Solo se muestra al propietario de la inscripción. */}
                {canLeave(player) && (
                  <button
                    type="button"
                    onClick={() => leave(player.id)}
                    disabled={busy || pinChangeRequired}
                    title={
                      pinChangeRequired
                        ? "Primero debes cambiar tu PIN"
                        : "Eliminar tu inscripción"
                    }
                    style={{
                      ...buttonStyle,
                      padding: "9px 12px",
                      backgroundColor: "#DC2626",
                      opacity:
                        busy || pinChangeRequired ? 0.7 : 1,
                    }}
                  >
                    Desapuntar
                  </button>
                )}
              </div>
            );
          })}

          {/* Mostrar las plazas vacías. */}
          {Array.from({
            length: Math.max(0, 4 - playersForDay.length),
          }).map((_, index) => (
            <div
              key={`empty-${slot.id}-${index}`}
              style={{
                padding: "10px 12px",
                borderRadius: "9px",
                border: "1px dashed #CBD5E1",
                color: "#94A3B8",
                fontSize: "14px",
                backgroundColor: "#FFFFFF",
              }}
            >
              ＋ Plaza disponible
            </div>
          ))}
        </div>

        {/* Controles del responsable de la reserva. */}
        {responsible && (
          <div
            style={{
              marginTop: "16px",
              padding: "14px",
              backgroundColor: reserved ? "#F0FDF4" : "#FFFBEB",
              border: reserved
                ? "1px solid #BBF7D0"
                : "1px solid #FDE68A",
              borderRadius: "11px",
            }}
          >
            <strong style={{ color: "#92400E" }}>
              👑 Responsable: {responsible.name}
            </strong>

            {!reserved && isResponsible && (
              <div style={{ marginTop: "12px" }}>
                <button
                  onClick={() => markReserved(responsible.id)}
                  disabled={busy || pinChangeRequired}
                  style={{
                    ...buttonStyle,
                    backgroundColor: "#64748B",
                    opacity:
                      busy || pinChangeRequired ? 0.7 : 1,
                  }}
                >
                  📍 Reservar pista
                </button>
              </div>
            )}

            {reserved && (
              <div
                style={{
                  color: "#15803D",
                  marginTop: "10px",
                  fontWeight: "bold",
                }}
              >
                ✅ Marcada como reservada en la web
              </div>
            )}

            {!reserved && !isResponsible && (
              <p style={{ marginBottom: 0, fontSize: "14px" }}>
                ⏳ Pendiente de reserva por el responsable.
              </p>
            )}
          </div>
        )}
      </article>
    );
  }

  // ==========================================================
  // 16. INTERFAZ PRINCIPAL
  // ==========================================================

  return (
    <main
      style={{
        maxWidth: "1400px",
        width: "100%",
        boxSizing: "border-box",
        margin: "0 auto",
        padding: "20px",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#1F2937",
        backgroundColor: "#F8FAFC",
        minHeight: "100vh",
      }}
    >
      <style jsx>{`
        .weeks-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 24px;
          align-items: start;
        }

        .week-column {
          min-width: 0;
        }

        .week-heading {
          padding: 15px 17px;
          margin: 0 0 16px;
          border-radius: 12px;
          background: #0F172A;
          color: #FFFFFF;
          font-size: 20px;
        }

        @media (max-width: 760px) {
          .weeks-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 14px;
          }

          .week-heading {
            font-size: 18px;
          }
        }
      `}</style>

      {/* Cabecera. */}
      <header
        style={{
          padding: "24px",
          marginBottom: "24px",
          borderRadius: "18px",
          background:
            "linear-gradient(135deg, #064E3B 0%, #15803D 65%, #22C55E 100%)",
          color: "#FFFFFF",
          boxShadow: "0 8px 22px rgba(6,78,59,0.18)",
        }}
      >
        <div
          style={{
            fontSize: "13px",
            textTransform: "uppercase",
            textAlign: "center",
            letterSpacing: "2px",
            opacity: 0.9,
            fontWeight: "bold",
          }}
        >
          Juega al Padel en Quintanar
        </div>

        <h1
          style={{
            fontSize: "clamp(27px, 5vw, 38px)",
            margin: "8px 0",
            textAlign: "center",
          }}
        >
          🎾 Reserva de Pádel
        </h1>

        <p
          style={{
            margin: 0,
            opacity: 0.95,
            textAlign: "center",
          }}
        >
          Organiza tus partidas y encuentra tu próximo partido.
        </p>
      </header>

      {/* Mensajes de estado y errores. */}
      {notice && (
        <div
          role="status"
          style={{
            marginBottom: "18px",
            padding: "14px 16px",
            borderRadius: "10px",
            backgroundColor: "#EFF6FF",
            border: "1px solid #BFDBFE",
            color: "#1E40AF",
            overflowWrap: "anywhere",
          }}
        >
          {notice}
        </div>
      )}

      {/* Registro e inicio de sesión. */}
      {!account ? (
        <section
          style={{
            maxWidth: "440px",
            marginBottom: "28px",
            padding: "22px",
            border: "1px solid #E2E8F0",
            borderRadius: "16px",
            backgroundColor: "#FFFFFF",
            boxShadow: "0 4px 14px rgba(15,23,42,0.05)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>
            {authMode === "login"
              ? "🔐 Iniciar sesión"
              : "📝 Crear cuenta"}
          </h2>

          <p style={{ color: "#64748B", lineHeight: 1.5 }}>
            {authMode === "login"
              ? "Entra con tu nombre y tu PIN personal."
              : "Necesitas un código de invitación para registrar tu nombre."}
          </p>

          <form onSubmit={handleAuth}>
            <label
              htmlFor="player-name"
              style={{ display: "block", marginBottom: "6px" }}
            >
              Nombre del jugador
            </label>

            <input
              id="player-name"
              type="text"
              autoComplete="username"
              maxLength={60}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              style={inputStyle}
            />

            {authMode === "register" && (
              <>
                <label
                  htmlFor="invite-code"
                  style={{ display: "block", marginBottom: "6px" }}
                >
                  Código de invitación
                </label>

                <input
                  id="invite-code"
                  type="text"
                  autoComplete="off"
                  required
                  value={inviteCode}
                  onChange={(event) =>
                    setInviteCode(event.target.value)
                  }
                  style={inputStyle}
                />
              </>
            )}

            <label
              htmlFor="player-pin"
              style={{ display: "block", marginBottom: "6px" }}
            >
              PIN personal (8–12 dígitos)
            </label>

            <input
              id="player-pin"
              type="password"
              inputMode="numeric"
              autoComplete={
                authMode === "login"
                  ? "current-password"
                  : "new-password"
              }
              minLength={8}
              maxLength={12}
              pattern="[0-9]{8,12}"
              required
              value={pin}
              onChange={(event) =>
                setPin(
                  event.target.value.replace(/\D/g, "").slice(0, 12)
                )
              }
              style={inputStyle}
            />

            <button
              type="submit"
              disabled={busy}
              style={{
                ...buttonStyle,
                backgroundColor: "#2563EB",
                width: "100%",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy
                ? "Procesando..."
                : authMode === "login"
                  ? "Entrar"
                  : "Registrarme"}
            </button>
          </form>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setAuthMode(
                authMode === "login" ? "register" : "login"
              );
              setPin("");
              setInviteCode("");
              setNotice("");
            }}
            style={{
              display: "block",
              marginTop: "14px",
              padding: "8px 0",
              border: "none",
              background: "transparent",
              color: "#2563EB",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            {authMode === "login"
              ? "¿Primera vez? Crear cuenta con invitación"
              : "Ya tengo cuenta. Iniciar sesión"}
          </button>
        </section>
      ) : (
        <section
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            marginBottom: "24px",
            padding: "16px",
            backgroundColor: "#F0FDF4",
            border: "1px solid #BBF7D0",
            borderRadius: "12px",
          }}
        >
          <strong>👋 Sesión iniciada: {account.name}</strong>

          <button
            onClick={logout}
            disabled={busy}
            style={{
              ...buttonStyle,
              backgroundColor: "#374151",
            }}
          >
            Cerrar sesión
          </button>
        </section>
      )}

      {/* Cambiar el PIN. */}
      {account && (
        <section
          style={{
            maxWidth: "480px",
            marginBottom: "28px",
            padding: "20px",
            border: "1px solid #E2E8F0",
            borderRadius: "14px",
            backgroundColor: account.must_change_pin
              ? "#FFFBEB"
              : "#FFFFFF",
          }}
        >
          <h2 style={{ marginTop: 0 }}>
            {account.must_change_pin
              ? "🔐 Cambia tu PIN temporal"
              : "Cambiar mi PIN"}
          </h2>

          {account.must_change_pin && (
            <p>
              El administrador te ha proporcionado un PIN temporal.
              Para proteger tu cuenta, debes establecer uno personal
              antes de utilizar las partidas.
            </p>
          )}

          <form onSubmit={changePlayerPin}>
            <label
              htmlFor="current-pin"
              style={{ display: "block", marginBottom: "6px" }}
            >
              PIN actual
            </label>

            <input
              id="current-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              minLength={8}
              maxLength={12}
              pattern="[0-9]{8,12}"
              required
              value={currentPin}
              onChange={(event) =>
                setCurrentPin(
                  event.target.value.replace(/\D/g, "").slice(0, 12)
                )
              }
              style={inputStyle}
            />

            <label
              htmlFor="new-pin"
              style={{ display: "block", marginBottom: "6px" }}
            >
              Nuevo PIN
            </label>

            <input
              id="new-pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              minLength={8}
              maxLength={12}
              pattern="[0-9]{8,12}"
              required
              value={newPin}
              onChange={(event) =>
                setNewPin(
                  event.target.value.replace(/\D/g, "").slice(0, 12)
                )
              }
              style={inputStyle}
            />

            <label
              htmlFor="confirm-pin"
              style={{ display: "block", marginBottom: "6px" }}
            >
              Repetir nuevo PIN
            </label>

            <input
              id="confirm-pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              minLength={8}
              maxLength={12}
              pattern="[0-9]{8,12}"
              required
              value={confirmPin}
              onChange={(event) =>
                setConfirmPin(
                  event.target.value.replace(/\D/g, "").slice(0, 12)
                )
              }
              style={inputStyle}
            />

            <button
              type="submit"
              disabled={busy}
              style={{
                ...buttonStyle,
                backgroundColor: "#2563EB",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy
                ? "Guardando..."
                : account.must_change_pin
                  ? "Guardar PIN personal"
                  : "Cambiar PIN"}
            </button>
          </form>
        </section>
      )}

      {loading && (
        <p style={{ color: "#64748B" }}>
          Cargando partidas...
        </p>
      )}

      {/* Las dos semanas de partidas. */}
      {!account?.must_change_pin && (
        <div className="weeks-grid">
          <section className="week-column">
            <h2 className="week-heading">
              📅 Esta semana
            </h2>

            {thisWeek.map(renderSlot)}
          </section>

          <section className="week-column">
            <h2 className="week-heading">
              📅 Próxima semana
            </h2>

            {nextWeek.map(renderSlot)}
          </section>
        </div>
      )}
    </main>
  );
}
