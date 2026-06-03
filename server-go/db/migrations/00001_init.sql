-- +goose Up
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    login TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL CONSTRAINT users_username_unique UNIQUE,
    password TEXT NOT NULL,
    role INTEGER NOT NULL DEFAULT 1 CONSTRAINT users_role_check CHECK (role IN (1, 3)),
    refresh_token TEXT,
    public_key TEXT,
    encrypted_private_key TEXT,
    encrypted_private_key_iv TEXT,
    encrypted_private_key_salt TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE private_chats (
    id SERIAL PRIMARY KEY,
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT private_chats_user1_id_user2_id_unique UNIQUE (user1_id, user2_id),
    CONSTRAINT private_chats_distinct_users_check CHECK (user1_id <> user2_id)
);

CREATE INDEX private_chats_user1_id_idx ON private_chats(user1_id);
CREATE INDEX private_chats_user2_id_idx ON private_chats(user2_id);

CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    chat_id INTEGER REFERENCES private_chats(id) ON DELETE CASCADE,
    chat_type TEXT NOT NULL DEFAULT 'group' CONSTRAINT messages_chat_type_check CHECK (chat_type IN ('group', 'private')),
    nonce TEXT,
    sender_public_key TEXT,
    reply_to_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_encrypted INTEGER NOT NULL DEFAULT 0 CONSTRAINT messages_is_encrypted_check CHECK (is_encrypted IN (0, 1)),
    date TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX messages_user_id_idx ON messages(user_id);
CREATE INDEX messages_reply_to_message_id_idx ON messages(reply_to_message_id);
CREATE INDEX messages_chat_type_id_idx ON messages(chat_type, id);
CREATE INDEX messages_chat_id_id_idx ON messages(chat_id, id);

-- +goose Down
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS private_chats;
DROP TABLE IF EXISTS users;
