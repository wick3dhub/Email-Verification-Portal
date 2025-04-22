declare module 'async-retry' {
  interface RetryOptions {
    retries?: number;
    factor?: number;
    minTimeout?: number;
    maxTimeout?: number;
    randomize?: boolean;
    onRetry?: (error: any, attempt: number) => void;
  }

  function retry<T>(
    fn: (bail: (error: Error) => void, attempt: number) => Promise<T>,
    opts?: RetryOptions
  ): Promise<T>;

  export = retry;
}