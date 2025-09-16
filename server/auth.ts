import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { emailService } from "./email-service";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 32)) as Buffer; // Ridotto da 64 a 32 per performance
  return `${buf.toString("hex")}.${salt}`;
}

function isHex(s: string): boolean {
  return /^[0-9a-f]{2,}$/i.test(s) && s.length % 2 === 0;
}

export async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  
  // Compatibilità retroattiva: determina se è hash legacy (64 bytes) o nuovo (32 bytes)
  const keyLength = hashedBuf.length;
  
  // Try hex-decoded salt first (legacy format), then string salt (new format)
  const saltBuf = isHex(salt) ? Buffer.from(salt, "hex") : Buffer.from(salt, 'utf8');
  let derived = (await scryptAsync(supplied, saltBuf, keyLength)) as Buffer;
  
  if (!timingSafeEqual(hashedBuf, derived) && isHex(salt)) {
    // Fallback: try string salt if hex salt failed
    derived = (await scryptAsync(supplied, salt, keyLength)) as Buffer;
  }
  
  return timingSafeEqual(hashedBuf, derived);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Local Strategy - supporting both email and username
  passport.use(
    new LocalStrategy({ usernameField: 'email' }, async (emailOrUsername, password, done) => {
      console.log(`[AUTH] Login attempt for: ${emailOrUsername}`);
      console.log(`[AUTH] System debug active`);
      
      // First try to find user by email
      let user = await storage.getUserByEmail(emailOrUsername);
      
      // If not found and it doesn't look like an email, try by username
      if (!user && !emailOrUsername.includes('@')) {
        console.log(`[AUTH] Email lookup failed, trying username lookup`);
        user = await storage.getUserByUsername(emailOrUsername);
      }
      
      if (!user) {
        console.log(`[AUTH] User not found`);
        return done(null, false);
      }
      
      if (!user.password) {
        console.log(`[AUTH] User has no password`);
        return done(null, false);
      }
      
      const passwordMatch = await comparePasswords(password, user.password);
      console.log(`[AUTH] Password match: ${passwordMatch}`);
      
      if (!passwordMatch) {
        return done(null, false);
      } else {
        console.log(`[AUTH] Login successful for user: ${user.username}`);
        return done(null, user);
      }
    }),
  );

  // Google OAuth Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists with this Google ID
          let user = await storage.getUserByProvider("google", profile.id);
          
          if (user) {
            return done(null, user);
          }

          // Check if user exists with same email
          user = await storage.getUserByEmail(profile.emails?.[0]?.value || "");
          
          if (user) {
            // Email already registered - return error
            return done(new Error(`Utente già registrato con ${profile.emails?.[0]?.value}`), false);
          }

          // Create new user
          const newUser = await storage.createUser({
            email: profile.emails?.[0]?.value || "",
            username: profile.emails?.[0]?.value || "", // Use email as username
            firstName: profile.name?.givenName || "",
            lastName: profile.name?.familyName || "",
            provider: "google",
            externalId: profile.id,
            profileImageUrl: profile.photos?.[0]?.value,
            isEmailVerified: true, // Google emails are verified
          });

          return done(null, newUser);
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      console.error('[AUTH] Failed to deserialize user:', error);
      done(null, false);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      // Check for existing email
      const existingEmailUser = await storage.getUserByEmail(req.body.email);
      if (existingEmailUser) {
        return res.status(400).send("Email already exists");
      }

      const user = await storage.createUser({
        ...req.body,
        username: req.body.email, // Use email as username
        password: await hashPassword(req.body.password),
        isEmailVerified: false, // New users need email verification
      });

      // Generate and save email verification token
      const verificationToken = emailService.generateVerificationToken();
      await storage.createEmailVerificationToken(user.id, user.email, verificationToken);

      // Send verification email
      const emailSent = await emailService.sendVerificationEmail(
        user.email, 
        user.firstName || user.username || 'Utente', 
        verificationToken
      );

      if (!emailSent) {
        console.error('[AUTH] Failed to send verification email to', user.email);
        // Don't fail registration if email sending fails
      }

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json({
          ...user,
          message: "Registrazione completata. Controlla la tua email per confermare l'account."
        });
      });
    } catch (error) {
      console.error('[AUTH] Registration error:', error);
      res.status(500).send("Registration failed");
    }
  });

  // Password Reset Request endpoint
  app.post("/api/password-reset/request", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Find user by email (case insensitive)
      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      
      // Always return success for security (don't reveal if email exists)
      if (!user) {
        console.log('[AUTH] Password reset requested for non-existent email:', email);
        return res.json({ message: "Se l'email esiste nel sistema, riceverai un link per il reset della password." });
      }

      // Generate secure reset token
      const crypto = await import('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      // Hash token for secure database storage
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      
      // Set token expiry to 1 hour from now
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + 1);
      
      // Save hashed reset token to database (never store raw token)
      await storage.setResetToken(user.id, hashedToken, expiryDate);
      
      // Send reset email
      const userName = user.firstName || user.username || 'Utente';
      const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;
      
      // Try to send email (graceful fallback if email service unavailable)
      let emailSent = false;
      try {
        // Check if sendResetEmail method exists
        if (emailService && typeof emailService.sendResetEmail === 'function') {
          emailSent = await emailService.sendResetEmail(user.email, userName, resetToken);
        } else {
          console.log('[AUTH] Reset link generated for', user.email, '(token masked for security)');
          emailSent = true; // Fallback: link generated but not logged
        }
      } catch (emailError) {
        console.error('[AUTH] Failed to send reset email:', emailError);
        console.log('[AUTH] Reset link generated for', user.email, '(token masked for security)');
        emailSent = true; // Fallback: link generated but not logged
      }

      if (!emailSent) {
        console.error('[AUTH] Email service unavailable. Reset link generated for', user.email, '(token masked for security)');
      }

      res.json({ message: "Se l'email esiste nel sistema, riceverai un link per il reset della password." });
      
    } catch (error) {
      console.error('[AUTH] Password reset request error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Password Reset Verification endpoint
  app.post("/api/password-reset/verify", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ error: "Token and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long" });
      }

      // Find user by reset token (will hash token internally for comparison)
      const user = await storage.getUserByResetToken(token);
      
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      // Hash the new password
      const hashedPassword = await hashPassword(newPassword);
      
      // Update user's password and clear reset token
      await storage.updateUser(user.id, { password: hashedPassword });
      await storage.clearResetToken(user.id);
      
      console.log('[AUTH] Password successfully reset for user:', user.email);
      res.json({ message: "Password reset successfully. You can now log in with your new password." });
      
    } catch (error) {
      console.error('[AUTH] Password reset verification error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/login", passport.authenticate("local"), async (req, res) => {
    // Preload all user data for instant performance
    console.log(`[LOGIN] User ${req.user.id} logged in, starting data preload...`);
    
    // Don't wait for preload to complete - send login response immediately  
    // Preload happens in background for better UX
    storage.preloadUserData(req.user.id).catch(error => {
      console.error('[LOGIN] Preload failed:', error);
    });
    
    res.status(200).json(req.user);
  });

  // Google OAuth routes
  app.get("/api/auth/google", 
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  app.get("/api/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login" }),
    (req, res) => {
      // Successful authentication, redirect to frontend
      res.redirect("/");
    }
  );

  app.get("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie('connect.sid');
        res.redirect('/auth');
      });
    });
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie('connect.sid');
        res.json({ success: true, redirect: '/auth' });
      });
    });
  });

  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    // Auto-preload on first user request if not already cached
    const userId = req.user.id;
    if (!storage.isUserDataCached(userId)) {
      console.log(`[AUTO-PRELOAD] Starting preload for user ${userId} on first access`);
      storage.preloadUserData(userId).catch(error => {
        console.error('[AUTO-PRELOAD] Failed:', error);
      });
    }
    
    res.json(req.user);
  });

  // Manual preload endpoint for testing
  app.post("/api/preload", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      console.log(`[MANUAL-PRELOAD] Starting for user ${req.user.id}`);
      await storage.preloadUserData(req.user.id);
      res.json({ success: true, message: "Preload completed" });
    } catch (error) {
      console.error('[MANUAL-PRELOAD] Failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // User update endpoint
  app.put("/api/users/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const userId = req.params.id;
      const currentUserId = req.user.id;
      
      // Users can only update their own data
      if (userId !== currentUserId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const updatedUser = await storage.updateUser(userId, req.body);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });


  // Invitation endpoints
  app.get("/api/invitations", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const userEmail = req.user.email;
      const invitations = await storage.getUserInvitations(userEmail);
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  app.post("/api/invitations/:token/accept", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const token = req.params.token;
      const userId = req.user.id;
      const userEmail = req.user.email;
      
      const result = await storage.acceptInvitation(token, userId, userEmail);
      res.json(result);
    } catch (error) {
      console.error("Error accepting invitation:", error);
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  // Email verification endpoint
  app.get("/api/verify-email", async (req, res) => {
    try {
      const token = req.query.token as string;
      
      if (!token) {
        return res.status(400).json({ 
          success: false, 
          message: "Token di verifica mancante" 
        });
      }

      // Get token details before verification
      const tokenRecord = await storage.getEmailVerificationToken(token);
      if (!tokenRecord) {
        return res.status(400).json({ 
          success: false, 
          message: "Token di verifica non valido o scaduto" 
        });
      }

      // Verify the token (this also updates the user's email verification status)
      const success = await storage.verifyEmailToken(token);
      
      if (success) {
        // Get updated user info
        const user = await storage.getUser(tokenRecord.userId);
        
        // Send welcome email
        if (user) {
          await emailService.sendWelcomeEmail(
            user.email, 
            user.firstName || user.username || 'Utente'
          );
        }

        res.json({ 
          success: true, 
          message: "Email verificata con successo! Ora puoi accedere a tutte le funzionalità del CRM." 
        });
      } else {
        res.status(400).json({ 
          success: false, 
          message: "Errore durante la verifica. Il token potrebbe essere scaduto." 
        });
      }
    } catch (error) {
      console.error('[AUTH] Email verification error:', error);
      res.status(500).json({ 
        success: false, 
        message: "Errore del server durante la verifica" 
      });
    }
  });

  // Frontend route for email verification page
  app.get("/verify-email", (req, res) => {
    // Return a simple HTML page that handles the verification
    const token = req.query.token as string;
    
    if (!token) {
      return res.send(`
        <html>
          <head><title>Verifica Email - Errore</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #dc3545;">Token di verifica mancante</h2>
            <p>Il link di verifica non è valido.</p>
            <a href="/" style="color: #007bff;">Torna alla homepage</a>
          </body>
        </html>
      `);
    }

    res.send(`
      <html>
        <head>
          <title>Verifica Email</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .loader { border: 4px solid #f3f3f3; border-top: 4px solid #007bff; border-radius: 50%; width: 40px; height: 40px; animation: spin 2s linear infinite; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .success { color: #28a745; }
            .error { color: #dc3545; }
          </style>
        </head>
        <body>
          <h2>Verifica in corso...</h2>
          <div class="loader"></div>
          <div id="result"></div>
          
          <script>
            fetch('/api/verify-email?token=${token}')
              .then(response => response.json())
              .then(data => {
                const loader = document.querySelector('.loader');
                const result = document.getElementById('result');
                loader.style.display = 'none';
                
                if (data.success) {
                  result.innerHTML = '<h2 class="success">✓ Email verificata con successo!</h2><p>' + data.message + '</p><a href="/" style="color: #007bff;">Accedi al CRM</a>';
                } else {
                  result.innerHTML = '<h2 class="error">✗ Verifica fallita</h2><p>' + data.message + '</p><a href="/" style="color: #007bff;">Torna alla homepage</a>';
                }
              })
              .catch(error => {
                const loader = document.querySelector('.loader');
                const result = document.getElementById('result');
                loader.style.display = 'none';
                result.innerHTML = '<h2 class="error">✗ Errore di connessione</h2><p>Si è verificato un errore durante la verifica.</p><a href="/" style="color: #007bff;">Torna alla homepage</a>';
              });
          </script>
        </body>
      </html>
    `);
  });

}
