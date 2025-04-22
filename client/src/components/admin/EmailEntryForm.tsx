import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Download, Copy, CheckCircle } from "lucide-react";
import { GenerateLinksResponse } from "@/lib/types";

const emailBatchSchema = z.object({
  emails: z.string()
    .min(1, "Please enter at least one email address")
    .refine(val => val.trim().length > 0, "Please enter at least one email address"),
  expireDays: z.number()
    .int()
    .min(1, "Expiration days must be at least 1")
    .default(7),
});

type EmailBatchFormValues = z.infer<typeof emailBatchSchema>;

export default function EmailEntryForm() {
  const [generatedLinks, setGeneratedLinks] = useState<GenerateLinksResponse | null>(null);
  const { toast } = useToast();
  
  const form = useForm<EmailBatchFormValues>({
    resolver: zodResolver(emailBatchSchema),
    defaultValues: {
      emails: "",
      expireDays: 7,
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (values: EmailBatchFormValues) => {
      const res = await apiRequest("POST", "/api/verification/generate", {
        emails: values.emails,
        expireDays: values.expireDays,
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

  const onSubmit = (values: EmailBatchFormValues) => {
    generateMutation.mutate(values);
  };
  
  const handleCopyLinks = () => {
    if (!generatedLinks) return;
    
    const host = window.location.origin;
    const linksText = generatedLinks.links
      .map(link => `${host}${link.url}`)
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
          <h2 className="text-lg font-medium text-gray-900 mb-4">Add Emails for Verification</h2>
          <p className="text-sm text-gray-500 mb-4">
            Enter email addresses (one per line or comma separated) to generate verification links.
          </p>
          
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
                  `${window.location.origin}${link.url}\n`
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
