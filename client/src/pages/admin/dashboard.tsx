import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import EmailEntryForm from "@/components/admin/EmailEntryForm";
import VerificationStatusTable from "@/components/admin/VerificationStatusTable";
import SettingsForm from "@/components/admin/SettingsForm";
import { Button } from "@/components/ui/button";
import { Shield, Lock } from "lucide-react";

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation Header */}
      <nav className="bg-white dark:bg-gray-900 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Shield className="h-8 w-8 text-purple-600 mr-2" />
                <h1 className="text-xl font-bold">
                  <span className="bg-gradient-to-r from-purple-600 to-red-600 bg-clip-text text-transparent">Wick3d</span>
                  <span className="text-gray-800 dark:text-gray-200"> Link Portal</span>
                </h1>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <ThemeToggle />
              <div className="flex items-center bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                <Lock className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{user?.username}</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleLogout}
                className="text-gray-700 dark:text-gray-300"
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
