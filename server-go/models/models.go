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
	ChatID           *int       `json:"chatId"`
	ChatType         string     `json:"chatType"` // "group" or "private"
	Nonce            *string    `json:"nonce"`
	SenderPublicKey  *string    `json:"senderPublicKey"`
	ReplyToMessageID *int       `json:"replyToMessageId"`
	RecipientID      *int       `json:"recipientId"`
	IsEncrypted      int        `json:"isEncrypted"` // 0 = plain, 1 = E2EE
	Date             time.Time  `json:"date"`
}

// ReplyPreview represents the preview metadata of a referenced reply message
type ReplyPreview struct {
	ID              int     `json:"id"`
	UserID          int     `json:"userId"`
	Username        string  `json:"username"`
	Message         string  `json:"message"`
	IsEncrypted     int     `json:"isEncrypted"`
	Nonce           *string `json:"nonce"`
	SenderPublicKey *string `json:"senderPublicKey"`
	RecipientID     *int    `json:"recipientId"`
	MediaType       *string `json:"mediaType"`
	MediaName       *string `json:"mediaName"`
}

// MessageWithReply embeds a Message and adds its ReplyPreview reference
type MessageWithReply struct {
	Message
	ReplyTo *ReplyPreview `json:"replyTo"`
}
