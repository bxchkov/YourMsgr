package services

import (
	"context"
	"testing"

	"yourmsgr/db"
)

func TestChatService_GetOrCreatePrivateChat(t *testing.T) {
	setupTestDB(t)
	if db.Pool == nil {
		return
	}

	ctx := context.Background()
	authService := NewAuthService()
	chatService := NewChatService()

	// Register two users
	uniqueID1 := generateRandomString(8)
	login1 := "chat_u1_" + uniqueID1
	user1, err := authService.Register(ctx, login1, "pass123", "UserOne "+uniqueID1, "pub1", "priv1", "iv1", "salt1")
	if err != nil {
		t.Fatalf("Failed to create user 1: %v", err)
	}

	uniqueID2 := generateRandomString(8)
	login2 := "chat_u2_" + uniqueID2
	user2, err := authService.Register(ctx, login2, "pass123", "UserTwo "+uniqueID2, "pub2", "priv2", "iv2", "salt2")
	if err != nil {
		t.Fatalf("Failed to create user 2: %v", err)
	}

	// Clean up users and chats after test
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM users WHERE id IN ($1, $2)", user1.ID, user2.ID)
	})

	// 1. Create Private Chat
	chat, err := chatService.GetOrCreatePrivateChat(ctx, user1.ID, user2.ID)
	if err != nil {
		t.Fatalf("GetOrCreatePrivateChat failed: %v", err)
	}

	if chat.ID <= 0 {
		t.Errorf("Expected valid chat ID, got %d", chat.ID)
	}

	// Verify order-independent distinct user check
	chat2, err := chatService.GetOrCreatePrivateChat(ctx, user2.ID, user1.ID)
	if err != nil {
		t.Fatalf("GetOrCreatePrivateChat (reverse order) failed: %v", err)
	}

	if chat.ID != chat2.ID {
		t.Errorf("Expected same chat ID for reverse order query: got %d, expected %d", chat2.ID, chat.ID)
	}
}

func TestChatService_SendAndGetMessages(t *testing.T) {
	setupTestDB(t)
	if db.Pool == nil {
		return
	}

	ctx := context.Background()
	authService := NewAuthService()
	chatService := NewChatService()

	// Create test users
	uID1 := generateRandomString(8)
	user1, _ := authService.Register(ctx, "send_u1_"+uID1, "pass", "SenderOne", "pub1", "priv1", "iv1", "salt1")
	uID2 := generateRandomString(8)
	user2, _ := authService.Register(ctx, "send_u2_"+uID2, "pass", "SenderTwo", "pub2", "priv2", "iv2", "salt2")

	chat, err := chatService.GetOrCreatePrivateChat(ctx, user1.ID, user2.ID)
	if err != nil {
		t.Fatalf("Failed to create private chat: %v", err)
	}

	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM users WHERE id IN ($1, $2)", user1.ID, user2.ID)
	})

	// 1. Send Private Message
	nonce := "random_nonce_value"
	msgText := "Hello, this is a secure message!"
	newMsg, err := chatService.SendPrivateMessage(ctx, chat.ID, user1.ID, user1.Username, msgText, user2.ID, &nonce, 1, nil)
	if err != nil {
		t.Fatalf("SendPrivateMessage failed: %v", err)
	}

	if newMsg.Message.Message != msgText || newMsg.ChatID == nil || *newMsg.ChatID != chat.ID || newMsg.Nonce == nil || *newMsg.Nonce != nonce {
		t.Errorf("Sent message fields mismatch: %+v", newMsg)
	}

	// 2. Fetch Private Messages
	history, err := chatService.GetPrivateChatMessages(ctx, chat.ID, user1.ID, nil, 10)
	if err != nil {
		t.Fatalf("GetPrivateChatMessages failed: %v", err)
	}

	found := false
	for _, msg := range history {
		if msg.ID == newMsg.ID {
			found = true
			if msg.Message.Message != msgText {
				t.Errorf("Expected message text %q, got %q", msgText, msg.Message.Message)
			}
		}
	}
	if !found {
		t.Error("Sent private message not found in chat history")
	}

	// 3. Send Group Message
	groupNonce := "group_nonce"
	groupMsgText := "Hello Group!"
	newGroupMsg, err := chatService.SendGroupMessage(ctx, user1.ID, user1.Username, groupMsgText, &groupNonce, 0, nil)
	if err != nil {
		t.Fatalf("SendGroupMessage failed: %v", err)
	}

	// 4. Fetch Group Messages
	groupHistory, err := chatService.GetGroupMessages(ctx, nil, 10)
	if err != nil {
		t.Fatalf("GetGroupMessages failed: %v", err)
	}

	foundGroup := false
	for _, msg := range groupHistory {
		if msg.ID == newGroupMsg.ID {
			foundGroup = true
			if msg.Message.Message != groupMsgText {
				t.Errorf("Expected group message text %q, got %q", groupMsgText, msg.Message.Message)
			}
		}
	}
	if !foundGroup {
		t.Error("Sent group message not found in group history")
	}
}
