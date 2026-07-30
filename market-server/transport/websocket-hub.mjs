import { WebSocketServer, WebSocket } from "ws";
import { isAllowedOrigin } from "./origin.mjs";

export class WebSocketHub {
  constructor({ allowedOrigins = [] } = {}) {
    this.allowedOrigins = allowedOrigins;
    this.server = new WebSocketServer({ noServer: true });
    this.subscriptions = new Map();
    this.server.on("connection", (socket, request, subscription) => {
      this.subscriptions.set(socket, subscription);
      socket.send(JSON.stringify({ type: "connected", ...subscription }));
      socket.on("close", () => this.subscriptions.delete(socket));
    });
  }

  attach(httpServer) {
    httpServer.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const marketId = url.searchParams.get("marketId");
      const wallet = url.searchParams.get("wallet")?.toLowerCase();
      const origin = request.headers.origin;
      const originAllowed = isAllowedOrigin(origin, this.allowedOrigins);
      if (!originAllowed) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      if (url.pathname !== "/ws" || (!marketId && !wallet)) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
      this.server.handleUpgrade(request, socket, head, (webSocket) => {
        this.server.emit("connection", webSocket, request, {
          marketId: marketId ?? null,
          wallet: wallet ?? null,
        });
      });
    });
  }

  publish(marketId, message) {
    const payload = JSON.stringify(message);
    for (const [socket, subscription] of this.subscriptions) {
      if (subscription.marketId === marketId && socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  publishOrder(wallet, message) {
    const payload = JSON.stringify(message);
    const normalizedWallet = wallet.toLowerCase();
    for (const [socket, subscription] of this.subscriptions) {
      if (subscription.wallet === normalizedWallet && socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  close() {
    for (const socket of this.subscriptions.keys()) socket.close();
    this.server.close();
  }
}
