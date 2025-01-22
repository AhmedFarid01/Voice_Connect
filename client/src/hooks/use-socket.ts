import { useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import { useUser } from './use-user';

export function useSocket() {
  const { user } = useUser();
  const socket = useRef<Socket | null>(null);

  useEffect(() => {
    if (user && !socket.current) {
      socket.current = io();
      socket.current.emit('register', user.id);
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
