package controllers

import (
	"context"
	"strconv"

	"yourmsgr/realtime"
	"yourmsgr/services"
	"yourmsgr/utils"

	"github.com/gofiber/fiber/v2"
)

type ChatController struct {
	chatService *services.ChatService
}

func NewChatController() *ChatController {
	return &ChatController{
		chatService: services.NewChatService(),
	}
}

// CreatePrivateChatRequest represents the request payload to start a new direct chat
type CreatePrivateChatRequest struct {
	OtherUserID int `json:"otherUserId"`
}

func (ctrl *ChatController) CreatePrivateChat(c *fiber.Ctx) error {
	userId := c.Locals("userId").(int)

	var req CreatePrivateChatRequest
	if err := c.BodyParser(&req); err != nil {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid request body")
	}

	if req.OtherUserID <= 0 || req.OtherUserID == userId {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid user ID")
	}

	ctx := context.Background()
	chat, err := ctrl.chatService.GetOrCreatePrivateChat(ctx, userId, req.OtherUserID)
	if err != nil {
		if err.Error() == "User not found" {
			return utils.SendError(c, fiber.StatusNotFound, "User not found")
		}
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to create chat")
	}

	// Publish sync_private_chats event for both participants
	realtime.PublishRealtimeEvent(ctx, realtime.RealtimeEvent{
		Type:    "sync_private_chats",
		UserIDs: []int{userId, req.OtherUserID},
	})

	return utils.SendSuccess(c, "Chat created", fiber.Map{
		"chat": chat,
	})
}

func (ctrl *ChatController) GetPrivateChats(c *fiber.Ctx) error {
	userId := c.Locals("userId").(int)

	ctx := context.Background()
	chats, err := ctrl.chatService.GetUserPrivateChats(ctx, userId)
	if err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to fetch chats")
	}

	return utils.SendSuccess(c, "Chats retrieved", fiber.Map{
		"chats": chats,
	})
}

func (ctrl *ChatController) GetPrivateChatMessages(c *fiber.Ctx) error {
	userId := c.Locals("userId").(int)

	chatIdStr := c.Params("chatId")
	chatId, err := strconv.Atoi(chatIdStr)
	if err != nil || chatId <= 0 {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid chat ID")
	}

	// Parse pagination queries
	var lastMessageId *int
	lastMsgQuery := c.Query("lastMessageId")
	if lastMsgQuery != "" {
		val, err := strconv.Atoi(lastMsgQuery)
		if err == nil && val > 0 {
			lastMessageId = &val
		}
	}

	limit := 50
	limitQuery := c.Query("limit")
	if limitQuery != "" {
		val, err := strconv.Atoi(limitQuery)
		if err == nil && val > 0 && val <= 100 {
			limit = val
		}
	}

	ctx := context.Background()
	messages, err := ctrl.chatService.GetPrivateChatMessages(ctx, chatId, userId, lastMessageId, limit)
	if err != nil {
		if err.Error() == "Chat not found or access denied" {
			return utils.SendError(c, fiber.StatusForbidden, err.Error())
		}
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to fetch messages")
	}

	return utils.SendSuccess(c, "Messages retrieved", fiber.Map{
		"messages": messages,
	})
}

func (ctrl *ChatController) GetGroupMessages(c *fiber.Ctx) error {
	// Parse pagination queries
	var lastMessageId *int
	lastMsgQuery := c.Query("lastMessageId")
	if lastMsgQuery != "" {
		val, err := strconv.Atoi(lastMsgQuery)
		if err == nil && val > 0 {
			lastMessageId = &val
		}
	}

	limit := 50
	limitQuery := c.Query("limit")
	if limitQuery != "" {
		val, err := strconv.Atoi(limitQuery)
		if err == nil && val > 0 && val <= 100 {
			limit = val
		}
	}

	ctx := context.Background()
	messages, err := ctrl.chatService.GetGroupMessages(ctx, lastMessageId, limit)
	if err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to fetch group messages")
	}

	return utils.SendSuccess(c, "Group messages retrieved", fiber.Map{
		"messages": messages,
	})
}
