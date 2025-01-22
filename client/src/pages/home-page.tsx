import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@/hooks/use-user";
import { useSocket } from "@/hooks/use-socket";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, UserPlus, LogOut, Search } from "lucide-react";
import { Dialpad } from "@/components/dialpad";
import type { User, Call, Contact } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const { user, logout } = useUser();
  const socket = useSocket();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [userStatuses, setUserStatuses] = useState<Record<number, string>>({});

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: calls } = useQuery<Call[]>({
    queryKey: ["/api/calls"],
  });

  const { data: searchResults } = useQuery<User[]>({
    queryKey: [`/api/users/search?query=${searchQuery}`],
    enabled: searchQuery.length > 0,
  });

  useEffect(() => {
    if (!socket) return;

    socket.on("userStatus", ({ userId, status }) => {
      setUserStatuses(prev => ({ ...prev, [userId]: status }));
    });

    return () => {
      socket.off("userStatus");
    };
  }, [socket]);

  const handleCallUser = (userId: number | string) => {
    if (!userId) return;

    // Ensure userId is a number
    const receiverId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(receiverId)) {
      toast({
        variant: "destructive",
        title: "Invalid User",
        description: "Please enter a valid user ID",
      });
      return;
    }

    setLocation(`/call/${receiverId}`);
  };

  const handleAddContact = async (contactId: number) => {
    await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId }),
    });
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">VoIP Calling App</h1>
          <div className="flex items-center gap-4">
            <span>{user?.username}</span>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Dialpad</CardTitle>
            </CardHeader>
            <CardContent>
              <Dialpad onCall={(number) => handleCallUser(parseInt(number))} />
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Contacts</CardTitle>
              <div className="flex gap-2">
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {searchQuery ? (
                searchResults?.map((result) => (
                  <div key={result.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar>
                        <AvatarFallback>{result.username[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p>{result.username}</p>
                        <p className="text-sm text-muted-foreground">
                          {userStatuses[result.id] || result.status}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleAddContact(result.id)}
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="default"
                        size="icon"
                        onClick={() => handleCallUser(result.id)}
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                contacts?.map((contact) => (
                  <div key={contact.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar>
                        <AvatarFallback>
                          {contact.nickname?.[0] || "C"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p>{contact.nickname || `Contact ${contact.contactId}`}</p>
                        <p className="text-sm text-muted-foreground">
                          {userStatuses[contact.contactId] || "offline"}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="default"
                      size="icon"
                      onClick={() => handleCallUser(contact.contactId)}
                    >
                      <Phone className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>Call History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {calls?.map((call) => (
                <div key={call.id} className="flex items-center justify-between">
                  <div>
                    <p>
                      {call.callerId === user?.id ? "Outgoing" : "Incoming"} call
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(call.startTime).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Duration: {call.duration || 0}s
                    </p>
                  </div>
                  <Button
                    variant="default"
                    size="icon"
                    onClick={() =>
                      handleCallUser(
                        call.callerId === user?.id
                          ? call.receiverId
                          : call.callerId
                      )
                    }
                  >
                    <Phone className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}