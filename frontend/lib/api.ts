import axios, { AxiosError } from 'axios';
import type {
  AddressCheckResponse,
  TransactionCheckResponse,
  ApiResponse,
} from './types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public isAuthError = false,
    public isRateLimitError = false
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function normalizeError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ message?: string; error?: string | { message?: string; statusCode?: number }; success?: boolean }>;
    const statusCode = axiosError.response?.status;
    const responseData = axiosError.response?.data;
    
    let message = 'Network error';
    
    // Extract error message from response
    if (responseData) {
      // Handle new API error format: { success: false, error: { message, statusCode } }
      if (typeof responseData === 'object' && 'success' in responseData && responseData.success === false) {
        const errorData = (responseData as any).error;
        if (errorData && typeof errorData === 'object' && errorData.message) {
          message = errorData.message;
          const errorStatusCode = errorData.statusCode || statusCode;
          return new ApiError(
            message,
            errorStatusCode,
            errorStatusCode === 401,
            errorStatusCode === 429
          );
        }
      }
      
      if (typeof responseData === 'string') {
        message = responseData;
      } else if (responseData.message) {
        message = responseData.message;
      } else if (responseData.error) {
        if (typeof responseData.error === 'string') {
          message = responseData.error;
        } else if (typeof responseData.error === 'object' && responseData.error.message) {
          message = responseData.error.message;
        }
      }
    }

    // Handle specific status codes
    if (statusCode === 401) {
      return new ApiError(
        'Authentication failed. Please check your API key.',
        401,
        true,
        false
      );
    }
    
    if (statusCode === 429) {
      return new ApiError(
        'Rate limit exceeded. Please try again later.',
        429,
        false,
        true
      );
    }
    
    if (statusCode === 500) {
      return new ApiError(
        'Server error. Please try again later.',
        500,
        false,
        false
      );
    }
    
    if (statusCode && statusCode >= 400) {
      return new ApiError(
        message || `Request failed with status ${statusCode}`,
        statusCode,
        statusCode === 401,
        statusCode === 429
      );
    }

    // Network errors
    if (!axiosError.response) {
      return new ApiError(
        'Unable to connect to the server. Please check your connection.',
        undefined,
        false,
        false
      );
    }

    return new ApiError(
      message || axiosError.message || 'An unexpected error occurred',
      statusCode,
      false,
      false
    );
  }

  if (error instanceof Error) {
    return new ApiError(error.message);
  }

  return new ApiError('An unexpected error occurred');
}

export const api = {
  /**
   * Check TRON address for AML risk
   */
  async checkAddress(
    address: string,
    apiKey?: string
  ): Promise<AddressCheckResponse> {
    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }

      const response = await apiClient.post<ApiResponse<AddressCheckResponse>>(
        '/api/v1/check/address',
        { address },
        { headers }
      );

      // Check if response indicates an error
      if (!response.data.success || !response.data.data) {
        const errorData = response.data.error || { message: 'Unknown error', statusCode: response.status || 500 };
        throw new ApiError(
          errorData.message,
          errorData.statusCode,
          errorData.statusCode === 401,
          errorData.statusCode === 429
        );
      }

      return response.data.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw normalizeError(error);
    }
  },

  /**
   * Check TRON transaction for AML risk
   */
  async checkTransaction(
    txHash: string,
    apiKey?: string
  ): Promise<TransactionCheckResponse> {
    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }

      const response = await apiClient.post<ApiResponse<TransactionCheckResponse>>(
        '/api/v1/check/transaction',
        { txHash },
        { headers }
      );

      // Check if response indicates an error
      if (!response.data.success || !response.data.data) {
        const errorData = response.data.error || { message: 'Unknown error', statusCode: response.status || 500 };
        throw new ApiError(
          errorData.message,
          errorData.statusCode,
          errorData.statusCode === 401,
          errorData.statusCode === 429
        );
      }

      return response.data.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw normalizeError(error);
    }
  },
};

