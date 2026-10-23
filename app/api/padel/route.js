
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

// ======================================================
// CONFIGURACIÓN
// ======================================================

const COOKIE_NAME = "padel_session";
const SESSION_DAYS = 30;

const ADMIN_COOKIE_NAME = "padel_admin_session";
const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
const ADMIN_SESSION_MAX_AGE = 8 * 60 * 60;

// ======================================================
// FUNCIONES GENERALES
// ======================================================

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function validName(name) {
  return (
    typeof name === "string" &&
    name.trim().length >= 2 &&
    name.trim().length <= 60
  );
}

function validPin(pin) {
  return typeof pin === "string" && /^\d{8,12}$/.test(pin);
}

function normalizeName(name) {
  return name.trim().toLocaleLowerCase("es");
}

function validDate(value) {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    Number.isFinite(Date.parse(value))
  );
}

function todayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function validPozoDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T12:00:00.000Z`);

  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function validPozoTime(value) {
  if (
    typeof value !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
  ) {
    return false;
  }

  return value.slice(0, 5) >= "08:00";
}

function validPozoDuration(value) {
  const duration = Number(value);

  return (
    Number.isFinite(duration) &&
    duration >= 0.5 &&
    duration <= 6 &&
    duration * 2 === Math.trunc(duration * 2)
  );
}

function validTitularCount(value) {
  return [4, 8, 12, 16, 20, 24, 28].includes(Number(value));
}

// ======================================================
// RESTABLECER LA RESERVA DE UNA PARTIDA
// ======================================================

async function clearReservationForDay(day) {
  const [playersResult, guestsResult] = await Promise.all([
    supabaseAdmin
      .from("players")
      .update({ reserved: false })
      .eq("day", day),

    supabaseAdmin
      .from("padel_guests")
      .update({ reserved: false })
      .eq("day", day),
  ]);

  if (playersResult.error || guestsResult.error) {
    console.error(
      "Error restableciendo la reserva:",
      playersResult.error?.message,
      guestsResult.error?.message
    );

    throw new Error(
      "No se ha podido restablecer la reserva de la partida."
    );
  }
}

// ======================================================
// HASH Y VERIFICACIÓN DE PIN
// ======================================================

async function hashPin(pin) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(pin, salt, 64);

  return `scrypt$${salt}$${derived.toString("hex")}`;
}

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

function signAdminExpiry(expiry) {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    throw new Error("Falta ADMIN_SESSION_SECRET.");
  }

  return createHmac("sha256", secret)
    .update(expiry)
    .digest("hex");
}

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
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE,
    }
  );

  return response;
}

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
// SESIONES DE JUGADORES
// ======================================================

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

async function getAccountFromRequest(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) return null;

  const { data: session, error } = await supabaseAdmin
    .from("player_sessions")
    .select("id, account_id, expires_at")
    .eq("token_hash", hashText(token))
    .maybeSingle();

  if (error || !session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await supabaseAdmin
      .from("player_sessions")
      .delete()
      .eq("id", session.id);

    return null;
  }

  const { data: account, error: accountError } = await supabaseAdmin
    .from("player_accounts")
    .select("id, name, active, must_change_pin")
    .eq("id", session.account_id)
    .maybeSingle();

  if (accountError || !account || !account.active) return null;

  await supabaseAdmin
    .from("player_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", session.id);

  return account;
}

// ======================================================
// CUENTAS E INVITACIONES
// ======================================================

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
// CONSULTA DE PARTICIPANTES DEL POZO
// ======================================================

async function getPozoWithPlayers(pozo) {
  const { data: registrations, error } = await supabaseAdmin
    .from("pozo_players")
    .select(
      "id, account_id, created_at, account:player_accounts(name)"
    )
    .eq("pozo_id", pozo.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `No se han podido consultar los participantes: ${error.message}`
    );
  }

  const players = (registrations || []).map((item, index) => ({
    id: item.id,
    account_id: item.account_id,
    name: item.account?.name || "Jugador",
    created_at: item.created_at,
    status:
      index < Number(pozo.titular_count)
        ? "titular"
        : "reserva",
  }));

  return {
    ...pozo,
    enrolled_count: players.length,
    players,
  };
}

// ======================================================
// GET: PARTIDAS, SESIÓN ACTUAL Y POZOS
// ======================================================

export async function GET(request) {
  try {
    const { data: playerRows, error: playersError } =
      await supabaseAdmin
        .from("players")
        .select(
          "id, day, account_id, reserved, created_at, account:player_accounts(name)"
        )
        .order("created_at", { ascending: true });

    if (playersError) {
      console.error(
        "Error consultando partidas:",
        playersError.message
      );

      return jsonError("No se han podido cargar las partidas.", 500);
    }

    const { data: guestRows, error: guestsError } =
      await supabaseAdmin
        .from("padel_guests")
        .select("id, day, invited_by, reserved, created_at")
        .order("created_at", { ascending: true });

    if (guestsError) {
      console.error(
        "Error consultando invitados:",
        guestsError.message
      );

      return jsonError("No se han podido cargar los invitados.", 500);
    }

    const inviterIds = [
      ...new Set((guestRows || []).map((guest) => guest.invited_by)),
    ];

    let inviterNames = {};

    if (inviterIds.length > 0) {
      const { data: inviters, error: invitersError } =
        await supabaseAdmin
          .from("player_accounts")
          .select("id, name")
          .in("id", inviterIds);

      if (invitersError) {
        console.error(
          "Error consultando anfitriones:",
          invitersError.message
        );

        return jsonError("No se han podido cargar los anfitriones.", 500);
      }

      inviterNames = Object.fromEntries(
        (inviters || []).map((item) => [item.id, item.name])
      );
    }

    const normalPlayers = (playerRows || []).map((player) => ({
      id: player.id,
      day: player.day,
      account_id: player.account_id,
      name: player.account?.name || "Jugador",
      reserved: player.reserved,
      created_at: player.created_at,
      is_guest: false,
      invited_by: null,
    }));

    const guests = (guestRows || []).map((guest) => ({
      id: guest.id,
      day: guest.day,
      account_id: null,
      name: `Invitado (${inviterNames[guest.invited_by] || "Jugador"})`,
      reserved: guest.reserved,
      created_at: guest.created_at,
      is_guest: true,
      invited_by: guest.invited_by,
    }));

    const players = [...normalPlayers, ...guests].sort(
      (a, b) =>
        new Date(a.created_at).getTime() -
        new Date(b.created_at).getTime()
    );

    const account = await getAccountFromRequest(request);
    const today = todayLocalDate();

    const { data: pozosData, error: pozosError } =
      await supabaseAdmin
        .from("pozos")
        .select(
          "id, date, start_time, duration_hours, titular_count, created_at"
        )
        .gte("date", today)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });

    if (pozosError) {
      console.error(
        "Error consultando pozos:",
        pozosError.message
      );

      return jsonError("No se han podido cargar los pozos.", 500);
    }

    const pozos = [];

    for (const pozoItem of pozosData || []) {
      pozos.push(await getPozoWithPlayers(pozoItem));
    }

    return NextResponse.json(
      {
        players,
        pozo: pozos[0] || null,
        pozos,
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

    // ==================================================
    // ADMINISTRACIÓN: SESIÓN
    // ==================================================

    if (action === "admin-status") {
      return NextResponse.json({
        authenticated: isAdminAuthenticated(request),
      });
    }

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

      const actual = Buffer.from(
        hashText(body.password),
        "hex"
      );

      if (!timingSafeEqual(expected, actual)) {
        return jsonError("Contraseña incorrecta.", 401);
      }

      const response = NextResponse.json({
        ok: true,
        message: "Sesión de administrador iniciada.",
      });

      return setAdminCookie(response);
    }

    if (action === "admin-logout") {
      const response = NextResponse.json({
        ok: true,
        message: "Sesión de administrador cerrada.",
      });

      return clearAdminCookie(response);
    }

    // ==================================================
    // ADMINISTRACIÓN: DATOS DEL POZO
    // ==================================================

    if (action === "admin-pozo-data") {
      if (!isAdminAuthenticated(request)) {
        return jsonError("Debes iniciar sesión como administrador.", 401);
      }

      const today = todayLocalDate();

      const { data: pozosData, error: pozosError } =
        await supabaseAdmin
          .from("pozos")
          .select(
            "id, date, start_time, duration_hours, titular_count, created_at"
          )
          .gte("date", today)
          .order("date", { ascending: true })
          .order("start_time", { ascending: true });

      if (pozosError) {
        console.error(
          "Error consultando pozos:",
          pozosError.message
        );

        return jsonError("No se han podido cargar los pozos.", 500);
      }

      const { data: accounts, error: accountsError } =
        await supabaseAdmin
          .from("player_accounts")
          .select("id, name, active")
          .eq("active", true)
          .order("name", { ascending: true });

      if (accountsError) {
        console.error(
          "Error consultando cuentas:",
          accountsError.message
        );

        return jsonError("No se han podido cargar los jugadores.", 500);
      }

      const pozos = [];

      for (const pozoItem of pozosData || []) {
        pozos.push(await getPozoWithPlayers(pozoItem));
      }

      return NextResponse.json({
        pozos,
        accounts: (accounts || []).map((item) => ({
          id: item.id,
          name: item.name,
        })),
      });
    }

    // ==================================================
    // ADMINISTRACIÓN: CREAR POZO
    // ==================================================

    if (action === "admin-create-pozo") {
      if (!isAdminAuthenticated(request)) {
        return jsonError("Debes iniciar sesión como administrador.", 401);
      }

      if (!validPozoDate(body.date) || body.date < todayLocalDate()) {
        return jsonError("Selecciona una fecha de hoy o posterior.");
      }

      if (!validPozoTime(body.start_time)) {
        return jsonError("La hora de inicio debe ser a partir de las 08:00.");
      }

      if (!validPozoDuration(body.duration_hours)) {
        return jsonError(
          "La duración debe estar entre 0,5 y 6 horas, en intervalos de 0,5."
        );
      }

      if (!validTitularCount(body.titular_count)) {
        return jsonError(
          "El número de titulares debe ser 4, 8, 12, 16, 20, 24 o 28."
        );
      }

      const { data: existingPozos, error: existingError } =
        await supabaseAdmin
          .from("pozos")
          .select("id")
          .eq("date", body.date)
          .eq("start_time", body.start_time);

      if (existingError) {
        console.error(
          "Error comprobando pozos existentes:",
          existingError.message
        );

        return jsonError(
          "No se ha podido comprobar si ya existe un pozo a esa hora.",
          500
        );
      }

      if ((existingPozos || []).length > 0) {
        return jsonError("Ya existe un pozo para esa fecha y hora.", 409);
      }

      const { data: created, error: createError } =
        await supabaseAdmin
          .from("pozos")
          .insert({
            date: body.date,
            start_time: body.start_time,
            duration_hours: Number(body.duration_hours),
            titular_count: Number(body.titular_count),
          })
          .select(
            "id, date, start_time, duration_hours, titular_count, created_at"
          )
          .single();

      if (createError || !created) {
        console.error(
          "Error creando pozo:",
          createError?.message
        );

        return jsonError("No se ha podido crear el pozo.", 500);
      }

      return NextResponse.json({ ok: true, pozo: created });
    }

    // ==================================================
    // ADMINISTRACIÓN: AÑADIR JUGADOR AL POZO
    // ==================================================

    if (action === "admin-pozo-join") {
      if (!isAdminAuthenticated(request)) {
        return jsonError("Debes iniciar sesión como administrador.", 401);
      }

      if (
        typeof body.pozoId !== "string" ||
        typeof body.accountId !== "string"
      ) {
        return jsonError("Selecciona un pozo y un jugador válidos.");
      }

      const { data: pozo, error: pozoError } =
        await supabaseAdmin
          .from("pozos")
          .select("id, date")
          .eq("id", body.pozoId)
          .maybeSingle();

      if (pozoError || !pozo) {
        return jsonError("No se ha encontrado el pozo.", 404);
      }

      if (pozo.date < todayLocalDate()) {
        return jsonError("Este pozo ya ha pasado.", 409);
      }

      const { data: selectedAccount, error: accountError } =
        await supabaseAdmin
          .from("player_accounts")
          .select("id, name, active")
          .eq("id", body.accountId)
          .maybeSingle();

      if (accountError || !selectedAccount || !selectedAccount.active) {
        return jsonError(
          "No se encuentra una cuenta activa para ese jugador.",
          404
        );
      }

      const { data: current, error: currentError } =
        await supabaseAdmin
          .from("pozo_players")
          .select("id, account_id")
          .eq("pozo_id", body.pozoId);

      if (currentError) {
        return jsonError("No se han podido consultar los participantes.", 500);
      }

      if ((current || []).length >= 30) {
        return jsonError("El pozo ya tiene el máximo de 30 participantes.", 409);
      }

      if (
        (current || []).some(
          (item) => item.account_id === selectedAccount.id
        )
      ) {
        return jsonError(
          `${selectedAccount.name} ya está apuntado a este pozo.`,
          409
        );
      }

      const { error: insertError } = await supabaseAdmin
        .from("pozo_players")
        .insert({
          pozo_id: body.pozoId,
          account_id: selectedAccount.id,
        });

      if (insertError) {
        console.error(
          "Error añadiendo jugador al pozo:",
          insertError.message
        );

        return jsonError("No se ha podido añadir al jugador.", 500);
      }

      return NextResponse.json({ ok: true, name: selectedAccount.name });
    }

    // ==================================================
    // ADMINISTRACIÓN: QUITAR JUGADOR DEL POZO
    // ==================================================

    if (action === "admin-pozo-leave") {
      if (!isAdminAuthenticated(request)) {
        return jsonError("Debes iniciar sesión como administrador.", 401);
      }

      if (typeof body.registrationId !== "string") {
        return jsonError("La inscripción no es válida.");
      }

      const { data: registration, error: registrationError } =
        await supabaseAdmin
          .from("pozo_players")
          .select("id, pozo_id")
          .eq("id", body.registrationId)
          .maybeSingle();

      if (registrationError || !registration) {
        return jsonError("No se ha encontrado esa inscripción.", 404);
      }

      const { data: pozo, error: pozoError } =
        await supabaseAdmin
          .from("pozos")
          .select("date")
          .eq("id", registration.pozo_id)
          .maybeSingle();

      if (pozoError || !pozo || pozo.date < todayLocalDate()) {
        return jsonError("Este pozo ya ha pasado o no existe.", 409);
      }

      const { error: deleteError } = await supabaseAdmin
        .from("pozo_players")
        .delete()
        .eq("id", body.registrationId);

      if (deleteError) {
        console.error(
          "Error quitando jugador del pozo:",
          deleteError.message
        );

        return jsonError("No se ha podido quitar al jugador del pozo.", 500);
      }

      return NextResponse.json({ ok: true });
    }

    // ==================================================
    // ADMINISTRACIÓN: ELIMINAR POZO
    // ==================================================

    if (action === "admin-delete-pozo") {
      if (!isAdminAuthenticated(request)) {
        return jsonError("Debes iniciar sesión como administrador.", 401);
      }

      if (typeof body.pozoId !== "string") {
        return jsonError("El pozo no es válido.");
      }

      const { data: deleted, error: deleteError } =
        await supabaseAdmin
          .from("pozos")
          .delete()
          .eq("id", body.pozoId)
          .select("id")
          .maybeSingle();

      if (deleteError) {
        console.error(
          "Error eliminando pozo:",
          deleteError.message
        );

        return jsonError("No se ha podido eliminar el pozo.", 500);
      }

      if (!deleted) {
        return jsonError("No se ha encontrado el pozo.", 404);
      }

      return NextResponse.json({ ok: true });
    }

    // ==================================================
    // CREAR INVITACIÓN PARA UN NUEVO USUARIO
    // ==================================================

    if (action === "create-invite") {
      if (!isAdminAuthenticated(request)) {
        return jsonError("Debes iniciar sesión como administrador.", 401);
      }

      if (!validName(body.name)) {
        return jsonError("El nombre debe tener entre 2 y 60 caracteres.");
      }

      const name = body.name.trim();
      const existingAccount = await findAccountByName(name);

      if (existingAccount) {
        return jsonError("Ese jugador ya tiene una cuenta.", 409);
      }

      const existingInvite = await findInviteByName(name);

      if (existingInvite?.used_at || existingInvite?.account_id) {
        return jsonError("Esa invitación ya se ha utilizado.", 409);
      }

      if (existingInvite) {
        const { error: deleteError } = await supabaseAdmin
          .from("player_invites")
          .delete()
          .eq("id", existingInvite.id)
          .is("used_at", null);

        if (deleteError) {
          return jsonError("No se ha podido renovar la invitación.", 500);
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

      return NextResponse.json({ name, code });
    }

    // ==================================================
    // RESTABLECER PIN DESDE ADMINISTRACIÓN
    // ==================================================

    if (action === "admin-reset-pin") {
      if (!isAdminAuthenticated(request)) {
        return jsonError("Debes iniciar sesión como administrador.", 401);
      }

      if (!validName(body.name)) {
        return jsonError("Introduce un nombre válido.");
      }

      const accountToReset = await findAccountByName(body.name.trim());

      if (!accountToReset || !accountToReset.active) {
        return jsonError(
          "No se encuentra una cuenta activa con ese nombre.",
          404
        );
      }

      const temporaryPin = String(
        randomInt(0, 10_000_000_000)
      ).padStart(10, "0");

      const temporaryHash = await hashPin(temporaryPin);

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

      const { error: sessionsError } = await supabaseAdmin
        .from("player_sessions")
        .delete()
        .eq("account_id", accountToReset.id);

      if (sessionsError) {
        console.error(
          "Error invalidando sesiones:",
          sessionsError.message
        );
      }

      return NextResponse.json({
        ok: true,
        name: accountToReset.name,
        temporaryPin,
        sessionsInvalidated: !sessionsError,
      });
    }

    // ==================================================
    // ADMINISTRACIÓN: ELIMINAR INVITADO DE PARTIDA
    // ==================================================

    if (action === "admin-delete-guest") {
      if (!isAdminAuthenticated(request)) {
        return jsonError("Debes iniciar sesión como administrador.", 401);
      }

      if (typeof body.id !== "string" || body.id.length > 100) {
        return jsonError("El invitado no es válido.");
      }

      const { data: deletedGuest, error: deleteError } =
        await supabaseAdmin
          .from("padel_guests")
          .delete()
          .eq("id", body.id)
          .select("id, day")
          .maybeSingle();

      if (deleteError) {
        console.error(
          "Error eliminando invitado desde administración:",
          deleteError.message
        );

        return jsonError("No se ha podido eliminar al invitado.", 500);
      }

      if (!deletedGuest) {
        return jsonError("No se ha encontrado al invitado.", 404);
      }

      try {
        await clearReservationForDay(deletedGuest.day);
      } catch (error) {
        console.error(
          "Error restableciendo reserva tras eliminar invitado desde administración:",
          error
        );

        return jsonError(
          "El invitado se ha eliminado, pero no se ha podido restablecer la reserva. Recarga la página.",
          500
        );
      }

      return NextResponse.json({
        ok: true,
        message: "Invitado eliminado y reserva restablecida.",
      });
    }

    // ==================================================
    // ADMINISTRACIÓN: ELIMINAR JUGADOR DE PARTIDA
    // ==================================================

    if (action === "admin-delete-player") {
      if (!isAdminAuthenticated(request)) {
        return jsonError("Debes iniciar sesión como administrador.", 401);
      }

      if (
        (typeof body.id !== "string" && typeof body.id !== "number") ||
        String(body.id).trim() === ""
      ) {
        return jsonError("La inscripción no es válida.");
      }

      const { data: deletedPlayer, error: deleteError } =
        await supabaseAdmin
          .from("players")
          .delete()
          .eq("id", body.id)
          .select("id, day, account_id")
          .maybeSingle();

      if (deleteError) {
        console.error(
          "Error eliminando jugador:",
          deleteError.message
        );

        return jsonError("No se ha podido eliminar al jugador.", 500);
      }

      if (!deletedPlayer) {
        return jsonError("No se ha encontrado al jugador.", 404);
      }

      try {
        await clearReservationForDay(deletedPlayer.day);
      } catch (error) {
        console.error(
          "Error restableciendo reserva tras eliminar jugador desde administración:",
          error
        );

        return jsonError(
          "El jugador se ha eliminado, pero no se ha podido restablecer la reserva. Recarga la página.",
          500
        );
      }

      return NextResponse.json({
        ok: true,
        message: "Jugador eliminado y reserva restablecida.",
      });
    }

    // ==================================================
    // ADMINISTRACIÓN: LISTAR CUENTAS
    // ==================================================

    if (action === "admin-list-accounts") {
      if (!isAdminAuthenticated(request)) {
        return jsonError("Debes iniciar sesión como administrador.", 401);
      }

      const { data: accounts, error: accountsError } =
        await supabaseAdmin
          .from("player_accounts")
          .select("id, name, active")
          .eq("active", true)
          .order("name", { ascending: true });

      if (accountsError) {
        console.error(
          "Error consultando cuentas:",
          accountsError.message
        );

        return jsonError("No se han podido cargar los jugadores.", 500);
      }

      return NextResponse.json({
        accounts: (accounts || []).map((item) => ({
          id: item.id,
          name: item.name,
        })),
      });
    }

    // ==================================================
    // ADMINISTRACIÓN: AÑADIR JUGADOR A PARTIDA NORMAL
    // ==================================================

    if (action === "admin-join") {
      if (!isAdminAuthenticated(request)) {
        return jsonError("Debes iniciar sesión como administrador.", 401);
      }

      if (!validDate(body.day)) {
        return jsonError("La fecha de la partida no es válida.");
      }

      if (
        typeof body.accountId !== "string" ||
        body.accountId.length < 1 ||
        body.accountId.length > 100
      ) {
        return jsonError("Selecciona un jugador válido.");
      }

      const day = new Date(body.day).toISOString();

      const { data: selectedAccount, error: selectedAccountError } =
        await supabaseAdmin
          .from("player_accounts")
          .select("id, name, active")
          .eq("id", body.accountId)
          .maybeSingle();

      if (selectedAccountError) {
        console.error(
          "Error consultando jugador:",
          selectedAccountError.message
        );

        return jsonError(
          "No se ha podido comprobar la cuenta del jugador.",
          500
        );
      }

      if (!selectedAccount || !selectedAccount.active) {
        return jsonError(
          "No se encuentra una cuenta activa para ese jugador.",
          404
        );
      }

      const { data: joinResult, error: joinError } =
        await supabaseAdmin.rpc("join_padel_match", {
          p_day: day,
          p_account_id: selectedAccount.id,
        });

      if (joinError) {
        console.error(
          "Error apuntando jugador desde administración:",
          joinError.message
        );

        return jsonError("No se ha podido completar la inscripción.", 500);
      }

      if (!joinResult?.ok) {
        return jsonError(
          joinResult?.message || "No se ha podido apuntar al jugador.",
          409
        );
      }

      return NextResponse.json({
        ok: true,
        name: selectedAccount.name,
        day,
        message: joinResult.message,
        removedDuplicates: joinResult.removed_duplicates ?? 0,
      });
    }

    // ==================================================
    // REGISTRO CON INVITACIÓN
    // ==================================================

    if (action === "register") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const code = body.code;
      const pin = body.pin;

      if (!validName(name)) {
        return jsonError("El nombre debe tener entre 2 y 60 caracteres.");
      }

      if (typeof code !== "string" || !/^[a-f0-9]{48}$/i.test(code)) {
        return jsonError("El código de invitación no es válido.");
      }

      if (!validPin(pin)) {
        return jsonError("El PIN debe tener entre 8 y 12 dígitos.");
      }

      const invite = await findInviteByName(name);

      if (!invite) {
        return jsonError("Nombre o invitación incorrectos.", 401);
      }

      if (invite.used_at || invite.account_id) {
        return jsonError("Esta invitación ya se ha utilizado.", 409);
      }

      if (
        invite.expires_at &&
        new Date(invite.expires_at).getTime() <= Date.now()
      ) {
        return jsonError("La invitación ha caducado.", 401);
      }

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
        return jsonError("Ese jugador ya tiene una cuenta.", 409);
      }

      const pinHash = await hashPin(pin);

      const { data: newAccount, error: accountError } =
        await supabaseAdmin
          .from("player_accounts")
          .insert({
            name,
            pin_hash: pinHash,
            active: true,
            must_change_pin: false,
            failed_attempts: 0,
            locked_until: null,
          })
          .select("id, name, active, must_change_pin")
          .single();

      if (accountError || !newAccount) {
        console.error(
          "Error creando cuenta:",
          accountError?.message
        );

        return jsonError("No se ha podido crear la cuenta.", 500);
      }

      const { data: claimedInvite, error: claimError } =
        await supabaseAdmin
          .from("player_invites")
          .update({
            used_at: new Date().toISOString(),
            account_id: newAccount.id,
          })
          .eq("id", invite.id)
          .is("used_at", null)
          .select("id")
          .maybeSingle();

      if (claimError || !claimedInvite) {
        await supabaseAdmin
          .from("player_accounts")
          .delete()
          .eq("id", newAccount.id);

        return jsonError(
          "La invitación ya se ha utilizado o no se ha podido validar.",
          409
        );
      }

      const token = await createSession(newAccount.id);

      return sessionCookie(
        NextResponse.json({
          ok: true,
          account: {
            id: newAccount.id,
            name: newAccount.name,
            must_change_pin: false,
          },
        }),
        token
      );
    }

    // ==================================================
    // INICIAR SESIÓN DE JUGADOR
    // ==================================================

    if (action === "login") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const pin = body.pin;

      if (!validName(name) || !validPin(pin)) {
        return jsonError("Nombre o PIN incorrectos.", 401);
      }

      const { data: accounts, error: accountError } =
        await supabaseAdmin
          .from("player_accounts")
          .select(
            "id, name, pin_hash, active, failed_attempts, locked_until, must_change_pin"
          );

      if (accountError) {
        return jsonError("No se ha podido comprobar la cuenta.", 500);
      }

      const account = (accounts || []).find(
        (item) => normalizeName(item.name) === normalizeName(name)
      );

      if (!account || !account.active) {
        return jsonError("Nombre o PIN incorrectos.", 401);
      }

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

      await supabaseAdmin
        .from("player_accounts")
        .update({ failed_attempts: 0, locked_until: null })
        .eq("id", account.id);

      const token = await createSession(account.id);

      const response = NextResponse.json({
        account: {
          id: account.id,
          name: account.name,
          must_change_pin: account.must_change_pin === true,
        },
      });

      return sessionCookie(response, token);
    }

    // ==================================================
    // CERRAR SESIÓN DE JUGADOR
    // ==================================================

    if (action === "logout") {
      const token = request.cookies.get(COOKIE_NAME)?.value;

      if (token) {
        await supabaseAdmin
          .from("player_sessions")
          .delete()
          .eq("token_hash", hashText(token));
      }

      return clearSessionCookie(NextResponse.json({ ok: true }));
    }

    // ==================================================
    // OPERACIONES QUE REQUIEREN SESIÓN DE JUGADOR
    // ==================================================

    const account = await getAccountFromRequest(request);

    if (!account) {
      return jsonError("Inicia sesión para continuar.", 401);
    }

    if (
      account.must_change_pin === true &&
      action !== "change-pin"
    ) {
      return jsonError(
        "Debes cambiar tu PIN temporal antes de continuar.",
        403
      );
    }

    // ==================================================
    // APUNTARSE AL POZO
    // ==================================================

    if (action === "pozo-join") {
      if (typeof body.pozoId !== "string") {
        return jsonError("El pozo no es válido.");
      }

      const { data: pozo, error: pozoError } =
        await supabaseAdmin
          .from("pozos")
          .select("id, date")
          .eq("id", body.pozoId)
          .maybeSingle();

      if (pozoError || !pozo) {
        return jsonError("No se ha encontrado el pozo.", 404);
      }

      if (pozo.date < todayLocalDate()) {
        return jsonError("Este pozo ya ha pasado.", 409);
      }

      const { data: current, error: currentError } =
        await supabaseAdmin
          .from("pozo_players")
          .select("id, account_id")
          .eq("pozo_id", body.pozoId);

      if (currentError) {
        return jsonError("No se han podido consultar las plazas del pozo.", 500);
      }

      if ((current || []).length >= 30) {
        return jsonError("El pozo está completo: hay 30 participantes.", 409);
      }

      if (
        (current || []).some(
          (item) => item.account_id === account.id
        )
      ) {
        return jsonError("Ya estás apuntado a este pozo.", 409);
      }

      const { error: insertError } = await supabaseAdmin
        .from("pozo_players")
        .insert({
          pozo_id: body.pozoId,
          account_id: account.id,
        });

      if (insertError) {
        console.error(
          "Error apuntándose al pozo:",
          insertError.message
        );

        return jsonError("No se ha podido completar la inscripción.", 500);
      }

      return NextResponse.json({ ok: true });
    }

    // ==================================================
    // DESAPUNTARSE DEL POZO
    // ==================================================

    if (action === "pozo-leave") {
      if (typeof body.registrationId !== "string") {
        return jsonError("La inscripción no es válida.");
      }

      const { data: registration, error: registrationError } =
        await supabaseAdmin
          .from("pozo_players")
          .select("id, pozo_id, account_id")
          .eq("id", body.registrationId)
          .maybeSingle();

      if (registrationError || !registration) {
        return jsonError("No se ha encontrado esa inscripción.", 404);
      }

      if (registration.account_id !== account.id) {
        return jsonError("Solo puedes quitar tu propia inscripción.", 403);
      }

      const { data: pozo, error: pozoError } =
        await supabaseAdmin
          .from("pozos")
          .select("date")
          .eq("id", registration.pozo_id)
          .maybeSingle();

      if (pozoError || !pozo || pozo.date < todayLocalDate()) {
        return jsonError("Este pozo ya ha pasado o no existe.", 409);
      }

      const { error: deleteError } = await supabaseAdmin
        .from("pozo_players")
        .delete()
        .eq("id", body.registrationId);

      if (deleteError) {
        console.error(
          "Error saliendo del pozo:",
          deleteError.message
        );

        return jsonError("No se ha podido salir del pozo.", 500);
      }

      return NextResponse.json({ ok: true });
    }

    // ==================================================
    // CAMBIAR PIN
    // ==================================================

    if (action === "change-pin") {
      const currentPin = body.currentPin;
      const newPin = body.newPin;
      const confirmPin = body.confirmPin;

      if (!validPin(newPin) || newPin !== confirmPin) {
        return jsonError(
          "El nuevo PIN debe tener entre 8 y 12 dígitos y coincidir con la confirmación."
        );
      }

      const { data: accountWithPin, error: accountError } =
        await supabaseAdmin
          .from("player_accounts")
          .select("id, pin_hash")
          .eq("id", account.id)
          .maybeSingle();

      if (accountError || !accountWithPin) {
        return jsonError("No se ha podido consultar tu cuenta.", 500);
      }

      if (
        !account.must_change_pin &&
        !(await verifyPin(currentPin, accountWithPin.pin_hash))
      ) {
        return jsonError("El PIN actual no es correcto.", 401);
      }

      const newHash = await hashPin(newPin);

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
        console.error(
          "Error cambiando PIN:",
          updateError.message
        );

        return jsonError("No se ha podido cambiar el PIN.", 500);
      }

      return NextResponse.json({
        ok: true,
        message: "PIN cambiado correctamente.",
      });
    }

    // ==================================================
    // CAMBIAR NOMBRE DE USUARIO
    // ==================================================

    if (action === "change-name") {
      const newName =
        typeof body.newName === "string"
          ? body.newName.trim()
          : "";

      if (!validName(newName)) {
        return jsonError("El nombre debe tener entre 2 y 60 caracteres.");
      }

      const existingAccount = await findAccountByName(newName);

      if (existingAccount && existingAccount.id !== account.id) {
        return jsonError("Ese nombre ya está siendo utilizado.", 409);
      }

      const { data: updatedAccount, error: updateError } =
        await supabaseAdmin
          .from("player_accounts")
          .update({ name: newName })
          .eq("id", account.id)
          .select("id, name, must_change_pin")
          .single();

      if (updateError || !updatedAccount) {
        console.error(
          "Error cambiando nombre:",
          updateError?.message
        );

        return jsonError("No se ha podido cambiar el nombre.", 500);
      }

      return NextResponse.json({
        ok: true,
        account: {
          id: updatedAccount.id,
          name: updatedAccount.name,
          must_change_pin: updatedAccount.must_change_pin === true,
        },
        message: "Nombre cambiado correctamente.",
      });
    }

    // ==================================================
    // AÑADIR INVITADO A UNA PARTIDA
    // ==================================================

    if (action === "add-guest") {
      if (!validDate(body.day)) {
        return jsonError("La fecha de la partida no es válida.");
      }

      const day = new Date(body.day).toISOString();

      const { data: result, error: guestError } =
        await supabaseAdmin.rpc("add_padel_guest", {
          p_day: day,
          p_invited_by: account.id,
        });

      if (guestError) {
        console.error(
          "Error añadiendo invitado:",
          guestError.message
        );

        return jsonError("No se ha podido añadir al invitado.", 500);
      }

      if (!result?.ok) {
        return jsonError(
          result?.message || "No se ha podido añadir al invitado.",
          409
        );
      }

      return NextResponse.json({
        ok: true,
        day,
        message: result.message,
      });
    }

    // ==================================================
    // APUNTARSE A PARTIDA NORMAL
    // ==================================================

    if (action === "join") {
      if (!validDate(body.day)) {
        return jsonError("La fecha de la partida no es válida.");
      }

      const day = new Date(body.day).toISOString();

      const { data: joinResult, error: joinError } =
        await supabaseAdmin.rpc("join_padel_match", {
          p_day: day,
          p_account_id: account.id,
        });

      if (joinError) {
        console.error(
          "Error apuntando jugador:",
          joinError.message
        );

        return jsonError("No se ha podido completar la inscripción.", 500);
      }

      if (!joinResult?.ok) {
        return jsonError(
          joinResult?.message || "No se ha podido apuntar a la partida.",
          409
        );
      }

      return NextResponse.json({
        ok: true,
        message: joinResult.message,
        removedDuplicates: joinResult.removed_duplicates ?? 0,
      });
    }

    // ==================================================
    // DESAPUNTARSE O ELIMINAR UN INVITADO
    // ==================================================

    if (action === "leave") {
      if (
        (typeof body.id !== "string" &&
          typeof body.id !== "number") ||
        String(body.id).trim() === ""
      ) {
        return jsonError("La inscripción no es válida.");
      }

      if (!validDate(body.day)) {
        return jsonError("La fecha de la partida no es válida.");
      }

      const day = new Date(body.day).toISOString();

      // Primero comprobar si la inscripción corresponde a un invitado.
      const { data: guest, error: guestError } =
        await supabaseAdmin
          .from("padel_guests")
          .select("id, day, invited_by")
          .eq("id", body.id)
          .eq("day", day)
          .maybeSingle();

      if (guestError) {
        console.error(
          "Error buscando invitado:",
          guestError.message
        );

        return jsonError("No se ha podido consultar el invitado.", 500);
      }

      if (guest) {
        if (guest.invited_by !== account.id) {
          return jsonError(
            "Solo el anfitrión que añadió al invitado puede eliminarlo.",
            403
          );
        }

        const { data: deletedGuest, error: deleteGuestError } =
          await supabaseAdmin
            .from("padel_guests")
            .delete()
            .eq("id", guest.id)
            .eq("invited_by", account.id)
            .select("id, day")
            .maybeSingle();

        if (deleteGuestError) {
          console.error(
            "Error eliminando invitado:",
            deleteGuestError.message
          );

          return jsonError("No se ha podido eliminar al invitado.", 500);
        }

        if (!deletedGuest) {
          return jsonError(
            "El invitado ya no existe o ya se ha eliminado.",
            409
          );
        }

        try {
          await clearReservationForDay(deletedGuest.day);
        } catch (error) {
          console.error(
            "Error restableciendo reserva tras eliminar invitado:",
            error
          );

          return jsonError(
            "El invitado se ha eliminado, pero no se ha podido restablecer la reserva. Recarga la página.",
            500
          );
        }

        return NextResponse.json({
          ok: true,
          message:
            "Invitado eliminado de la partida y reserva restablecida.",
        });
      }

      // Si no es un invitado, comprobar la inscripción normal.
      const { data: player, error: playerError } =
        await supabaseAdmin
          .from("players")
          .select("id, account_id, day")
          .eq("id", body.id)
          .eq("day", day)
          .maybeSingle();

      if (playerError) {
        console.error(
          "Error buscando inscripción:",
          playerError.message
        );

        return jsonError("No se ha podido consultar la inscripción.", 500);
      }

      if (!player) {
        return jsonError(
          "No se ha encontrado esa inscripción. Actualiza la página e inténtalo de nuevo.",
          404
        );
      }

      if (player.account_id !== account.id) {
        return jsonError("Solo puedes quitar tu propia inscripción.", 403);
      }

      const { data: deletedPlayer, error: deletePlayerError } =
        await supabaseAdmin
          .from("players")
          .delete()
          .eq("id", player.id)
          .eq("account_id", account.id)
          .select("id, day")
          .maybeSingle();

      if (deletePlayerError) {
        console.error(
          "Error eliminando inscripción:",
          deletePlayerError.message
        );

        return jsonError("No se ha podido eliminar la inscripción.", 500);
      }

      if (!deletedPlayer) {
        return jsonError(
          "La inscripción ya no existe o no se ha podido eliminar. Actualiza la página.",
          409
        );
      }

      // Al eliminar al anfitrión, eliminar también sus invitados de ese partido.
      const { error: deleteHostedGuestsError } =
        await supabaseAdmin
          .from("padel_guests")
          .delete()
          .eq("day", day)
          .eq("invited_by", account.id);

      if (deleteHostedGuestsError) {
        console.error(
          "Error eliminando invitados del anfitrión:",
          deleteHostedGuestsError.message
        );

        return jsonError(
          "Te has desapuntado, pero no se han podido eliminar todos tus invitados.",
          500
        );
      }

      try {
        await clearReservationForDay(deletedPlayer.day);
      } catch (error) {
        console.error(
          "Error restableciendo reserva tras desapuntar jugador:",
          error
        );

        return jsonError(
          "Te has desapuntado, pero no se ha podido restablecer la reserva. Recarga la página.",
          500
        );
      }

      return NextResponse.json({
        ok: true,
        message:
          "Te has desapuntado, se han eliminado tus invitados y se ha restablecido la reserva.",
      });
    }

    // ==================================================
    // MARCAR PARTIDA COMO RESERVADA
    // ==================================================

    if (action === "reserve") {
      if (!validDate(body.day)) {
        return jsonError("La fecha de la partida no es válida.");
      }

      const day = new Date(body.day).toISOString();

      // Consultar jugadores de la partida.
      const { data: playerRows, error: playersError } =
        await supabaseAdmin
          .from("players")
          .select("id, account_id, created_at, reserved")
          .eq("day", day);

      if (playersError) {
        console.error(
          "Error consultando jugadores para reservar:",
          playersError.message
        );

        return jsonError("No se ha podido consultar la partida.", 500);
      }

      // Consultar invitados de la partida.
      const { data: guestRows, error: guestsError } =
        await supabaseAdmin
          .from("padel_guests")
          .select("id, invited_by, created_at, reserved")
          .eq("day", day);

      if (guestsError) {
        console.error(
          "Error consultando invitados para reservar:",
          guestsError.message
        );

        return jsonError("No se ha podido consultar la partida.", 500);
      }

      // Unificar participantes y ordenarlos cronológicamente.
      const participants = [
        ...(playerRows || []).map((player) => ({
          ...player,
          is_guest: false,
        })),
        ...(guestRows || []).map((guest) => ({
          ...guest,
          is_guest: true,
          account_id: null,
        })),
      ].sort(
        (a, b) =>
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
      );

      if (participants.length !== 4) {
        return jsonError(
          "Se necesitan cuatro participantes para reservar.",
          409
        );
      }

      // El cuarto participante determina quién es responsable.
      const fourthParticipant = participants[3];

      // Si es un invitado, el responsable es su anfitrión.
      const responsibleAccountId = fourthParticipant.is_guest
        ? fourthParticipant.invited_by
        : fourthParticipant.account_id;

      // Solo el responsable puede marcar la reserva.
      if (responsibleAccountId !== account.id) {
        return jsonError(
          "Solo el responsable de la partida puede marcar la reserva.",
          403
        );
      }

      // No permitir marcar la reserva dos veces.
      if (
        participants.some(
          (participant) => participant.reserved === true
        )
      ) {
        return jsonError("La reserva ya está marcada.", 409);
      }

      // Marcar la fila del cuarto participante.
      let updateResult;

      if (fourthParticipant.is_guest) {
        updateResult = await supabaseAdmin
          .from("padel_guests")
          .update({ reserved: true })
          .eq("id", fourthParticipant.id)
          .eq("day", day)
          .eq("invited_by", account.id)
          .select("id")
          .maybeSingle();
      } else {
        updateResult = await supabaseAdmin
          .from("players")
          .update({ reserved: true })
          .eq("id", fourthParticipant.id)
          .eq("day", day)
          .eq("account_id", account.id)
          .select("id")
          .maybeSingle();
      }

      if (updateResult.error) {
        console.error(
          "Error marcando la reserva:",
          updateResult.error.message
        );

        return jsonError("No se ha podido actualizar la reserva.", 500);
      }

      if (!updateResult.data) {
        return jsonError(
          "No se ha podido actualizar la reserva. Recarga la página e inténtalo de nuevo.",
          409
        );
      }

      return NextResponse.json({
        ok: true,
        message: "La reserva se ha marcado correctamente.",
      });
    }

    // ==================================================
    // ACCIÓN NO RECONOCIDA
    // ==================================================

    return jsonError("Acción no reconocida.");
  } catch (error) {
    console.error("Error en API de pádel:", error);

    return jsonError("Error interno del servidor.", 500);
  }
}
