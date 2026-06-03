package services

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"yourmsgr/db"
	"yourmsgr/models"

	"github.com/jackc/pgx/v5"
)

type ChatService struct{}

func NewChatService() *ChatService {
	return &ChatService{}
}

// resolveSenderPublicKey retrieves public key of the message sender
func (s *ChatService) resolveSenderPublicKey(ctx context.Context, userId int) (*string, error) {
	var pubKey sql.NullString
	err := db.Pool.QueryRow(ctx, "SELECT public_key FROM users WHERE id = $1", userId).Scan(&pubKey)
	if err != nil {
		return nil, err
	}
	if pubKey.Valid {
		return &pubKey.String, nil
	}
	return nil, nil
}

// GetOrCreatePrivateChat registers a new chat between two users if it does not exist
func (s *ChatService) GetOrCreatePrivateChat(ctx context.Context, user1Id, user2Id int) (*models.PrivateChat, error) {
	// Check if other user exists
	var otherExists bool
	err := db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", user2Id).Scan(&otherExists)
	if err != nil {
		return nil, err
	}
	if !otherExists {
		return nil, errors.New("User not found")
	}

	smallerId, largerId := user1Id, user2Id
	if user1Id > user2Id {
		smallerId, largerId = user2Id, user1Id
	}

	// Check if chat exists
	chat := &models.PrivateChat{}
	query := "SELECT id, user1_id, user2_id, created_at FROM private_chats WHERE user1_id = $1 AND user2_id = $2"
	err = db.Pool.QueryRow(ctx, query, smallerId, largerId).Scan(&chat.ID, &chat.User1ID, &chat.User2ID, &chat.CreatedAt)

	if err == nil {
		return chat, nil
	} else if err != pgx.ErrNoRows {
		return nil, err
	}

	// Insert new private chat
	insertQuery := "INSERT INTO private_chats (user1_id, user2_id) VALUES ($1, $2) RETURNING id, user1_id, user2_id, created_at"
	err = db.Pool.QueryRow(ctx, insertQuery, smallerId, largerId).Scan(&chat.ID, &chat.User1ID, &chat.User2ID, &chat.CreatedAt)
	if err != nil {
		return nil, err
	}

	return chat, nil
}

type UserChatListItem struct {
	ChatID                     int        `json:"chatId"`
	OtherUser                  *OtherUser `json:"otherUser"`
	LastMessage                *string    `json:"lastMessage"`
	LastMessageDate            time.Time  `json:"lastMessageDate"`
	LastMessageNonce           *string    `json:"lastMessageNonce"`
	LastMessageIsEncrypted     int        `json:"lastMessageIsEncrypted"`
	LastMessageSenderPublicKey *string    `json:"lastMessageSenderPublicKey"`
	CreatedAt                  time.Time  `json:"createdAt"`
}

type OtherUser struct {
	ID        int     `json:"id"`
	Username  string  `json:"username"`
	Login     string  `json:"login"`
	PublicKey *string `json:"publicKey"`
}

