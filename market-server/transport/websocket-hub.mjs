import { WebSocketServer, WebSocket } from "ws";

export class WebSocketHub {
  constructor({ allowedOrigins = [] } = {}) {
    this.allowedOrigins = allowedOrigins;
    this.server = new WebSocketServer({ noServer: true });
    this.subscriptions = new Map();
    this.server.on("connection", (socket, request, marketId) => {
      this.subscriptions.set(socket, marketId);
      socket.send(JSON.stringify({ type: "connected", marketId }));
      socket.on("close", () => this.subscriptions.delete(socket));
    });
  }

  attach(httpServer) {
    httpServer.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const marketId = url.searchParams.get("marketId");
      const origin = request.headers.origin;
      const originAllowed = !origin || this.allowedOrigins.includes(origin);
      if (!originAllowed) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      if (url.pathname !== "/ws" || !marketId) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
      this.server.handleUpgrade(request, socket, head, (webSocket) => {
        this.server.emit("connection", webSocket, request, marketId);
      });
    });
  }

  publish(marketId, message) {
    const payload = JSON.stringify(message);
    for (const [socket, subscribedMarketId] of this.subscriptions) {
      if (subscribedMarketId === marketId && socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  close() {
    for (const socket of this.subscriptions.keys()) socket.close();
    this.server.close();
  }
}
