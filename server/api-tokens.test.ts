import { describe, expect, it } from "vitest";
import {
  createRateCounter,
  generateApiToken,
  hashApiToken,
  isDeniedForToken,
  readBearerApiToken,
} from "./api-tokens";

describe("generateApiToken", () => {
  it("produce un token nel formato atteso", () => {
    const { token } = generateApiToken();
    expect(token).toMatch(/^thu_[A-Za-z0-9_-]{43}$/);
  });

  it("calcola hash e prefisso coerenti", () => {
    const { token, hash, prefix } = generateApiToken();
    expect(hash).toBe(hashApiToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(prefix).toBe(token.slice(4, 12));
  });

  it("produce token diversi a ogni chiamata", () => {
    expect(generateApiToken().token).not.toBe(generateApiToken().token);
  });
});

describe("readBearerApiToken", () => {
  const { token } = generateApiToken();

  it("restituisce il token per un header Bearer valido", () => {
    expect(readBearerApiToken("Bearer " + token)).toBe(token);
  });

  it.each([
    undefined,
    "Bearer abc",
    "Basic " + token,
    "Bearer thu_short",
    "bearer " + token,
  ])("restituisce null per %s", (header) => {
    expect(readBearerApiToken(header)).toBeNull();
  });
});

describe("isDeniedForToken", () => {
  it.each([
    ["GET", "/api/ai/models"],
    ["GET", "/api/ai"],
    ["POST", "/api/organizations"],
    ["GET", "/api/sap-systems/abc/credentials/active"],
    ["GET", "/api/vpn-credentials/5"],
    ["DELETE", "/api/account/api-tokens/3"],
    ["POST", "/api/logout"],
  ])("vieta %s %s", (method, path) => {
    expect(isDeniedForToken(method, path)).toBe(true);
  });

  it.each([
    ["GET", "/api/ai-learning-patterns"],
    ["GET", "/api/organizations"],
    ["GET", "/api/sap-systems/abc"],
    ["GET", "/api/projects"],
    ["POST", "/api/comments"],
    ["GET", "/api/email-training-selections"],
    ["GET", "/api/user"],
  ])("ammette %s %s", (method, path) => {
    expect(isDeniedForToken(method, path)).toBe(false);
  });
});

describe("createRateCounter", () => {
  it("limita per chiave a finestra fissa", () => {
    const counter = createRateCounter(2, 60000);
    expect(counter.consume("a", 0)).toBe(true);
    expect(counter.consume("a", 0)).toBe(true);
    expect(counter.consume("a", 0)).toBe(false);
    expect(counter.consume("b", 0)).toBe(true);
    expect(counter.consume("a", 60001)).toBe(true);
  });
});
