import { useRef, useEffect } from 'react';

interface GroupCallGridProps {
  localStream: MediaStream | null;
  remoteStreams: Map<number, MediaStream>;
  isLocalAudioEnabled?: boolean;
  isLocalVideoEnabled?: boolean;
}

export function GroupCallGrid({
  localStream,
  remoteStreams,
  isLocalAudioEnabled = true,
  isLocalVideoEnabled = true,
}: GroupCallGridProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());

  // Check if local stream has video tracks
  const hasVideoTrack = localStream?.getVideoTracks().length > 0;

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    remoteStreams.forEach((stream, peerId) => {
      const videoElement = remoteVideoRefs.current.get(peerId);
      if (videoElement && videoElement.srcObject !== stream) {
        videoElement.srcObject = stream;
      }
    });
  }, [remoteStreams]);

  const gridColumns = Math.ceil(Math.sqrt(remoteStreams.size + 1));

  return (
    <div 
      className="grid gap-4"
      style={{ 
        gridTemplateColumns: `repeat(${gridColumns}, 1fr)` 
      }}
    >
      <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
        {hasVideoTrack ? (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${!isLocalVideoEnabled ? 'hidden' : ''}`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <span className="text-muted-foreground">Video Unavailable</span>
          </div>
        )}
        <div className="absolute bottom-2 left-2 text-white text-sm bg-black/50 px-2 py-1 rounded">
          You {!isLocalAudioEnabled ? '(Muted)' : ''}
        </div>
      </div>

      {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
        <div
          key={peerId}
          className="relative aspect-video bg-muted rounded-lg overflow-hidden"
        >
          {stream.getVideoTracks().length > 0 ? (
            <video
              ref={(el) => {
                if (el) {
                  remoteVideoRefs.current.set(peerId, el);
                } else {
                  remoteVideoRefs.current.delete(peerId);
                }
              }}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <span className="text-muted-foreground">Participant Video Unavailable</span>
            </div>
          )}
          <div className="absolute bottom-2 left-2 text-white text-sm bg-black/50 px-2 py-1 rounded">
            Participant {peerId}
          </div>
        </div>
      ))}
    </div>
  );
}