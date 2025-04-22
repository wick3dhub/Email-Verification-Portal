import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmailEntryForm from "@/components/admin/EmailEntryForm";
import VerificationStatusTable from "@/components/admin/VerificationStatusTable";
import SettingsForm from "@/components/admin/SettingsForm";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("email-entry");

  const handleLogout = () => {
    logout();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out.",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-primary">Link Verification Portal</h1>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-gray-700 mr-4">{user?.username}</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleLogout}
                className="text-gray-700"
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Tabs 
          defaultValue="email-entry" 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="mb-6">
            <TabsTrigger value="email-entry">Email Entry</TabsTrigger>
            <TabsTrigger value="verification-status">Verification Status</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="email-entry">
            <EmailEntryForm />
          </TabsContent>
          
          <TabsContent value="verification-status">
            <VerificationStatusTable />
          </TabsContent>
          
          <TabsContent value="settings">
            <SettingsForm />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
