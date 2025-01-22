import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useWebRTC } from "@/hooks/use-webrtc";
import { useUser } from "@/hooks/use-user";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GroupCallGrid } from "@/components/group-call-grid";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState as useDialogState } from "react";

export default function CallPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useDialogState(false);
  const [roomName, setRoomName] = useState("");

  const {
    createRoom,
    joinRoom,
    leaveRoom,
    isCallActive,
    localStream,
    remoteStreams,
    error,
    activeRoomId
  } = useWebRTC(user?.id || 0);

  useEffect(() => {
    if (id && !isCallActive && !activeRoomId) {
      // If ID is numeric, it's a room ID
      const roomId = parseInt(id);
      if (!isNaN(roomId)) {
        joinRoom(roomId);
      }
    }
  }, [id, isCallActive, activeRoomId, joinRoom]);

  const handleCreateRoom = () => {
    if (roomName) {
      createRoom(roomName);
      setIsCreateRoomOpen(false);
      setRoomName("");
    }
  };

  const handleEndCall = () => {
    leaveRoom();
    setLocation("/");
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => setLocation("/")} className="w-full">
              Return Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>
                {isCallActive ? `Active Call - Room ${activeRoomId}` : "Connecting..."}
              </span>
              <Dialog open={isCreateRoomOpen} onOpenChange={setIsCreateRoomOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="ml-4">
                    <Users className="h-4 w-4 mr-2" />
                    New Room
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Room</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <Input
                      placeholder="Room Name"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                    />
                    <Button onClick={handleCreateRoom} className="w-full">
                      Create Room
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <GroupCallGrid
              localStream={localStream}
              remoteStreams={remoteStreams}
              isLocalAudioEnabled={!isMuted}
              isLocalVideoEnabled={isVideoEnabled}
            />
          </CardContent>
          <CardFooter className="flex justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={toggleMute}
              className={isMuted ? "bg-destructive" : ""}
            >
              {isMuted ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleVideo}
              className={!isVideoEnabled ? "bg-destructive" : ""}
            >
              {isVideoEnabled ? (
                <Video className="h-4 w-4" />
              ) : (
                <VideoOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="destructive"
              size="icon"
              onClick={handleEndCall}
            >
              <PhoneOff className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}