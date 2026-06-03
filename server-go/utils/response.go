package utils

import "github.com/gofiber/fiber/v2"

// ApiResponse matches the Hono api response structure
type ApiResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// SendResponse formats and sends a standardized JSON API response
func SendResponse(c *fiber.Ctx, status int, success bool, message string, data interface{}) error {
	return c.Status(status).JSON(ApiResponse{
		Success: success,
		Message: message,
		Data:    data,
	})
}

// SendSuccess sends a successful (HTTP 200) JSON response
func SendSuccess(c *fiber.Ctx, message string, data interface{}) error {
	return SendResponse(c, fiber.StatusOK, true, message, data)
}

// SendError sends an error JSON response with custom HTTP status code
func SendError(c *fiber.Ctx, status int, message string) error {
	return SendResponse(c, status, false, message, nil)
}
