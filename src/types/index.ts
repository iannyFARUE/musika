export type SuccessResponse<T> = {
  success: true;
  message?: string;
  data: T;
  timestamp: string;
};

export type ErrorResponse = {
  success: false;
  message: string;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
  timestamp: string;
};

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;
