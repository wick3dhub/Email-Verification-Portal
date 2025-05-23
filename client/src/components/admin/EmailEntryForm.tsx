import { useState, useRef, useMemo, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Download, Copy, CheckCircle, Upload, FileUp } from "lucide-react";
import { GenerateLinksResponse, Settings } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const emailBatchSchema = z.object({
  emails: z.string()
    .min(1, "Please enter at least one email address")
    .refine(val => val.trim().length > 0, "Please enter at least one email address"),
  expireDays: z.number()
    .int()
    .min(1, "Expiration days must be at least 1")
    .default(7),
  redirectUrl: z.string().url("Please enter a valid URL").optional(),
});

type EmailBatchFormValues = z.infer<typeof emailBatchSchema>;

export default function EmailEntryForm() {
  const [generatedLinks, setGeneratedLinks] = useState<GenerateLinksResponse | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>("manual");
  const [selectedDomain, setSelectedDomain] = useState<string>("default");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  // Fetch settings to get available domains
  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });
  
  // Process available domains for selection
  const domainOptions = useMemo(() => {
    const options = [
      { value: "default", label: "Default Domain" },
      { value: "random", label: "Random Domain" }
    ];
    
    // Add main custom domain if enabled
    if (settings?.useCustomDomain && settings.customDomain && settings.domainVerified) {
      options.push({ 
        value: settings.customDomain, 
        label: settings.customDomain 
      });
    }
    
    // Add additional domains if any
    if (settings?.useCustomDomain && settings.additionalDomains) {
      try {
        const additionalDomains = JSON.parse(settings.additionalDomains);
        if (Array.isArray(additionalDomains) && additionalDomains.length > 0) {
          additionalDomains.forEach((domain: string) => {
            options.push({ value: domain, label: domain });
          });
        }
      } catch (error) {
        console.error("Error parsing additional domains:", error);
      }
    }
    
    return options;
  }, [settings]);
  
  const form = useForm<EmailBatchFormValues>({
    resolver: zodResolver(emailBatchSchema),
    defaultValues: {
      emails: "",
      expireDays: 7,
      redirectUrl: "",
    },
  });
  
  // Update redirectUrl default when settings change
  useEffect(() => {
    if (settings?.redirectUrl) {
      form.setValue("redirectUrl", settings.redirectUrl);
    }
  }, [settings, form]);

  const generateMutation = useMutation({
    mutationFn: async (values: EmailBatchFormValues) => {
      const res = await apiRequest("POST", "/api/verification/generate", {
        emails: values.emails,
        expireDays: values.expireDays,
        domain: selectedDomain, // Add selected domain to the request
        redirectUrl: values.redirectUrl, // Add custom redirect URL
      });
      return res.json();
    },
    onSuccess: (data: GenerateLinksResponse) => {
      setGeneratedLinks(data);
      toast({
        title: "Links generated",
        description: `${data.count} verification links generated successfully`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate links",
        variant: "destructive",
      });
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async () => {
      if (!generatedLinks) return null;
      
      const res = await apiRequest("POST", "/api/verification/download", {
        links: generatedLinks.links,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (!data || !data.content) return;
      
      // Create and download the file
      const element = document.createElement("a");
      const file = new Blob([data.content], { type: "text/plain" });
      element.href = URL.createObjectURL(file);
      element.download = `verification_links_${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      
      toast({
        title: "Download started",
        description: "Verification links have been downloaded as a text file",
      });
    },
    onError: (error) => {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Failed to download links",
        variant: "destructive",
      });
    },
  });

  const fileUploadMutation = useMutation({
    mutationFn: async ({ file, expireDays, redirectUrl }: { file: File, expireDays: number, redirectUrl?: string }) => {
      setUploadProgress(0);
      
      // Create FormData to send the file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('expireDays', expireDays.toString());
      formData.append('domain', selectedDomain);
      if (redirectUrl) {
        formData.append('redirectUrl', redirectUrl);
      }
      
      // Create a custom fetch with progress tracking
      const xhr = new XMLHttpRequest();
      
      return new Promise<any>((resolve, reject) => {
        xhr.open('POST', '/api/verification/upload', true);
        
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(progress);
          }
        };
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch (e) {
              reject(new Error('Invalid response format'));
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };
        
        xhr.onerror = () => {
          reject(new Error('Network error occurred'));
        };
        
        xhr.send(formData);
      });
    },
    onSuccess: (data: GenerateLinksResponse) => {
      setGeneratedLinks(data);
      setUploadProgress(null);
      setUploadFileName(null);
      toast({
        title: "Links generated",
        description: `${data.count} verification links generated successfully`,
      });
    },
    onError: (error) => {
      setUploadProgress(null);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Check if it's a .txt file
    if (!file.name.endsWith('.txt')) {
      toast({
        title: "Invalid file format",
        description: "Please upload a .txt file",
        variant: "destructive",
      });
      return;
    }
    
    setUploadFileName(file.name);
    
    // Get values from the form
    const { expireDays, redirectUrl } = form.getValues();
    
    // Upload the file
    fileUploadMutation.mutate({ file, expireDays, redirectUrl });
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const onSubmit = (values: EmailBatchFormValues) => {
    generateMutation.mutate(values);
  };
  
  const handleCopyLinks = () => {
    if (!generatedLinks) return;
    
    // link.url already contains the full URL with domain
    const linksText = generatedLinks.links
      .map(link => link.url)
      .join('\n');
    
    navigator.clipboard.writeText(linksText)
      .then(() => {
        toast({
          title: "Copied",
          description: "Links copied to clipboard",
        });
      })
      .catch(() => {
        toast({
          title: "Copy failed",
          description: "Failed to copy links to clipboard",
          variant: "destructive",
        });
      });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Add Emails for Verification
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Enter email addresses manually or upload a TXT file with email addresses (one per line).
          </p>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="manual">Manual Entry</TabsTrigger>
              <TabsTrigger value="upload">File Upload</TabsTrigger>
            </TabsList>
            
            <TabsContent value="manual" className="space-y-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="emails"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Addresses</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="email1@example.com&#10;email2@example.com&#10;email3@example.com"
                            className="min-h-[150px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="expireDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expire Links After</FormLabel>
                        <FormControl>
                          <div className="flex rounded-md">
                            <Input
                              type="number"
                              min={1}
                              className="rounded-r-none"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            />
                            <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted text-muted-foreground text-sm">
                              Days
                            </span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Custom Redirect URL */}
                  <FormField
                    control={form.control}
                    name="redirectUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom Redirect URL (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://example.com/thank-you" 
                            {...field} 
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormDescription>
                          Override the default redirect URL for this batch of links only. 
                          Leave empty to use the global redirect URL from settings.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Domain Selection */}
                  <div className="space-y-2">
                    <FormLabel>Domain for Verification Links</FormLabel>
                    <Select
                      value={selectedDomain}
                      onValueChange={setSelectedDomain}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select domain" />
                      </SelectTrigger>
                      <SelectContent>
                        {domainOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose which domain to use for verification links. 
                      "Default" uses the application domain, "Random" picks a domain randomly from available domains.
                    </FormDescription>
                  </div>
                  
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={generateMutation.isPending}
                    >
                      {generateMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        "Generate Verification Links"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </TabsContent>
            
            <TabsContent value="upload" className="space-y-6">
              <Form {...form}>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="expireDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expire Links After</FormLabel>
                        <FormControl>
                          <div className="flex rounded-md">
                            <Input
                              type="number"
                              min={1}
                              className="rounded-r-none"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            />
                            <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted text-muted-foreground text-sm">
                              Days
                            </span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Custom Redirect URL for File Upload */}
                  <FormField
                    control={form.control}
                    name="redirectUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom Redirect URL (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://example.com/thank-you" 
                            {...field} 
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormDescription>
                          Override the default redirect URL for this batch of links only. 
                          Leave empty to use the global redirect URL from settings.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                
                  {/* Domain Selection for File Upload */}
                  <div className="space-y-2">
                    <FormLabel>Domain for Verification Links</FormLabel>
                    <Select
                      value={selectedDomain}
                      onValueChange={setSelectedDomain}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select domain" />
                      </SelectTrigger>
                      <SelectContent>
                        {domainOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose which domain to use for verification links. 
                      "Default" uses the application domain, "Random" picks a domain randomly from available domains.
                    </FormDescription>
                  </div>
                  
                  <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition cursor-pointer" onClick={handleChooseFile}>
                    <FileUp className="h-10 w-10 mb-3 text-gray-400" />
                    
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-sm font-medium text-gray-700">
                        {uploadFileName ? uploadFileName : "Click to upload TXT file"}
                      </p>
                      <p className="text-xs text-gray-500">
                        TXT file with one email per line
                      </p>
                    </div>
                    
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={fileUploadMutation.isPending}
                    />
                  </div>
                  
                  {uploadProgress !== null && (
                    <div className="w-full bg-gray-200 rounded-full overflow-hidden h-2">
                      <div className="bg-primary h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                  
                  {uploadProgress !== null && (
                    <p className="text-xs text-center text-gray-500">
                      Uploading... {uploadProgress}%
                    </p>
                  )}
                </div>
              </Form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {generatedLinks && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Generated Verification Links</h3>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadMutation.mutate()}
                  disabled={downloadMutation.isPending}
                >
                  {downloadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download as TXT
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLinks}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy All
                </Button>
              </div>
            </div>

            <div className="border border-gray-300 rounded-md bg-gray-50 p-4 h-64 overflow-y-auto">
              <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                {generatedLinks.links.map(link => (
                  // link.url already contains the full URL with domain
                  `${link.url}\n`
                ))}
              </pre>
            </div>
            
            <div className="mt-4 flex items-center text-sm text-green-600">
              <CheckCircle className="h-5 w-5 mr-1.5" />
              <span>
                {generatedLinks.count} verification {generatedLinks.count === 1 ? 'link' : 'links'} generated successfully
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
