import { Logger } from '@nestjs/common';

export interface TelegramApiError {
  error_code?: number;
  description?: string;
  message?: string;
}

interface ErrorDetails {
  code?: number;
  description?: string;
}

export class TelegramErrorHandler {
  private static readonly logger = new Logger('TelegramErrorHandler');

  /**
   * Handles Telegram API errors gracefully, logging appropriate messages and continuing execution
   * @param error The error thrown by Telegram API
   * @param context Additional context for logging (e.g., chatId, operation type)
   * @param chatId The chat ID where the operation failed (for specific logging)
   * @returns true if error was handled gracefully, false if it should be re-thrown
   */
  static handleTelegramError(error: unknown, context: string, chatId?: number | string | null): boolean {
    const errorDetails = this.extractErrorDetails(error);

    if (this.isBotBlockedError(errorDetails)) {
      this.logger.warn(`Bot blocked by user - ChatID: ${chatId}, Context: ${context}. Continuing execution.`);

      return true;
    }

    if (this.isChatNotFoundError(errorDetails)) {
      this.logger.warn(
        `Chat not found (user may have deleted account) - ChatID: ${chatId}, Context: ${context}. Continuing execution.`,
      );

      return true;
    }

    if (this.isUserDeactivatedError(errorDetails)) {
      this.logger.warn(`User deactivated - ChatID: ${chatId}, Context: ${context}. Continuing execution.`);

      return true;
    }

    if (this.isBotKickedError(errorDetails)) {
      this.logger.warn(`Bot was kicked from group - ChatID: ${chatId}, Context: ${context}. Continuing execution.`);

      return true;
    }

    if (this.isRateLimitError(errorDetails)) {
      this.logger.warn(
        `Rate limited by Telegram API - ChatID: ${chatId}, Context: ${context}. Error: ${errorDetails.description}`,
      );

      return true;
    }

    if (this.isClientError(errorDetails)) {
      this.logger.warn(
        `Telegram API client error - ChatID: ${chatId}, Context: ${context}, Code: ${errorDetails.code}, Error: ${errorDetails.description}`,
      );

      return true;
    }

    if (this.isServerError(errorDetails)) {
      this.logger.error(
        `Telegram API server error - ChatID: ${chatId}, Context: ${context}, Code: ${errorDetails.code}, Error: ${errorDetails.description}`,
      );

      return true;
    }

    // For unknown errors, log as error and continue
    this.logger.error(
      `Unknown Telegram API error - ChatID: ${chatId}, Context: ${context}, Error: ${
        errorDetails.description || 'Unknown error'
      }`,
    );

    return true;
  }

  private static extractErrorDetails(error: unknown): ErrorDetails {
    const telegramError = error as TelegramApiError;

    return {
      code: telegramError.error_code || (error as { code?: number }).code,
      description: telegramError.description || telegramError.message || (error as Error).message,
    };
  }

  private static isBotBlockedError(errorDetails: ErrorDetails): boolean {
    return errorDetails.code === 403 && errorDetails.description?.includes('bot was blocked by the user') === true;
  }

  private static isChatNotFoundError(errorDetails: ErrorDetails): boolean {
    return errorDetails.code === 400 && errorDetails.description?.includes('chat not found') === true;
  }

  private static isUserDeactivatedError(errorDetails: ErrorDetails): boolean {
    return errorDetails.code === 403 && errorDetails.description?.includes('user is deactivated') === true;
  }

  private static isBotKickedError(errorDetails: ErrorDetails): boolean {
    return errorDetails.code === 403 && errorDetails.description?.includes('bot was kicked') === true;
  }

  private static isRateLimitError(errorDetails: ErrorDetails): boolean {
    return errorDetails.code === 429;
  }

  private static isClientError(errorDetails: ErrorDetails): boolean {
    return Boolean(errorDetails.code && errorDetails.code >= 400 && errorDetails.code < 500);
  }

  private static isServerError(errorDetails: ErrorDetails): boolean {
    return Boolean(errorDetails.code && errorDetails.code >= 500 && errorDetails.code < 600);
  }

  /**
   * Wrapper for safe Telegram API calls that handles errors gracefully
   * @param operation The async operation to execute
   * @param context Description of the operation for logging
   * @param chatId The chat ID for logging context
   * @returns Promise that resolves to the operation result or undefined if error occurred
   */
  static async safeTelegramCall<T>(
    operation: () => Promise<T>,
    context: string,
    chatId?: number | string | null,
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      const isHandled = this.handleTelegramError(error, context, chatId);

      if (!isHandled) {
        throw error;
      }

      return undefined;
    }
  }
}
