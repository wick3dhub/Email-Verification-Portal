import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Settings } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const settingsSchema = z.object({
  redirectUrl: z.string().url("Please enter a valid URL"),
  showLoadingSpinner: z.boolean(),
  loadingDuration: z.number().int().min(1, "Duration must be at least 1 second").max(10, "Duration must be at most 10 seconds"),
  successMessage: z.string().min(1, "Success message cannot be empty"),
  useEmailAutograb: z.boolean(),
  emailAutograbParam: z.string().min(1, "Parameter name cannot be empty"),
  enableBotProtection: z.boolean(),
  customThankYouPage: z.string(),
  useCustomThankYouPage: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function SettingsForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current settings
  const { data: settings, isLoading, error } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  // Create form with default values
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      redirectUrl: "",
      showLoadingSpinner: true,
      loadingDuration: 3,
      successMessage: "Thank you for verifying your email address!",
      useEmailAutograb: false,
      emailAutograbParam: "email",
      enableBotProtection: true,
      customThankYouPage: "",
      useCustomThankYouPage: false,
    },
  });

  // Update form values when settings are loaded
  useEffect(() => {
    if (settings) {
      form.reset({
        redirectUrl: settings.redirectUrl,
        showLoadingSpinner: settings.showLoadingSpinner,
        loadingDuration: settings.loadingDuration,
        successMessage: settings.successMessage,
        useEmailAutograb: settings.useEmailAutograb,
        emailAutograbParam: settings.emailAutograbParam,
        enableBotProtection: settings.enableBotProtection,
        customThankYouPage: settings.customThankYouPage,
        useCustomThankYouPage: settings.useCustomThankYouPage,
      });
    }
  }, [settings, form]);

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async (data: SettingsFormValues) => {
      const res = await apiRequest("POST", "/api/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings saved",
        description: "Your settings have been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SettingsFormValues) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="mt-2 text-sm text-gray-500">Loading settings...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-red-500">Error loading settings</p>
          <p className="mt-2 text-sm text-gray-500">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 pb-6">
        <div className="border-b border-gray-200 pb-4 mb-6">
          <h2 className="text-lg font-medium text-gray-900">Verification Settings</h2>
          <p className="mt-1 text-sm text-gray-500">
            Configure settings for the verification process.
          </p>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="redirectUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Redirect URL After Verification</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com/thank-you" {...field} />
                  </FormControl>
                  <FormDescription>
                    Users will be redirected to this URL after successful verification.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="showLoadingSpinner"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enable Loading Spinner</FormLabel>
                    <FormDescription>
                      Show a loading spinner during verification before redirecting.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="loadingDuration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loading Spinner Duration (seconds)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 3)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="successMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Verification Success Message</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Thank you for verifying your email address!"
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border-t border-gray-200 pt-6 mt-6 mb-6">
              <h3 className="text-base font-medium text-gray-900 mb-4">Advanced Features</h3>
            </div>
            
            <FormField
              control={form.control}
              name="useEmailAutograb"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enable Email Autograb</FormLabel>
                    <FormDescription>
                      Replace a parameter in the redirect URL with the user's email address
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {form.watch('useEmailAutograb') && (
              <FormField
                control={form.control}
                name="emailAutograbParam"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Parameter Name</FormLabel>
                    <FormControl>
                      <Input placeholder="email" {...field} />
                    </FormControl>
                    <FormDescription>
                      Example: If parameter is "email", your redirect URL like "https://example.com?email=EMAIL_HERE" 
                      will replace EMAIL_HERE with the user's actual email
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            <FormField
              control={form.control}
              name="enableBotProtection"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enable Bot Protection</FormLabel>
                    <FormDescription>
                      Show a simple challenge for verification links when suspicious traffic is detected
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="useCustomThankYouPage"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Use Custom Thank You Page</FormLabel>
                    <FormDescription>
                      Use custom HTML for the verification success page instead of the default
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {form.watch('useCustomThankYouPage') && (
              <FormField
                control={form.control}
                name="customThankYouPage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom Thank You HTML</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="<h1>Thank you!</h1><p>Your email has been verified.</p>"
                        className="min-h-[200px] font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Enter custom HTML for the thank you page. Use &#123;email&#125; to include the user's email.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Settings"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
