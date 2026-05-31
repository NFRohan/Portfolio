import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: Role;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: String(credentials.email) },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(String(credentials.password), user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "credentials") return true;
      if (!user.email || !isOAuthEmailAllowed(user.email)) return false;

      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
        select: { id: true },
      });
      return Boolean(existingUser);
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "credentials") {
          token.id = user.id!;
          token.role = user.role;
        } else if (user.email) {
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email },
            select: { id: true, name: true, role: true },
          });
          if (existingUser) {
            token.id = existingUser.id;
            token.name = existingUser.name;
            token.role = existingUser.role;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
});

function isOAuthEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const allowedEmails = splitEnv("AUTH_ALLOWED_EMAILS");
  const allowedDomains = splitEnv("AUTH_ALLOWED_EMAIL_DOMAINS");
  if (allowedEmails.length === 0 && allowedDomains.length === 0) return true;
  if (allowedEmails.includes(normalized)) return true;

  const domain = normalized.split("@")[1];
  return Boolean(domain && allowedDomains.includes(domain));
}

function splitEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
