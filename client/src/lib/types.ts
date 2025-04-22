export interface VerificationLink {
  id: number;
  email: string;
  code: string;
  status: 'pending' | 'verified' | 'expired';
  createdAt: string | Date;
  expiresAt: string | Date;
  verifiedAt: string | Date | null;
  url?: string;
}

export interface Settings {
  id: number;
  redirectUrl: string;
  showLoadingSpinner: boolean;
  loadingDuration: number;
  successMessage: string;
  useEmailAutograb: boolean;
  emailAutograbParam: string;
  enableBotProtection: boolean;
  customThankYouPage: string;
  useCustomThankYouPage: boolean;
  securityLevel: number;
  useWildcards: boolean;
  encryptionSalt: string;
  // Email template settings
  emailSubject: string;
  emailTemplate: string;
  senderEmail: string;
  senderName: string;
  smtpServer: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
}

export interface AuthUser {
  id: number;
  username: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface EmailBatchData {
  emails: string;
  expireDays: number;
}

export interface GenerateLinksResponse {
  count: number;
  links: {
    email: string;
    code: string;
    url: string;
  }[];
}
