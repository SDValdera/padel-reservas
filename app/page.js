
"use client";

import { useCallback, useEffect, useState } from "react";

// ============================================================
// 1. GENERAR LOS HORARIOS DE LOS PRÓXIMOS 14 DÍAS
// ============================================================

function generateSlots() {
  const thisWeek = [];
  const nextWeek = [];

  const dayNames = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];

  // Horarios de las partidas según el día de la semana.
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

      // Convertimos el horario local a ISO para Supabase.
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
        label: dayNames[dayOfWeek] + " " + formattedDate + " - " + hour,
      };

      // Los primeros siete días aparecen en la primera columna.
      if (i < 7) {
        thisWeek.push(slot);
      } else {
        nextWeek.push(slot);
      }
    }
  }

  return { thisWeek, nextWeek };
}

// Comparar fechas ISO sin depender de su formato de representación.
function sameDay(first, second) {
  if (!first || !second) return false;

  return new Date(first).getTime() === new Date(second).getTime();
}

// ============================================================
// 2. COMPONENTE PRINCIPAL
// ============================================================

export default function Home() {
  // Campos de inicio de sesión y registro.
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [authMode, setAuthMode] = useState("login");

  // Estado del formulario para cambiar el PIN.
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // Datos de la cuenta y de las partidas.
  const [account, setAccount] = useState(null);
  const [players, setPlayers] = useState([]);
  const [slots, setSlots] = useState({
    thisWeek: [],
    nextWeek: [],
  });

  // Estado general de carga y mensajes.
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

    // Si hay acción, enviamos una petición POST.
    // Si no hay acción, consultamos mediante GET.
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

      // La API también devuelve must_change_pin.
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

      // El GET posterior obtiene también si debe cambiar el PIN.
      await loadPlayers();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // 6. CERRAR SESIÓN DE JUGADOR
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
  // 7. CAMBIAR EL PIN DEL JUGADOR
  // ==========================================================

  async function changePlayerPin(event) {
    event.preventDefault();

    if (busy) return;

    // Validar el PIN actual.
    if (!/^\d{8,12}$/.test(currentPin)) {
      setNotice("Introduce tu PIN actual.");
      return;
    }

    // Validar el nuevo PIN.
    if (!/^\d{8,12}$/.test(newPin)) {
      setNotice("El nuevo PIN debe tener entre 8 y 12 dígitos.");
      return;
    }

    // Confirmar que ambos PIN nuevos coinciden.
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
      // El servidor verifica el PIN actual y guarda el nuevo hash.
      await apiRequest("change-pin", {
        currentPin,
        newPin,
        confirmPin,
      });

      // La API invalida las sesiones y elimina la cookie actual.
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

    // No permitir operaciones mientras haya un PIN temporal.
    if (account.must_change_pin) {
      setNotice("Debes cambiar tu PIN temporal antes de continuar.");
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
  // 9. COMPROBAR SI EL JUGADOR ES EL PROPIETARIO
  // ==========================================================

  // Esta comprobación controla los botones visibles.
  // Los permisos reales también deben verificarse en el servidor.
  function canLeave(player) {
    return Boolean(
      account &&
        player.name &&
        account.name &&
        player.name.trim().toLowerCase() ===
          account.name.trim().toLowerCase()
    );
  }

  // ==========================================================
  // 10. DESAPUNTARSE DE UNA PARTIDA
  // ==========================================================

  async function leave(id) {
    if (!account) {
      setNotice("Inicia sesión para desapuntarte.");
      return;
    }

    if (account.must_change_pin) {
      setNotice("Debes cambiar tu PIN temporal antes de continuar.");
      return;
    }

    if (busy) return;

    const player = players.find(
      (item) => String(item.id) === String(id)
    );

    if (!player) {
      setNotice("No se ha encontrado esa inscripción.");
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      await apiRequest("leave", {
        id,
        day: player.day,
      });

      await loadPlayers();
      setNotice("Te has desapuntado de la partida.");
    } catch (error) {
      setNotice(error.message);
      await loadPlayers();
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // 11. ABRIR RESASPORTS SEGÚN EL DISPOSITIVO
  // ==========================================================

  function openResasports() {
    // Web de reservas para ordenador y alternativa para iPhone.
    const bookingUrl = "https://centro.resasports.com/login";

    // Identificador Android que estamos probando.
    const packageName = "com.Nubapp.LesJoueurs";

    // Enlace a Google Play por si Android no abre la aplicación.
    const playStoreUrl =
      "https://play.google.com/store/apps/details?id=" +
      packageName;

    // Detectar el dispositivo.
    const userAgent = navigator.userAgent || "";

    const isAndroid = /Android/i.test(userAgent);

    const isIPhone = /iPhone|iPod/i.test(userAgent);

    // Algunos iPad se identifican como ordenadores Mac.
    const isIPad =
      /iPad/i.test(userAgent) ||
      (navigator.platform === "MacIntel" &&
        navigator.maxTouchPoints > 1);

    // --------------------------------------------------------
    // ANDROID
    // Intentar abrir ResaSports mediante un Android Intent.
    // Si no se puede abrir, Android/Chrome puede usar Google Play.
    // --------------------------------------------------------
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

    // --------------------------------------------------------
    // IPHONE / IPAD
    // Intentar abrir la aplicación instalada.
    // Si el navegador continúa activo, abrir la web de reservas.
    //
    // NOTA: "resasports://" es un esquema provisional.
    // Para garantizar la apertura de la app necesitamos confirmar
    // que ResaSports admite oficialmente ese esquema.
    // --------------------------------------------------------
    if (isIPhone || isIPad) {
      let appOpened = false;
      let fallbackTimer;

      // Si Safari pasa a segundo plano, normalmente significa
      // que se ha cambiado a otra aplicación.
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

      // Intentar abrir ResaSports.
      window.location.href = "resasports://";

      // Si la aplicación no se abre, recurrir a la web.
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

    // --------------------------------------------------------
    // ORDENADOR
    // Abrir la web de reservas en una nueva pestaña.
    // --------------------------------------------------------
    window.open(
      bookingUrl,
      "_blank",
      "noopener,noreferrer"
    );
  }

  // ==========================================================
  // 12. MARCAR LA RESERVA EN LA WEB
  // ==========================================================

  async function markReserved(id) {
    if (!account) {
      setNotice("Inicia sesión para continuar.");
      return;
    }

    if (account.must_change_pin) {
      setNotice("Debes cambiar tu PIN temporal antes de continuar.");
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

    // Ordenar las inscripciones para identificar al cuarto jugador.
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
      // Marcar primero la reserva en nuestra aplicación.
      await apiRequest("reserve", {
        id,
        day: responsible.day,
      });

      await loadPlayers();

      setNotice(
        "Marcada en la web. Comprueba y completa la reserva en ResaSports."
      );

      // Abrir ResaSports según el dispositivo.
      // Esto no confirma una reserva dentro de ResaSports.
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
    // Generar los horarios en el navegador.
    setSlots(generateSlots());

    // Cargar jugadores y sesión.
    loadPlayers();
  }, [loadPlayers]);

  // ==========================================================
  // 14. MOSTRAR UNA PARTIDA
  // ==========================================================

  function renderSlot(slot) {
    const playersForDay = players
      .filter((player) => sameDay(player.day, slot.id))
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
      );

    // El cuarto jugador es el responsable de reservar.
    const responsible =
      playersForDay.length === 4 ? playersForDay[3] : null;

    const reserved = responsible?.reserved === true;
    const isResponsible =
      responsible && canLeave(responsible);

    const isFull = playersForDay.length >= 4;
    const pinChangeRequired =
      account?.must_change_pin === true;

    return (
      <div
        key={slot.id}
        className="slot-card"
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: "12px",
          padding: "15px",
          marginBottom: "15px",
          backgroundColor: "#FFFFFF",
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
          overflowWrap: "anywhere",
          boxSizing: "border-box",
        }}
      >
        <h3>{slot.label}</h3>

        <p>
          <strong>{playersForDay.length}/4 jugadores</strong>
        </p>

        {/* Botón para apuntarse a la partida. */}
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
            padding: "10px 16px",
            minHeight: "42px",
            borderRadius: "8px",
            border: "none",
            backgroundColor: isFull ? "#9CA3AF" : "#16A34A",
            color: "#FFFFFF",
            fontWeight: "bold",
            cursor:
              isFull || busy || !account || pinChangeRequired
                ? "not-allowed"
                : "pointer",
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
                : "Me apunto"}
        </button>

        {/* Lista de jugadores apuntados. */}
        <div style={{ marginTop: "12px" }}>
          {playersForDay.map((player, index) => (
            <div
              key={player.id}
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "8px",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <span>
                {player.name}
                {index === 3 ? " 👑" : ""}
              </span>

              {/* Solo el propietario puede desapuntarse. */}
              {canLeave(player) && (
                <button
                  onClick={() => leave(player.id)}
                  disabled={
                    busy ||
                    player.reserved === true ||
                    pinChangeRequired
                  }
                  style={{
                    padding: "8px 12px",
                    minHeight: "40px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#DC2626",
                    color: "#FFFFFF",
                    fontWeight: "bold",
                    cursor:
                      busy || pinChangeRequired
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  Desapuntar
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Información y controles del responsable. */}
        {responsible && (
          <div
            style={{
              marginTop: "15px",
              padding: "12px",
              backgroundColor: "#FFF8DC",
              borderRadius: "8px",
            }}
          >
            <strong>
              👑 Responsable: {responsible.name}
            </strong>

            {!reserved && isResponsible && (
              <div style={{ marginTop: "12px" }}>
                <button
                  onClick={() => markReserved(responsible.id)}
                  disabled={busy || pinChangeRequired}
                  style={{
                    padding: "10px 16px",
                    minHeight: "42px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#6B7280",
                    color: "#FFFFFF",
                    fontWeight: "bold",
                    cursor:
                      busy || pinChangeRequired
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  Reservar pista
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
              <p style={{ marginBottom: 0 }}>
                ⏳ Pendiente de reserva por el responsable.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ==========================================================
  // 15. INTERFAZ PRINCIPAL
  // ==========================================================

  return (
    <main
      style={{
        maxWidth: "1400px",
        width: "100%",
        boxSizing: "border-box",
        margin: "0 auto",
        padding: "20px",
        fontFamily: "Arial, sans-serif",
        color: "#1F2937",
      }}
    >

      <h1 style={{ marginBottom: "20px" }}>
        🎾 Reserva Pádel
      </h1>

      {/* Mensajes de estado, errores y confirmaciones. */}
      {notice && (
        <div
          role="status"
          style={{
            marginBottom: "16px",
            padding: "12px",
            borderRadius: "8px",
            backgroundColor: "#F3F4F6",
            overflowWrap: "anywhere",
          }}
        >
          {notice}
        </div>
      )}

      {/* ====================================================
          FORMULARIO DE REGISTRO E INICIO DE SESIÓN
          ==================================================== */}

      {!account ? (
        <section
          style={{
            maxWidth: "420px",
            marginBottom: "28px",
            padding: "18px",
            border: "1px solid #E5E7EB",
            borderRadius: "12px",
          }}
        >
          <h2 style={{ marginTop: 0 }}>
            {authMode === "login"
              ? "Iniciar sesión"
              : "Crear cuenta"}
          </h2>

          <p>
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
              style={{
                padding: "12px",
                width: "100%",
                boxSizing: "border-box",
                marginBottom: "14px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "16px",
              }}
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
                  style={{
                    padding: "12px",
                    width: "100%",
                    boxSizing: "border-box",
                    marginBottom: "14px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "16px",
                  }}
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
              style={{
                padding: "12px",
                width: "100%",
                boxSizing: "border-box",
                marginBottom: "16px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "16px",
              }}
            />

            <button
              type="submit"
              disabled={busy}
              style={{
                padding: "11px 16px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#2563EB",
                color: "#FFFFFF",
                fontWeight: "bold",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy
                ? "Procesando..."
                : authMode === "login"
                  ? "Entrar"
                  : "Registrarme"}
            </button>
          </form>

          {/* Alternar entre entrar y crear una cuenta. */}
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
        // Información de la sesión del jugador autenticado.
        <section
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            marginBottom: "24px",
            padding: "14px",
            backgroundColor: "#F0FDF4",
            borderRadius: "10px",
          }}
        >
          <strong>Sesión iniciada: {account.name}</strong>

          <button
            onClick={logout}
            disabled={busy}
            style={{
              padding: "9px 14px",
              border: "none",
              borderRadius: "8px",
              backgroundColor: "#374151",
              color: "#FFFFFF",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Cerrar sesión
          </button>
        </section>
      )}

      {/* ====================================================
          FORMULARIO PARA CAMBIAR EL PIN
          ==================================================== */}

      {account && (
        <section
          style={{
            maxWidth: "480px",
            marginBottom: "28px",
            padding: "18px",
            border: "1px solid #E5E7EB",
            borderRadius: "12px",
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
              style={{
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                padding: "12px",
                margin: "6px 0 14px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "16px",
              }}
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
              style={{
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                padding: "12px",
                margin: "6px 0 14px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "16px",
              }}
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
              style={{
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                padding: "12px",
                margin: "6px 0 14px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "16px",
              }}
            />

            <button
              type="submit"
              disabled={busy}
              style={{
                padding: "11px 16px",
                border: "none",
                borderRadius: "8px",
                backgroundColor: "#2563EB",
                color: "#FFFFFF",
                fontWeight: "bold",
                cursor: busy ? "not-allowed" : "pointer",
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

      {loading && <p>Cargando partidas...</p>}

      {/* ====================================================
          LAS DOS SEMANAS DE PARTIDAS
          ==================================================== */}

      {!account?.must_change_pin && (
        <div className="weeks-grid">
          <section className="week-column">
            <h2>📅 Esta semana</h2>
            {thisWeek.map(renderSlot)}
          </section>

          <section className="week-column">
            <h2>📅 Próxima semana</h2>
            {nextWeek.map(renderSlot)}
          </section>
        </div>
      )}
    </main>
  );
}