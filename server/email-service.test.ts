import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sendgrid/mail", () => ({ default: { setApiKey: vi.fn(), send: vi.fn() } }));

describe("emailService.sendResetEmail", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env.PUBLIC_APP_URL = "https://hubup.example.test/";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("costruisce il link alla pagina di reset con il token", async () => {
    const { emailService } = await import("./email-service");
    expect(emailService.resetLink("abc123")).toBe("https://hubup.example.test/reset-password?token=abc123");
  });

  it("senza SendGrid non invia e risponde false, senza scrivere il token nei log", async () => {
    delete process.env.SENDGRID_API_KEY;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { emailService } = await import("./email-service");
    expect(await emailService.sendResetEmail("a@b.it", "Ivan", "segreto-token")).toBe(false);
    const written = [...log.mock.calls, ...err.mock.calls].flat().join(" ");
    expect(written).not.toContain("segreto-token");
  });

  it("con SendGrid manda l'email con il link", async () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    const sg = (await import("@sendgrid/mail")).default as unknown as { send: ReturnType<typeof vi.fn> };
    sg.send.mockResolvedValue([{}]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { emailService } = await import("./email-service");
    expect(await emailService.sendResetEmail("a@b.it", "Ivan", "tok")).toBe(true);
    const msg = sg.send.mock.calls[0][0];
    expect(msg.to).toBe("a@b.it");
    expect(msg.html).toContain("https://hubup.example.test/reset-password?token=tok");
  });
});
