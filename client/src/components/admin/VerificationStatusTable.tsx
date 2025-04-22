import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { VerificationLink } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

export default function VerificationStatusTable() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch verification links
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/verification/links"],
  });

  // Resend verification link mutation
  const resendMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/verification/resend", { email });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/verification/links"] });
      toast({
        title: "Verification link resent",
        description: "A new verification link has been generated and sent.",
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

  return (
    <Card>
      <CardContent className="p-0">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Verification Status</h2>
          <p className="mt-1 text-sm text-gray-500">
            Monitor which email addresses have completed verification.
          </p>
        </div>

        {/* Filters and Search */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col md:flex-row justify-between space-y-3 md:space-y-0 md:space-x-4">
            <div className="w-full md:w-64">
              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger>
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

        {/* Status Table */}
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
                    No verification links found
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

        {/* Pagination - Simplified version */}
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">1</span> to <span className="font-medium">{filteredLinks.length}</span> of <span className="font-medium">{filteredLinks.length}</span> results
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
