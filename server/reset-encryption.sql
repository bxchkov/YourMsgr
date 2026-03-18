-- Reset encryption: clear old messages and user keys
-- This is needed after switching from asymmetric to symmetric encryption

-- Delete all old encrypted messages
DELETE FROM messages;

-- Clear old public keys (users will regenerate them on next login)
UPDATE users SET public_key = NULL;

-- Optional: if you want to completely reset users too, uncomment:
-- DELETE FROM users;
