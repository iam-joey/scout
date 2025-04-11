import type { Server } from 'http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';

export function setupWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket client connected');

    ws.send(
      JSON.stringify({
        type: 'welcome',
        message: 'Connected to WebSocket server',
      }),
    );

    ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received:', message);

        ws.send(JSON.stringify({ type: 'echo', data: message }));
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });

  return wss;
}
