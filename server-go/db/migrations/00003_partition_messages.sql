-- +goose Up
-- 1. Detach the sequence from the old table so it is not dropped
ALTER SEQUENCE messages_id_seq OWNED BY NONE;

-- 2. Create the partitioned messages table
CREATE TABLE messages_partitioned (
    id BIGINT NOT NULL DEFAULT nextval('messages_id_seq'),
    user_id BIGINT NOT NULL,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    chat_id BIGINT,
    chat_type TEXT NOT NULL DEFAULT 'group',
    nonce TEXT,
    sender_public_key TEXT,
    reply_to_message_id BIGINT,
    recipient_id BIGINT,
    is_encrypted INTEGER NOT NULL DEFAULT 0,
    date TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, date)
) PARTITION BY RANGE (date);

-- 3. Create default partition and initial partitions for 2026 to prevent insertion errors
CREATE TABLE messages_default PARTITION OF messages_partitioned DEFAULT;

CREATE TABLE messages_y2026m06 PARTITION OF messages_partitioned
    FOR VALUES FROM ('2026-06-01 00:00:00') TO ('2026-07-01 00:00:00');

CREATE TABLE messages_y2026m07 PARTITION OF messages_partitioned
    FOR VALUES FROM ('2026-07-01 00:00:00') TO ('2026-08-01 00:00:00');

CREATE TABLE messages_y2026m08 PARTITION OF messages_partitioned
    FOR VALUES FROM ('2026-08-01 00:00:00') TO ('2026-09-01 00:00:00');

-- 4. Copy existing data
INSERT INTO messages_partitioned (id, user_id, username, message, chat_id, chat_type, nonce, sender_public_key, reply_to_message_id, recipient_id, is_encrypted, date)
SELECT id, user_id, username, message, chat_id, chat_type, nonce, sender_public_key, reply_to_message_id, recipient_id, is_encrypted, date FROM messages;

-- 5. Drop the old unpartitioned table
DROP TABLE messages CASCADE;

-- 6. Rename partitioned table to messages
ALTER TABLE messages_partitioned RENAME TO messages;

-- 7. Re-associate the sequence to the new table
ALTER SEQUENCE messages_id_seq OWNED BY messages.id;

-- 8. Create indexes on the partitioned table
CREATE INDEX messages_user_id_idx ON messages(user_id);
CREATE INDEX messages_reply_to_message_id_idx ON messages(reply_to_message_id);
CREATE INDEX messages_chat_type_id_idx ON messages(chat_type, id);
CREATE INDEX messages_chat_id_id_idx ON messages(chat_id, id);

-- +goose Down
-- Detach the sequence
ALTER SEQUENCE messages_id_seq OWNED BY NONE;

-- Recreate unpartitioned table
CREATE TABLE messages_old (
    id BIGINT NOT NULL DEFAULT nextval('messages_id_seq') PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    chat_id BIGINT REFERENCES private_chats(id) ON DELETE CASCADE,
    chat_type TEXT NOT NULL DEFAULT 'group' CONSTRAINT messages_chat_type_check CHECK (chat_type IN ('group', 'private')),
    nonce TEXT,
    sender_public_key TEXT,
    reply_to_message_id BIGINT REFERENCES messages_old(id) ON DELETE SET NULL,
    recipient_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    is_encrypted INTEGER NOT NULL DEFAULT 0 CONSTRAINT messages_is_encrypted_check CHECK (is_encrypted IN (0, 1)),
    date TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Copy data back
INSERT INTO messages_old (id, user_id, username, message, chat_id, chat_type, nonce, sender_public_key, reply_to_message_id, recipient_id, is_encrypted, date)
SELECT id, user_id, username, message, chat_id, chat_type, nonce, sender_public_key, reply_to_message_id, recipient_id, is_encrypted, date FROM messages;

-- Drop partitioned table
DROP TABLE messages CASCADE;

-- Rename back
ALTER TABLE messages_old RENAME TO messages;

-- Re-associate sequence
ALTER SEQUENCE messages_id_seq OWNED BY messages.id;

-- Recreate indexes
CREATE INDEX messages_user_id_idx ON messages(user_id);
CREATE INDEX messages_reply_to_message_id_idx ON messages(reply_to_message_id);
CREATE INDEX messages_chat_type_id_idx ON messages(chat_type, id);
CREATE INDEX messages_chat_id_id_idx ON messages(chat_id, id);
