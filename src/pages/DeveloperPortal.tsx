/**
 * Developer Portal - Main Page
 * Portal dewelopera z logowaniem PIN-em i widokiem usterek
 */
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2,
  Lock,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  MessageSquare,
  FileText,
  Loader2,
} from "lucide-react";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import {
  DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS,
  DEVELOPER_WARRANTY_ISSUE_PRIORITY_LABELS,
  type DeveloperWarrantyIssueStatus,
  type DeveloperWarrantyIssueWithComments,
} from "@/types/developer-warranty";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { DeveloperIssueDetailsModal } from "@/components/developer/DeveloperIssueDetailsModal";

const loginFormSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, "PIN musi składać się z 4-6 cyfr"),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

interface PortalSession {
  accessId: string;
  communityId: string;
  developerName: string;
  developerEmail: string;
  accessToken: string;
  pin: string;
}

interface PortalData {
  community: {
    id: string;
    name: string;
    legal_name: string | null;
  };
  issues: DeveloperWarrantyIssueWithComments[];
}

export default function DeveloperPortal() {
  const { token } = useParams<{ token: string }>();
  
  const [session, setSession] = useState<PortalSession | null>(null);
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<DeveloperWarrantyIssueStatus | "all">("all");
  const [selectedIssue, setSelectedIssue] = useState<DeveloperWarrantyIssueWithComments | null>(null);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      pin: "",
    },
  });

  useEffect(() => {
    // Try to restore session from sessionStorage
    const savedSession = sessionStorage.getItem(`developer-portal-${token}`);
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        setSession(parsed);
        loadPortalData(token!, parsed.pin);
      } catch (err) {
        console.error("Failed to restore session:", err);
      }
    }
  }, [token]);

  const handleLogin = async (values: LoginFormValues) => {
    if (!token) return;

    setLoading(true);
    setLoginError(null);

    try {
      const { data, error } = await supabase.rpc("developer_portal_login", {
        p_access_token: token,
        p_pin: values.pin,
      });

      if (error) throw error;

      if (!data || !data.ok) {
        setLoginError("Nieprawidłowy PIN lub token dostępu");
        return;
      }

      const sessionData: PortalSession = {
        accessId: data.access_id,
        communityId: data.community_id,
        developerName: data.developer_name,
        developerEmail: data.developer_email,
        accessToken: token,
        pin: values.pin,
      };

      setSession(sessionData);
      sessionStorage.setItem(`developer-portal-${token}`, JSON.stringify(sessionData));
      
      await loadPortalData(token, values.pin);
      
      toast.success(`Witaj, ${data.developer_name}!`);
    } catch (err: any) {
      console.error("Login error:", err);
      setLoginError("Wystąpił błąd podczas logowania");
    } finally {
      setLoading(false);
    }
  };

  const loadPortalData = async (accessToken: string, pin: string) => {
    setDataLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_developer_portal_data", {
        p_access_token: accessToken,
        p_pin: pin,
      });

      if (error) throw error;

      if (!data || !data.ok) {
        throw new Error("Nie udało się pobrać danych portalu");
      }

      setPortalData({
        community: data.community,
        issues: data.issues,
      });
    } catch (err: any) {
      console.error("Failed to load portal data:", err);
      toast.error("Nie udało się załadować danych");
    } finally {
      setDataLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(`developer-portal-${token}`);
    setSession(null);
    setPortalData(null);
    setSelectedIssue(null);
    loginForm.reset();
  };

  const getStatusIcon = (status: DeveloperWarrantyIssueStatus) => {
    switch (status) {
      case "draft":
        return <FileText className="h-4 w-4" />;
      case "reported":
        return <AlertCircle className="h-4 w-4" />;
      case "acknowledged":
      case "in_progress":
        return <Clock className="h-4 w-4" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      case "appealed":
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: DeveloperWarrantyIssueStatus) => {
    switch (status) {
      case "draft":
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
      case "reported":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "acknowledged":
      case "in_progress":
        return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
      case "completed":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "rejected":
        return "bg-red-500/10 text-red-600 dark:text-red-400";
      case "appealed":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
    }
  };

  const filteredIssues = portalData?.issues.filter((issue) => {
    if (selectedStatus === "all") return true;
    return issue.status === selectedStatus;
  }) || [];

  const stats = portalData?.issues
    ? {
        total: portalData.issues.length,
        reported: portalData.issues.filter((i) => i.status === "reported").length,
        inProgress: portalData.issues.filter((i) => 
          ["acknowledged", "in_progress"].includes(i.status)
        ).length,
        completed: portalData.issues.filter((i) => i.status === "completed").length,
      }
    : null;

  // Login Screen
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-primary/10">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Portal dewelopera</CardTitle>
                <CardDescription>Wprowadź swój PIN, aby się zalogować</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {loginError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Błąd logowania</AlertTitle>
                <AlertDescription>{loginError}</AlertDescription>
              </Alert>
            )}

            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="pin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PIN dostępowy</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="4-6 cyfr"
                          maxLength={6}
                          {...field}
                          className="text-center text-2xl tracking-widest"
                          autoFocus
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Logowanie...
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Zaloguj się
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Portal Screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="border-b bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">
                  {portalData?.community.legal_name || portalData?.community.name}
                </h1>
                <p className="text-sm text-muted-foreground">{session.developerName}</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Wyloguj
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {dataLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats */}
            {stats && (
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Wszystkie</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.total}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Nowe zgłoszenia</CardTitle>
                    <AlertCircle className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.reported}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">W trakcie</CardTitle>
                    <Clock className="h-4 w-4 text-yellow-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.inProgress}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Zrealizowane</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.completed}</div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filtry</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Select
                    value={selectedStatus}
                    onValueChange={(value) => setSelectedStatus(value as DeveloperWarrantyIssueStatus | "all")}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszystkie statusy</SelectItem>
                      <SelectItem value="reported">Nowe zgłoszenia</SelectItem>
                      <SelectItem value="acknowledged">Potwierdzone</SelectItem>
                      <SelectItem value="in_progress">W trakcie</SelectItem>
                      <SelectItem value="completed">Zrealizowane</SelectItem>
                      <SelectItem value="rejected">Odrzucone</SelectItem>
                      <SelectItem value="appealed">W odwołaniu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Issues List */}
            <Card>
              <CardHeader>
                <CardTitle>Lista usterek ({filteredIssues.length})</CardTitle>
                <CardDescription>
                  Kliknij na usterkę, aby zobaczyć szczegóły i dodać komentarz
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredIssues.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Brak usterek do wyświetlenia</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredIssues.map((issue) => (
                      <Card
                        key={issue.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => setSelectedIssue(issue)}
                      >
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="font-semibold text-lg truncate">{issue.title}</h3>
                                <Badge variant="outline" className={getStatusColor(issue.status)}>
                                  <span className="flex items-center gap-1.5">
                                    {getStatusIcon(issue.status)}
                                    {DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS[issue.status]}
                                  </span>
                                </Badge>
                              </div>

                              {issue.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                  {issue.description}
                                </p>
                              )}

                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                {issue.category && <span>{issue.category}</span>}
                                {issue.location_detail && (
                                  <>
                                    <span>•</span>
                                    <span>{issue.location_detail}</span>
                                  </>
                                )}
                                <span>•</span>
                                <span>
                                  {format(new Date(issue.reported_at || issue.created_at), "d MMM yyyy", {
                                    locale: pl,
                                  })}
                                </span>
                                {issue.comments && issue.comments.length > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                      <MessageSquare className="h-3 w-3" />
                                      {issue.comments.length}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Issue Details Modal */}
      <DeveloperIssueDetailsModal
        issue={selectedIssue}
        open={!!selectedIssue}
        onOpenChange={(open) => !open && setSelectedIssue(null)}
        onUpdate={() => {
          if (token && session) {
            loadPortalData(token, session.pin);
          }
        }}
        developerName={session?.developerName || "Deweloper"}
        accessToken={token!}
        pin={session?.pin || ""}
      />
    </div>
  );
}
