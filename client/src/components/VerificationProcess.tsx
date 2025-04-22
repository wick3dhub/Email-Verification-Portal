import React, { useState } from "react";
import { Settings } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface VerificationProcessProps {
  state: 'loading' | 'success' | 'error' | 'bot-check';
  errorMessage?: string;
  settings: Settings | null;
  email?: string;
  onBotCheckComplete?: () => void;
  onRenewRequest?: () => Promise<boolean>;
}

export default function VerificationProcess({ 
  state, 
  errorMessage = "Verification link is invalid or has expired.", 
  settings,
  email,
  onBotCheckComplete,
  onRenewRequest
}: VerificationProcessProps) {
  const [answer, setAnswer] = useState<string>("");
  const [botCheckError, setBotCheckError] = useState<string>("");
  const [renewalState, setRenewalState] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  
  // Simple math question for bot protection
  const num1 = 5;
  const num2 = 3;
  const correctAnswer = String(num1 + num2);
  
  const handleBotCheckSubmit = () => {
    if (answer === correctAnswer) {
      setBotCheckError("");
      onBotCheckComplete && onBotCheckComplete();
    } else {
      setBotCheckError("Incorrect answer. Please try again.");
    }
  };

  // Render custom thank you page if enabled
  const renderSuccessContent = () => {
    if (settings?.useCustomThankYouPage && settings.customThankYouPage) {
      return (
        <div 
          className="text-center custom-thank-you-page" 
          dangerouslySetInnerHTML={{ 
            __html: settings.customThankYouPage.replace('{email}', email || '') 
          }} 
        />
      );
    }
    
    return (
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
          <CheckCircle className="h-6 w-6 text-green-600" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Email Verified!
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {settings?.successMessage || "Thank you for verifying your email address!"}
        </p>
        <p className="mt-3 text-center text-sm text-gray-600">
          You will be redirected automatically...
        </p>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="max-w-md w-full space-y-8">
        <CardContent className="pt-8 pb-8 text-center">
          {state === 'loading' && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                Verifying your email
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600">
                Please wait while we process your verification.
              </p>
            </div>
          )}
          
          {state === 'success' && renderSuccessContent()}
          
          {state === 'bot-check' && (
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                <ShieldAlert className="h-6 w-6 text-blue-600" />
              </div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                Security Check
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600">
                Please complete this quick verification to continue.
              </p>
              
              <div className="mt-6">
                <p className="mb-2 font-medium text-gray-700">What is {num1} + {num2}?</p>
                <div className="flex items-center justify-center space-x-2">
                  <Input
                    type="text"
                    placeholder="Your answer"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    className="max-w-[100px] text-center"
                  />
                  <Button onClick={handleBotCheckSubmit}>
                    Submit
                  </Button>
                </div>
                {botCheckError && (
                  <p className="mt-2 text-sm text-red-600">
                    {botCheckError}
                  </p>
                )}
              </div>
            </div>
          )}
          
          {state === 'error' && (
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                Verification Failed
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600">
                {errorMessage}
              </p>
              
              {/* Show renewal button only if settings allow it */}
              {settings?.allowLinkRenewal && onRenewRequest && renewalState === 'idle' && (
                <div className="mt-6">
                  <p className="mb-4 text-sm text-gray-700">
                    Would you like to request a new verification link?
                  </p>
                  <Button 
                    onClick={async () => {
                      setRenewalState('pending');
                      try {
                        const success = await onRenewRequest();
                        setRenewalState(success ? 'success' : 'error');
                      } catch (error) {
                        setRenewalState('error');
                      }
                    }}
                    className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                  >
                    Request New Link
                  </Button>
                </div>
              )}

              {/* Show pending state while renewal is processing */}
              {renewalState === 'pending' && (
                <div className="mt-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-3 text-center text-sm text-gray-600">
                    Processing your request...
                  </p>
                </div>
              )}

              {/* Show success message after renewal */}
              {renewalState === 'success' && (
                <div className="mt-6">
                  <div className="mx-auto flex items-center justify-center h-8 w-8 rounded-full bg-green-100">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <p className="mt-3 text-center text-sm text-green-600 font-medium">
                    Your request has been received. A new verification link will be sent to your email soon.
                  </p>
                </div>
              )}

              {/* Show error message if renewal fails */}
              {renewalState === 'error' && (
                <div className="mt-6">
                  <p className="text-center text-sm text-red-600">
                    Failed to process your request. Please try again later or contact support.
                  </p>
                </div>
              )}

              {/* Show contact support message if renewals are not allowed */}
              {(!settings?.allowLinkRenewal || !onRenewRequest) && renewalState === 'idle' && (
                <p className="mt-3 text-center text-sm text-gray-600">
                  Please contact support for assistance.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
