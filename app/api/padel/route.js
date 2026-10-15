
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

// Cookies y duración de las sesiones.
const COOKIE_NAME = "padel_session";
const SESSION_DAYS = 30;
const ADMIN_COOKIE_NAME = "padel_admin_session";
const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

// ======================================================
// FUNCIONES GENERALES
// ======================================================

// Hash SHA-256 para códigos de invitación y tokens de sesión.
function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

// Respuesta JSON de error.
function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Validar el nombre del jugador.
function validName(name) {
  return (
    typeof name === "string" &&
    name.trim().length >= 2 &&
    name.trim().length <= 60
  );
}

// Los PIN tienen entre 8 y 12 dígitos.
function validPin(pin) {
  return typeof pin === "string" && /^\d{8,12}$/.test(pin);
}

// Normalizar nombres para evitar diferencias de mayúsculas.
function normalizeName(name) {
  return name.trim().toLocaleLowerCase("es");
}

// Validar fechas recibidas desde el navegador.
function validDate(value) {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    Number.isFinite(Date.parse(value))
  );
}

// ======================================================
// HASH Y VERIFICACIÓN DE PIN
// ======================================================

// Scrypt genera un hash con una sal aleatoria para cada PIN.
async function hashPin(pin) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(pin, salt, 64);

  return `scrypt$${salt}$${derived.toString("hex")}`;
}

// Verificar un PIN sin comparaciones de cadenas vulnerables.
async function verifyPin(pin, storedHash) {
  try {
    if (typeof storedHash !== "string") return false;

    const [algorithm, salt, storedHex] = storedHash.split("$");

    if (
      algorithm !== "scrypt" ||
      !salt ||
      !storedHex ||
      !/^[a-f0-9]+$/i.test(storedHex) ||
      storedHex.length % 2 !== 0
    ) {
      return false;
    }

    const stored = Buffer.from(storedHex, "hex");
    const calculated = await scrypt(pin, salt, stored.length);

    return (
      stored.length === calculated.length &&
      timingSafeEqual(stored, calculated)
    );
  } catch {
    return false;
  }
}

// ======================================================
// COOKIES DE SESIÓN DE JUGADORES
// ======================================================

function sessionCookie(response, token) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  return response;
}

function clearSessionCookie(response) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}

// ======================================================
// SESIÓN DE ADMINISTRADOR
// ======================================================

// Firmar la fecha de expiración con un secreto privado.
function signAdminExpiry(expiry) {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    throw new Error("Falta ADMIN_SESSION_SECRET.");
  }

  return createHmac("sha256", secret)
    .update(expiry)
    .digest("hex");
}

