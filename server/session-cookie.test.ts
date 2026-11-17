import { describe, it, expect } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import { sessionCookieOptions } from "./session-cookie";

describe("sessionCookieOptions", () => {
  it("in produzione il cookie è secure", () => {
    expect(sessionCookieOptions({ NODE_ENV: "production" }).secure).toBe(true);
  });

  it("in sviluppo e nei test il cookie non è secure", () => {
    expect(sessionCookieOptions({ NODE_ENV: "development" }).secure).toBe(false);
    expect(sessionCookieOptions({ NODE_ENV: "test" }).secure).toBe(false);
    expect(sessionCookieOptions({}).secure).toBe(false);
  });

  it("SESSION_COOKIE_SECURE forza il valore in entrambi i sensi", () => {
    expect(sessionCookieOptions({ NODE_ENV: "production", SESSION_COOKIE_SECURE: "false" }).secure).toBe(false);
    expect(sessionCookieOptions({ NODE_ENV: "production", SESSION_COOKIE_SECURE: "0" }).secure).toBe(false);
    expect(sessionCookieOptions({ NODE_ENV: "development", SESSION_COOKIE_SECURE: "true" }).secure).toBe(true);
    expect(sessionCookieOptions({ NODE_ENV: "development", SESSION_COOKIE_SECURE: " TRUE " }).secure).toBe(true);
  });

  it("un valore non riconosciuto di SESSION_COOKIE_SECURE è un errore", () => {
    expect(() => sessionCookieOptions({ NODE_ENV: "production", SESSION_COOKIE_SECURE: "forse" })).toThrow(
      /SESSION_COOKIE_SECURE/,
    );
  });

  it("mantiene httpOnly, sameSite lax e durata di 30 giorni", () => {
    const opts = sessionCookieOptions({ NODE_ENV: "production" });
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("cookie di sessione dietro il proxy HTTPS", () => {
  function app(env: Record<string, string | undefined>) {
    const a = express();
    a.set("trust proxy", 1);
    a.use(
      session({ secret: "s", resave: false, saveUninitialized: false, cookie: sessionCookieOptions(env) }),
    );
    a.get("/login", (req: any, res) => {
      req.session.userId = "u1";
      res.sendStatus(200);
    });
    return a;
  }

  it("in produzione dietro HTTPS il cookie ha gli attributi Secure, HttpOnly e SameSite=Lax", async () => {
    const res = await request(app({ NODE_ENV: "production" })).get("/login").set("X-Forwarded-Proto", "https");
    const cookie = String(res.headers["set-cookie"]?.[0] ?? "");
    expect(cookie).toMatch(/connect\.sid=/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
  });

  it("in produzione su HTTP in chiaro il cookie non viene emesso", async () => {
    const res = await request(app({ NODE_ENV: "production" })).get("/login");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("in sviluppo su HTTP il cookie viene emesso senza Secure", async () => {
    const res = await request(app({ NODE_ENV: "development" })).get("/login");
    const cookie = String(res.headers["set-cookie"]?.[0] ?? "");
    expect(cookie).toMatch(/connect\.sid=/);
    expect(cookie).not.toMatch(/Secure/);
  });
});
