import { useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import { useUser } from './use-user';

export function useSocket() {
  const { user } = useUser();
  const socket = useRef<Socket | null>(null);

  useEffect(() => {
    if (user && !socket.current) {
      // Initialize socket with the same origin
      socket.current = io(window.location.origin, {
        transports: ['websocket'],
        autoConnect: true,
        reconnection: true
      });

      socket.current.on('connect', () => {
        console.log('Socket connected');
        socket.current?.emit('register', user.id);
      });

      socket.current.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
      });
    }

    return () => {
      if (socket.current) {
        socket.current.disconnect();
        socket.current = null;
      }
    };
  }, [user]);

  return socket.current;
}