// Comprobar que la cookie del administrador es válida.
function isAdminAuthenticated(request) {
  try {
    const value = request.cookies.get(ADMIN_COOKIE_NAME)?.value;

    if (!value) return false;

    const [expiry, signature] = value.split(".");

    if (
      !expiry ||
      !signature ||
      !/^\d+$/.test(expiry) ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      return false;
    }

    if (Number(expiry) <= Math.floor(Date.now() / 1000)) {
      return false;
    }

    const expected = Buffer.from(signAdminExpiry(expiry), "hex");
    const actual = Buffer.from(signature, "hex");

    return (
      actual.length === expected.length &&
      timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

// Crear cookie de administrador.
function setAdminCookie(response) {
  const expiry = String(
    Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS
  );

  const signature = signAdminExpiry(expiry);

  response.cookies.set(
    ADMIN_COOKIE_NAME,
    `${expiry}.${signature}`,
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: ADMIN_SESSION_SECONDS,
    }
  );

  return response;
}

// Eliminar la cookie del administrador.
function clearAdminCookie(response) {
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}

// ======================================================
// CREACIÓN Y COMPROBACIÓN DE SESIONES DE JUGADORES
// ======================================================

// El token real solo se envía en la cookie; en la BD se guarda su hash.
async function createSession(accountId) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashText(token);

  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await supabaseAdmin
    .from("player_sessions")
    .insert({
      account_id: accountId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

  if (error) {
    console.error("Error creando sesión:", error.message);
    throw new Error("No se ha podido iniciar la sesión.");
  }

  return token;
}

// Obtener la cuenta asociada a la cookie actual.
async function getAccountFromRequest(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) return null;

  const { data: session, error } = await supabaseAdmin
    .from("player_sessions")
    .select("id, account_id, expires_at")
    .eq("token_hash", hashText(token))
    .maybeSingle();

  if (error || !session) return null;

  // Eliminar sesiones caducadas.
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await supabaseAdmin
      .from("player_sessions")
      .delete()
      .eq("id", session.id);

    return null;
  }

  // Es importante incluir must_change_pin en la cuenta.
  const { data: account, error: accountError } = await supabaseAdmin
    .from("player_accounts")
    .select("id, name, active, must_change_pin")
    .eq("id", session.account_id)
    .maybeSingle();

  if (accountError || !account || !account.active) return null;

  // Registrar el último uso de la sesión.
  await supabaseAdmin
    .from("player_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", session.id);

  return account;
}

// ======================================================
// BÚSQUEDA DE CUENTAS E INVITACIONES
// ======================================================

// Buscar una cuenta por nombre normalizado.
async function findAccountByName(name) {
  const { data, error } = await supabaseAdmin
    .from("player_accounts")
    .select("id, name, active");

  if (error) {
    throw new Error("No se han podido consultar las cuentas.");
  }

  const normalized = normalizeName(name);

  return (
    (data || []).find(
      (item) => normalizeName(item.name) === normalized
    ) || null
  );
}

// Buscar una invitación por nombre normalizado.
async function findInviteByName(name) {
  const { data, error } = await supabaseAdmin
    .from("player_invites")
    .select("*");

  if (error) {
    throw new Error("No se han podido consultar las invitaciones.");
  }

  const normalized = normalizeName(name);

  return (
    (data || []).find(
      (item) => normalizeName(item.name) === normalized
    ) || null
  );
}

// ======================================================
// GET: PARTIDAS Y SESIÓN ACTUAL
// ======================================================

export async function GET(request) {
  try {
    // Consultar las inscripciones de las partidas.
    const { data, error } = await supabaseAdmin
      .from("players")
      .select(
        "id, day, reserved, created_at, account:player_accounts(name)"
      )
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error consultando partidas:", error.message);
      return jsonError("No se han podido cargar las partidas.", 500);
    }

    const players = (data || []).map((player) => ({
      id: player.id,
      day: player.day,
      name: player.account?.name || "Jugador",
      reserved: player.reserved,
      created_at: player.created_at,
    }));

    // Consultar la cuenta autenticada, si existe.
    const account = await getAccountFromRequest(request);

    return NextResponse.json(
      {
        players,
        account: account
          ? {
              id: account.id,
              name: account.name,
              must_change_pin: account.must_change_pin === true,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Error en GET:", error);
    return jsonError("Error interno del servidor.", 500);
  }
}

// ======================================================
// POST: ACCIONES DE LA APLICACIÓN
// ======================================================

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body.action;

    if (typeof action !== "string") {
      return jsonError("Acción no válida.");
    }

    // --------------------------------------------------
    // CONSULTAR SESIÓN DE ADMINISTRADOR
    // --------------------------------------------------

    if (action === "admin-status") {
      return NextResponse.json({
        authenticated: isAdminAuthenticated(request),
      });
    }

    // --------------------------------------------------
    // INICIAR SESIÓN DE ADMINISTRADOR
    // --------------------------------------------------

    if (action === "admin-login") {
      const configuredPassword = process.env.ADMIN_PASSWORD;

      if (!configuredPassword || !process.env.ADMIN_SESSION_SECRET) {
        return jsonError(
          "Falta configurar la contraseña o el secreto del administrador.",
          500
        );
      }

      if (
        typeof body.password !== "string" ||
        body.password.length > 200
      ) {
        return jsonError("Contraseña incorrecta.", 401);
      }

      const expected = Buffer.from(
        hashText(configuredPassword),
        "hex"
      );
      const actual = Buffer.from(hashText(body.password), "hex");

      if (!timingSafeEqual(expected, actual)) {
        return jsonError("Contraseña incorrecta.", 401);
      }

      return setAdminCookie(
        NextResponse.json({ ok: true })
      );
    }

    // --------------------------------------------------
    // CERRAR SESIÓN DE ADMINISTRADOR
    // --------------------------------------------------

    if (action === "admin-logout") {
      return clearAdminCookie(
        NextResponse.json({ ok: true })
      );
    }

    // --------------------------------------------------
    // GENERAR INVITACIÓN PARA UN NUEVO JUGADOR
    // --------------------------------------------------

    if (action === "create-invite") {
      if (!isAdminAuthenticated(request)) {
        return jsonError(
          "Debes iniciar sesión como administrador.",
          401
        );
      }

      if (!validName(body.name)) {
        return jsonError(
          "El nombre debe tener entre 2 y 60 caracteres."
        );
      }

      const name = body.name.trim();
      const existingAccount = await findAccountByName(name);

      if (existingAccount) {
        return jsonError("Ese jugador ya tiene una cuenta.", 409);
      }

      const existingInvite = await findInviteByName(name);

      if (existingInvite?.used_at || existingInvite?.account_id) {
        return jsonError(
          "Esa invitación ya se ha utilizado.",
          409
        );
      }

      // Renovar una invitación pendiente si ya existía.
      if (existingInvite) {
        const { error: deleteError } = await supabaseAdmin
          .from("player_invites")
          .delete()
          .eq("id", existingInvite.id)
          .is("used_at", null);

        if (deleteError) {
          return jsonError(
            "No se ha podido renovar la invitación.",
            500
          );
        }
      }

      const code = randomBytes(24).toString("hex");

      const { error: inviteError } = await supabaseAdmin
        .from("player_invites")
        .insert({
          name,
          code_hash: hashText(code),
        });

      if (inviteError) {
        console.error(
          "Error creando invitación:",
          inviteError.message
        );

        return jsonError(
          "No se ha podido crear la invitación. Comprueba si ya existe otra.",
          409
        );
      }

      // El código solo se devuelve en esta respuesta.
      return NextResponse.json({ name, code });
    }

    // --------------------------------------------------
    // RESTABLECER PIN DESDE EL PANEL DE ADMINISTRACIÓN
    // --------------------------------------------------

    if (action === "admin-reset-pin") {
      if (!isAdminAuthenticated(request)) {
        return jsonError(
          "Debes iniciar sesión como administrador.",
          401
        );
      }

      if (!validName(body.name)) {
        return jsonError("Introduce un nombre válido.");
      }

      const accountToReset = await findAccountByName(
        body.name.trim()
      );

      if (!accountToReset || !accountToReset.active) {
        return jsonError(
          "No se encuentra una cuenta activa con ese nombre.",
          404
        );
      }

      // Generar un PIN temporal aleatorio de 10 dígitos.
      const temporaryPin = String(
        randomInt(0, 10_000_000_000)
      ).padStart(10, "0");

      const temporaryHash = await hashPin(temporaryPin);

      // Guardar únicamente el hash y obligar a cambiarlo.
      const { error: updateError } = await supabaseAdmin
        .from("player_accounts")
        .update({
          pin_hash: temporaryHash,
          must_change_pin: true,
          failed_attempts: 0,
          locked_until: null,
        })
        .eq("id", accountToReset.id);

      if (updateError) {
        console.error(
          "Error restableciendo PIN:",
          updateError.message
        );

        return jsonError("No se ha podido restablecer el PIN.", 500);
      }

      // Invalidar las sesiones existentes del jugador.
      const { error: sessionsError } = await supabaseAdmin
        .from("player_sessions")
        .delete()
        .eq("account_id", accountToReset.id);

      if (sessionsError) {
        // El bloqueo por must_change_pin sigue impidiendo
        // usar las sesiones antiguas para apuntarse o reservar.
        console.error(
          "Error invalidando sesiones:",
          sessionsError.message
        );
      }

      // El PIN temporal se entrega una sola vez al administrador.
      return NextResponse.json({
        ok: true,
        name: accountToReset.name,
        temporaryPin,
        sessionsInvalidated: !sessionsError,
      });
    }

    // --------------------------------------------------
    // REGISTRO CON INVITACIÓN
    // --------------------------------------------------

    if (action === "register") {
      const name =
        typeof body.name === "string" ? body.name.trim() : "";
      const code = body.code;
      const pin = body.pin;

      if (!validName(name)) {
        return jsonError(
          "El nombre debe tener entre 2 y 60 caracteres."
        );
      }

      if (
        typeof code !== "string" ||
        !/^[a-f0-9]{48}$/i.test(code)
      ) {
        return jsonError("El código de invitación no es válido.");
      }

      if (!validPin(pin)) {
        return jsonError(
          "El PIN debe tener entre 8 y 12 dígitos."
        );
      }

      const invite = await findInviteByName(name);

      if (!invite) {
        return jsonError("Nombre o invitación incorrectos.", 401);
      }

      if (invite.used_at || invite.account_id) {
        return jsonError(
          "Esta invitación ya se ha utilizado.",
          409
        );
      }

      if (
        invite.expires_at &&
        new Date(invite.expires_at).getTime() <= Date.now()
      ) {
        return jsonError("La invitación ha caducado.", 401);
      }

      // Comparar los hashes del código de invitación.
      const submittedHash = Buffer.from(hashText(code), "hex");
      const expectedHash = Buffer.from(invite.code_hash, "hex");

      if (
        submittedHash.length !== expectedHash.length ||
        !timingSafeEqual(submittedHash, expectedHash)
      ) {
        return jsonError("Nombre o invitación incorrectos.", 401);
      }

      const existingAccount = await findAccountByName(name);

      if (existingAccount) {
        return jsonError("Ese nombre ya tiene una cuenta.", 409);
      }

      const pinHash = await hashPin(pin);

      const { data: account, error: createAccountError } =
        await supabaseAdmin
          .from("player_accounts")
          .insert({
            name: invite.name,
            pin_hash: pinHash,
            must_change_pin: false,
          })
          .select("id, name")
          .single();

      if (createAccountError || !account) {
        console.error(
          "Error creando cuenta:",
          createAccountError?.message
        );

        return jsonError(
          "No se ha podido crear la cuenta. Comprueba si ya existe.",
          409
        );
      }

      // Consumir la invitación solo si sigue sin utilizarse.
      const { data: consumed, error: consumeError } =
        await supabaseAdmin
          .from("player_invites")
          .update({
            used_at: new Date().toISOString(),
            account_id: account.id,
          })
          .eq("id", invite.id)
          .is("used_at", null)
          .is("account_id", null)
          .select("id")
          .maybeSingle();

      if (consumeError || !consumed) {
        await supabaseAdmin
          .from("player_accounts")
          .delete()
          .eq("id", account.id);

        return jsonError(
          "La invitación ya se ha utilizado o no se ha podido consumir.",
          409
        );
      }

      const token = await createSession(account.id);
      const response = NextResponse.json({ account });

      return sessionCookie(response, token);
    }

    // --------------------------------------------------
    // INICIAR SESIÓN DE JUGADOR
    // --------------------------------------------------

    if (action === "login") {
      const name =
        typeof body.name === "string" ? body.name.trim() : "";
      const pin = body.pin;

      if (!validName(name) || !validPin(pin)) {
        return jsonError("Nombre o PIN incorrectos.", 401);
      }

      const { data: accounts, error: accountError } =
        await supabaseAdmin
          .from("player_accounts")
          .select(
            "id, name, pin_hash, active, failed_attempts, locked_until"
          );

      if (accountError) {
        return jsonError(
          "No se ha podido comprobar la cuenta.",
          500
        );
      }

      const account = (accounts || []).find(
        (item) => normalizeName(item.name) === normalizeName(name)
      );

      if (!account || !account.active) {
        return jsonError("Nombre o PIN incorrectos.", 401);
      }

      // Respetar los bloqueos por intentos fallidos.
      if (
        account.locked_until &&
        new Date(account.locked_until).getTime() > Date.now()
      ) {
        return jsonError(
          "Cuenta bloqueada temporalmente. Inténtalo más tarde.",
          429
        );
      }

      const pinMatches = await verifyPin(pin, account.pin_hash);

      if (!pinMatches) {
        const failedAttempts = (account.failed_attempts || 0) + 1;
        const locked = failedAttempts >= 5;

        await supabaseAdmin
          .from("player_accounts")
          .update({
            failed_attempts: locked ? 0 : failedAttempts,
            locked_until: locked
              ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
              : null,
          })
          .eq("id", account.id);

        return jsonError(
          locked
            ? "Demasiados intentos. Cuenta bloqueada durante 15 minutos."
            : "Nombre o PIN incorrectos.",
          locked ? 429 : 401
        );
      }

      // Limpiar los intentos fallidos al autenticar correctamente.
      await supabaseAdmin
        .from("player_accounts")
        .update({
          failed_attempts: 0,
          locked_until: null,
        })
        .eq("id", account.id);

      const token = await createSession(account.id);

      const response = NextResponse.json({
        account: {
          id: account.id,
          name: account.name,
        },
      });

      return sessionCookie(response, token);
    }

    // --------------------------------------------------
    // CERRAR SESIÓN DE JUGADOR
    // --------------------------------------------------

    if (action === "logout") {
      const token = request.cookies.get(COOKIE_NAME)?.value;

      if (token) {
        await supabaseAdmin
          .from("player_sessions")
          .delete()
          .eq("token_hash", hashText(token));
      }

      return clearSessionCookie(
        NextResponse.json({ ok: true })
      );
    }

    // --------------------------------------------------
    // TODAS LAS OPERACIONES RESTANTES REQUIEREN SESIÓN
    // --------------------------------------------------

    const account = await getAccountFromRequest(request);

    if (!account) {
      return jsonError("Inicia sesión para continuar.", 401);
    }

    // Un PIN temporal solo permite cambiarlo o cerrar sesión.
    if (
      account.must_change_pin === true &&
      action !== "change-pin"
    ) {
      return jsonError(
        "Debes cambiar tu PIN temporal antes de continuar.",
        403
      );
    }

    // --------------------------------------------------
    // CAMBIAR PIN DEL JUGADOR
    // --------------------------------------------------

    if (action === "change-pin") {
      const currentPin = body.currentPin;
      const newPin = body.newPin;
      const confirmPin = body.confirmPin;

      if (!validPin(currentPin)) {
        return jsonError(
          "El PIN actual debe tener entre 8 y 12 dígitos."
        );
      }

      if (!validPin(newPin)) {
        return jsonError(
          "El nuevo PIN debe tener entre 8 y 12 dígitos."
        );
      }

      if (newPin !== confirmPin) {
        return jsonError("Los dos PIN nuevos no coinciden.");
      }

      if (currentPin === newPin) {
        return jsonError(
          "El nuevo PIN debe ser diferente del actual."
        );
      }

      const { data: fullAccount, error: accountError } =
        await supabaseAdmin
          .from("player_accounts")
          .select("id, pin_hash")
          .eq("id", account.id)
          .maybeSingle();

      if (accountError || !fullAccount) {
        return jsonError(
          "No se ha podido consultar tu cuenta.",
          500
        );
      }

      // Verificar el PIN actual antes de cambiarlo.
      const matches = await verifyPin(
        currentPin,
        fullAccount.pin_hash
      );

      if (!matches) {
        return jsonError("El PIN actual es incorrecto.", 401);
      }

      const newHash = await hashPin(newPin);

      // Guardar el hash nuevo y eliminar la obligación de cambio.
      const { error: updateError } = await supabaseAdmin
        .from("player_accounts")
        .update({
          pin_hash: newHash,
          must_change_pin: false,
          failed_attempts: 0,
          locked_until: null,
        })
        .eq("id", account.id);

      if (updateError) {
        console.error("Error cambiando PIN:", updateError.message);
        return jsonError("No se ha podido cambiar el PIN.", 500);
      }

      // Revocar todas las sesiones para que vuelva a autenticarse.
      const { error: deleteSessionsError } = await supabaseAdmin
        .from("player_sessions")
        .delete()
        .eq("account_id", account.id);

      if (deleteSessionsError) {
        console.error(
          "Error invalidando sesiones tras cambiar PIN:",
          deleteSessionsError.message
        );

        // Se limpia la cookie de este navegador aunque haya fallado
        // la revocación general. Hay que revisar el error del servidor.
        return clearSessionCookie(
          jsonError(
            "El PIN se ha cambiado, pero no se han podido invalidar todas las sesiones. Revisa el servidor.",
            500
          )
        );
      }

      return clearSessionCookie(
        NextResponse.json({
          ok: true,
          message: "PIN cambiado correctamente. Inicia sesión de nuevo.",
        })
      );
    }

    // --------------------------------------------------
    // APUNTARSE A UNA PARTIDA
    // --------------------------------------------------

    if (action === "join") {
      if (!validDate(body.day)) {
        return jsonError("La fecha de la partida no es válida.");
      }

      const day = new Date(body.day).toISOString();

      const { data: currentPlayers, error: listError } =
        await supabaseAdmin
          .from("players")
          .select("id, account_id, reserved")
          .eq("day", day);

      if (listError) {
        return jsonError(
          "No se ha podido consultar la partida.",
          500
        );
      }

      if ((currentPlayers || []).length >= 4) {
        return jsonError("La partida está completa.", 409);
      }

      if (
        (currentPlayers || []).some(
          (player) => player.account_id === account.id
        )
      ) {
        return jsonError(
          "Ya estás apuntado a esta partida.",
          409
        );
      }

      const { error: joinError } = await supabaseAdmin
        .from("players")
        .insert({
          day,
          account_id: account.id,
          reserved: false,
        });

      if (joinError) {
        console.error(
          "Error apuntando jugador:",
          joinError.message
        );

        return jsonError(
          "No se ha podido apuntar. Puede que la plaza haya cambiado.",
          409
        );
      }

      return NextResponse.json({ ok: true });
    }

    // --------------------------------------------------
    // DESAPUNTARSE DE UNA PARTIDA
    // --------------------------------------------------

    if (action === "leave") {
      if (!validDate(body.day)) {
        return jsonError("La fecha de la partida no es válida.");
      }

      const day = new Date(body.day).toISOString();

      const { data: player, error: playerError } =
        await supabaseAdmin
          .from("players")
          .select("id, account_id, reserved")
          .eq("id", body.id)
          .eq("day", day)
          .maybeSingle();

      if (playerError || !player) {
        return jsonError(
          "No se ha encontrado esa inscripción.",
          404
        );
      }

      if (player.account_id !== account.id) {
        return jsonError(
          "Solo puedes quitar tu propia inscripción.",
          403
        );
      }

      if (player.reserved) {
        return jsonError(
          "La pista figura como reservada. Contacta con el grupo antes de borrarte.",
          409
        );
      }

      const { data: deleted, error: deleteError } =
        await supabaseAdmin
          .from("players")
          .delete()
          .eq("id", player.id)
          .eq("account_id", account.id)
          .select("id")
          .maybeSingle();

      if (deleteError || !deleted) {
        return jsonError(
          "No se ha podido eliminar la inscripción.",
          500
        );
      }

      return NextResponse.json({ ok: true });
    }

    // --------------------------------------------------
    // MARCAR UNA PARTIDA COMO RESERVADA
    // --------------------------------------------------

    if (action === "reserve") {
      if (!validDate(body.day)) {
        return jsonError("La fecha de la partida no es válida.");
      }

      const day = new Date(body.day).toISOString();

      const { data: currentPlayers, error: listError } =
        await supabaseAdmin
          .from("players")
          .select("id, account_id, created_at, reserved")
          .eq("day", day)
          .order("created_at", { ascending: true });

      if (listError) {
        return jsonError(
          "No se ha podido consultar la partida.",
          500
        );
      }

      if ((currentPlayers || []).length !== 4) {
        return jsonError(
          "Se necesitan cuatro jugadores para reservar.",
          409
        );
      }

      // El cuarto jugador es el responsable de la reserva.
      const responsible = currentPlayers[3];

      if (responsible.account_id !== account.id) {
        return jsonError(
          "Solo el cuarto jugador puede marcar la reserva.",
          403
        );
      }

      if (responsible.reserved) {
        return jsonError("La reserva ya está marcada.", 409);
      }

      const { data: updated, error: updateError } =
        await supabaseAdmin
          .from("players")
          .update({ reserved: true })
          .eq("id", responsible.id)
          .eq("account_id", account.id)
          .eq("reserved", false)
          .select("id")
          .maybeSingle();

      if (updateError || !updated) {
        return jsonError(
          "No se ha podido actualizar la reserva.",
          409
        );
      }

      return NextResponse.json({ ok: true });
    }

    // Acción no reconocida.
    return jsonError("Acción no reconocida.");
  } catch (error) {
    console.error("Error en API de pádel:", error);
    return jsonError("Error interno del servidor.", 500);
  }
}
