import type { TokenPayload } from "../utils/jwt";

export interface AppVariables {
  user: TokenPayload;
}

export interface AppEnv {
  Variables: AppVariables;
}
