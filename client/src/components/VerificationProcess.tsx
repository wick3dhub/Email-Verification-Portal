import React from "react";
import { Settings } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckCircle } from "lucide-react";

interface VerificationProcessProps {
  state: 'loading' | 'success' | 'error';
  errorMessage?: string;
  settings: Settings | null;
}

export default function VerificationProcess({ 
  state, 
  errorMessage = "Verification link is invalid or has expired.", 
  settings 
}: VerificationProcessProps) {
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
          
          {state === 'success' && (
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
              <p className="mt-3 text-center text-sm text-gray-600">
                Please contact support for assistance.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
