import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Lock, Loader2, Save } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Form schema for credential updates
const credentialsFormSchema = z.object({
  currentUsername: z.string()
    .min(1, "Current username is required"),
  currentPassword: z.string()
    .min(1, "Current password is required"),
  newUsername: z.string()
    .min(3, "New username must be at least 3 characters")
    .email("New username must be a valid email address"),
  newPassword: z.string()
    .min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string()
    .min(1, "Please confirm your new password")
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});

type CredentialsFormValues = z.infer<typeof credentialsFormSchema>;

export default function CredentialsForm() {
  const { toast } = useToast();
  const { user, login } = useAuth();
  const [showSuccess, setShowSuccess] = useState(false);

  // Define form
  const form = useForm<CredentialsFormValues>({
    resolver: zodResolver(credentialsFormSchema),
    defaultValues: {
      currentUsername: "",
      currentPassword: "",
      newUsername: "",
      newPassword: "",
      confirmPassword: ""
    }
  });

  // Update credentials mutation
  const updateMutation = useMutation({
    mutationFn: async (data: Omit<CredentialsFormValues, 'confirmPassword'>) => {
      const res = await apiRequest("POST", "/api/auth/update-credentials", {
        currentUsername: data.currentUsername,
        currentPassword: data.currentPassword,
        newUsername: data.newUsername,
        newPassword: data.newPassword
      });
      return res.json();
    },
    onSuccess: (data) => {
      // Show success message
      setShowSuccess(true);
      
      // Reset form
      form.reset();
      
      toast({
        title: "Credentials updated",
        description: "Your admin credentials have been updated successfully.",
      });
      
      // Attempt to re-login with new credentials after a delay
      setTimeout(() => {
        login({
          username: form.getValues().newUsername,
          password: form.getValues().newPassword
        });
      }, 2000);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update credentials",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CredentialsFormValues) => {
    // Remove confirmPassword from the data before sending to the server
    const { confirmPassword, ...submitData } = data;
    updateMutation.mutate(submitData);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="border-b border-gray-200">
        <div className="flex items-center">
          <Lock className="h-5 w-5 mr-2 text-primary" />
          <CardTitle>Admin Credentials</CardTitle>
        </div>
        <CardDescription>
          Update your administrator username and password
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pt-6">
        {showSuccess && (
          <Alert className="mb-6 bg-gradient-to-r from-green-50 to-teal-50 border-green-200">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <AlertTitle className="text-green-800">Success!</AlertTitle>
            <AlertDescription className="text-green-700">
              Your credentials have been updated successfully.
            </AlertDescription>
          </Alert>
        )}
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="currentUsername"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Username</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="current@email.com" 
                        type="email"
                        autoComplete="username"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Your current admin username
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="••••••••"
                        type="password"
                        autoComplete="current-password"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Your current admin password
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="newUsername"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Username</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="new@email.com" 
                        type="email"
                        autoComplete="new-username"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Enter your new admin username (email address)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="New password"
                        type="password"
                        autoComplete="new-password"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Choose a secure password (min. 8 characters)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Confirm password"
                        type="password"
                        autoComplete="new-password"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Re-enter your new password to confirm
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="bg-gradient-to-r from-primary to-primary-foreground hover:from-primary/90 hover:to-primary-foreground/90"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Update Credentials
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}