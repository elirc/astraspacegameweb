export interface RequestPort {
  body: any;
  query: any;
  params: any;
  headers: Record<string, string | string[] | undefined>;
  cookies: Record<string, string | undefined>;
  user: any;
  playerId: number;
  userId: number | null;
  isAdmin: boolean;
  sessionId: string;
  jwtVerify(): Promise<unknown>;
}
export interface ReplyPort {
  setCookie(name: string, value: string, options: any): unknown;
  clearCookie(name: string, options: any): unknown;
}