// GetUserPrivateChats fetches the private chats list including metadata of the other participant and the last message
func (s *ChatService) GetUserPrivateChats(ctx context.Context, userId int) ([]UserChatListItem, error) {
	// Fetch all private chats for user
	rows, err := db.Pool.Query(ctx, "SELECT id, user1_id, user2_id, created_at FROM private_chats WHERE user1_id = $1 OR user2_id = $1", userId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var chats []models.PrivateChat
	var otherUserIds []int
	var chatIds []int

	for rows.Next() {
		var chat models.PrivateChat
		if err := rows.Scan(&chat.ID, &chat.User1ID, &chat.User2ID, &chat.CreatedAt); err != nil {
			return nil, err
		}
		chats = append(chats, chat)
		chatIds = append(chatIds, chat.ID)

		otherID := chat.User1ID
		if chat.User1ID == userId {
			otherID = chat.User2ID
		}
		otherUserIds = append(otherUserIds, otherID)
	}

	if len(chats) == 0 {
		return []UserChatListItem{}, nil
	}

	// Fetch other users info
	uRows, err := db.Pool.Query(ctx, "SELECT id, username, login, public_key FROM users WHERE id = ANY($1)", otherUserIds)
	if err != nil {
		return nil, err
	}
	defer uRows.Close()

	otherUsersById := make(map[int]*OtherUser)
	for uRows.Next() {
		var ou OtherUser
		var pubKey sql.NullString
		if err := uRows.Scan(&ou.ID, &ou.Username, &ou.Login, &pubKey); err != nil {
			return nil, err
		}
		if pubKey.Valid {
			ou.PublicKey = &pubKey.String
		}
		otherUsersById[ou.ID] = &ou
	}

	// Wave 2 optimization: DISTINCT ON query to get the last message for each chat
	lmQuery := `
		SELECT DISTINCT ON (chat_id) 
		       id, chat_id, message, date, nonce, is_encrypted, sender_public_key
		FROM messages
		WHERE chat_id = ANY($1) AND chat_type = 'private'
		ORDER BY chat_id ASC, date DESC, id DESC
	`
	lmRows, err := db.Pool.Query(ctx, lmQuery, chatIds)
	if err != nil {
		return nil, err
	}
	defer lmRows.Close()

	type LastMsgInfo struct {
		ID              int
		Message         string
		Date            time.Time
		Nonce           *string
		IsEncrypted     int
		SenderPublicKey *string
	}
	lastMessagesByChatId := make(map[int]LastMsgInfo)

	for lmRows.Next() {
		var id, chatId, isEncrypted int
		var message string
		var date time.Time
		var nonce, senderPublicKey sql.NullString
		err := lmRows.Scan(&id, &chatId, &message, &date, &nonce, &isEncrypted, &senderPublicKey)
		if err != nil {
			return nil, err
		}

		info := LastMsgInfo{
			ID:          id,
			Message:     message,
			Date:        date,
			IsEncrypted: isEncrypted,
		}
		if nonce.Valid {
			info.Nonce = &nonce.String
		}
		if senderPublicKey.Valid {
			info.SenderPublicKey = &senderPublicKey.String
		}
		lastMessagesByChatId[chatId] = info
	}

	result := make([]UserChatListItem, len(chats))
	for i, chat := range chats {
		otherID := chat.User1ID
		if chat.User1ID == userId {
			otherID = chat.User2ID
		}

		lastMsg, hasMsg := lastMessagesByChatId[chat.ID]
		item := UserChatListItem{
			ChatID:    chat.ID,
			OtherUser: otherUsersById[otherID],
			CreatedAt: chat.CreatedAt,
		}

		if hasMsg {
			item.LastMessage = &lastMsg.Message
			item.LastMessageDate = lastMsg.Date
			item.LastMessageNonce = lastMsg.Nonce
			item.LastMessageIsEncrypted = lastMsg.IsEncrypted
			item.LastMessageSenderPublicKey = lastMsg.SenderPublicKey
		} else {
			item.LastMessageDate = chat.CreatedAt
		}
		result[i] = item
	}

	return result, nil
}

// validateReplyTarget ensures reply target message is valid for the current chat context
func (s *ChatService) validateReplyTarget(ctx context.Context, replyToId *int, chatType string, chatId *int) error {
	if replyToId == nil || *replyToId <= 0 {
		return nil
	}

	var targetChatType string
	var targetChatId sql.NullInt64
	err := db.Pool.QueryRow(ctx, "SELECT chat_type, chat_id FROM messages WHERE id = $1", *replyToId).Scan(&targetChatType, &targetChatId)
	if err == pgx.ErrNoRows {
		return errors.New("Reply target not found")
	} else if err != nil {
		return err
	}

	if chatType == "private" {
		if targetChatType != "private" || !targetChatId.Valid || int(targetChatId.Int64) != *chatId {
			return errors.New("Reply target is outside the current chat")
		}
	} else {
		// Group chat replies should be group-typed and null chatId
		if targetChatType == "private" || targetChatId.Valid {
			return errors.New("Reply target is outside the current chat")
		}
	}

	return nil
}

// attachReplyTargets binds reply message previews to a list of messages
func (s *ChatService) attachReplyTargets(ctx context.Context, messageList []models.Message) ([]models.MessageWithReply, error) {
	var replyIds []int
	seen := make(map[int]bool)

	for _, msg := range messageList {
		if msg.ReplyToMessageID != nil && *msg.ReplyToMessageID > 0 {
			rid := *msg.ReplyToMessageID
			if !seen[rid] {
				replyIds = append(replyIds, rid)
				seen[rid] = true
			}
		}
	}

	replyMap := make(map[int]*models.ReplyPreview)
	if len(replyIds) > 0 {
		query := `
			SELECT id, user_id, username, message, is_encrypted, nonce, sender_public_key, recipient_id 
			FROM messages 
			WHERE id = ANY($1)
		`
		rows, err := db.Pool.Query(ctx, query, replyIds)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		for rows.Next() {
			var preview models.ReplyPreview
			var nonce, pubKey sql.NullString
			var recipientId sql.NullInt64

			err := rows.Scan(
				&preview.ID, &preview.UserID, &preview.Username, &preview.Message,
				&preview.IsEncrypted, &nonce, &pubKey, &recipientId,
			)
			if err != nil {
				return nil, err
			}

			if nonce.Valid {
				preview.Nonce = &nonce.String
			}
			if pubKey.Valid {
				preview.SenderPublicKey = &pubKey.String
			}
			if recipientId.Valid {
				rId := int(recipientId.Int64)
				preview.RecipientID = &rId
			}

			replyMap[preview.ID] = &preview
		}
	}

	result := make([]models.MessageWithReply, len(messageList))
	for i, msg := range messageList {
		var preview *models.ReplyPreview
		if msg.ReplyToMessageID != nil {
			preview = replyMap[*msg.ReplyToMessageID]
		}
		result[i] = models.MessageWithReply{
			Message: msg,
			ReplyTo: preview,
		}
	}

	return result, nil
}

// GetPrivateChatMessages retrieves messages history for private chat
func (s *ChatService) GetPrivateChatMessages(ctx context.Context, chatId, userId int, lastMessageId *int, limit int) ([]models.MessageWithReply, error) {
	// Verify chat membership
	var chatExists bool
	verifyQuery := "SELECT EXISTS(SELECT 1 FROM private_chats WHERE id = $1 AND (user1_id = $2 OR user2_id = $2))"
	err := db.Pool.QueryRow(ctx, verifyQuery, chatId, userId).Scan(&chatExists)
	if err != nil {
		return nil, err
	}
	if !chatExists {
		return nil, errors.New("Chat not found or access denied")
	}

	var rows pgx.Rows
	if lastMessageId != nil && *lastMessageId > 0 {
		query := `
			SELECT id, user_id, username, message, chat_id, chat_type, nonce, sender_public_key, reply_to_message_id, recipient_id, is_encrypted, date 
			FROM messages 
			WHERE chat_id = $1 AND chat_type = 'private' AND id < $2
			ORDER BY id DESC LIMIT $3
		`
		rows, err = db.Pool.Query(ctx, query, chatId, *lastMessageId, limit)
	} else {
		query := `
			SELECT id, user_id, username, message, chat_id, chat_type, nonce, sender_public_key, reply_to_message_id, recipient_id, is_encrypted, date 
			FROM messages 
			WHERE chat_id = $1 AND chat_type = 'private'
			ORDER BY id DESC LIMIT $2
		`
		rows, err = db.Pool.Query(ctx, query, chatId, limit)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messageList []models.Message
	for rows.Next() {
		var msg models.Message
		var nonce, pubKey sql.NullString
		var replyId, recipientId, cId sql.NullInt64

		err := rows.Scan(
			&msg.ID, &msg.UserID, &msg.Username, &msg.Message, &cId, &msg.ChatType,
			&nonce, &pubKey, &replyId, &recipientId, &msg.IsEncrypted, &msg.Date,
		)
		if err != nil {
			return nil, err
		}

		if nonce.Valid {
			msg.Nonce = &nonce.String
		}
		if pubKey.Valid {
			msg.SenderPublicKey = &pubKey.String
		}
		if replyId.Valid {
			rId := int(replyId.Int64)
			msg.ReplyToMessageID = &rId
		}
		if recipientId.Valid {
			rcpId := int(recipientId.Int64)
			msg.RecipientID = &rcpId
		}
		if cId.Valid {
			chatIdVal := int(cId.Int64)
			msg.ChatID = &chatIdVal
		}

		messageList = append(messageList, msg)
	}

	return s.attachReplyTargets(ctx, messageList)
}

// GetGroupMessages retrieves history for the global general chat
func (s *ChatService) GetGroupMessages(ctx context.Context, lastMessageId *int, limit int) ([]models.MessageWithReply, error) {
	var rows pgx.Rows
	var err error

	if lastMessageId != nil && *lastMessageId > 0 {
		query := `
			SELECT id, user_id, username, message, chat_id, chat_type, nonce, sender_public_key, reply_to_message_id, recipient_id, is_encrypted, date 
			FROM messages 
			WHERE (chat_type = 'group' OR chat_type IS NULL) AND id < $1
			ORDER BY id DESC LIMIT $2
		`
		rows, err = db.Pool.Query(ctx, query, *lastMessageId, limit)
	} else {
		query := `
			SELECT id, user_id, username, message, chat_id, chat_type, nonce, sender_public_key, reply_to_message_id, recipient_id, is_encrypted, date 
			FROM messages 
			WHERE (chat_type = 'group' OR chat_type IS NULL)
			ORDER BY id DESC LIMIT $1
		`
		rows, err = db.Pool.Query(ctx, query, limit)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messageList []models.Message
	for rows.Next() {
		var msg models.Message
		var nonce, pubKey sql.NullString
		var replyId, recipientId, cId sql.NullInt64

		err := rows.Scan(
			&msg.ID, &msg.UserID, &msg.Username, &msg.Message, &cId, &msg.ChatType,
			&nonce, &pubKey, &replyId, &recipientId, &msg.IsEncrypted, &msg.Date,
		)
		if err != nil {
			return nil, err
		}

		if nonce.Valid {
			msg.Nonce = &nonce.String
		}
		if pubKey.Valid {
			msg.SenderPublicKey = &pubKey.String
		}
		if replyId.Valid {
			rId := int(replyId.Int64)
			msg.ReplyToMessageID = &rId
		}
		if recipientId.Valid {
			rcpId := int(recipientId.Int64)
			msg.RecipientID = &rcpId
		}
		if cId.Valid {
			chatIdVal := int(cId.Int64)
			msg.ChatID = &chatIdVal
		}

		messageList = append(messageList, msg)
	}

	return s.attachReplyTargets(ctx, messageList)
}

// SendPrivateMessage persists a new message inside a private chat
func (s *ChatService) SendPrivateMessage(
	ctx context.Context, chatId, userId int, username, message string, recipientId int,
	nonce *string, isEncrypted int, replyToId *int,
) (*models.MessageWithReply, error) {
	// Verify chat membership
	var chat models.PrivateChat
	query := "SELECT id, user1_id, user2_id FROM private_chats WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)"
	err := db.Pool.QueryRow(ctx, query, chatId, userId).Scan(&chat.ID, &chat.User1ID, &chat.User2ID)
	if err == pgx.ErrNoRows {
		return nil, errors.New("Chat not found or access denied")
	} else if err != nil {
		return nil, err
	}

	// Validate recipient
	expectedRecipient := chat.User1ID
	if chat.User1ID == userId {
		expectedRecipient = chat.User2ID
	}
	if recipientId != expectedRecipient {
		return nil, errors.New("Invalid recipient for chat")
	}

	// Validate reply target
	if err := s.validateReplyTarget(ctx, replyToId, "private", &chatId); err != nil {
		return nil, err
	}

	// Resolve sender public key
	pubKey, err := s.resolveSenderPublicKey(ctx, userId)
	if err != nil {
		return nil, err
	}

	// Insert message
	insertQuery := `
		INSERT INTO messages (
			user_id, username, message, chat_id, chat_type, recipient_id, 
			nonce, sender_public_key, is_encrypted, reply_to_message_id
		) VALUES ($1, $2, $3, $4, 'private', $5, $6, $7, $8, $9)
		RETURNING id, user_id, username, message, chat_id, chat_type, nonce, sender_public_key, reply_to_message_id, recipient_id, is_encrypted, date
	`
	var inserted models.Message
	var retNonce, retPubKey sql.NullString
	var retReplyId, retRecipientId, retChatId sql.NullInt64

	err = db.Pool.QueryRow(ctx, insertQuery,
		userId, username, message, chatId, recipientId,
		sql.NullString{String: *nonce, Valid: nonce != nil},
		sql.NullString{String: *pubKey, Valid: pubKey != nil},
		isEncrypted,
		sql.NullInt64{Int64: int64(*replyToId), Valid: replyToId != nil},
	).Scan(
		&inserted.ID, &inserted.UserID, &inserted.Username, &inserted.Message, &retChatId, &inserted.ChatType,
		&retNonce, &retPubKey, &retReplyId, &retRecipientId, &inserted.IsEncrypted, &inserted.Date,
	)

	if err != nil {
		return nil, err
	}

	if retNonce.Valid {
		inserted.Nonce = &retNonce.String
	}
	if retPubKey.Valid {
		inserted.SenderPublicKey = &retPubKey.String
	}
	if retReplyId.Valid {
		rId := int(retReplyId.Int64)
		inserted.ReplyToMessageID = &rId
	}
	if retRecipientId.Valid {
		rcpId := int(retRecipientId.Int64)
		inserted.RecipientID = &rcpId
	}
	if retChatId.Valid {
		chatIdVal := int(retChatId.Int64)
		inserted.ChatID = &chatIdVal
	}

	msgList, err := s.attachReplyTargets(ctx, []models.Message{inserted})
	if err != nil || len(msgList) == 0 {
		return nil, err
	}

	return &msgList[0], nil
}

// SendGroupMessage persists a new message inside the global group chat
func (s *ChatService) SendGroupMessage(
	ctx context.Context, userId int, username, message string,
	nonce *string, isEncrypted int, replyToId *int,
) (*models.MessageWithReply, error) {
	// Validate reply target
	if err := s.validateReplyTarget(ctx, replyToId, "group", nil); err != nil {
		return nil, err
	}

	// Resolve sender public key
	pubKey, err := s.resolveSenderPublicKey(ctx, userId)
	if err != nil {
		return nil, err
	}

	// Insert message
	insertQuery := `
		INSERT INTO messages (
			user_id, username, message, chat_id, chat_type, recipient_id, 
			nonce, sender_public_key, is_encrypted, reply_to_message_id
		) VALUES ($1, $2, $3, NULL, 'group', NULL, $4, $5, $6, $7)
		RETURNING id, user_id, username, message, chat_id, chat_type, nonce, sender_public_key, reply_to_message_id, recipient_id, is_encrypted, date
	`
	var inserted models.Message
	var retNonce, retPubKey sql.NullString
	var retReplyId, retRecipientId, retChatId sql.NullInt64

	err = db.Pool.QueryRow(ctx, insertQuery,
		userId, username, message,
		sql.NullString{String: *nonce, Valid: nonce != nil},
		sql.NullString{String: *pubKey, Valid: pubKey != nil},
		isEncrypted,
		sql.NullInt64{Int64: int64(*replyToId), Valid: replyToId != nil},
	).Scan(
		&inserted.ID, &inserted.UserID, &inserted.Username, &inserted.Message, &retChatId, &inserted.ChatType,
		&retNonce, &retPubKey, &retReplyId, &retRecipientId, &inserted.IsEncrypted, &inserted.Date,
	)

	if err != nil {
		return nil, err
	}

	if retNonce.Valid {
		inserted.Nonce = &retNonce.String
	}
	if retPubKey.Valid {
		inserted.SenderPublicKey = &retPubKey.String
	}
	if retReplyId.Valid {
		rId := int(retReplyId.Int64)
		inserted.ReplyToMessageID = &rId
	}
	if retRecipientId.Valid {
		rcpId := int(retRecipientId.Int64)
		inserted.RecipientID = &rcpId
	}
	if retChatId.Valid {
		chatIdVal := int(retChatId.Int64)
		inserted.ChatID = &chatIdVal
	}

	msgList, err := s.attachReplyTargets(ctx, []models.Message{inserted})
	if err != nil || len(msgList) == 0 {
		return nil, err
	}

	return &msgList[0], nil
}
