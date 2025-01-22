import { useEffect, useState, useCallback } from "react";
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
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Loader2, RefreshCcw, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function CallPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const socket = useSocket();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [hasInitiatedCall, setHasInitiatedCall] = useState(false);

  const {
    startCall,
    endCall,
    isCallActive,
    localStream,
    remoteStreams,
    error: webRTCError,
    isInitializing,
    isAudioOnly
  } = useWebRTC(user?.id || 0);

  const initiateCall = useCallback(() => {
    if (!socket || !id || hasInitiatedCall) return;

    const receiverId = parseInt(id);
    if (!isNaN(receiverId) && !isCallActive) {
      console.log('Starting call with:', receiverId);
      startCall(receiverId, false);
      setHasInitiatedCall(true);
    }
  }, [id, socket, isCallActive, startCall, hasInitiatedCall]);

  useEffect(() => {
    initiateCall();
    return () => {
      endCall();
    };
  }, [initiateCall, endCall]);

  const handleRetry = () => {
    setHasInitiatedCall(false);
    initiateCall();
  };

  const handleJoinAudioOnly = () => {
    if (!socket || !id) return;
    const receiverId = parseInt(id);
    if (!isNaN(receiverId)) {
      console.log('Starting audio-only call with:', receiverId);
      startCall(receiverId, true);
      setHasInitiatedCall(true);
    }
  };

  const handleEndCall = () => {
    endCall();
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
                Setting up Media Devices
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Please allow access to your camera and microphone when prompted.</p>
            <p className="text-sm text-muted-foreground">
              If permissions were denied, please check your browser settings and try again.
            </p>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button onClick={handleRetry} className="flex-1">
              <RefreshCcw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button onClick={handleJoinAudioOnly} variant="secondary" className="flex-1">
              <Mic className="h-4 w-4 mr-2" />
              Audio Only
            </Button>
          </CardFooter>
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
              Connection Error
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
            <Button onClick={handleJoinAudioOnly} variant="secondary" className="flex-1">
              <Mic className="h-4 w-4 mr-2" />
              Audio Only
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
                {isCallActive ? "Active Call" : "Connecting..."}
              </span>
              {isAudioOnly && (
                <Alert>
                  <AlertDescription>
                    Running in audio-only mode
                  </AlertDescription>
                </Alert>
              )}
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