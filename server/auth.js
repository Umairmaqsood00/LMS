import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { fail } from "./validation.js";

// New passwords use salted scrypt. Existing SHA-256 sample passwords still work.
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password, stored) {
  if (stored.startsWith("scrypt:")) {
    const [, salt, hash] = stored.split(":");
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
  return (
    createHash("sha256").update(password).digest("hex").toUpperCase() ===
    stored.toUpperCase()
  );
}
const sessions = new Map();
const lifetime = 8 * 60 * 60 * 1000;
setInterval(() => {
  for (const [token, session] of sessions)
    if (session.expires < Date.now()) sessions.delete(token);
}, 60000).unref();
export function createSession(res, user) {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { user, expires: Date.now() + lifetime });
  res.cookie("lms_session", token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: lifetime,
  });
}
export function readSession(req, res, next) {
  const token = req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("lms_session="))
    ?.slice(12);
  const session = sessions.get(token);
  if (session && session.expires > Date.now()) {
    req.user = session.user;
    req.token = token;
  }
  next();
}
export function loginRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Please log in." });
  next();
}
export function role(name) {
  return (req, res, next) => {
    if (req.user.Role !== name)
      return res.status(403).json({ message: `${name} access required.` });
    next();
  };
}
export function logout(req, res) {
  sessions.delete(req.token);
  res.clearCookie("lms_session");
  res.json({ message: "Logged out." });
}
export function password(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128)
    fail("Password must be 8–128 characters.");
  return value;
}
