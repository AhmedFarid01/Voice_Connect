import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './use-user';
import { useToast } from './use-toast';

export function useSocket() {
  const { user } = useUser();
  const { toast } = useToast();
  const socket = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  useEffect(() => {
    if (user && !socket.current) {
      // Initialize socket with the same origin
      socket.current = io(window.location.origin, {
        transports: ['websocket'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 1000,
      });

      socket.current.on('connect', () => {
        console.log('Socket connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;
        socket.current?.emit('register', user.id);
      });

      socket.current.on('disconnect', () => {
        console.log('Socket disconnected');
        setIsConnected(false);
      });

      socket.current.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        reconnectAttempts.current += 1;

        if (reconnectAttempts.current >= maxReconnectAttempts) {
          toast({
            variant: "destructive",
            title: "Connection Error",
            description: "Failed to connect to the server. Please try again later.",
          });
          socket.current?.disconnect();
        }
      });
    }

    return () => {
      if (socket.current) {
        socket.current.disconnect();
        socket.current = null;
        setIsConnected(false);
      }
    };
  }, [user, toast]);

  // Only return the socket if it's connected
  return isConnected ? socket.current : null;
}