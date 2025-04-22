import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { VerificationLink } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { format, isToday, isYesterday, formatDistanceToNow, isSameDay } from "date-fns";
import { 
  Loader2, 
  Trash2, 
  Inbox, 
  RefreshCw, 
  Clock, 
  Calendar, 
  MailCheck,
  AlertTriangle
} from "lucide-react";

export default function VerificationStatusTable() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State for view mode: 'list' (traditional) or 'sessions' (grouped by session date)
  const [viewMode, setViewMode] = useState<'list' | 'sessions'>('list');
  
  // Fetch verification links with grouping by session if needed
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/verification/links", { groupBySession: viewMode === 'sessions' }],
    queryFn: async ({ queryKey }) => {
      const [_, { groupBySession }] = queryKey as [string, { groupBySession: boolean }];
      const res = await apiRequest(
        "GET", 
        `/api/verification/links${groupBySession ? '?groupBySession=true' : ''}`
      );
      return res.json();
    }
  });
  
  // Clear cache mutation
  const clearCacheMutation = useMutation({
    mutationFn: async (olderThanDays?: number) => {
      const res = await apiRequest("POST", "/api/verification/clear", { olderThanDays });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/verification/links"] });
      toast({
        title: "Cache cleared",
        description: data.message || `Successfully cleared ${data.clearedCount} verification links`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to clear cache",
        variant: "destructive",
      });
    },
  });

  // Resend verification link mutation
  const resendMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/verification/resend", { 
        email,
        useCustomTemplate: true // Signal the server to use custom message template from settings
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/verification/links"] });
      toast({
        title: "Verification link resent",
        description: data.message || "A new verification link has been generated and sent.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to resend verification link",
        variant: "destructive",
      });
    },
  });

  // Filter and sort links
  const filteredLinks = data ? 
    (data as VerificationLink[])
      .filter(link => {
        // Apply status filter
        if (statusFilter !== "all" && link.status !== statusFilter) {
          return false;
        }
        
        // Apply search filter (case insensitive)
        if (searchQuery && !link.email.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        
        return true;
      })
      // Sort by most recent first
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];

  const handleResend = (email: string) => {
    resendMutation.mutate(email);
  };

  // Format date function
  const formatDate = (date: string | Date | null) => {
    if (!date) return "-";
    return format(new Date(date), "yyyy-MM-dd");
  };

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
      case "verified":
        return <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">Verified</Badge>;
      case "expired":
        return <Badge variant="outline" className="bg-red-100 text-red-800 hover:bg-red-100">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="mt-2 text-sm text-gray-500">Loading verification status...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-red-500">Error loading verification status</p>
          <p className="mt-2 text-sm text-gray-500">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Helper for session view
  const formatSessionDate = (date: string) => {
    const dateObj = new Date(date);
    
    if (isToday(dateObj)) {
      return 'Today';
    } else if (isYesterday(dateObj)) {
      return 'Yesterday';
    } else {
      return format(dateObj, 'MMMM d, yyyy');
    }
  };
  
  // Function to handle clearing cache with different timeframes
  const handleClearCache = (days?: number) => {
    if (days === undefined || days <= 0) {
      // Confirm before clearing all links
      if (window.confirm('Are you sure you want to clear ALL verification links? This action cannot be undone.')) {
        clearCacheMutation.mutate({ olderThanDays: undefined });
      }
    } else {
      clearCacheMutation.mutate({ olderThanDays: days });
    }
  };
  
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-slate-50 dark:bg-slate-900 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
          <div>
            <CardTitle className="text-xl font-bold">Verification Status</CardTitle>
            <CardDescription>
              Monitor email verification progress
            </CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'list' | 'sessions')}>
              <TabsList>
                <TabsTrigger value="list">List View</TabsTrigger>
                <TabsTrigger value="sessions">Sessions</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center space-x-2">
              <Select onValueChange={(value) => handleClearCache(parseInt(value))}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Clear Cache" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Clear older than 7 Days</SelectItem>
                  <SelectItem value="30">Clear older than 30 Days</SelectItem>
                  <SelectItem value="90">Clear older than 90 Days</SelectItem>
                  <SelectItem value="0">Clear All</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => refetch()}
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Filters and Search */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
          <div className="flex flex-col md:flex-row justify-between space-y-3 md:space-y-0 md:space-x-4">
            <div className="w-full md:w-64">
              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-64">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search emails"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Session View */}
        {viewMode === 'sessions' && Array.isArray(data) && !('id' in data[0]) ? (
          <div className="overflow-x-auto p-4">
            <Accordion type="single" collapsible className="w-full">
              {(data as any[]).map((session, index) => (
                <AccordionItem key={index} value={`session-${index}`}>
                  <AccordionTrigger className="py-4 px-2">
                    <div className="flex items-center space-x-3">
                      <Calendar className="h-5 w-5 text-gray-500" />
                      <span className="font-medium">
                        Session: {formatSessionDate(session.date)}
                      </span>
                      <div className="ml-2 flex items-center space-x-1">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 rounded-full">
                          {session.count} emails
                        </Badge>
                        {session.verifiedCount > 0 && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 rounded-full">
                            {session.verifiedCount} verified
                          </Badge>
                        )}
                        {session.pendingCount > 0 && (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 rounded-full">
                            {session.pendingCount} pending
                          </Badge>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="overflow-x-auto pl-10">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Expires</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {session.links.map((link: any) => (
                            <TableRow key={link.id}>
                              <TableCell className="font-medium">{link.email}</TableCell>
                              <TableCell><StatusBadge status={link.status} /></TableCell>
                              <TableCell>{formatDate(link.expiresAt)}</TableCell>
                              <TableCell className="text-right">
                                {link.status !== "verified" ? (
                                  <Button
                                    variant="link"
                                    className="text-primary hover:text-primary/80"
                                    onClick={() => handleResend(link.email)}
                                    disabled={resendMutation.isPending}
                                  >
                                    {resendMutation.isPending ? "Sending..." : "Resend"}
                                  </Button>
                                ) : (
                                  <span className="text-gray-400">
                                    <MailCheck className="h-4 w-4 inline mr-1" />
                                    Verified
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ) : (
          // List View
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Generated Date</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Verification Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLinks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6">
                      <div className="flex flex-col items-center space-y-3 py-6 text-gray-500">
                        <Inbox className="h-10 w-10" />
                        <p>No verification links found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLinks.map((link) => (
                    <TableRow key={link.id}>
                      <TableCell className="font-medium">{link.email}</TableCell>
                      <TableCell><StatusBadge status={link.status} /></TableCell>
                      <TableCell>{formatDate(link.createdAt)}</TableCell>
                      <TableCell>{formatDate(link.expiresAt)}</TableCell>
                      <TableCell>{formatDate(link.verifiedAt)}</TableCell>
                      <TableCell className="text-right">
                        {link.status !== "verified" ? (
                          <Button
                            variant="link"
                            className="text-primary hover:text-primary/80"
                            onClick={() => handleResend(link.email)}
                            disabled={resendMutation.isPending}
                          >
                            {resendMutation.isPending ? "Sending..." : "Resend"}
                          </Button>
                        ) : (
                          <span className="text-gray-400">Verified</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination & Status */}
        <div className="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 sm:px-6">
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {viewMode === 'list' ? (
                  <>
                    Showing <span className="font-medium">{filteredLinks.length}</span> of <span className="font-medium">{filteredLinks.length}</span> results
                  </>
                ) : (
                  <>
                    Showing <span className="font-medium">{(data as any[]).length}</span> sessions
                  </>
                )}
              </p>
            </div>
            {clearCacheMutation.isPending && (
              <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Clearing cache...</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
