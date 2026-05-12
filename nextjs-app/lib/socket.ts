import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { fetchHistoricalCandles, getDateRange, isMarketOpen } from './upstox';

declare global {
  // eslint-disable-next-line no-var
  var _socketIO: SocketIOServer | undefined;
  // eslint-disable-next-line no-var
  var _socketToken: string | undefined;
  // eslint-disable-next-line no-var
  var _socketInterval: ReturnType<typeof setInterval> | undefined;
}

export function getSocketIO(httpServer?: HTTPServer): SocketIOServer {
  if (!global._socketIO) {
    if (!httpServer) throw new Error('HTTPServer required to initialize Socket.IO');

    global._socketIO = new SocketIOServer(httpServer, {
      path: '/api/socket',
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    global._socketIO.on('connection', (socket) => {
      console.log('[Socket] Client connected:', socket.id);

      socket.on('set_token', (token: string) => {
        global._socketToken = token;
        startLiveUpdates();
      });

      socket.on('disconnect', () => {
        console.log('[Socket] Client disconnected:', socket.id);
      });
    });
  }

  return global._socketIO;
}

function startLiveUpdates() {
  if (global._socketInterval) return;

  global._socketInterval = setInterval(async () => {
    if (!isMarketOpen() || !global._socketToken || !global._socketIO) return;

    const symbols = ['nifty50', 'banknifty'];
    const { fromDate, toDate } = getDateRange(1);

    for (const symbol of symbols) {
      try {
        const candles = await fetchHistoricalCandles(
          global._socketToken,
          symbol,
          '5minute',
          fromDate,
          toDate
        );

        if (candles.length > 0) {
          const latest = candles[candles.length - 1];
          global._socketIO.emit('candle_update', { symbol, candle: latest });
        }
      } catch (err) {
        console.error(`[Socket] Failed to fetch ${symbol}:`, err);
      }
    }
  }, 60_000);
}
