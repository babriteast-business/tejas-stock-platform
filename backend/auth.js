import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool, newId } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const SIGNUP_BONUS = 100000; // ₹1,00,000 virtual credit on signup

export async function registerUser(name, email, password) {
  const existing = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1)", [email]);
  if (existing.rows.length) {
    throw new Error("An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const id = newId();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)",
      [id, name, email, passwordHash]
    );
    await client.query("INSERT INTO wallets (user_id, cash) VALUES ($1, $2)", [id, SIGNUP_BONUS]);
    await client.query(
      "INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after) VALUES ($1, $2, 'BONUS', $3, $3)",
      [newId(), id, SIGNUP_BONUS]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { id, name, email, createdAt: new Date().toISOString() };
}

export async function loginUser(email, password) {
  const res = await pool.query("SELECT * FROM users WHERE lower(email) = lower($1)", [email]);
  const user = res.rows[0];
  if (!user) throw new Error("Invalid email or password");
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new Error("Invalid email or password");
  return publicUser(user);
}

export async function findUserById(id) {
  const res = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  const user = res.rows[0];
  return user ? publicUser(user) : null;
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.created_at };
}

export function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}
