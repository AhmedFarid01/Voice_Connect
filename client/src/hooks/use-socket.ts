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
  const maxReconnectAttempts = 5;

  useEffect(() => {
    if (!socket.current && user) {
      console.log('Initializing socket connection...');
      socket.current = io(window.location.origin, {
        transports: ['websocket'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 1000,
        timeout: 10000,
      });

      socket.current.on('connect', () => {
        console.log('Socket connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;

        if (user) {
          console.log('Authenticating socket for user:', user.id);
          socket.current?.emit('auth', { userId: user.id });
        }
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

      // Add error event handler
      socket.current.on('error', (error: any) => {
        console.error('Socket error:', error);
        toast({
          variant: "destructive",
          title: "Connection Error",
          description: error.message || "An error occurred with the connection",
        });
      });
    }

    return () => {
      if (socket.current) {
        console.log('Cleaning up socket connection');
        socket.current.disconnect();
        socket.current = null;
        setIsConnected(false);
      }
    };
  }, [user, toast]);

  // For debugging
  useEffect(() => {
    console.log('Socket connection state:', isConnected);
    console.log('User state:', user);
  }, [isConnected, user]);

  return isConnected && socket.current ? socket.current : null;
}