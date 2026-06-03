package models

import "time"

// User represents the users table structure
type User struct {
	ID                      int        `json:"id"`
	Login                   string     `json:"login"`
	Username                string     `json:"username"`
	Password                string     `json:"-"` // Never expose password hash in JSON
	Role                    int        `json:"role"`
	RefreshToken            *string    `json:"refresh_token,omitempty"`
	PublicKey               *string    `json:"publicKey,omitempty"`
	EncryptedPrivateKey     *string    `json:"encryptedPrivateKey,omitempty"`
	EncryptedPrivateKeyIv   *string    `json:"encryptedPrivateKeyIv,omitempty"`
	EncryptedPrivateKeySalt *string    `json:"encryptedPrivateKeySalt,omitempty"`
	CreatedAt               time.Time  `json:"createdAt"`
}

// PrivateChat represents the private_chats table structure
type PrivateChat struct {
	ID        int       `json:"id"`
	User1ID   int       `json:"user1Id"`
	User2ID   int       `json:"user2Id"`
	CreatedAt time.Time `json:"createdAt"`
}

// Message represents the messages table structure
type Message struct {
	ID               int        `json:"id"`
	UserID           int        `json:"userId"`
	Username         string     `json:"username"`
	Message          string     `json:"message"`
	ChatID           *int       `json:"chatId,omitempty"`
	ChatType         string     `json:"chatType"` // "group" or "private"
	Nonce            *string    `json:"nonce,omitempty"`
	SenderPublicKey  *string    `json:"senderPublicKey,omitempty"`
	ReplyToMessageID *int       `json:"replyToMessageId,omitempty"`
	RecipientID      *int       `json:"recipientId,omitempty"`
	IsEncrypted      int        `json:"isEncrypted"` // 0 = plain, 1 = E2EE
	Date             time.Time  `json:"date"`
}
