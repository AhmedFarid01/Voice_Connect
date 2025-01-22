import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useWebRTC } from "@/hooks/use-webrtc";
import { useUser } from "@/hooks/use-user";
import { useSocket } from "@/hooks/use-socket";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GroupCallGrid } from "@/components/group-call-grid";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Users, Loader2, RefreshCcw, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState as useDialogState } from "react";

export default function CallPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const socket = useSocket();
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
    error: webRTCError,
    activeRoomId,
    isInitializing,
    isAudioOnly
  } = useWebRTC(user?.id || 0);

  useEffect(() => {
    if (!socket || !id) return;

    const roomId = parseInt(id);
    if (!isNaN(roomId) && !isCallActive && !activeRoomId) {
      console.log('Attempting to join room:', roomId);
      joinRoom(roomId);
    }
  }, [id, socket, isCallActive, activeRoomId, joinRoom]);

  const handleCreateRoom = () => {
    if (!socket) return;

    if (roomName) {
      createRoom(roomName);
      setIsCreateRoomOpen(false);
      setRoomName("");
    }
  };

  const handleRetry = () => {
    if (!socket || !id) return;
    const roomId = parseInt(id);
    if (!isNaN(roomId)) {
      console.log('Retrying to join room:', roomId);
      joinRoom(roomId);
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
    if (localStream && !isAudioOnly) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  if (!socket) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle className="text-destructive">Connection Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Unable to connect to the server. Please check your internet connection and try again.</p>
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

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Initializing call...
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Setting up your media devices...</p>
            <p className="text-sm text-muted-foreground">
              Please allow access to your camera and microphone when prompted.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (webRTCError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Media Setup Error
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{webRTCError}</p>
            <p className="text-sm text-muted-foreground">
              Try checking your camera and microphone permissions in your browser settings.
            </p>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button onClick={handleRetry} className="flex-1">
              <RefreshCcw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button onClick={() => setLocation("/")} variant="outline" className="flex-1">
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
              {isAudioOnly && (
                <Alert variant="warning" className="ml-4">
                  <AlertDescription>
                    Running in audio-only mode. Video is unavailable.
                  </AlertDescription>
                </Alert>
              )}
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
            {!isAudioOnly && (
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
            )}
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