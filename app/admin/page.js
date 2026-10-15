
"use client";

import { useEffect, useState } from "react";

export default function AdminPage() {
  // Datos del formulario de acceso.
  const [password, setPassword] = useState("");

  // Datos para crear invitaciones.
  const [name, setName] = useState("");
  const [invite, setInvite] = useState(null);

  // Datos para restablecer el PIN de una cuenta existente.
  const [resetName, setResetName] = useState("");
  const [temporaryPin, setTemporaryPin] = useState(null);

  // Estado general de la página.
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // ====================================================
  // COMUNICACIÓN CON LA API
  // ====================================================

  async function api(action, values = {}) {
    const response = await fetch("/api/padel", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ action, ...values }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Ha ocurrido un error.");
    }

    return result;
  }

  // ====================================================
  // COMPROBAR SI YA HAY UNA SESIÓN DE ADMINISTRADOR
  // ====================================================

  useEffect(() => {
    let active = true;

    api("admin-status")
      .then((result) => {
        if (active) {
          setAuthenticated(result.authenticated === true);
        }
      })
      .catch(() => {
        if (active) {
          setMessage("No se ha podido comprobar la sesión.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Evitar actualizar el estado si la página se desmonta.
    return () => {
      active = false;
    };
  }, []);

  // ====================================================
  // INICIAR SESIÓN DE ADMINISTRADOR
  // ====================================================

  async function login(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      await api("admin-login", { password });

      setAuthenticated(true);
      setPassword("");
      setMessage("Sesión de administrador iniciada.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  // ====================================================
  // GENERAR INVITACIÓN PARA UN NUEVO JUGADOR
  // ====================================================

  async function createInvite(event) {
    event.preventDefault();
    if (busy) return;

    const cleanName = name.trim();

    if (cleanName.length < 2 || cleanName.length > 60) {
      setMessage("El nombre debe tener entre 2 y 60 caracteres.");
      return;
    }

    setBusy(true);
    setMessage("");
    setInvite(null);

    try {
      const result = await api("create-invite", {
        name: cleanName,
      });

      setInvite(result);
      setName("");
      setMessage("Invitación generada correctamente.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  // Copiar la invitación para compartirla por WhatsApp.
  async function copyInvite() {
    if (!invite) return;

    const text = [
      `Hola ${invite.name},`,
      "",
      "Te invito a crear tu cuenta para las reservas de pádel.",
      `Tu código de invitación es: ${invite.code}`,
      "",
      "Entra en la web de reservas y pulsa «Crear cuenta con invitación».",
      "Introduce tu nombre, el código y crea tu PIN personal.",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setMessage("Invitación copiada. Ya puedes pegarla en WhatsApp.");
    } catch {
      setMessage(
        "No se ha podido copiar automáticamente. Selecciona el código y cópialo."
      );
    }
  }

  // ====================================================
  // RESTABLECER EL PIN DE UN JUGADOR EXISTENTE
  // ====================================================

  async function resetPlayerPin(event) {
    event.preventDefault();
    if (busy) return;

    const cleanName = resetName.trim();

    if (cleanName.length < 2 || cleanName.length > 60) {
      setMessage("Introduce un nombre válido.");
      return;
    }

    setBusy(true);
    setMessage("");
    setTemporaryPin(null);

    try {
      // La API comprueba la sesión de administrador.
      const result = await api("admin-reset-pin", {
        name: cleanName,
      });

      setTemporaryPin(result);
      setResetName("");

      if (result.sessionsInvalidated) {
        setMessage(
          "PIN temporal generado. Las sesiones anteriores se han invalidado."
        );
      } else {
        setMessage(
          "PIN temporal generado, pero hay que revisar la invalidación de sesiones en el servidor."
        );
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  // Copiar el PIN temporal para enviarlo al jugador.
  async function copyTemporaryPin() {
    if (!temporaryPin?.temporaryPin) return;

    const text = [
      `Hola ${temporaryPin.name},`,
      "",
      `Tu PIN temporal para las reservas de pádel es: ${temporaryPin.temporaryPin}`,
      "",
      "Entra en la web, inicia sesión con tu nombre y este PIN, y cámbialo por uno personal.",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setMessage("PIN copiado. Ya puedes pegarlo en WhatsApp.");
    } catch {
      setMessage(
        "No se ha podido copiar automáticamente. Selecciona el PIN y cópialo."
      );
    }
  }

  // ====================================================
  // CERRAR SESIÓN DE ADMINISTRADOR
  // ====================================================

  async function logout() {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      await api("admin-logout");

      setAuthenticated(false);
      setInvite(null);
      setTemporaryPin(null);
      setPassword("");
      setMessage("Sesión de administrador cerrada.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  // ====================================================
  // ESTILOS COMPARTIDOS
  // ====================================================

  const inputStyle = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: "12px",
    marginTop: "6px",
    border: "1px solid #D1D5DB",
    borderRadius: "8px",
    fontSize: "16px",
  };

  const primaryButtonStyle = {
    padding: "11px 16px",
    border: "none",
    borderRadius: "8px",
    backgroundColor: "#2563EB",
    color: "#FFFFFF",
    fontWeight: "bold",
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.7 : 1,
  };

  const sectionStyle = {
    marginTop: "24px",
    padding: "20px",
    border: "1px solid #E5E7EB",
    borderRadius: "12px",
  };

  // ====================================================
  // INTERFAZ
  // ====================================================

  return (
    <main
      style={{
        maxWidth: "650px",
        margin: "0 auto",
        padding: "24px 16px",
        fontFamily: "Arial, sans-serif",
        color: "#1F2937",
      }}
    >
      <h1>🎾 Administración de pádel</h1>

      <p>
        Gestiona las invitaciones y los PIN de los jugadores.
      </p>

      {/* Mensajes de éxito y error. */}
      {message && (
        <div
          role="status"
          style={{
            padding: "12px",
            margin: "16px 0",
            backgroundColor: "#F3F4F6",
            borderRadius: "8px",
            overflowWrap: "anywhere",
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <p>Comprobando sesión...</p>
      ) : !authenticated ? (
        // Pantalla de acceso privado del administrador.
        <section style={sectionStyle}>
          <h2>Acceso privado</h2>

          <form onSubmit={login}>
            <label htmlFor="admin-password">
              Contraseña de administrador
            </label>

            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={200}
              style={inputStyle}
            />

            <button
              type="submit"
              disabled={busy}
              style={{ ...primaryButtonStyle, marginTop: "16px" }}
            >
              {busy ? "Comprobando..." : "Entrar"}
            </button>
          </form>
        </section>
      ) : (
        // Panel visible únicamente al administrador autenticado.
        <>
          <section style={sectionStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <h2>Panel de administración</h2>

              <button
                type="button"
                onClick={logout}
                disabled={busy}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  backgroundColor: "#FFFFFF",
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                Cerrar sesión
              </button>
            </div>
          </section>

          {/* Sección para dar de alta nuevos jugadores. */}
          <section style={sectionStyle}>
            <h2>Generar invitación</h2>

            <p>
              Introduce el nombre del jugador al que quieres autorizar
              a crear su cuenta.
            </p>

            <form onSubmit={createInvite}>
              <label htmlFor="player-name">Nombre del jugador</label>

              <input
                id="player-name"
                type="text"
                autoComplete="off"
                minLength={2}
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                style={inputStyle}
              />

              <button
                type="submit"
                disabled={busy}
                style={{ ...primaryButtonStyle, marginTop: "16px" }}
              >
                {busy ? "Generando..." : "Generar invitación"}
              </button>
            </form>

            {invite && (
              <div
                style={{
                  marginTop: "24px",
                  padding: "16px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "10px",
                  backgroundColor: "#F9FAFB",
                }}
              >
                <h3>Invitación para {invite.name}</h3>

                <p>
                  Comparte el código con el jugador. Solo se muestra
                  en esta respuesta.
                </p>

                <div
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #D1D5DB",
                    overflowWrap: "anywhere",
                    fontFamily: "monospace",
                    userSelect: "all",
                  }}
                >
                  {invite.code}
                </div>

                <button
                  type="button"
                  onClick={copyInvite}
                  style={{
                    ...primaryButtonStyle,
                    marginTop: "12px",
                  }}
                >
                  Copiar invitación para WhatsApp
                </button>
              </div>
            )}
          </section>

          {/* Sección para recuperar la cuenta de un jugador. */}
          <section style={sectionStyle}>
            <h2>Restablecer PIN</h2>

            <p>
              Usa esta opción si un jugador ha olvidado su PIN.
              Se generará uno temporal y deberá cambiarlo al entrar.
            </p>

            <form onSubmit={resetPlayerPin}>
              <label htmlFor="reset-player-name">
                Nombre del jugador existente
              </label>

              <input
                id="reset-player-name"
                type="text"
                autoComplete="off"
                minLength={2}
                maxLength={60}
                value={resetName}
                onChange={(event) => setResetName(event.target.value)}
                required
                style={inputStyle}
              />

              <button
                type="submit"
                disabled={busy}
                style={{ ...primaryButtonStyle, marginTop: "16px" }}
              >
                {busy ? "Restableciendo..." : "Generar PIN temporal"}
              </button>
            </form>

            {temporaryPin && (
              <div
                style={{
                  marginTop: "24px",
                  padding: "16px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "10px",
                  backgroundColor: "#F9FAFB",
                }}
              >
                <h3>PIN temporal de {temporaryPin.name}</h3>

                <p>
                  Entrégalo directamente al jugador. No se guarda
                  en texto plano en la base de datos.
                </p>

                <div
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #D1D5DB",
                    overflowWrap: "anywhere",
                    fontFamily: "monospace",
                    fontSize: "20px",
                    userSelect: "all",
                  }}
                >
                  {temporaryPin.temporaryPin}
                </div>

                <button
                  type="button"
                  onClick={copyTemporaryPin}
                  style={{
                    ...primaryButtonStyle,
                    marginTop: "12px",
                  }}
                >
                  Copiar PIN para WhatsApp
                </button>
              </div>
            )}
          </section>
        </>
      )}

      <p
        style={{
          marginTop: "28px",
          fontSize: "13px",
          color: "#6B7280",
        }}
      >
        Los PIN se guardan mediante hash. El administrador solo ve
        el PIN temporal cuando lo genera.
      </p>
    </main>
  );
}
