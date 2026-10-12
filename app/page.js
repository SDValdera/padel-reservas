
"use client";

// Importamos los hooks de React.
import { useEffect, useState } from "react";

// Cliente de conexión con Supabase.
import { supabase } from "../lib/supabase";

// ============================================================
// 1. GENERAR LOS HORARIOS DE LOS PRÓXIMOS 14 DÍAS
// ============================================================

function generateSlots() {
  const thisWeek = [];
  const nextWeek = [];

  // Nombres de los días de la semana.
  const dayNames = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];

  // Horarios disponibles según el día.
  const schedules = {
    1: ["18:30", "20:00"], // Lunes
    2: ["18:30", "20:00"], // Martes
    3: ["18:30", "20:00"], // Miércoles
    4: ["18:30", "20:00"], // Jueves
    5: ["18:30", "20:00"], // Viernes
    6: ["09:30", "11:00"], // Sábado
    0: ["09:30", "11:00"], // Domingo
  };

  // Obtenemos la fecha actual.
  // Esta función se ejecutará desde useEffect.
  const today = new Date();

  // Generamos los horarios de los próximos 14 días.
  for (let i = 0; i < 14; i++) {
    const date = new Date(today);

    // Sumamos los días correspondientes.
    date.setDate(today.getDate() + i);

    // Obtenemos el día de la semana.
    const dayOfWeek = date.getDay();

    // Si existen horarios para ese día, los generamos.
    if (schedules[dayOfWeek]) {
      // Convertimos la fecha a formato DD/MM.
      const formattedDate =
        String(date.getDate()).padStart(2, "0") +
        "/" +
        String(date.getMonth() + 1).padStart(2, "0");

      // Creamos una partida por cada horario.
      schedules[dayOfWeek].forEach((hour) => {
        const slot = {
          // Identificador utilizado para relacionar jugadores y horarios.
          id: `${formattedDate}-${hour}`,

          // Nombre visible de la partida.
          label: `${dayNames[dayOfWeek]} ${formattedDate} - ${hour}`,
        };

        // Separamos los horarios en dos grupos.
        if (i < 7) {
          thisWeek.push(slot);
        } else {
          nextWeek.push(slot);
        }
      });
    }
  }

  return { thisWeek, nextWeek };
}

// ============================================================
// 2. COMPONENTE PRINCIPAL
// ============================================================

