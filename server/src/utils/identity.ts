const RESERVED_IDENTIFIERS = new Set([
  "admin",
  "administrator",
  "owner",
  "root",
  "system",
  "support",
  "moder",
  "mod",
  "moderator",
  "administator",
]);

export const normalizeIdentity = (value: string) => value.trim().toLowerCase();

export const isReservedIdentity = (value: string) => RESERVED_IDENTIFIERS.has(normalizeIdentity(value));

export const getReservedIdentityError = (kind: "login" | "username") =>
  kind === "login" ? "Reserved login" : "Reserved username";

export const assertIdentityIsAllowed = (value: string, kind: "login" | "username") => {
  if (isReservedIdentity(value)) {
    throw new Error(getReservedIdentityError(kind));
  }
};
