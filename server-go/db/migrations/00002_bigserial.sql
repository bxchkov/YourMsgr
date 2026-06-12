-- +goose Up
-- Migrate primary key sequences from INT (SERIAL) to BIGINT (BIGSERIAL)
-- SERIAL caps at ~2.1 billion; BIGSERIAL supports up to ~9.2 quintillion rows.
-- Safe to run on existing data: ALTER COLUMN type is compatible, sequence is swapped in-place.

ALTER TABLE users
    ALTER COLUMN id TYPE BIGINT;
ALTER SEQUENCE users_id_seq AS BIGINT;

ALTER TABLE private_chats
    ALTER COLUMN id TYPE BIGINT,
    ALTER COLUMN user1_id TYPE BIGINT,
    ALTER COLUMN user2_id TYPE BIGINT;
ALTER SEQUENCE private_chats_id_seq AS BIGINT;

ALTER TABLE messages
    ALTER COLUMN id TYPE BIGINT,
    ALTER COLUMN user_id TYPE BIGINT,
    ALTER COLUMN chat_id TYPE BIGINT,
    ALTER COLUMN reply_to_message_id TYPE BIGINT,
    ALTER COLUMN recipient_id TYPE BIGINT;
ALTER SEQUENCE messages_id_seq AS BIGINT;

-- +goose Down
ALTER TABLE messages
    ALTER COLUMN id TYPE INTEGER,
    ALTER COLUMN user_id TYPE INTEGER,
    ALTER COLUMN chat_id TYPE INTEGER,
    ALTER COLUMN reply_to_message_id TYPE INTEGER,
    ALTER COLUMN recipient_id TYPE INTEGER;
ALTER SEQUENCE messages_id_seq AS INTEGER;

ALTER TABLE private_chats
    ALTER COLUMN id TYPE INTEGER,
    ALTER COLUMN user1_id TYPE INTEGER,
    ALTER COLUMN user2_id TYPE INTEGER;
ALTER SEQUENCE private_chats_id_seq AS INTEGER;

ALTER TABLE users
    ALTER COLUMN id TYPE INTEGER;
ALTER SEQUENCE users_id_seq AS INTEGER;