export default function Home() {
  // Nombre introducido por el usuario.
  const [name, setName] = useState("");

  // Jugadores recuperados de Supabase.
  const [players, setPlayers] = useState([]);

  // Horarios que mostraremos en pantalla.
  const [slots, setSlots] = useState({
    thisWeek: [],
    nextWeek: [],
  });

  // Extraemos los dos grupos de horarios.
  const { thisWeek, nextWeek } = slots;

  // ==========================================================
  // 3. ABRIR RESASPORTS EN ANDROID
  // ==========================================================

  function openResasports() {
    // Identificador de paquete de Resasports en Android.
    const packageName = "com.Nubapp.LesJoueurs";

    // Enlace de Google Play para utilizarlo como alternativa.
    const playStoreUrl =
      `https://play.google.com/store/apps/details?id=${packageName}`;

    // Detectamos si el dispositivo utiliza Android.
    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isAndroid) {
      // Intentamos abrir la aplicación.
      // El esquema "resasports" no está confirmado oficialmente;
      // la apertura directa dependerá de los enlaces que admita la app.
      const intentUrl =
        `intent://#Intent;` +
        `package=${packageName};` +
        `scheme=resasports;` +
        `S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};` +
        `end`;

      // Redirigimos al navegador para que Android gestione el intento.
      window.location.href = intentUrl;
    } else {
      // En ordenador o dispositivos que no sean Android,
      // abrimos la ficha de Resasports en Google Play.
      window.open(
        playStoreUrl,
        "_blank",
        "noopener,noreferrer"
      );
    }
  }

  // ==========================================================
  // 4. CARGAR LOS JUGADORES DESDE SUPABASE
  // ==========================================================

  async function loadPlayers() {
    // Consultamos todos los registros de la tabla players.
    // Los ordenamos por fecha de creación.
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("created_at");

    // Si hay un error, lo mostramos en la consola.
    if (error) {
      console.error("Error cargando jugadores:", error);
      return;
    }

    // Actualizamos el estado con los datos recuperados.
    setPlayers(data || []);
  }

  // ==========================================================
  // 5. APUNTARSE A UNA PARTIDA
  // ==========================================================

  async function join(day) {
    // Comprobamos que el nombre no esté vacío.
    if (!name.trim()) {
      alert("Introduce tu nombre");
      return;
    }

    // Eliminamos espacios al principio y al final.
    const cleanName = name.trim();

    // Buscamos los jugadores de la partida seleccionada.
    const playersForDay = players.filter(
      (p) => p.day === day
    );

    // Una partida admite como máximo cuatro jugadores.
    if (playersForDay.length >= 4) {
      alert("Partida completa");
      return;
    }

    // Evitamos inscripciones duplicadas con el mismo nombre.
    // La comparación ignora mayúsculas y minúsculas.
    const alreadyJoined = playersForDay.find(
      (p) =>
        p.name.trim().toLowerCase() ===
        cleanName.toLowerCase()
    );

    if (alreadyJoined) {
      alert("Ya estás apuntado");
      return;
    }

    // Guardamos la inscripción en Supabase.
    const { error } = await supabase
      .from("players")
      .insert({
        day,
        name: cleanName,
      });

    // Gestionamos posibles errores de inserción.
    if (error) {
      console.error("Error al apuntarse:", error);
      alert("No se ha podido completar la inscripción");
      return;
    }

    // Actualizamos la lista de jugadores.
    // El campo name del formulario se mantiene intacto.
    await loadPlayers();
  }

  // ==========================================================
  // 6. COMPROBAR SI EL USUARIO PUEDE DESAPUNTARSE
  // ==========================================================

  function canLeave(player) {
    // Solo permitimos mostrar el botón si el nombre coincide
    // con el de la inscripción.
    return (
      name.trim().length > 0 &&
      name.trim().toLowerCase() ===
        player.name.trim().toLowerCase()
    );
  }

  // ==========================================================
  // 7. DESAPUNTARSE DE UNA PARTIDA
  // ==========================================================

  async function leave(id) {
    // Buscamos el jugador por su ID.
    const player = players.find(
      (p) => String(p.id) === String(id)
    );

    // Comprobamos que el registro exista y el nombre coincida.
    if (!player || !canLeave(player)) {
      alert(
        "Escribe el mismo nombre con el que te apuntaste."
      );
      return;
    }

    // Eliminamos la inscripción de Supabase.
    const { error } = await supabase
      .from("players")
      .delete()
      .eq("id", id);

    // Mostramos un aviso si falla la eliminación.
    if (error) {
      console.error("Error al desapuntarse:", error);
      alert("No se ha podido eliminar la inscripción");
      return;
    }

    // Recargamos los jugadores.
    await loadPlayers();
  }

  // ==========================================================
  // 8. MARCAR LA PISTA COMO RESERVADA
  // ==========================================================

  async function markReserved(id) {
    // Buscamos al jugador que figura como responsable.
    const responsible = players.find(
      (p) => String(p.id) === String(id)
    );

    if (!responsible) {
      alert("No se ha encontrado al responsable");
      return;
    }

    // Recuperamos y ordenamos los jugadores de esa partida.
    const playersForDay = players
      .filter((p) => p.day === responsible.day)
      .sort(
        (a, b) =>
          new Date(a.created_at) -
          new Date(b.created_at)
      );

    // Verificamos que haya cuatro jugadores y que el responsable
    // sea el cuarto inscrito.
    if (
      playersForDay.length !== 4 ||
      String(playersForDay[3].id) !== String(id)
    ) {
      alert("Solo el cuarto jugador puede reservar");
      return;
    }

    // Comprobamos que el nombre introducido sea el responsable.
    if (
      name.trim().toLowerCase() !==
      responsible.name.trim().toLowerCase()
    ) {
      alert("Solo el responsable puede marcar la reserva");
      return;
    }

    // Abrimos Resasports cuando el responsable pulsa reservar.
    // Esto no confirma ni realiza una reserva dentro de Resasports.
    openResasports();

    // IMPORTANTE:
    // El código original también marca reserved = true en Supabase.
    // Se conserva ese comportamiento, aunque abrir Resasports
    // no significa que la pista se haya reservado realmente.
    const { error } = await supabase
      .from("players")
      .update({ reserved: true })
      .eq("id", id);

    if (error) {
      console.error("Error al actualizar la reserva:", error);
      alert("No se ha podido marcar la reserva en la web");
      return;
    }

    // Actualizamos el estado visible.
    await loadPlayers();
  }

  // ==========================================================
  // 9. CARGA INICIAL DE LA PÁGINA
  // ==========================================================

  useEffect(() => {
    // Generamos los horarios después del montaje del componente.
    // Así evitamos errores de hidratación con new Date().
    setSlots(generateSlots());

    // Cargamos los jugadores guardados en la base de datos.
    loadPlayers();
  }, []);

  // ==========================================================
  // 10. MOSTRAR UNA PARTIDA
  // ==========================================================

  function renderSlot(slot) {
    // Jugadores que pertenecen a este horario.
    const playersForDay = players.filter(
      (p) => p.day === slot.id
    );

    // El cuarto jugador inscrito es el responsable.
    const responsible =
      playersForDay.length === 4
        ? playersForDay[3]
        : null;

    // Comprobamos si la pista está marcada como reservada.
    const reserved =
      responsible?.reserved === true;

    // Comprobamos si el nombre introducido coincide
    // con el del responsable.
    const isResponsible =
      responsible &&
      name.trim().length > 0 &&
      name.trim().toLowerCase() ===
        responsible.name.trim().toLowerCase();

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
        {/* Día, fecha y hora */}
        <h3>{slot.label}</h3>

        {/* Número de jugadores apuntados */}
        <p>
          <strong>
            {playersForDay.length}/4 jugadores
          </strong>
        </p>

        {/* Botón para apuntarse */}
        <button
          onClick={() => join(slot.id)}
          disabled={playersForDay.length >= 4}
          style={{
            padding: "10px 16px",
            minHeight: "42px",
            borderRadius: "8px",
            border: "none",
            backgroundColor:
              playersForDay.length >= 4
                ? "#9CA3AF"
                : "#16A34A",
            color: "#FFFFFF",
            fontWeight: "bold",
            cursor:
              playersForDay.length >= 4
                ? "not-allowed"
                : "pointer",
            opacity:
              playersForDay.length >= 4 ? 0.7 : 1,
          }}
        >
          {playersForDay.length >= 4
            ? "Partida completa"
            : "Me apunto"}
        </button>

        {/* Listado de jugadores */}
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
              {/* Mostramos una corona junto al cuarto jugador */}
              <span>
                {player.name}
                {index === 3 ? " 👑" : ""}
              </span>

              {/* El botón de baja solo aparece al usuario correspondiente */}
              {canLeave(player) && (
                <button
                  onClick={() => leave(player.id)}
                  style={{
                    padding: "8px 12px",
                    minHeight: "40px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#DC2626",
                    color: "#FFFFFF",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Desapuntar
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Panel del responsable */}
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

            {/* Solo el responsable puede pulsar reservar */}
            {!reserved && isResponsible && (
              <div style={{ marginTop: "12px" }}>
                <button
                  onClick={() => markReserved(responsible.id)}
                  style={{
                    padding: "10px 16px",
                    minHeight: "42px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#6B7280",
                    color: "#FFFFFF",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Reservar pista
                </button>
              </div>
            )}

            {/* Estado visible para todos */}
            {reserved && (
              <div
                style={{
                  color: "#15803D",
                  marginTop: "10px",
                  fontWeight: "bold",
                }}
              >
                ✅ Pista reservada
              </div>
            )}

            {/* Mensaje para el resto de jugadores */}
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
  // 11. DISEÑO GENERAL Y DISTRIBUCIÓN RESPONSIVE
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
      {/* Estilos para ordenador y móvil */}
      <style>{`
        /* Dos columnas en pantallas grandes */
        .weeks-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 24px;
          align-items: start;
        }

        /* Evita desbordamientos de las columnas */
        .week-column {
          min-width: 0;
        }

        /* Estilos de los títulos de las partidas */
        .slot-card h3 {
          line-height: 1.5;
          font-size: 1.05rem;
        }

        /* Adaptamos los botones al ancho disponible */
        .slot-card button {
          max-width: 100%;
          white-space: normal;
          overflow-wrap: anywhere;
        }

        /* Diseño para móviles */
        @media (max-width: 700px) {
          .weeks-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 12px;
          }

          .week-column h2 {
            font-size: 1.25rem;
          }

          .slot-card {
            padding: 12px !important;
          }

          .slot-card h3 {
            font-size: 1rem;
          }
        }
      `}</style>

      {/* Título de la aplicación */}
      <h1 style={{ marginBottom: "20px" }}>
        🎾 Reserva Pádel
      </h1>

      {/* Campo para introducir el nombre del jugador */}
      <input
        type="text"
        placeholder="Tu nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{
          padding: "12px",
          width: "100%",
          maxWidth: "300px",
          boxSizing: "border-box",
          marginBottom: "24px",
          border: "1px solid #D1D5DB",
          borderRadius: "8px",
          fontSize: "16px",
        }}
      />

      {/* Contenedor con las dos semanas */}
      <div className="weeks-grid">
        {/* Primera columna: primeros siete días */}
        <section className="week-column">
          <h2>📅 Esta semana</h2>
          {thisWeek.map((slot) => renderSlot(slot))}
        </section>

        {/* Segunda columna: siguientes siete días */}
        <section className="week-column">
          <h2>📅 Próxima semana</h2>
          {nextWeek.map((slot) => renderSlot(slot))}
        </section>
      </div>
    </main>
  );
}
