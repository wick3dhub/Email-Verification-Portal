import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

// Simple component to manually test verification features
export default function TestVerification() {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  
  const handleTestVerification = async () => {
    if (!code) {
      setStatus("Please enter a verification code");
      return;
    }
    
    setIsLoading(true);
    setStatus("Testing verification...");
    
    try {
      // Making a direct API call to test verification
      const response = await apiRequest("GET", `/api/verification/verify/${code}`);
      const data = await response.json();
      
      if (data.botProtectionRequired) {
        setStatus("Bot protection triggered! Would show challenge to user.");
        setEmail(data.email || "");
      } else if (data.success) {
        setStatus(`Verification successful for ${data.email}`);
        setEmail(data.email || "");
      } else {
        setStatus("Verification failed: " + (data.message || "Unknown error"));
      }
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleBotCheck = async () => {
    if (!code) {
      setStatus("Please enter a verification code");
      return;
    }
    
    setIsLoading(true);
    setStatus("Simulating bot check passed...");
    
    try {
      const response = await apiRequest("GET", `/api/verification/verify/${code}?botcheck=passed`);
      const data = await response.json();
      
      if (data.success) {
        setStatus(`Verification successful for ${data.email}`);
        setEmail(data.email || "");
      } else {
        setStatus("Verification failed: " + (data.message || "Unknown error"));
      }
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 pb-6">
          <h1 className="text-2xl font-bold mb-4 text-center">Test Verification Features</h1>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Verification Code
              </label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter verification code"
              />
            </div>
            
            <div className="flex space-x-2">
              <Button 
                onClick={handleTestVerification}
                disabled={isLoading}
                className="flex-1"
              >
                Test Regular Verification
              </Button>
              
              <Button 
                onClick={handleBotCheck}
                disabled={isLoading}
                variant="outline"
                className="flex-1"
              >
                Test Bot Check Pass
              </Button>
            </div>
            
            {status && (
              <div className={`p-3 rounded ${status.includes("successful") ? "bg-green-100" : status.includes("Error") ? "bg-red-100" : "bg-blue-100"}`}>
                <p className="text-sm">{status}</p>
                {email && <p className="text-sm font-medium mt-1">Email: {email}</p>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}