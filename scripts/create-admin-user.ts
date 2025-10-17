import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { users, organizations, userOrganizations } from "../shared/schema";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 32)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function createAdminUser() {
  try {
    // Check if admin user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.username, 'admin'))
      .limit(1);

    if (existingUser.length > 0) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Hash the password
    const hashedPassword = await hashPassword('admin');

    // Create the user
    const [user] = await db
      .insert(users)
      .values({
        username: 'admin',
        email: 'admin@example.com',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        isEmailVerified: true,
      })
      .returning();

    console.log('Admin user created successfully:', user.id);

    // Create default "Personal" organization
    const [personalOrg] = await db
      .insert(organizations)
      .values({
        name: "Personal",
        isActive: true,
        theme: "blue"
      })
      .returning();

    // Add user as admin of their personal organization
    await db
      .insert(userOrganizations)
      .values({
        userId: user.id,
        organizationId: personalOrg.id,
        role: "admin"
      });

    console.log('Personal organization created and user assigned as admin');
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();
