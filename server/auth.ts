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
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Local Strategy - using email as username
  passport.use(
    new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
      const user = await storage.getUserByEmail(email);
      if (!user || !user.password || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
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
        // User doesn't exist anymore - clear session
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      console.error('[AUTH] Failed to deserialize user:', error);
      // Clear session if user can't be found
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

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
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

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
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
