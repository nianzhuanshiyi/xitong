import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role?: UserRole;
    allowedModules?: string | null;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      allowedModules: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    allowedModules?: string[];
  }
}
