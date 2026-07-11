import "express-session";

declare module "express-session" {
  interface SessionData {
    host?: {
      id: number;
      host_serial?: string;
      name: string;
      email: string;
      organization_name?: string;
    };
    supervisor?: {
      username: string;
    };
    merchant?: {
      id: number;
      name: string;
      email: string;
      country?: "KR" | "TH" | "VN";
    };
    partner?: {
      id: number;
      email: string;
    };
    lastActivity?: number;
    emailVerified?: string;
    merchantEmailVerified?: string;
  }
}
