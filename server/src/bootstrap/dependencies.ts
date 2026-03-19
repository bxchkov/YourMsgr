import { db, type Database } from "../db";
import { AuthService } from "../services/auth.service";
import { MessageService } from "../services/message.service";
import { PrivateChatService } from "../services/privateChat.service";

export interface ServerDependencies {
  database: Database;
  authService: AuthService;
  messageService: MessageService;
  privateChatService: PrivateChatService;
}

export const createServerDependencies = (database: Database = db): ServerDependencies => {
  return {
    database,
    authService: new AuthService(database),
    messageService: new MessageService(database),
    privateChatService: new PrivateChatService(database),
  };
};
